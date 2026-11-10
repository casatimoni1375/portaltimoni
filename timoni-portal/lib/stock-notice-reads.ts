import { isCicaAccess, type PortalUser } from "./access-control";
import { canReadUnit } from "./module-authorization";
type Need = { id: string; unidade: string; status: string; respondidoEm?: string; observacao?: string };
export function canReceiveStockNotice(email: string) {
  return isCicaAccess(email) || email.trim().toLowerCase() === "estoquetimoni@gmail.com";
}
export function pendingStockIds(email: string, needs: Need[]) {
  email = email.trim().toLowerCase();
  if (!canReceiveStockNotice(email)) return [];
  return needs.filter(n => n.status === "pendente" && !n.respondidoEm && !n.observacao && (isCicaAccess(email) || n.unidade === "rio_claro")).map(n => n.id);
}

export function pendingStockIdsForUser(user: PortalUser, needs: Need[]) {
  if (!user.collaboratorAccess) return pendingStockIds(user.email, needs);
  const profile = user.collaboratorAccess.profile;
  if (profile !== "administracao-cica" && profile !== "estoque-rio-claro") return [];
  if (profile === "estoque-rio-claro" && user.unit !== "Rio Claro") return [];
  return needs.filter(need => canReadUnit(user, "estoque", need.unidade)
    && need.status === "pendente" && !need.respondidoEm && !need.observacao).map(need => need.id);
}
