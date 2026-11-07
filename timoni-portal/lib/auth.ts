import { createGoogleTokenRefresher } from "@/lib/google-token-refresh";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticatePortalCollaborator, individualLoginEnabled, resolvePortalCollaboratorSession } from "@/lib/collaborator-auth.server";
import type { CollaboratorSessionSubject } from "@/lib/collaborator-login.server";
import type { CollaboratorAccess } from "@/lib/collaborator-access";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";
import type { PortalUser } from "@/lib/access-control";
import { getEffectivePortalUser, getPortalUserSessionState, recordPortalAccess } from "@/lib/portal-config";
import { getPortalConfigurationRevisionSafely } from "@/lib/portal-config-revision";
import { resolveConfiguredUser } from "@/lib/authorization";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET;

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError" | "SessionTemporarilyUnavailable" | "CollaboratorAccessRevoked";
    collaboratorSubject?: CollaboratorSessionSubject;
    collaboratorAccess?: CollaboratorAccess | null;
    portalUser?: PortalUser | null;
    portalConfigRevision?: string;
  }
  interface User { collaboratorSubject?: CollaboratorSessionSubject }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    googleAccountId?: string;
    collaboratorSubject?: CollaboratorSessionSubject;
    expiresAt?: number;
    refreshRetryAt?: number;
    error?: "RefreshAccessTokenError" | "SessionTemporarilyUnavailable";
    portalUser?: PortalUser | null;
    portalConfigAt?: number;
    portalConfigRevision?: string;
  }
}

const refreshGoogleToken = createGoogleTokenRefresher();
class IndividualLoginUnavailable extends CredentialsSignin { code = "temporarily_unavailable"; }
class IndividualLoginThrottled extends CredentialsSignin { code = "too_many_attempts"; }
async function refreshAccessToken(token: JWT): Promise<JWT> {
  return refreshGoogleToken(token, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: AUTH_SECRET,
  providers: [
    ...(individualLoginEnabled() ? [Credentials({
      credentials: { username: { label: "Usuário", type: "text" }, password: { label: "Senha", type: "password" } },
      async authorize(credentials) {
        if (!individualLoginEnabled()) return null;
        const result = await authenticatePortalCollaborator({ username: credentials.username, password: credentials.password });
        if (!result.ok) {
          if (result.reason === "temporarily_unavailable") throw new IndividualLoginUnavailable();
          if (result.reason === "too_many_attempts") throw new IndividualLoginThrottled();
          return null;
        }
        return { id: result.subject.collaboratorId, collaboratorSubject: result.subject };
      },
    })] : []),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.appdata",
          ].join(" "),
          access_type: "offline",
          // O Google pede consentimento quando necessário, sem forçar a repetição em cada login.
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return Boolean(individualLoginEnabled() && user.collaboratorSubject);
      const configured = await getEffectivePortalUser(account?.access_token, user.email);
      return Boolean(configured && configured.active !== false);
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "credentials") {
        return { sub: user.id, collaboratorSubject: user.collaboratorSubject };
      }
      if (token.collaboratorSubject && !account) return token;
      if (account) {
        const portalConfigRevision = await getPortalConfigurationRevisionSafely();
        const configured = await getEffectivePortalUser(account.access_token, token.email);
        if (configured && account.access_token && token.email) await recordPortalAccess(account.access_token, token.email);
        return {
          ...token,
          collaboratorSubject: undefined,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? (token.googleAccountId && token.googleAccountId === account.providerAccountId ? token.refreshToken : undefined),
          googleAccountId: account.providerAccountId,
          expiresAt: account.expires_at,
          error: undefined,
          refreshRetryAt: undefined,
          portalUser: configured,
          portalConfigAt: Date.now(),
          portalConfigRevision: portalConfigRevision ?? undefined,
        };
      }

      let current = token;
      if (!token.accessToken || !token.expiresAt || !Number.isFinite(token.expiresAt) || Date.now() / 1000 >= token.expiresAt - 120) {
        current = await refreshAccessToken(token);
      }

      // Never keep an old permission snapshot after a missing/failed official lookup.
      if (current.error === "RefreshAccessTokenError" || (current.error === "SessionTemporarilyUnavailable" && (!current.expiresAt || Date.now() / 1000 >= current.expiresAt))) {
        return { ...current, portalUser: null };
      }
      const state = await getPortalUserSessionState(current.accessToken, current.email);
      const portalUser = state.user;
      current = { ...current, error: state.unavailable ? "SessionTemporarilyUnavailable" : undefined };
      const revision = await getPortalConfigurationRevisionSafely();
      current = { ...current, portalUser, portalConfigAt: Date.now(), portalConfigRevision: revision ?? current.portalConfigRevision };

      return current;
    },
    async session({ session, token }) {
      if (token.collaboratorSubject) {
        const state = await resolvePortalCollaboratorSession(token.collaboratorSubject);
        return { ...session, user: undefined,
          collaboratorSubject: token.collaboratorSubject, collaboratorAccess: state.access,
          accessToken: undefined, portalUser: null,
          error: state.unavailable ? "SessionTemporarilyUnavailable" as const : state.access ? undefined : "CollaboratorAccessRevoked" as const };
      }
      const portalUser = resolveConfiguredUser(token.email, token.portalUser);
      if (!portalUser) {
        // Legacy endpoints that only check session.user.email must also reject a revoked account.
        return { ...session, user: undefined, accessToken: undefined, portalUser: null, error: token.error };
      }
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.portalUser = portalUser;
      session.portalConfigRevision = token.portalConfigRevision;
      return session;
    },
  },
});
