import {Suspense} from "react";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess,isCicaAccess} from "@/lib/access-control";
import Today from "@/components/clean/today";
export default async function DashboardPage(){
 const session=await getPortalSession();const user=session?.portalUser;if(!user)redirect("/login");
 const has=(module:Parameters<typeof hasModuleAccess>[1])=>hasModuleAccess(user.email,module,user);
 return <Suspense fallback={<p role="status">Abrindo Hoje…</p>}><Today name={isCicaAccess(user.email)?"Ciça":user.name.split(" ")[0]} defaultUnit={user.unit==="Geral"?"todas":user.unit==="Araras"?"araras":"rio_claro"} capabilities={{orders:has("pedido-de-compra")||has("compras"),purchases:has("compras"),trips:has("motorista"),people:has("painel")}}/></Suspense>;
}
