import { ADMIN_IDENTITIES, AUTHORIZATION_PROFILES, can, type AuthorizationAction, type AuthorizationContext, type AuthorizationProfile, type AuthorizationResource, type PortalUnit } from "./authorization";
import type { PortalModule, PortalUser } from "./access-control";

// O cadastro oficial por id será a autoridade. E-mail serve apenas como contato.
export type CollaboratorAccess = {
  collaboratorId: string;
  username: string;
  name: string;
  contactEmail: string;
  active: boolean;
  unit: PortalUnit;
  profile: AuthorizationProfile;
  permissions: Partial<Record<AuthorizationResource, AuthorizationAction[]>>;
  mobileModules?: PortalModule[];
};

export function normalizeCollaboratorLogin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const login = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(login) ? login : null;
}

export function collaboratorActorKey(id: string) {
  return `colaborador:${Array.from(id).map(char => char.codePointAt(0)!.toString(16).padStart(6, "0")).join("")}`;
}

// Projeção interna limitada aos módulos adaptados; nunca vira contato na sessão.
export function collaboratorModuleUser(access: CollaboratorAccess, module: "motorista" | "pedido-de-compra" | "reunioes" | "estoque" | "chat"): PortalUser {
  return { email: collaboratorActorKey(access.collaboratorId), name: access.name, unit: access.unit, profile: access.profile,
    requiresPassword: true, active: access.active, modules: [module], collaboratorAccess: access };
}

export function resolveCollaboratorAccess(expectedId: string, access: CollaboratorAccess | null): CollaboratorAccess | null {
  if (typeof expectedId !== "string" || !expectedId || expectedId.length > 128 || !access || access.collaboratorId !== expectedId || access.active !== true
    || !normalizeCollaboratorLogin(access.username) || !access.name?.trim()
    || !["Geral", "Araras", "Rio Claro"].includes(access.unit)
    || !AUTHORIZATION_PROFILES.includes(access.profile)
    || !access.permissions || typeof access.permissions !== "object" || Array.isArray(access.permissions)) return null;
  return access;
}

export function canCollaboratorAction(access: CollaboratorAccess | null, resource: AuthorizationResource, action: AuthorizationAction, context: AuthorizationContext = {}) {
  if (!access || !resolveCollaboratorAccess(access.collaboratorId, access)) return false;
  if ((resource === "pedido-de-compra" || resource === "agenda-ct") && action !== "visualizar") return false;
  const grants = access.permissions[resource];
  const explicitlyAllowed = Array.isArray(grants) && grants.includes(action);
  // Reaproveita as restrições centrais de unidade, perfil, mobile e ações críticas.
  // Estes identificadores são apenas uma ponte interna da política; nunca são contato, login ou autoria.
  const policyIdentity = access.profile === "administracao-cica" ? ADMIN_IDENTITIES.cica
    : access.profile === "administracao-marcelo" ? ADMIN_IDENTITIES.marcelo : `colaborador:${access.collaboratorId}`;
  if (access.profile !== "administracao-cica" && !explicitlyAllowed) return false;
  return can({
    email: policyIdentity, name: access.name, profile: access.profile,
    unit: access.unit, active: true, requiresPassword: true,
    modules: Object.keys(access.permissions) as PortalModule[], mobileModules: access.mobileModules,
  }, resource, action, { ...context, legacyAllowed: explicitlyAllowed });
}
