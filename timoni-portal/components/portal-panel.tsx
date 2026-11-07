import "@/app/colaboradores/panel-modern.css";
import WeeklyPeopleHighlights, { UpcomingPeopleHighlights, WeeklyPeopleCards } from "@/components/weekly-people-highlights";
import { Suspense } from "react";
import { getPortalSession as auth } from "@/lib/portal-session";
import ComunicadosFeed from "@/app/colaboradores/comunicados-feed";
import ComunicadosAdmin from "@/app/colaboradores/comunicados-admin";
import { hasModuleAccess, type PortalUser } from "@/lib/access-control";
import type { ConfiguredCollaborator } from "@/lib/portal-config";
import { getEffectivePanelData } from "@/lib/portal-config";
import { listMeetings, type Meeting } from "@/lib/reunioes";
import ModuleArrivalSummary from "@/components/module-arrival-summary";


type PanelStore = "geral" | "rio claro" | "araras";
type Store = "rio claro" | "araras";
type FixedMeeting = { date: string; time: string; label: string; frequency: string };

function getPanelStore(email:string,portalUser?:PortalUser|null):PanelStore{const e=email.trim().toLowerCase();if(["mcrodini@gmail.com","mrodini@gmail.com"].includes(e))return "geral";if(portalUser?.unit==="Geral")return "geral";if(portalUser?.unit==="Araras")return "araras";if(portalUser?.unit==="Rio Claro")return "rio claro";if(["estoqueararascasatimoni@gmail.com","comercialara@casatimoni.com.br"].includes(e))return "araras";return "rio claro"}
function parseEventDate(value:string){return new Date(value.includes("T")?value:`${value}T12:00:00-03:00`)}
const PANEL_TIME_ZONE="America/Sao_Paulo";
const PANEL_UTC_OFFSET="-03:00";
function formatDate(value:string|Date){const d=typeof value==="string"?parseEventDate(value):value;return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(d)}
function formatMeeting(m:FixedMeeting){return formatDate(m.date)}

function meetings(items:Meeting[],now:Date,unit:Store):FixedMeeting[]{
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:PANEL_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const today=`${parts.find(item=>item.type==="year")?.value}-${parts.find(item=>item.type==="month")?.value}-${parts.find(item=>item.type==="day")?.value}`;
 const expectedUnit=unit==="araras"?"Araras":"Rio Claro";
 return items.filter(item=>item.status==="agendada"&&item.unit===expectedUnit)
  .flatMap(item=>[{date:item.date,time:item.time,frequency:item.frequency},{date:item.secondDate,time:item.secondTime,frequency:item.frequency},...(item.additionalDates||[]).map(occurrence=>({...occurrence,frequency:item.frequency}))])
  .filter(item=>item.date&&item.date>=today)
  .sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time))
  .slice(0,2)
  .map((item,index)=>({date:item.date,time:item.time,label:index===0?"Próxima":"Seguinte",frequency:item.frequency||"Mensal"}));
}
function AnnouncementCard({store,isAdmin,canConfirmRead,collaborators}:{store:Store;isAdmin:boolean;canConfirmRead:boolean;collaborators:ConfiguredCollaborator[]}){const unit=store==="rio claro"?"Rio Claro":"Araras";const members=collaborators.filter(member=>member.active&&member.unit===unit);return <article className="h-full min-w-0 rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">AVISOS</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{unit}</h2><div className="mt-4 space-y-4"><ComunicadosFeed store={store} isAdmin={isAdmin} canConfirmRead={canConfirmRead} members={members}/></div></article>}
function MeetingSummaryCard({title,list}:{title:string;list:FixedMeeting[]}){const frequency=list[0]?.frequency;return <article className="h-full min-w-0 rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wider text-slate-500">PRÓXIMAS REUNIÕES</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{title}</h3></div>{frequency&&<span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{frequency}</span>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{["PRÓXIMA","SEGUINTE"].map((label,index)=>{const meeting=list[index];return <div key={label} className="min-w-0 rounded-2xl bg-white/80 p-4"><p className="text-sm font-semibold uppercase tracking-wider text-slate-500">{label}</p>{meeting?<><p className="mt-2 text-lg font-semibold text-slate-900">{formatMeeting(meeting)}</p>{meeting.time&&<p className="mt-1 text-base text-slate-500">{meeting.time}</p>}</>:<p className="mt-2 text-base text-slate-500">A definir</p>}</div>})}</div></article>}

async function PanelContent({showDates}:{showDates:boolean}){
 const session=await auth();const email=session?.user?.email??"";const normalized=email.trim().toLowerCase();const now=new Date();
 if(!hasModuleAccess(email,"painel",session?.portalUser))return null;
 const meetingsPromise=session?.accessToken&&session.error!=="RefreshAccessTokenError"
  ?listMeetings(session.accessToken).catch(()=>[] as Meeting[])
  :Promise.resolve([] as Meeting[]);
 const panelData=await getEffectivePanelData(session?.accessToken,normalized);
 if(!hasModuleAccess(normalized,"painel",panelData.user))return null;
 const effectiveUser=panelData.user;const collaborators=panelData.collaborators;const panelStore=getPanelStore(email,effectiveUser??session?.portalUser);const isCica=normalized==="mcrodini@gmail.com";const isManagement=["mcrodini@gmail.com","mrodini@gmail.com"].includes(normalized);const canConfirmRead=!isManagement&&Boolean(effectiveUser?.noticeRequired);
 return <>
 {showDates&&<Suspense fallback={<WeeklyPeopleCards events={[]} loading/>}><WeeklyPeopleHighlights accessToken={session?.accessToken}/></Suspense>}
 {isManagement&&<ModuleArrivalSummary module="avisos"/>}
 {panelStore==="geral"?<section className="grid portal-comms-grid grid-cols-2 items-stretch gap-2 sm:gap-4 lg:grid-cols-2"><AnnouncementCard store="rio claro" isAdmin={isCica} canConfirmRead={canConfirmRead} collaborators={collaborators}/><AnnouncementCard store="araras" isAdmin={isCica} canConfirmRead={canConfirmRead} collaborators={collaborators}/><Suspense fallback={<CardSkeleton label="PRÓXIMAS REUNIÕES" />}><MeetingsBlock items={meetingsPromise} now={now} store="rio claro" /></Suspense><Suspense fallback={<CardSkeleton label="PRÓXIMAS REUNIÕES" />}><MeetingsBlock items={meetingsPromise} now={now} store="araras" /></Suspense></section>:<section className="grid portal-comms-grid grid-cols-2 items-stretch gap-2 sm:gap-4 lg:grid-cols-2"><AnnouncementCard store={panelStore} isAdmin={isCica} canConfirmRead={canConfirmRead} collaborators={collaborators}/><Suspense fallback={<CardSkeleton label="PRÓXIMAS REUNIÕES" />}><MeetingsBlock items={meetingsPromise} now={now} store={panelStore} /></Suspense></section>}
 {showDates&&<Suspense fallback={<p role="status">Carregando próximas datas…</p>}><UpcomingPeopleHighlights accessToken={session?.accessToken}/></Suspense>}
 {isCica&&<ComunicadosAdmin/>}</>
}

function CardSkeleton({label,tone="blue"}:{label:string;tone?:"blue"|"pink"|"amber"}){
 const color=tone==="pink"?"border-pink-200 bg-pink-50":tone==="amber"?"border-amber-200 bg-amber-50":"border-blue-200 bg-blue-50";
 return <article aria-busy="true" aria-label={`Carregando ${label}`} className={`h-full min-w-0 rounded-3xl border p-5 shadow-sm ${color}`}><p className="text-xs font-semibold uppercase tracking-wider text-slate-700">{label}</p><div aria-hidden="true" className="mt-5 space-y-3 motion-safe:animate-pulse"><div className="h-5 w-2/3 rounded bg-white/80"/><div className="h-16 rounded-xl bg-white/70"/></div></article>;
}
async function MeetingsBlock({items,now,store}:{items:Promise<Meeting[]>;now:Date;store:Store}){
 return <MeetingSummaryCard title={store==="araras"?"Araras":"Rio Claro"} list={meetings(await items,now,store)}/>;
}
export default function PortalPanel({embedded=false}:{embedded?:boolean}){
 const Heading=embedded?"h2":"h1";
 return <div className="ct-modern-panel pb-10"><header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Comunicação interna</p><Heading className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Painel Timoni</Heading></header><Suspense fallback={<section className="grid portal-comms-grid grid-cols-2 items-stretch gap-2 sm:gap-4 lg:grid-cols-2"><CardSkeleton label="AVISOS"/><CardSkeleton label="PRÓXIMAS REUNIÕES"/></section>}><PanelContent showDates={!embedded}/></Suspense></div>;
}
