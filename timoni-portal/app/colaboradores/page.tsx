import {Suspense} from "react";
import {getPortalSession} from "@/lib/portal-session";
import {isManagementEmail,isCicaAccess} from "@/lib/access-control";
import EspacoEquipeForm from "./espaco-equipe-form";
import EspacoEquipeInbox from "./espaco-equipe-inbox";
export const dynamic="force-dynamic";
export default async function EquipePage(){
 const session=await getPortalSession();const email=session?.user?.email||"";
 return <Suspense fallback={<p role="status">Carregando equipe…</p>}>{isManagementEmail(email)?<EspacoEquipeInbox accessToken={session?.accessToken} canDelete={isCicaAccess(email)}/>:<EspacoEquipeForm/>}</Suspense>;
}
