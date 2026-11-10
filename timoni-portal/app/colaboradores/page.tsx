import {Suspense} from "react";
import Link from "next/link";
import PortalPanel from "@/components/portal-panel";
import {getPortalSession} from "@/lib/portal-session";
import {isManagementEmail,isCicaAccess} from "@/lib/access-control";
import EspacoEquipeForm from "./espaco-equipe-form";
import EspacoEquipeInbox from "./espaco-equipe-inbox";
export const dynamic="force-dynamic";
export default async function EquipePage({searchParams}:{searchParams:Promise<{aba?:string}>}){
 const query=await searchParams,session=await getPortalSession();const email=session?.user?.email||"";const messages=query.aba==="mensagens";
 return <><nav className="ct-clean-module-tabs" aria-label="Equipe"><Link href="/colaboradores" aria-current={!messages?"page":undefined}>Avisos e datas</Link><Link href="/colaboradores?aba=mensagens" aria-current={messages?"page":undefined}>Mensagens da equipe</Link></nav><Suspense fallback={<p role="status">Carregando equipe…</p>}>{messages?isManagementEmail(email)?<EspacoEquipeInbox accessToken={session?.accessToken} canDelete={isCicaAccess(email)}/>:<EspacoEquipeForm/>:<PortalPanel/>}</Suspense></>;
}
