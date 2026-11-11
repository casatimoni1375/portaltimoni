import { Suspense } from "react";
import { getPortalSession } from "@/lib/portal-session";
import { isCicaAccess, hasModuleAccess, type PortalModule, type PortalUser } from "@/lib/access-control";
import { can } from "@/lib/authorization";
import { cleanNavigation } from "@/lib/clean-navigation";
import PortalNavigation from "@/components/clean/portal-navigation";
import PortalNotifications from "@/components/portal-notifications";
import ChatButton from "@/components/chat-button";
export default async function PortalHeader({email}:{email:string;portalUser?:PortalUser|null}) {
 const session=await getPortalSession();
 // A sessão desta requisição já verificou o cadastro. O cabeçalho não repete a leitura externa.
 const user=session?.portalUser;
 if(!user || user.active===false || user.email.trim().toLowerCase()!==email.trim().toLowerCase())return null;
 const items=cleanNavigation(user);
 const isCica=isCicaAccess(email);
 const units=user.unit==="Geral"?["rio_claro","araras"]:user.unit==="Araras"?["araras"]:["rio_claro"];
 const notifications=hasModuleAccess(email,"estoque",user)?[{href:"/dashboard/estoque",label:"Estoque"}]:[];
 return <Suspense fallback={<div className="ct-clean-spacer"/>}><PortalNavigation items={items} name={isCica?"Ciça":user.name} initials={isCica?email:user.name.split(" ").slice(0,2).map(s=>s[0]).join("")} units={units} settings={can(user,"configuracoes","visualizar")} identity={email} searchModules={( ["painel","estoque","compras","pedido-de-compra","leads"] as PortalModule[]).filter(module=>hasModuleAccess(email,module,user))} actions={<><PortalNotifications items={notifications} showUpdates={false}/>{hasModuleAccess(email,"chat",user)&&<ChatButton/>}</>}/></Suspense>;
}
