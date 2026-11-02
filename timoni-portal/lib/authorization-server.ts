import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePortalUser } from "@/lib/portal-config";
import { can, type AuthorizationAction, type AuthorizationContext, type AuthorizationResource } from "@/lib/authorization";

/** Shared server entrypoint. Context/legacyAllowed must be constructed by the server. */
export async function requireAuthorization(
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: AuthorizationContext = {},
) {
  const session = await auth();
  const user = await getEffectivePortalUser(session?.accessToken, session?.user?.email);
  if (!session?.accessToken || !user) {
    return { current: null, errorResponse: NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 }) };
  }
  if (!can(user, resource, action, context)) {
    return { current: null, errorResponse: NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 }) };
  }
  return { current: { user, email: user.email, accessToken: session.accessToken }, errorResponse: null };
}
