import { createHmac } from "node:crypto";
import type { neon } from "@neondatabase/serverless";
import type { CollaboratorAccess } from "./collaborator-access";
import type { CollaboratorLoginRecord, CollaboratorLoginStore } from "./collaborator-login.server";

export type CollaboratorPolicyRow = { collaborator_id: string; username: string; profile?: unknown; permissions?: unknown; mobile_modules?: unknown };
type CredentialRow = CollaboratorPolicyRow & { password_hash: string; credential_version: number; enabled: boolean };

// Não cria tabelas nem contas. Requer aplicação explícita do esquema antes da futura ativação.
export function createCollaboratorLoginStore(
  loadAccessById: (id: string, policy: CollaboratorPolicyRow) => Promise<CollaboratorAccess | null>,
  sql: ReturnType<typeof neon>,
  rateSecret: string,
): CollaboratorLoginStore {
  if (!rateSecret || rateSecret.length < 32) throw new Error("Proteção de tentativas não configurada.");
  async function resolve(rows: CredentialRow[]): Promise<CollaboratorLoginRecord | null> {
    if (!rows.length) return null;
    if (rows.length !== 1) throw new Error("Cadastro de login inconsistente.");
    const row = rows[0];
    const access = await loadAccessById(row.collaborator_id, row);
    if (!access || access.collaboratorId !== row.collaborator_id || access.username !== row.username) return null;
    return { access: { ...access, active: access.active === true && row.enabled === true }, passwordHash: row.password_hash, credentialVersion: Number(row.credential_version) };
  }
  return {
    findByLogin: async username => resolve(await sql`SELECT credentials.collaborator_id, credentials.username,
      credentials.password_hash, credentials.credential_version, credentials.enabled,
      policy.profile, policy.permissions, policy.mobile_modules
      FROM portal_collaborator_credentials credentials
      INNER JOIN portal_collaborator_access_policy policy ON policy.collaborator_id = credentials.collaborator_id
      WHERE credentials.username = ${username}` as CredentialRow[]),
    findById: async id => resolve(await sql`SELECT credentials.collaborator_id, credentials.username,
      credentials.password_hash, credentials.credential_version, credentials.enabled,
      policy.profile, policy.permissions, policy.mobile_modules
      FROM portal_collaborator_credentials credentials
      INNER JOIN portal_collaborator_access_policy policy ON policy.collaborator_id = credentials.collaborator_id
      WHERE credentials.collaborator_id = ${id}` as CredentialRow[]),
    async reserveAttempt(username, clientKey) {
      const bucket = (kind: string, value: string) => createHmac("sha256", rateSecret).update(`${kind}:${value}`).digest("hex");
      const keys = [[bucket("login", username), 10], [bucket("client", clientKey), 100]] as const;
      const results = await sql.transaction(keys.map(([key, limit]) => sql`
        INSERT INTO portal_collaborator_login_limits (bucket, window_started_at, attempts)
        VALUES (${key}, NOW(), 1)
        ON CONFLICT (bucket) DO UPDATE SET
          attempts = CASE WHEN portal_collaborator_login_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
            THEN 1 ELSE portal_collaborator_login_limits.attempts + 1 END,
          window_started_at = CASE WHEN portal_collaborator_login_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
            THEN NOW() ELSE portal_collaborator_login_limits.window_started_at END
        WHERE portal_collaborator_login_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
          OR portal_collaborator_login_limits.attempts < ${limit}
        RETURNING bucket
      `));
      // Uma cota esgotada recusa o login. A outra reserva pode ser consumida conservadoramente.
      return results.length === 2 && results.every(rows => Array.isArray(rows) && rows.length === 1);
    },
  };
}
