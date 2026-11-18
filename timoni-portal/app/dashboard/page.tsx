import {Suspense} from "react";
import type {ReactNode} from "react";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {COMPRAS_ENVIADOS_SOMENTE_EMAILS,hasModuleAccess,isCicaAccess,isManagementEmail} from "@/lib/access-control";
import {getEffectivePanelData,getEffectivePortalUser} from "@/lib/portal-config";
import {wantsTodayBlock} from "@/lib/today-blocks";
import type {TodayNoticesConfig} from "@/components/clean/today";
import {canModuleOperation} from "@/lib/module-authorization";
import Today from "@/components/clean/today";
import {MeetingSummaryCard,meetings} from "@/components/portal-panel";
import {listMeetings,type Meeting} from "@/lib/reunioes";
export default async function DashboardPage(){
 const session=await getPortalSession();const user=session?.portalUser;if(!user)redirect("/login");
 const has=(module:Parameters<typeof hasModuleAccess>[1])=>hasModuleAccess(user.email,module,user);
 // Comunicados: mesmas regras do Painel Timoni (unidade, administradora e confirmação obrigatória).
 let notices:TodayNoticesConfig|null=null;
 let sharedAccess=false;
 if(has("painel")){
  const email=user.email.trim().toLowerCase();
  const panel=await getEffectivePanelData(session?.accessToken,email).catch(()=>({user:null,collaborators:[]}));
  const effective=panel.user??user;
  const store:TodayNoticesConfig["store"]=isManagementEmail(email)||effective.unit==="Geral"?"geral":effective.unit==="Araras"?"araras":"rio claro";
  const active=panel.collaborators.filter(member=>member.active);
  const own=active.filter(member=>(member.accessEmail||"").trim().toLowerCase()===email);
  // Conta usada por mais de uma pessoa: saudação sem nome.
  sharedAccess=own.length>1;
  const pool=(own.length?own:active.filter(member=>store==="geral"||member.unit===(store==="araras"?"Araras":"Rio Claro"))).map(member=>({name:member.name,unit:member.unit}));
  notices={store,isAdmin:isCicaAccess(email),canConfirmRead:!isManagementEmail(email)&&Boolean(effective.noticeRequired),members:pool};
 }
 // Tela Hoje: blocos escolhidos em Configurações (coluna O), sempre limitados pela permissão.
 const configured=await getEffectivePortalUser(session?.accessToken,user.email).catch(()=>null);
 const blocks=configured?.todayBlocks;
 const want=(id:string)=>wantsTodayBlock(blocks,id,has);
 const ordersAll=want("pedidos");
 const capabilities={orders:ordersAll||want("pedidos-atrasados"),ordersMode:(ordersAll?"todos":"atrasados") as "todos"|"atrasados",purchases:want("compras"),comprasEnviadosTodas:COMPRAS_ENVIADOS_SOMENTE_EMAILS.has(user.email.trim().toLowerCase()),trips:want("viagens"),tripsCreate:want("viagens")&&canModuleOperation(user,"motorista","criar"),people:want("aniversarios"),agenda:!want("agenda")?null:isCicaAccess(user.email)?(has("agenda-ct")?"timoni" as const:has("agenda")?"principal" as const:null):(has("agenda-ct")?"timoni" as const:null),shortcuts:{estoque:want("atalho-estoque"),equipe:want("atalho-equipe"),vendas:want("atalho-vendas")}};
 // Reuniões na Hoje (desktop e celular, 18/11): mesmo card aprovado do Painel, somente leitura.
 let meetingCards:ReactNode=null;
 if(has("painel")&&session?.accessToken&&session.error!=="RefreshAccessTokenError"){
  const items=await listMeetings(session.accessToken).catch(()=>[] as Meeting[]);const now=new Date();const todas=user.unit==="Geral"||isManagementEmail(user.email);
  const lojas:Array<["rio claro"|"araras",string]>=[["rio claro","Rio Claro"],["araras","Araras"]];
  const visiveis=lojas.filter(([store])=>todas||(user.unit==="Araras")===(store==="araras"));
  meetingCards=<div className="ct-today-meetings grid md:grid-cols-2 gap-4 mt-4">{visiveis.map(([store,title])=><MeetingSummaryCard key={store} title={title} list={meetings(items,now,store)}/>)}</div>;
 }
 return <Suspense fallback={<p role="status">Abrindo Hoje…</p>}><Today meetingCards={meetingCards} email={user.email} name={isCicaAccess(user.email)?"Ciça":sharedAccess||/^vendedores\b/i.test((user.accessLabel||user.name||"").trim())?"":user.name.split(" ")[0]} defaultUnit={user.unit==="Geral"?"todas":user.unit==="Araras"?"araras":"rio_claro"} capabilities={capabilities} notices={notices}/></Suspense>;
}
