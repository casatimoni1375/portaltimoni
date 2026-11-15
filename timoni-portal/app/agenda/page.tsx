import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess} from "@/lib/access-control";
import CalendarContent from "./calendar-content";
import Meetings from "@/app/dashboard/reunioes/reunioes-view";
export default async function AgendaPage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const session=await getPortalSession(),user=session?.portalUser;if(!user)redirect("/login");const query=await searchParams;
 const tabs=[{key:"loja",label:"Loja",visible:hasModuleAccess(user.email,"agenda-ct",user)},{key:"reunioes",label:"Reuniões",visible:hasModuleAccess(user.email,"reunioes",user)}].filter(tab=>tab.visible);
 if(!tabs.length)redirect("/dashboard");const selected=tabs.some(tab=>tab.key===query.view)?query.view:tabs[0].key;
 const linksAbas=tabs.map(tab=><Link key={tab.key} href={`/agenda?view=${tab.key}`} aria-current={selected===tab.key?"page":undefined}>{tab.label}</Link>);
 // Reuniões: abas acima, como antes.
 if(selected==="reunioes")return <div><nav className="ct-clean-module-tabs" aria-label="Filtros da Agenda">{linksAbas}</nav><Suspense fallback={<p role="status">Carregando agenda…</p>}><Meetings/></Suspense></div>;
 // Minha e Loja: as abas vão para a mesma linha do cabeçalho do calendário, sem margem nem linha própria.
 const abas=<nav className="ct-clean-module-tabs" aria-label="Filtros da Agenda" style={{marginBottom:0,borderBottom:0,padding:0}}>{linksAbas}</nav>;
 return <Suspense fallback={<div>{abas}<p role="status">Carregando agenda…</p></div>}><CalendarContent company={selected==="loja"} abas={abas}/></Suspense>;
}
