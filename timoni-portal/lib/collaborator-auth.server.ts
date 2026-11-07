import { neon } from "@neondatabase/serverless";
import { createPortalCollaboratorLogin } from "./collaborator-login-runtime.server";
import { createGoogleTokenRefresher } from "./google-token-refresh";
import type { CollaboratorSessionSubject } from "./collaborator-login.server";

export function individualLoginEnabled() { return process.env.PORTAL_INDIVIDUAL_LOGIN_ENABLED === "true"; }
const renew = createGoogleTokenRefresher();
let integration: { key: string; accessToken?: string; refreshToken?: string; expiresAt?: number; error?: "RefreshAccessTokenError" | "SessionTemporarilyUnavailable"; refreshRetryAt?: number } | undefined;

async function runtime() {
  if (!individualLoginEnabled()) throw new Error("Entrada individual indisponível.");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const secret = process.env.PORTAL_LOGIN_RATE_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!databaseUrl || !secret || secret.length < 32 || !refreshToken || !clientId || !clientSecret) throw new Error("Conexão individual não configurada.");
  const key = JSON.stringify([clientId, clientSecret, refreshToken]);
  if (!integration || integration.key !== key) integration = { key, refreshToken };
  if (!integration.accessToken || !integration.expiresAt || Date.now() / 1000 >= integration.expiresAt - 120) {
    integration = await renew(integration, clientId, clientSecret);
  }
  if (!integration.accessToken || !integration.expiresAt || Date.now() / 1000 >= integration.expiresAt || integration.error === "RefreshAccessTokenError") throw new Error("Conexão central temporariamente indisponível.");
  return createPortalCollaboratorLogin(neon(databaseUrl), secret, integration.accessToken, {
    cicaId: process.env.PORTAL_CICA_COLLABORATOR_ID?.trim(), marceloId: process.env.PORTAL_MARCELO_COLLABORATOR_ID?.trim(),
  });
}

export async function authenticatePortalCollaborator(input: { username?: unknown; password?: unknown }) {
  try {
    // Cota global conservadora além da cota por login. Não confia em IP fornecido pelo navegador.
    return await (await runtime()).authenticate(input, "entrada-individual");
  } catch { return { ok: false as const, reason: "temporarily_unavailable" as const }; }
}

export async function resolvePortalCollaboratorSession(subject: CollaboratorSessionSubject) {
  if (!individualLoginEnabled()) return { access: null, unavailable: false };
  try { return await (await runtime()).resolveSession(subject); }
  catch { return { access: null, unavailable: true }; }
}

// Somente para chamadas de integração feitas no servidor; nunca anexar ao objeto de sessão público.
export async function getPortalCentralIntegrationToken() {
  await runtime();
  return integration!.accessToken!;
}
