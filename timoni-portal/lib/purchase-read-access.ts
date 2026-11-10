import { getPortalSession } from "@/lib/portal-session";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { hasModuleAccess } from "@/lib/access-control";
export async function requirePurchaseRead(){
 const session=await getPortalSession();
 const resource: "compras" | "pedido-de-compra"=hasModuleAccess(session?.user?.email,"compras",session?.portalUser)?"compras":"pedido-de-compra";
 const gate=await requireModuleAuthorization(resource,"visualizar");return {...gate,resource};
}
