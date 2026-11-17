import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess,isCicaAccess} from "@/lib/access-control";
import CalendarContent from "./calendar-content";
export default async function AgendaPage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const session=await getPortalSession(),user=session?.portalUser;if(!user)redirect("/login");const query=await searchParams;
 if(query.view==="reunioes")redirect("/dashboard/reunioes");
 // Minha agenda: só no desktop e só nos acessos da Ciça (no celular fica só a Loja).
 const tabs=[{key:"loja",label:"Loja",visible:hasModuleAccess(user.email,"agenda-ct",user),desktopOnly:false},{key:"minha",label:"Minha agenda",visible:isCicaAccess(user.email),desktopOnly:true}].filter(tab=>tab.visible);
 if(!tabs.length)redirect("/dashboard");const selected=tabs.some(tab=>tab.key===query.view)?query.view:tabs[0].key;
 const linksAbas=tabs.map(tab=><Link key={tab.key} className={tab.desktopOnly?"max-md:!hidden":undefined} href={`/agenda?view=${tab.key}`} aria-current={selected===tab.key?"page":undefined}>{tab.label}</Link>);
 // Minha e Loja: as abas vão para a mesma linha do cabeçalho do calendário, sem margem nem linha própria.
 const abas=<nav className="ct-clean-module-tabs" aria-label="Filtros da Agenda" style={{marginBottom:0,borderBottom:0,padding:0}}>{linksAbas}</nav>;
 return <Suspense fallback={<div>{abas}<p role="status">Carregando agenda…</p></div>}><CalendarContent company={selected==="loja"} abas={abas}/></Suspense>;
}
