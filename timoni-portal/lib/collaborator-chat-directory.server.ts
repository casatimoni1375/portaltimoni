import { neon } from "@neondatabase/serverless";
import { getPortalCentralIntegrationToken } from "./collaborator-auth.server";
import { getOfficialCollaboratorsForAccess } from "./portal-config";
import { resolveCollaboratorPolicy } from "./collaborator-policy.server";
import { canCollaboratorAction, type CollaboratorAccess } from "./collaborator-access";
import type { CollaboratorPolicyRow } from "./collaborator-login-store.server";

// Uma leitura oficial para montar o diretório, sem fallback por contato compartilhado.
export async function listCollaboratorChatDirectory(): Promise<CollaboratorAccess[]> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Diretório indisponível.");
  const token = await getPortalCentralIntegrationToken();
  const sql = neon(databaseUrl);
  const [members, policies] = await Promise.all([
    getOfficialCollaboratorsForAccess(token),
    sql`SELECT credentials.collaborator_id, credentials.username, policy.profile, policy.permissions, policy.mobile_modules
      FROM portal_collaborator_credentials credentials
      INNER JOIN portal_collaborator_access_policy policy ON policy.collaborator_id = credentials.collaborator_id
      WHERE credentials.enabled = TRUE`,
  ]);
  const result: CollaboratorAccess[] = [];
  for (const row of policies as CollaboratorPolicyRow[]) {
    const matches = members.filter(member => member.id === row.collaborator_id);
    if (matches.length !== 1 || matches[0].chatEnabled !== true) continue;
    const access = resolveCollaboratorPolicy(matches[0], row, {
      cicaId: process.env.PORTAL_CICA_COLLABORATOR_ID?.trim(), marceloId: process.env.PORTAL_MARCELO_COLLABORATOR_ID?.trim(),
    });
    if (access && canCollaboratorAction(access, "chat", "visualizar")) result.push(access);
  }
  return result;
}
