import {Suspense} from "react";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess,isCicaAccess,isManagementEmail} from "@/lib/access-control";
import {getEffectivePanelData,getEffectivePortalUser} from "@/lib/portal-config";
import {wantsTodayBlock} from "@/lib/today-blocks";
import type {TodayNoticesConfig} from "@/components/clean/today";
import {canModuleOperation} from "@/lib/module-authorization";
import Today from "@/components/clean/today";
export default async function DashboardPage(){
 const session=await getPortalSession();const user=session?.portalUser;if(!user)redirect("/login");
 const has=(module:Parameters<typeof hasModuleAccess>[1])=>hasModuleAccess(user.email,module,user);
 // Comunicados: mesmas regras do Painel Timoni (unidade, administradora e confirmação obrigatória).
 let notices:TodayNoticesConfig|null=null;
 if(has("painel")){
  const email=user.email.trim().toLowerCase();
  const panel=await getEffectivePanelData(session?.accessToken,email).catch(()=>({user:null,collaborators:[]}));
  const effective=panel.user??user;
  const store:TodayNoticesConfig["store"]=isManagementEmail(email)||effective.unit==="Geral"?"geral":effective.unit==="Araras"?"araras":"rio claro";
  const active=panel.collaborators.filter(member=>member.active);
  const own=active.filter(member=>(member.accessEmail||"").trim().toLowerCase()===email);
  const pool=(own.length?own:active.filter(member=>store==="geral"||member.unit===(store==="araras"?"Araras":"Rio Claro"))).map(member=>({name:member.name,unit:member.unit}));
  notices={store,isAdmin:isCicaAccess(email),canConfirmRead:!isManagementEmail(email)&&Boolean(effective.noticeRequired),members:pool};
 }
 // Tela Hoje: blocos escolhidos em Configurações (coluna O), sempre limitados pela permissão.
 const configured=await getEffectivePortalUser(session?.accessToken,user.email).catch(()=>null);
 const blocks=configured?.todayBlocks;
 const want=(id:string)=>wantsTodayBlock(blocks,id,has);
 const ordersAll=want("pedidos");
 const capabilities={orders:ordersAll||want("pedidos-atrasados"),ordersMode:(ordersAll?"todos":"atrasados") as "todos"|"atrasados",purchases:want("compras"),trips:want("viagens"),tripsCreate:want("viagens")&&canModuleOperation(user,"motorista","criar"),people:want("aniversarios"),agenda:!want("agenda")?null:isCicaAccess(user.email)?(has("agenda")?"principal" as const:null):(has("agenda-ct")?"timoni" as const:null),shortcuts:{estoque:want("atalho-estoque"),equipe:want("atalho-equipe"),vendas:want("atalho-vendas")}};
 return <Suspense fallback={<p role="status">Abrindo Hoje…</p>}><Today name={isCicaAccess(user.email)?"Ciça":/^vendedores\b/i.test((user.accessLabel||user.name||"").trim())?"":user.name.split(" ")[0]} defaultUnit={user.unit==="Geral"?"todas":user.unit==="Araras"?"araras":"rio_claro"} capabilities={capabilities} notices={notices}/></Suspense>;
}
