import { ADMIN_IDENTITIES, can, resolveConfiguredUser, type AuthorizationProfile } from "./authorization";
import type { CollaboratorAccess } from "./collaborator-access";

export type PortalModule =
  | "painel"
  | "agenda"
  | "agenda-ct"
  | "chat"
  | "compras"
  | "pedido-de-compra"
  | "conferencia"
  | "estoque"
  | "estoque-rotativo"
  | "motorista"
  | "reunioes"
  | "leads"
  | "marketing"
  | "financeiro";

export type PortalBox = PortalModule | "espaco-equipe";

export type PortalUser = {
  collaboratorAccess?: CollaboratorAccess;
  /** Resolved from the official registry/central identity adapter, never a display label. */
  profile?: AuthorizationProfile;
  name: string;
  accessLabel?: string;
  email: string;
  modules: PortalModule[];
  boxes?: PortalBox[];
  mobileModules?: PortalModule[];
  requiresPassword: boolean;
  readOnly?: boolean;
  active?: boolean;
  directPainel?: boolean;
  unit?: "Geral" | "Araras" | "Rio Claro";
  lastAccess?: string;
  noticeRequired?: boolean;
  /** Blocos da tela Hoje (coluna O). Vazio = padrão pelas permissões. */
  todayBlocks?: string[];
};

export const MANAGEMENT_EMAILS: ReadonlySet<string> = new Set([
  ADMIN_IDENTITIES.cica, ADMIN_IDENTITIES.cicaBusiness, ADMIN_IDENTITIES.marcelo,
]);
export function isManagementEmail(email?: string | null) { return MANAGEMENT_EMAILS.has(normalizeEmail(email)); }
export function isCicaAccess(email?: string | null) { const value = normalizeEmail(email); return isManagementEmail(value) && value !== ADMIN_IDENTITIES.marcelo; }

const allModules: PortalModule[] = [
  "painel",
  "agenda",
  "chat",
  "compras",
  "conferencia",
  "estoque",
  "estoque-rotativo",
  "motorista",
  "reunioes",
  "leads",
];

const modulesWithoutCicaAgenda = allModules.filter((module) => module !== "agenda");
const operationalModules: PortalModule[] = ["painel", "chat", "estoque", "motorista"];
const ESTOQUE_TIMONI_EMAIL = "estoquetimoni@gmail.com";
const DIRECT_PAINEL_TIMONI_EMAILS = new Set([
  "balcaotimoni@gmail.com",
  "marketplacerc.mcr@gmail.com",
  ESTOQUE_TIMONI_EMAIL,
]);
const COLLABORATOR_MOTORISTA_CONTROL_EMAILS = new Set([
  "estoqueararascasatimoni@gmail.com",
  "caixarctimoni@gmail.com",
  "estoquetimoni@gmail.com",
  "marketplacerc.mcr@gmail.com",
  "comercialara@casatimoni.com.br",
  "carolina@casatimoni.com.br",
  "comercialrc@casatimoni.com.br",
]);
const LEADS_COLLABORATOR_EMAILS = new Set([
  "marketplacerc.mcr@gmail.com",
  "comercialrc@casatimoni.com.br",
  "comercialara@casatimoni.com.br",
]);
const CHAT_COLLABORATOR_EMAILS = new Set([
  "estoquetimoni@gmail.com",
  "carolina@casatimoni.com.br",
]);

const LEADS_ARARAS_EMAILS = new Set([
  "comercialara@casatimoni.com.br",
  "estoqueararascasatimoni@gmail.com",
]);
const LEADS_RIO_CLARO_EMAILS = new Set([
  "marketplacerc.mcr@gmail.com",
  "comercialrc@casatimoni.com.br",
  "carolina@casatimoni.com.br",
  "balcaotimoni@gmail.com",
  "caixarctimoni@gmail.com",
  "estoquetimoni@gmail.com",
]);

export type LeadsLocation = "rc" | "ara";

export function canViewBothLeadsLocations(email?: string | null) {
  const normalized = normalizeEmail(email);
  return isManagementEmail(normalized);
}

export function getAssignedLeadsLocation(email?: string | null, configured?: PortalUser | null): LeadsLocation {
  const normalized = normalizeEmail(email);
  const user = getPortalUser(normalized, configured);
  if (user?.unit === "Araras") return "ara";
  if (user?.unit === "Rio Claro") return "rc";
  if (LEADS_ARARAS_EMAILS.has(normalized)) return "ara";
  if (LEADS_RIO_CLARO_EMAILS.has(normalized)) return "rc";
  // Preserve the existing Leads RC default for accounts without an assigned unit.
  return "rc";
}

export function resolveLeadsLocation(email: string | null | undefined, requested: unknown, configured?: PortalUser | null): LeadsLocation {
  if (canViewBothLeadsLocations(email)) return requested === "ara" ? "ara" : "rc";
  return getAssignedLeadsLocation(email, configured);
}

export function canAccessLeadsLocation(email: string | null | undefined, requested: LeadsLocation, configured?: PortalUser | null) {
  return canViewBothLeadsLocations(email) || getAssignedLeadsLocation(email, configured) === requested;
}

function operationalUser(name: string, email: string): PortalUser {
  let modules: PortalModule[] = email === ESTOQUE_TIMONI_EMAIL
    ? [...operationalModules, "compras"]
    : LEADS_COLLABORATOR_EMAILS.has(email)
      ? [...operationalModules, "leads"]
      : [...operationalModules];

  if (CHAT_COLLABORATOR_EMAILS.has(email) && !modules.includes("chat")) {
    modules = [...modules, "chat"];
  }

  if ([ESTOQUE_TIMONI_EMAIL, "carolina@casatimoni.com.br"].includes(email) && !modules.includes("estoque-rotativo")) {
    modules = [...modules, "estoque-rotativo"];
  }

  return { name, email, modules, requiresPassword: false, readOnly: !COLLABORATOR_MOTORISTA_CONTROL_EMAILS.has(email) };
}

export const portalUsers: Record<string, PortalUser> = {
  "cecilia@casatimoni.com.br": { name: "Ciça Rodini", email: "cecilia@casatimoni.com.br", modules: [...allModules, "agenda-ct"], requiresPassword: true },
  "mcrodini@gmail.com": { name: "Ciça Rodini", email: "mcrodini@gmail.com", modules: [...allModules, "agenda-ct"], requiresPassword: true },
  "mrodini@gmail.com": { name: "Marcelo Rodini", email: "mrodini@gmail.com", modules: modulesWithoutCicaAgenda, requiresPassword: true },
  "margareth@casatimoni.com.br": { name: "Margareth", email: "margareth@casatimoni.com.br", modules: allModules, requiresPassword: true },
  "balcaotimoni@gmail.com": operationalUser("Vendedores - Rio Claro", "balcaotimoni@gmail.com"),
  "caixarctimoni@gmail.com": { name: "Bruna - Rio Claro", email: "caixarctimoni@gmail.com", modules: ["painel", "chat", "motorista"], requiresPassword: false, readOnly: false, active: true },
  "estoquetimoni@gmail.com": operationalUser("Lucas - Estoque Rio Claro", "estoquetimoni@gmail.com"),
  "marketplacerc.mcr@gmail.com": operationalUser("Jaqueline - Marketplace Rio Claro", "marketplacerc.mcr@gmail.com"),
  "comercialara@casatimoni.com.br": operationalUser("Carolina - Vendas Araras", "comercialara@casatimoni.com.br"),
  "carolina@casatimoni.com.br": operationalUser("Carolina - Rio Claro", "carolina@casatimoni.com.br"),
  "comercialrc@casatimoni.com.br": operationalUser("Jeovana - Rio Claro", "comercialrc@casatimoni.com.br"),
  "estoqueararascasatimoni@gmail.com": { name: "Estoque Araras", email: "estoqueararascasatimoni@gmail.com", modules: operationalModules, requiresPassword: true },
};

export function normalizeEmail(email?: string | null) { return email?.trim().toLowerCase() ?? ""; }
export function isAuthorizedUser(email?: string | null, configured?: PortalUser | null) { return Boolean(getPortalUser(email, configured)); }
export function getPortalUser(email?: string | null, configured?: PortalUser | null) {
  return resolveConfiguredUser(email, configured);
}
export function hasModuleAccess(email: string | null | undefined, module: PortalModule, configured?: PortalUser | null) {
  return can(getPortalUser(email, configured), module, "visualizar");
}
export function entersDirectlyInPainelTimoni(email?: string | null, configured?: PortalUser | null) {
  if (configured && normalizeEmail(configured.email) === normalizeEmail(email)) return configured.directPainel ?? false;
  return DIRECT_PAINEL_TIMONI_EMAILS.has(normalizeEmail(email));
}
export function canManageMotorista(email?: string | null, configured?: PortalUser | null) {
  const user = getPortalUser(email, configured);
  return can(user, "motorista", "editar", { legacyAllowed: user?.readOnly !== true });
}
export function isReadOnlyUser(email?: string | null, configured?: PortalUser | null) { return !canManageMotorista(email, configured); }

export function isBoxVisible(email: string | null | undefined, box: PortalBox, configured?: PortalUser | null) {
  const user = getPortalUser(email, configured);
  if (!user) return false;
  if (!can(user, box === "espaco-equipe" ? "painel" : box, "visualizar")) return false;
  if (box === "motorista") return true;
  if (box === "espaco-equipe") {
    if (!user.modules.includes("painel")) return false;
    return user.boxes?.includes("espaco-equipe") ?? false;
  }
  if (!user.modules.includes(box)) return false;
  if (!user.boxes) return true;
  return user.boxes.includes(box);
}

