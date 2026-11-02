import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";
import type { PortalUser } from "@/lib/access-control";
import { getEffectivePortalUser, recordPortalAccess } from "@/lib/portal-config";
import { getPortalConfigurationRevisionSafely } from "@/lib/portal-config-revision";
import { resolveConfiguredUser } from "@/lib/authorization";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET;

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    portalUser?: PortalUser | null;
    portalConfigRevision?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError";
    portalUser?: PortalUser | null;
    portalConfigAt?: number;
    portalConfigRevision?: string;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) {
      return { ...token, error: "RefreshAccessTokenError" };
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600),
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("[auth] Falha temporária ao renovar token Google.", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: AUTH_SECRET,
  providers: [
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
          prompt: "consent",
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
      const configured = await getEffectivePortalUser(account?.access_token, user.email);
      return Boolean(configured && configured.active !== false);
    },
    async jwt({ token, account }) {
      if (account) {
        const portalConfigRevision = await getPortalConfigurationRevisionSafely();
        const configured = await getEffectivePortalUser(account.access_token, token.email);
        if (configured && account.access_token && token.email) await recordPortalAccess(account.access_token, token.email);
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? token.refreshToken,
          expiresAt: account.expires_at,
          error: undefined,
          portalUser: configured,
          portalConfigAt: Date.now(),
          portalConfigRevision: portalConfigRevision ?? undefined,
        };
      }

      let current = token;
      if (token.expiresAt && Date.now() / 1000 >= token.expiresAt - 120) {
        current = await refreshAccessToken(token);
      }

      // Never keep an old permission snapshot after a missing/failed official lookup.
      const portalUser = await getEffectivePortalUser(current.accessToken, current.email);
      const revision = await getPortalConfigurationRevisionSafely();
      current = { ...current, portalUser, portalConfigAt: Date.now(), portalConfigRevision: revision ?? current.portalConfigRevision };

      return current;
    },
    async session({ session, token }) {
      const portalUser = resolveConfiguredUser(token.email, token.portalUser);
      if (!portalUser) {
        // Legacy endpoints that only check session.user.email must also reject a revoked account.
        return { ...session, user: undefined, accessToken: undefined, portalUser: null };
      }
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.portalUser = portalUser;
      session.portalConfigRevision = token.portalConfigRevision;
      return session;
    },
  },
});
