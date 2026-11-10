"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import TodayNotices,{type NoticeMember} from "./today-notices";

type Order={id:string;nome:string;previsaoEntrega:string;unidade:string};
type Supplier={id:string;name:string;urgent:boolean;unit:string};
type Trip={id?:string;loja?:string;ordem?:number;tipoHorario?:string;horario?:string;horarioFim?:string;clienteFornecedor?:string;numeroPedido?:string;checkoutEm?:string|null;status?:string};
type DateItem={id:string;name:string;date:string;end?:string;kind:"birthday"|"vacation";unit:string};
type CalendarEvent={id:string;summary:string;start:string;end:string;allDay:boolean;completed?:boolean};
type Source={
 orders?:{pedidosEnviados:Order[];stale?:boolean};
 purchases?:{suppliers?:Supplier[];configured?:boolean};
 trips?:{viagens:Trip[]};
 people?:{events:DateItem[];meetings:Array<{id:string;title:string;date:string;time:string}>};
 agenda?:{events:CalendarEvent[]};
};

/**
 * Cada bloco da tela Hoje aparece conforme a permissão do acesso:
 * - agenda: "principal" = Agenda da Ciça; "timoni" = Agenda CT; null = sem bloco de agenda
 * - purchases: Compras urgentes
 * - orders: Pedidos atrasados
 * - trips: Viagens programadas (tripsCreate mostra o botão "Agendar viagem")
 * - people: Aniversários e Férias
 */
export type TodayCapabilities={orders:boolean;purchases:boolean;trips:boolean;tripsCreate:boolean;people:boolean;agenda:"principal"|"timoni"|null};

const todayKey=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const formatDate=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"}).format(new Date(value.includes("T")?value:`${value}T12:00:00-03:00`));
const formatTime=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
const addDays=(day:string,days:number)=>{const date=new Date(`${day}T12:00:00-03:00`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};

export type TodayNoticesConfig={store:"geral"|"araras"|"rio claro";isAdmin:boolean;canConfirmRead:boolean;members:NoticeMember[]};
export default function Today({name,capabilities,defaultUnit,notices=null}:{name:string;capabilities:TodayCapabilities;defaultUnit:string;notices?:TodayNoticesConfig|null}){
 const params=useSearchParams();const requested=params.get("unidade");
 const unit=defaultUnit==="todas"&&["rio_claro","araras","todas"].includes(requested||"")?requested!:defaultUnit;
 const [data,setData]=useState<Source>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState<Record<string,boolean>>({orders:capabilities.orders,purchases:capabilities.purchases,trips:capabilities.trips,people:capabilities.people,agenda:Boolean(capabilities.agenda)});
 const [reload,setReload]=useState(0);const capabilityKey=JSON.stringify(capabilities);

 useEffect(()=>{let active=true,pending=false;const controller=new AbortController();const caps=JSON.parse(capabilityKey) as TodayCapabilities;
  const run=async()=>{if(pending||document.hidden)return;pending=true;const day=todayKey();const sources:Array<[keyof Source,string]>=[];
   if(caps.orders)sources.push(["orders","/api/pedido-de-compra"]);
   if(caps.purchases)sources.push(["purchases","/api/compras"]);
   if(caps.trips)sources.push(["trips",`/api/agenda-motorista?action=dia&data=${day}`]);
   if(caps.people)sources.push(["people",`/api/hoje/equipe?unidade=${unit}`]);
   if(caps.agenda)sources.push(["agenda",`/api/events?calendarKey=${caps.agenda}&timeMin=${encodeURIComponent(`${day}T00:00:00-03:00`)}&timeMax=${encodeURIComponent(`${addDays(day,1)}T00:00:00-03:00`)}`]);
   await Promise.all(sources.map(async([key,url])=>{if(active)setLoading(old=>({...old,[key]:true}));try{let response:Response|undefined;
    for(let attempt=0;attempt<2;attempt++){response=await fetch(url,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12_000)])});if(response.ok||response.status<500)break;}
    const payload=await response!.json();if(!response!.ok||payload.ok===false||payload.error||payload.erro)throw Error("Não foi possível atualizar agora.");
    if(key==="purchases"&&payload.configured===false)throw Error("Conexão de Compras precisa ser configurada.");
    if(active){setData(old=>({...old,[key]:payload}));setErrors(old=>{const next={...old};delete next[key];return next;});}
   }catch(error){if(active&&!controller.signal.aborted)setErrors(old=>({...old,[key]:error instanceof Error?error.message:"Não foi possível atualizar agora."}));}finally{if(active)setLoading(old=>({...old,[key]:false}));}}));pending=false;};
  void run();const timer=setInterval(()=>void run(),60000);const visible=()=>void run();
  document.addEventListener("visibilitychange",visible);window.addEventListener("online",visible);
  return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("online",visible);};
 },[capabilityKey,unit,reload]);

 const allowed=(value?:string)=>unit==="todas"||value===unit||(unit==="rio_claro"&&["MCR","ROD","Rodini","rio claro","Rio Claro"].includes(value||""))||(unit==="araras"&&["CT","Casa Timoni","Araras"].includes(value||""));
 const orders=(data.orders?.pedidosEnviados||[]).filter(order=>allowed(order.unidade)&&order.previsaoEntrega&&order.previsaoEntrega.slice(0,10)<todayKey()).sort((a,b)=>a.previsaoEntrega.localeCompare(b.previsaoEntrega));
 const urgent=(data.purchases?.suppliers||[]).filter(item=>item.urgent&&allowed(item.unit));
 // Um motorista só: todas as viagens do dia aparecem, de qualquer empresa.
 const trips=(data.trips?.viagens||[]).filter(trip=>!trip.checkoutEm&&!/[Cc]onclu[ií]d|[Ff]inalizad|[Cc]ancelad|[Ee]ntregue/.test(trip.status||""));
 const events=(data.people?.events||[]).filter(item=>allowed(item.unit)||item.unit==="geral");
 const agendaEvents=[...(data.agenda?.events||[])].sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start));
 const agendaIds=new Set(agendaEvents.map(event=>event.id));
 const meetings=(data.people?.meetings||[]).filter(meeting=>!agendaIds.has(meeting.id));
 const agendaTitle=capabilities.agenda==="principal"?"Minha agenda":"Agenda CT";
 const agendaHref=capabilities.agenda==="principal"?"/agenda?view=minha":"/agenda?view=loja";

 useEffect(()=>{window.dispatchEvent(new CustomEvent("ct-pending-counts",{detail:{compras:orders.length+urgent.length,motorista:trips.length,agenda:agendaEvents.length+meetings.length}}));},[orders.length,urgent.length,trips.length,agendaEvents.length,meetings.length]);

 const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",hour:"2-digit",hour12:false}).format(new Date()));
 const cards=[
  {key:"orders",value:orders.length,label:"Pedidos atrasados",href:`/dashboard/compras?aba=acompanhar&filtro=atrasados&unidade=${unit}`,tone:"late"},
  {key:"purchases",value:urgent.length,label:"Compras urgentes",href:`/dashboard/compras?aba=montar&filtro=urgentes&unidade=${unit}`,tone:"urgent"},
  {key:"trips",value:trips.length,label:"Viagens do motorista hoje",href:`/dashboard/motorista?data=${todayKey()}&unidade=${unit}`,tone:"normal"},
 ].filter(card=>capabilities[card.key as "orders"|"purchases"|"trips"]&&(card.value>0||loading[card.key]&&!data[card.key as keyof Source]));
 const waiting=(key:keyof Source)=>loading[key]&&!data[key];
 const anyBlock=Boolean(notices)||Boolean(capabilities.agenda)||capabilities.trips||orders.length>0||urgent.length>0||events.length>0;

 return <div className="ct-clean-today">
  <header className="ct-clean-today-heading"><p>{new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long"}).format(new Date())}</p><h1>{hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite"}, {name}.</h1></header>
  {!!cards.length&&<section className="ct-clean-metrics" aria-label="Prioridades do dia">{cards.map(card=><Link key={card.key} href={card.href} className={`ct-clean-metric ct-clean-${card.tone}`}><strong>{waiting(card.key as keyof Source)?"…":card.value}</strong><span>{card.label}</span></Link>)}</section>}
  {Object.keys(errors).length>0&&<div className="ct-clean-source-notice" role="status"><span>Algumas informações não puderam ser atualizadas. Os dados já carregados foram preservados.</span><button type="button" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>}

  <div className={`ct-today-top${notices?"":" no-notices"}`}>
   {notices&&<TodayNotices store={notices.store} isAdmin={notices.isAdmin} canConfirmRead={notices.canConfirmRead} members={notices.members}/>}
   {capabilities.trips&&<section className="ct-clean-card"><div className="ct-clean-card-heading"><h2>Viagens programadas</h2><Link href={`/dashboard/motorista?data=${todayKey()}&unidade=${unit}`}>Ver agenda</Link></div>
    {waiting("trips")&&<p className="ct-clean-muted">Carregando…</p>}
    {!waiting("trips")&&!trips.length&&<p className="ct-clean-muted">Nenhuma viagem pendente hoje.</p>}
    {trips.map((trip,index)=>{const bloqueio=trip.tipoHorario==="Bloqueio";const hora=trip.horario?(trip.horarioFim?`${trip.horario.slice(0,5)}–${trip.horarioFim.slice(0,5)}`:trip.horario.slice(0,5)):`${(Number.isFinite(trip.ordem)?Number(trip.ordem):index)+1}ª`;const texto=bloqueio?"Motorista bloqueado":[trip.clienteFornecedor,trip.numeroPedido?`NF ${trip.numeroPedido}`:"",trip.loja].filter(Boolean).join(" · ")||"Viagem sem cliente informado";return <Link className="ct-clean-calendar-row" key={trip.id||index} href={`/dashboard/motorista?data=${todayKey()}`}><b>{hora}</b><span>{texto}</span></Link>;})}
    {capabilities.tripsCreate&&<Link className="ct-clean-action ct-clean-today-cta" href="/dashboard/motorista?nova=1">Agendar viagem</Link>}
   </section>}

  </div>

  <div className="ct-clean-today-blocks">
   {urgent.length>0&&<section className="ct-clean-card"><div className="ct-clean-card-heading"><h2>Compras urgentes</h2><Link href={`/dashboard/compras?aba=montar&filtro=urgentes&unidade=${unit}`}>Ver todas ({urgent.length})</Link></div>
    {urgent.slice(0,3).map(item=><div className="ct-clean-action-row" key={item.id}><strong>{item.name}</strong><span className="ct-clean-badge ct-clean-urgent">Urgente</span><Link className="ct-clean-action" href={`/dashboard/compras?aba=montar&fornecedor=${item.id}&unidade=${unit}`}>Montar pedido</Link></div>)}
   </section>}

   {orders.length>0&&<section className="ct-clean-card"><div className="ct-clean-card-heading"><h2>Pedidos atrasados</h2><Link href={`/dashboard/compras?aba=acompanhar&filtro=atrasados&unidade=${unit}`}>Ver todos ({orders.length})</Link></div>
    {data.orders?.stale&&<p className="ct-clean-muted">Última cópia disponível; atualização em andamento.</p>}
    {orders.slice(0,3).map(order=><div className="ct-clean-action-row" key={order.id}><div><strong>{order.nome}</strong><small>{order.unidade==="araras"?"Araras":"Rio Claro"} · previsão {formatDate(order.previsaoEntrega)}</small></div><span className="ct-clean-badge ct-clean-late">{Math.max(1,Math.floor((new Date(`${todayKey()}T12:00:00-03:00`).getTime()-new Date(order.previsaoEntrega).getTime())/86400000))} dias</span><Link className="ct-clean-action" href={`/dashboard/pedido-de-compra?pedido=${order.id}&unidade=${unit}`}>Ver pedido</Link></div>)}
   </section>}

   {capabilities.agenda&&<section className="ct-clean-card"><div className="ct-clean-card-heading"><h2>{agendaTitle}</h2><Link href={agendaHref}>Abrir agenda</Link></div>
    {waiting("agenda")&&<p className="ct-clean-muted">Carregando…</p>}
    {!waiting("agenda")&&!agendaEvents.length&&!meetings.length&&<p className="ct-clean-muted">Nenhum compromisso hoje.</p>}
    {agendaEvents.map(event=><Link className="ct-clean-calendar-row" key={event.id} href={agendaHref}><b>{event.allDay?"Dia":formatTime(event.start)}</b><span>{event.summary||"(sem título)"}{event.completed?" · concluído":""}</span></Link>)}
    {meetings.map(meeting=><Link className="ct-clean-calendar-row" key={meeting.id} href="/agenda?view=reunioes"><b>{meeting.time}</b><span>{meeting.title}</span></Link>)}
   </section>}

   {events.length>0&&<section className="ct-clean-card">
    {["birthday","vacation"].map(kind=>{const list=events.filter(event=>event.kind===kind);return list.length?<div className="ct-clean-people-group" key={kind}><h2>{kind==="birthday"?"Aniversários":"Férias"}</h2>{list.map(event=><div key={event.id} className="ct-clean-calendar-row"><b>{formatDate(event.date)}</b><span>{event.name}{kind==="vacation"&&event.end?` · até ${formatDate(event.end)}`:""}</span></div>)}</div>:null;})}
   </section>}
  </div>
  {!anyBlock&&!cards.length&&!Object.values(loading).some(Boolean)&&!Object.keys(errors).length&&<p className="ct-clean-empty">Nenhuma ação pendente para seu acesso agora.</p>}
 </div>;
}
