import type { PortalModule, PortalUser } from "./access-control";

export const ADMIN_IDENTITIES = {
  cica: "mcrodini@gmail.com",
  cicaBusiness: "cecilia@casatimoni.com.br",
  marcelo: "mrodini@gmail.com",
} as const;

export const AUTHORIZATION_PROFILES = [
  "administracao-cica", "administracao-marcelo",
  "gestao-rio-claro", "vendedores-rio-claro", "estoque-rio-claro",
  "gestao-araras", "vendedores-araras", "estoque-araras",
  "motorista-leitura", "legado",
] as const;
export type AuthorizationProfile = typeof AUTHORIZATION_PROFILES[number];
export type AuthorizationAction = "visualizar" | "criar" | "editar" | "excluir" | "administrar";
export type PortalUnit = "Rio Claro" | "Araras" | "Geral";
export type AuthorizationResource = PortalModule | "configuracoes" | "sistema" | "publicacao";
export type AuthorizationContext = {
  unidade?: PortalUnit;
  canal?: "portal" | "mobile";
  /** Only a server-side legacy rule may supply this during the 1B migration. */
  legacyAllowed?: boolean;
  operation?: "permissoes" | "restaurar-backup" | "publicar-codigo";
};

// Existing identity adapters are not an alternative user registry.
// They never make an absent/inactive official user eligible for authorization.
const EXISTING_PROFILES: Readonly<Record<string, AuthorizationProfile>> = {
  [ADMIN_IDENTITIES.cica]: "administracao-cica",
  [ADMIN_IDENTITIES.marcelo]: "administracao-marcelo",
  "margareth@casatimoni.com.br": "gestao-rio-claro",
  "balcaotimoni@gmail.com": "vendedores-rio-claro",
  "caixarctimoni@gmail.com": "vendedores-rio-claro",
  "marketplacerc.mcr@gmail.com": "vendedores-rio-claro",
  "comercialrc@casatimoni.com.br": "gestao-rio-claro",
  "carolina@casatimoni.com.br": "vendedores-rio-claro",
  "estoquetimoni@gmail.com": "estoque-rio-claro",
  "comercialara@casatimoni.com.br": "gestao-araras",
  "estoqueararascasatimoni@gmail.com": "estoque-araras",
};
const RETIRED_IDENTITIES = new Set([
  "fotoscasatimoni@gmail.com", "reginaldo@casatimoni.com.br",
  "casatimoniararas@gmail.com", "comercialtimoniararas@gmail.com",
]);
const ACTIONS: readonly string[] = ["visualizar", "criar", "editar", "excluir", "administrar"];
const RESOURCES: readonly string[] = [
  "painel", "agenda", "agenda-ct", "chat", "compras", "pedido-de-compra",
  "conferencia", "estoque", "estoque-rotativo", "motorista", "reunioes", "leads",
  "marketing", "financeiro", "configuracoes", "sistema", "publicacao",
];

export function normalizeIdentity(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function getAuthorizationProfile(user: PortalUser): AuthorizationProfile {
  const email = normalizeIdentity(user.email);
  // These administrative identities cannot be reassigned by a display label.
  if (email === ADMIN_IDENTITIES.cica || email === ADMIN_IDENTITIES.cicaBusiness) return "administracao-cica";
  if (email === ADMIN_IDENTITIES.marcelo) return "administracao-marcelo";
  if (user.profile && AUTHORIZATION_PROFILES.includes(user.profile)
    && user.profile !== "administracao-cica" && user.profile !== "administracao-marcelo") return user.profile;
  return EXISTING_PROFILES[email] ?? "legado";
}

/** Null is authoritative, never a request for historical fallback. */
export function resolveConfiguredUser(email: string | null | undefined, configured?: PortalUser | null): PortalUser | null {
  const normalized = normalizeIdentity(email);
  if (!normalized || RETIRED_IDENTITIES.has(normalized) || !configured
    || normalizeIdentity(configured.email) !== normalized || configured.active === false
    || !Array.isArray(configured.modules)) return null;
  return { ...configured, email: normalized, profile: getAuthorizationProfile(configured) };
}

/** Read failures, duplicate identities and missing records all deny access. */
export async function resolveOfficialPortalUser(
  email: string | null | undefined,
  loadUsers: () => Promise<PortalUser[]>,
): Promise<PortalUser | null> {
  const normalized = normalizeIdentity(email);
  if (!normalized) return null;
  try {
    const matches = (await loadUsers()).filter((user) => normalizeIdentity(user.email) === normalized);
    return matches.length === 1 ? resolveConfiguredUser(normalized, matches[0]) : null;
  } catch {
    return null;
  }
}

export function can(
  configured: PortalUser | null | undefined,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: AuthorizationContext = {},
): boolean {
  const user = resolveConfiguredUser(configured?.email, configured);
  if (!user || !ACTIONS.includes(action) || !RESOURCES.includes(resource)) return false;
  if (context.canal !== undefined && context.canal !== "portal" && context.canal !== "mobile") return false;
  if (context.unidade !== undefined) {
    if (!["Rio Claro", "Araras", "Geral"].includes(context.unidade)) return false;
    if (user.unit !== "Geral" && user.unit !== context.unidade) return false;
  }
  const profile = getAuthorizationProfile(user);
  if (context.canal === "mobile") {
    if (!["administracao-cica", "administracao-marcelo", "estoque-rio-claro", "motorista-leitura"].includes(profile)) return false;
    if (profile === "estoque-rio-claro" && user.unit !== "Rio Claro") return false;
    if (profile === "motorista-leitura" && (resource !== "motorista" || action !== "visualizar")) return false;
    if (user.mobileModules !== undefined && !user.mobileModules.includes(resource as PortalModule)) return false;
  }
  if (resource === "conferencia" && normalizeIdentity(user.email) !== ADMIN_IDENTITIES.cica && normalizeIdentity(user.email) !== ADMIN_IDENTITIES.cicaBusiness) return false;
  if (profile === "administracao-cica") return true;
  if (resource === "publicacao" || context.operation === "publicar-codigo") return false;
  if (profile === "administracao-marcelo") {
    if (action !== "visualizar" && action !== "editar") return false;
    if (context.operation !== undefined) return false;
    if (resource === "agenda") return false; // Preserve the approved Agenda Ciça restriction.
    if (resource === "configuracoes" || resource === "sistema") return true;
  } else if (resource === "configuracoes" || resource === "sistema" || context.operation !== undefined) {
    return false;
  }
  if (profile === "motorista-leitura") return resource === "motorista" && action === "visualizar";
  // 1B: entry now requires the saved module; cards/menu never grant access.
  const moduleAllowed = user.modules.includes(resource as PortalModule);
  if (!moduleAllowed) return false;
  if (action === "visualizar") return true;
  if (profile === "administracao-marcelo") return action === "editar";
  // No new action matrix is invented for operational profiles in this stage.
  return context.legacyAllowed === true;
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Allowlisted metadata only; editing never means granting/revoking permissions. */
export function canEditConfigurationRecord(
  actor: PortalUser | null | undefined,
  kind: "user" | "collaborator",
  before: object | undefined,
  after: object,
) {
  if (!can(actor, "configuracoes", before ? "editar" : "criar")) return false;
  if (can(actor, "configuracoes", "administrar", { operation: "permissoes" })) return true;
  if (!before) return false;
  const editable = new Set(kind === "user" ? ["name", "accessLabel"] : ["name", "role", "updatedAt"]);
  const previous = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .every((key) => editable.has(key) || sameValue(previous[key], next[key]));
}
