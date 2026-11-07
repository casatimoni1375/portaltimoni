import type { PortalModule, PortalUser } from "./access-control";
import { ADMIN_IDENTITIES, can, getAuthorizationProfile, type AuthorizationAction, type AuthorizationContext, type PortalUnit } from "./authorization";
import { canCollaboratorAction } from "./collaborator-access";

/** Existing operation rules, centralized while APIs migrate from module-only checks. */
export function canModuleOperation(user: PortalUser | null | undefined, module: PortalModule, action: AuthorizationAction, context: AuthorizationContext = {}) {
  if (!user) return false;
  if (module === "pedido-de-compra" && action !== "visualizar") return false;
  if (user.collaboratorAccess) return (module === "motorista" || module === "pedido-de-compra" || module === "reunioes" || module === "estoque" || module === "chat") && canCollaboratorAction(user.collaboratorAccess, module, action, context);
  let legacyAllowed = false;
  if (action === "visualizar") legacyAllowed = true;
  else if (module === "agenda") legacyAllowed = true;
  else if (module === "agenda-ct") legacyAllowed = false; // The approved CT screen is a read-only embed.
  else if (module === "motorista") legacyAllowed = user.readOnly !== true;
  else if (module === "compras" || module === "leads") legacyAllowed = action !== "administrar";
  else if (module === "estoque") legacyAllowed = action === "criar" || action === "editar";
  return can(user, module, action, { ...context, legacyAllowed });
}

export function normalizeUnit(value: unknown): PortalUnit | null {
  if (typeof value !== "string") return null;
  const unit = value.trim().toLowerCase().replace(/_/g, " ");
  if (unit === "rio claro" || unit === "rc") return "Rio Claro";
  if (unit === "araras" || unit === "ara") return "Araras";
  if (unit === "geral") return "Geral";
  return null;
}

/** Store names used by the Motorista form, tied to the existing company locations. */
export function normalizeMotoristaUnit(value: unknown): PortalUnit | null {
  const unit = normalizeUnit(value);
  if (unit) return unit;
  const store = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (store === "casa timoni" || store === "ct") return "Araras";
  if (store === "mcr" || store === "rodini" || store === "rod") return "Rio Claro";
  return null;
}

/** Unknown record units are visible only to an explicitly global official user. */
export function canReadUnit(user: PortalUser, module: PortalModule, value: unknown) {
  const unidade = module === "motorista" ? normalizeMotoristaUnit(value) : normalizeUnit(value);
  return unidade ? canModuleOperation(user, module, "visualizar", { unidade })
    : user.unit === "Geral" && canModuleOperation(user, module, "visualizar");
}

export function calendarModule(key: unknown): "agenda" | "agenda-ct" | null {
  return key === "principal" ? "agenda" : key === "timoni" ? "agenda-ct" : null;
}

export function stockAction(value: unknown): AuthorizationAction | null {
  if (value === "criar") return "criar";
  if (value === "excluir") return "excluir";
  return ["editar", "em_compra", "consulta", "pedido", "observacao", "editar_observacao", "resposta_vendedor", "reabrir", "chegou"].includes(String(value)) ? "editar" : null;
}

export function canStockOperation(user: PortalUser, operation: string, unidade: PortalUnit) {
  const action = stockAction(operation);
  if (!action || !canModuleOperation(user, "estoque", action, { unidade })) return false;
  if (["editar", "editar_observacao", "reabrir", "excluir"].includes(operation)) {
    const profile = user.collaboratorAccess?.profile ?? getAuthorizationProfile(user);
    return profile === "administracao-cica" || (profile === "administracao-marcelo" && action === "editar");
  }
  return true;
}

export type RotativoRole = "report" | "conference" | "manage";
// Existing named operational exception; no e-mail allowlists in route handlers.
const ROTATIVO_CONFERENCE_IDENTITY = "carolina@casatimoni.com.br";
export function canRotativoOperation(user: PortalUser, role: RotativoRole, action: AuthorizationAction) {
  const profile = getAuthorizationProfile(user);
  const manager = profile === "administracao-cica" || profile === "administracao-marcelo";
  const legacyAllowed = manager || (role === "report" && profile === "estoque-rio-claro")
    || (role === "conference" && user.email === ROTATIVO_CONFERENCE_IDENTITY);
  return legacyAllowed && can(user, "estoque-rotativo", action, { legacyAllowed });
}

export function rotativoAction(operation: string): AuthorizationAction | null {
  if (operation === "registrar") return "criar";
  if (["excluir_fornecedor_padronizado", "excluir_atualizacao"].includes(operation)) return "excluir";
  if (["editar_registro", "resolver_nao_encontrado", "conferir", "corrigir_item_conferencia", "atualizar"].includes(operation)) return "editar";
  if (["padronizar_proxima_planilha", "confirmar_planilha_fornecedor", "salvar_padrao_fornecedor", "salvar_padroes_fornecedores", "salvar_mapeamento"].includes(operation)) return "administrar";
  return null;
}

export function isCentralAdministrator(user: PortalUser) {
  return user.email === ADMIN_IDENTITIES.cica && can(user, "sistema", "administrar");
}
