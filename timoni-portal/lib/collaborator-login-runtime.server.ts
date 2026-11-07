import type { neon } from "@neondatabase/serverless";
import { getOfficialCollaboratorForAccess } from "./portal-config";
import { createCollaboratorLogin } from "./collaborator-login.server";
import { createCollaboratorLoginStore } from "./collaborator-login-store.server";
import { resolveCollaboratorPolicy, type CollaboratorAdministratorBindings } from "./collaborator-policy.server";

// Construção explícita no servidor. Não aplica esquema, não cria contas e não ativa o provider.
export function createPortalCollaboratorLogin(
  sql: ReturnType<typeof neon>, rateSecret: string, centralAccessToken: string, administratorBindings: CollaboratorAdministratorBindings,
) {
  if (!centralAccessToken) throw new Error("Conexão central do cadastro não configurada.");
  const store = createCollaboratorLoginStore(async (id, row) => {
    const member = await getOfficialCollaboratorForAccess(centralAccessToken, id);
    return resolveCollaboratorPolicy(member, row, administratorBindings);
  }, sql, rateSecret);
  return createCollaboratorLogin(store);
}
