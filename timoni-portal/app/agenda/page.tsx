import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess,isCicaAccess} from "@/lib/access-control";
import CalendarContent from "./calendar-content";
import Meetings from "@/app/dashboard/reunioes/reunioes-view";
export default async function AgendaPage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const session=await getPortalSession(),user=session?.portalUser;if(!user)redirect("/login");const query=await searchParams;
 const tabs=[{key:"minha",label:"Minha",visible:isCicaAccess(user.email)&&hasModuleAccess(user.email,"agenda",user)},{key:"loja",label:"Loja",visible:hasModuleAccess(user.email,"agenda-ct",user)},{key:"reunioes",label:"Reuniões",visible:hasModuleAccess(user.email,"reunioes",user)}].filter(tab=>tab.visible);
 if(!tabs.length)redirect("/dashboard");const selected=tabs.some(tab=>tab.key===query.view)?query.view:tabs[0].key;
 return <div><nav className="ct-clean-module-tabs" aria-label="Filtros da Agenda">{tabs.map(tab=><Link key={tab.key} href={`/agenda?view=${tab.key}`} aria-current={selected===tab.key?"page":undefined}>{tab.label}</Link>)}</nav><Suspense fallback={<p role="status">Carregando agenda…</p>}>{selected==="reunioes"?<Meetings/>:<CalendarContent company={selected==="loja"}/>}</Suspense></div>;
}
