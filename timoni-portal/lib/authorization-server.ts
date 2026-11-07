import { NextResponse } from "next/server";
import { getPortalSession as auth } from "@/lib/portal-session";
import { canCollaboratorAction, collaboratorModuleUser, resolveCollaboratorAccess } from "@/lib/collaborator-access";
import { getEffectivePortalUser } from "@/lib/portal-config";
import { can, type AuthorizationAction, type AuthorizationContext, type AuthorizationResource } from "@/lib/authorization";
import { canModuleOperation } from "@/lib/module-authorization";
import type { PortalModule } from "@/lib/access-control";

export async function requireModuleAuthorization(module: PortalModule, action: AuthorizationAction, context: AuthorizationContext = {}) {
  const result = await requireAuthorization(module, "visualizar");
  if (!result.current) return result;
  if (!canModuleOperation(result.current.user, module, action, context)) {
    return { current: null, errorResponse: NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 }) };
  }
  return result;
}

/** Shared server entrypoint. Context/legacyAllowed must be constructed by the server. */
export async function requireAuthorization(
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: AuthorizationContext = {},
) {
  const session = await auth();
  if (session?.collaboratorSubject) {
    if (session.error === "SessionTemporarilyUnavailable") return { current: null, errorResponse: NextResponse.json({ error: "Conexão temporariamente indisponível. Tente novamente." }, { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }) };
    const access = resolveCollaboratorAccess(session.collaboratorSubject.collaboratorId, session.collaboratorAccess ?? null);
    if (!access || session.error) return { current: null, errorResponse: NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 }) };
    if ((resource !== "motorista" && resource !== "pedido-de-compra" && resource !== "reunioes" && resource !== "estoque" && resource !== "chat") || !canCollaboratorAction(access, resource, action, context)) return { current: null, errorResponse: NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 }) };
    const user = collaboratorModuleUser(access, resource);
    return { current: { user, email: user.email, accessToken: "", collaboratorId: access.collaboratorId }, errorResponse: null };
  }
  if (session?.error === "SessionTemporarilyUnavailable") {
    return { current: null, errorResponse: NextResponse.json({ error: "Conexão temporariamente indisponível. Tente novamente." }, { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }) };
  }
  if (session?.error === "RefreshAccessTokenError") {
    return { current: null, errorResponse: NextResponse.json({ error: "Entre novamente para renovar sua autorização." }, { status: 401 }) };
  }
  const user = await getEffectivePortalUser(session?.accessToken, session?.user?.email);
  if (!session?.accessToken || !user) {
    return { current: null, errorResponse: NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 }) };
  }
  if (!can(user, resource, action, context)) {
    return { current: null, errorResponse: NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 }) };
  }
  return { current: { user, email: user.email, accessToken: session.accessToken }, errorResponse: null };
}
