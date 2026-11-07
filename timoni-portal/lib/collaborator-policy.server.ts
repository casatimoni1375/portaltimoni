import { AUTHORIZATION_PROFILES, type AuthorizationAction, type AuthorizationResource } from "./authorization";
import { normalizeCollaboratorLogin, type CollaboratorAccess } from "./collaborator-access";
import type { ConfiguredCollaborator } from "./portal-config";
import type { CollaboratorPolicyRow } from "./collaborator-login-store.server";
import type { PortalModule } from "./access-control";

export type CollaboratorAdministratorBindings = { cicaId?: string; marceloId?: string };
const resources = new Set(["painel", "agenda", "agenda-ct", "chat", "compras", "pedido-de-compra", "conferencia", "estoque", "estoque-rotativo", "motorista", "reunioes", "leads", "marketing", "financeiro", "configuracoes", "sistema", "publicacao"]);
const actions = new Set(["visualizar", "criar", "editar", "excluir", "administrar"]);
const decode = (value: unknown): unknown => typeof value === "string" ? JSON.parse(value) : value;

// Dados pessoais/unidade vêm do cadastro oficial; perfil e ações vêm da política por id.
export function resolveCollaboratorPolicy(member: ConfiguredCollaborator | null, row: CollaboratorPolicyRow, bindings: CollaboratorAdministratorBindings): CollaboratorAccess | null {
  try {
    if (!member || member.id !== row.collaborator_id || member.active !== true
      || !["Geral", "Araras", "Rio Claro"].includes(member.unit)
      || normalizeCollaboratorLogin(row.username) !== row.username
      || typeof row.profile !== "string" || !AUTHORIZATION_PROFILES.includes(row.profile as CollaboratorAccess["profile"])) return null;
    if (bindings.cicaId && bindings.cicaId === bindings.marceloId) return null;
    if ((row.profile === "administracao-cica" && member.id !== bindings.cicaId)
      || (row.profile === "administracao-marcelo" && member.id !== bindings.marceloId)
      || (member.id === bindings.cicaId && row.profile !== "administracao-cica")
      || (member.id === bindings.marceloId && row.profile !== "administracao-marcelo")) return null;
    if ((row.profile.endsWith("rio-claro") && member.unit !== "Rio Claro")
      || (row.profile.endsWith("araras") && member.unit !== "Araras")
      || (row.profile.startsWith("administracao-") && member.unit !== "Geral")) return null;
    const parsed = decode(row.permissions);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const permissions: CollaboratorAccess["permissions"] = {};
    for (const [resource, grants] of Object.entries(parsed)) {
      if (!resources.has(resource) || !Array.isArray(grants) || grants.some(action => typeof action !== "string" || !actions.has(action))
        || (grants.length > 0 && !grants.includes("visualizar"))) return null;
      permissions[resource as AuthorizationResource] = [...new Set(grants)] as AuthorizationAction[];
    }
    let mobileModules: PortalModule[] | undefined;
    if (row.mobile_modules != null) {
      const mobile = decode(row.mobile_modules);
      if (!Array.isArray(mobile) || mobile.some(module => typeof module !== "string" || !resources.has(module)
        || ["configuracoes", "sistema", "publicacao"].includes(module) || !permissions[module as AuthorizationResource]?.includes("visualizar"))) return null;
      mobileModules = [...new Set(mobile)] as PortalModule[];
    }
    return { collaboratorId: member.id, username: row.username, name: member.name, contactEmail: member.accessEmail,
      active: true, unit: member.unit, profile: row.profile as CollaboratorAccess["profile"], permissions, mobileModules };
  } catch { return null; }
}
