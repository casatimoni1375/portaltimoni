"use client";
import type {ReactNode} from "react";
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
 purchases?:{suppliers?:Supplier[];configured?:boolean;summary?:{pedidosParaFazer?:number;enviadosRioClaro?:number;enviadosAraras?:number}};
 trips?:{dias?:{data:string;viagens:Trip[]}[]};
 people?:{events:DateItem[];meetings:Array<{id:string;title:string;date:string;time:string}>};
 agenda?:{events:CalendarEvent[]};
 estoque?:{necessidades:Array<{status:string;unidade:string;chegouEm:string}>};
};

/**
 * Cada bloco da tela Hoje aparece conforme a permissão do acesso:
 * - agenda: "principal" = Agenda da Ciça; "timoni" = Agenda CT; null = sem bloco de agenda
 * - purchases: Compras urgentes
 * - orders: Pedidos atrasados
 * - trips: card "Viagens do motorista hoje" (atalho clicável para a agenda do Motorista)
 * - people: Aniversários e Férias
 */
export type TodayCapabilities={pendingBox?:boolean;orders:boolean;ordersMode?:"atrasados"|"todos";purchases:boolean;comprasEnviadosTodas?:boolean;trips:boolean;tripsCreate:boolean;people:boolean;agenda:"principal"|"timoni"|null;shortcuts?:{estoque:boolean;equipe:boolean;vendas:boolean}};

const todayKey=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const formatDate=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"}).format(new Date(value.includes("T")?value:`${value}T12:00:00-03:00`));
const formatTime=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
const addDays=(day:string,days:number)=>{const date=new Date(`${day}T12:00:00-03:00`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};

export type TodayNoticesConfig={store:"geral"|"araras"|"rio claro";isAdmin:boolean;canConfirmRead:boolean;members:NoticeMember[]};
export default function Today({name,email,capabilities,defaultUnit,notices=null,meetingCards=null}:{name:string;email?:string;capabilities:TodayCapabilities;defaultUnit:string;notices?:TodayNoticesConfig|null;meetingCards?:ReactNode}){
 const params=useSearchParams();const requested=params.get("unidade");
 const unit=defaultUnit==="todas"&&["rio_claro","araras","todas"].includes(requested||"")?requested!:defaultUnit;
 const [data,setData]=useState<Source>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState<Record<string,boolean>>({orders:capabilities.orders,purchases:capabilities.purchases||Boolean(capabilities.pendingBox),trips:capabilities.trips,people:capabilities.people,agenda:Boolean(capabilities.agenda),estoque:Boolean(capabilities.shortcuts?.estoque)});
 const [reload,setReload]=useState(0);const capabilityKey=JSON.stringify(capabilities);

 useEffect(()=>{let active=true,pending=false;const controller=new AbortController();const caps=JSON.parse(capabilityKey) as TodayCapabilities;
  const run=async()=>{if(pending||document.hidden)return;pending=true;const day=todayKey();const sources:Array<[keyof Source,string]>=[];
   if(caps.orders)sources.push(["orders","/api/pedido-de-compra"]);
   if(caps.purchases||caps.pendingBox)sources.push(["purchases","/api/compras"]);
   // 21/11: Viagens programadas = hoje + próximos 3 dias (pedido da Ciça); o box "Viagens hoje" usa só o dia de hoje.
   if(caps.trips)sources.push(["trips",`/api/motorista-agenda?inicio=${day}&dias=4`]);
   if(caps.shortcuts?.estoque)sources.push(["estoque","/api/estoque"]);
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
 const allOrders=capabilities.ordersMode==="todos";
 const ordersHref=`/dashboard/compras?aba=acompanhar${allOrders?"":"&filtro=atrasados"}&unidade=${unit}`;
 const orders=(data.orders?.pedidosEnviados||[]).filter(order=>allowed(order.unidade)&&(allOrders||order.previsaoEntrega&&order.previsaoEntrega.slice(0,10)<todayKey())).sort((a,b)=>(a.previsaoEntrega||"9").localeCompare(b.previsaoEntrega||"9"));
 // 18/11: boxes Pedidos enviados | Pedidos atrasados (antes os pedidos eram buscados e não apareciam).
 const sentOrders=(data.orders?.pedidosEnviados||[]).filter(order=>allowed(order.unidade));
 const lateOrders=sentOrders.filter(order=>order.previsaoEntrega&&order.previsaoEntrega.slice(0,10)<todayKey());
 const urgent=(data.purchases?.suppliers||[]).filter(item=>item.urgent&&allowed(item.unit));
 // Um motorista só: todas as viagens do dia aparecem, de qualquer empresa.
 const pendingTrip=(trip:Trip)=>!trip.checkoutEm&&!/[Cc]onclu[ií]d|[Ff]inalizad|[Cc]ancelad|[Ee]ntregue/.test(trip.status||"");
 const tripDays=(data.trips?.dias||[]).map(day=>({data:day.data,viagens:(day.viagens||[]).filter(pendingTrip)})).filter(day=>day.viagens.length>0);
 const trips=tripDays.find(day=>day.data===todayKey())?.viagens||[];
 const tripDayLabel=(day:string)=>{const today=todayKey();if(day===today)return "Hoje";if(day===addDays(today,1))return "Amanhã";const text=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(`${day}T12:00:00-03:00`)).replace(".","");return text.charAt(0).toUpperCase()+text.slice(1);};
 // 18/11: acessos de uma loja veem Aniversários e Férias das duas lojas; a gestão filtra pelo seletor.
 const events=(data.people?.events||[]).filter(item=>defaultUnit!=="todas"||allowed(item.unit)||item.unit==="geral");
 const agendaEvents=[...(data.agenda?.events||[])].sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start));
 const agendaIds=new Set(agendaEvents.map(event=>event.id));
 const meetings=(data.people?.meetings||[]).filter(meeting=>!agendaIds.has(meeting.id));
 // Estoque: total = soma das quatro colunas (Em aberto, Relação de compra, A caminho, Chegou nos últimos 7 dias).
 const stockSeven=Date.now()-7*24*60*60*1000;
 const stockCount=(data.estoque?.necessidades||[]).filter(need=>allowed(need.unidade)&&(["pendente","observacao","consulta","em_compra","pedido_existente"].includes(need.status)||(need.status==="chegou"&&Date.parse(need.chegouEm)>=stockSeven))).length;
 const agendaTitle=capabilities.agenda==="principal"?"Agenda Ciça":"Agenda CT";
 const agendaHref=capabilities.agenda==="principal"?"/agenda?view=minha":"/agenda?view=loja";


 const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",hour:"2-digit",hour12:false}).format(new Date()));
 // Tela Hoje v2 (acessos com Compras/Pedidos): contadores = cards do Trello por coluna.
 const allPending=(data.purchases?.suppliers||[]).filter(item=>allowed(item.unit));
 // 21/11: Ciça vê o box "Pedidos a fazer" no lugar de "Viagens hoje"; as listas de Compras seguem só para quem tem o bloco Compras.
 const pending=capabilities.purchases?allPending:[];
 const toDoCount=unit==="todas"?(data.purchases?.summary?.pedidosParaFazer??allPending.length):allPending.length;
 // Dois blocos: atrasados (urgentes) e a fazer (demais).
 const pedidosAtrasados=pending.filter(item=>item.urgent);
 const pedidosAFazer=pending.filter(item=>!item.urgent);
 const summary=capabilities.purchases?data.purchases?.summary:undefined;
 const pendingCount=unit==="todas"?(summary?.pedidosParaFazer??pending.length):pending.length;
 useEffect(()=>{window.dispatchEvent(new CustomEvent("ct-pending-counts",{detail:{compras:pendingCount,motorista:trips.length,agenda:agendaEvents.length+meetings.length}}));},[pendingCount,trips.length,agendaEvents.length,meetings.length]);
 const sentRC=unit==="araras"?0:(summary?.enviadosRioClaro??0);
 const sentAR=unit==="rio_claro"?0:(summary?.enviadosAraras??0);
 const cards=[
  {key:"purchases",value:pendingCount,label:"Pedidos pendentes",href:`/dashboard/compras?aba=montar&unidade=${unit}`,tone:"urgent"},
  ...(unit!=="araras"||capabilities.comprasEnviadosTodas?[{key:"purchases",value:sentRC,label:"Enviados Rio Claro",href:"/dashboard/compras?aba=acompanhar&unidade=rio_claro",tone:"normal"}]:[]),
  ...(unit!=="rio_claro"||capabilities.comprasEnviadosTodas?[{key:"purchases",value:sentAR,label:"Enviados Araras",href:"/dashboard/compras?aba=acompanhar&unidade=araras",tone:"normal"}]:[]),
 ].filter(()=>capabilities.purchases);
 const waiting=(key:keyof Source)=>loading[key]&&!data[key];
 // Acessos operacionais (sem Compras e sem Pedidos, ex.: Caixa, Estoque) usam o layout da Bruna:
 // topo = cards Viagens (+ Agendar) e Agenda ao lado dos Comunicados; embaixo = lista de Viagens + Aniversários/Férias.
 const operational=!capabilities.orders&&!capabilities.purchases;
 const agendaCount=agendaEvents.length+meetings.length;
 // 18/11 (opção A da Ciça): box "Viagens hoje", igual aos demais; o agendamento fica no Motorista (Nova viagem).
 const tripsCard=capabilities.trips&&<Link href={`/dashboard/motorista?data=${todayKey()}`} className="ct-clean-metric ct-clean-normal"><strong>{waiting("trips")?"–":trips.length}</strong><span>Viagens hoje</span></Link>;
 const agendaCard=capabilities.agenda&&<Link href={agendaHref} className="ct-clean-metric ct-clean-normal"><strong>{waiting("agenda")?"–":agendaCount}</strong><span>{capabilities.agenda==="principal"?"Compromissos hoje":"Agenda CT hoje"}</span></Link>;
 // 23/11 (Ciça): a mesma lista vira o card "Agenda Motorista" no lugar de "Pedidos a fazer".
 const renderTrips=(title:string,linkLabel:string,extra="")=>capabilities.trips&&<section className={`ct-clean-card${extra}`}><div className="ct-clean-card-heading"><h2>{title}</h2><Link href={`/dashboard/motorista?data=${todayKey()}`}>{linkLabel}</Link></div>
  {waiting("trips")&&<p className="ct-clean-muted">Carregando…</p>}
  {!waiting("trips")&&!tripDays.length&&<p className="ct-clean-muted">Nenhuma viagem programada até {tripDayLabel(addDays(todayKey(),3)).toLowerCase()}.</p>}
  {tripDays.map(day=><div className="ct-trips-day" key={day.data}><h3>{tripDayLabel(day.data)}</h3>{day.viagens.map((trip,index)=>{const bloqueio=trip.tipoHorario==="Bloqueio";const hora=trip.horario?(trip.horarioFim?`${trip.horario.slice(0,5)}–${trip.horarioFim.slice(0,5)}`:trip.horario.slice(0,5)):`${(Number.isFinite(trip.ordem)?Number(trip.ordem):index)+1}ª`;const texto=bloqueio?"Motorista bloqueado":[trip.clienteFornecedor,trip.numeroPedido?`NF ${trip.numeroPedido}`:"",trip.loja].filter(Boolean).join(" · ")||"Viagem sem cliente informado";return <Link className="ct-clean-calendar-row" key={trip.id||index} href={`/dashboard/motorista?data=${day.data}`}><b>{hora}</b><span>{texto}</span></Link>;})}</div>)}
 </section>;
 const tripsList=renderTrips("Viagens programadas","Ver agenda");
 const peopleBlock=events.length>0&&<section className="ct-clean-card">
  {["birthday","vacation"].map(kind=>{const list=events.filter(event=>event.kind===kind);return list.length?<div className="ct-clean-people-group" key={kind}><h2>{kind==="birthday"?"Aniversários":"Férias"}</h2>{list.map(event=><div key={event.id} className="ct-clean-calendar-row"><b>{formatDate(event.date)}</b><span>{event.name}{kind==="vacation"&&event.end?` · até ${formatDate(event.end)}`:""}</span></div>)}</div>:null;})}
 </section>;
 // 18/11: Estoque virou box na linha de boxes; o atalho solto saiu.
 const shortcutItems=[capabilities.shortcuts?.equipe&&{href:"/colaboradores",label:"Equipe"},capabilities.shortcuts?.vendas&&{href:"/dashboard/leads",label:"Vendas Internas"}].filter(Boolean) as Array<{href:string;label:string}>;
 const shortcuts=shortcutItems.length>0&&<nav className="ct-today-shortcuts" aria-label="Atalhos">{shortcutItems.map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>;
 const anyBlock=Boolean(notices)||Boolean(capabilities.agenda)||orders.length>0||urgent.length>0||pending.length>0||events.length>0;

 return <div className="ct-clean-today ct-today-azul">
  <header className="ct-clean-today-heading"><p>{new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long"}).format(new Date())}</p>{/* Acessos compartilhados de vendedores: saudação sem nome. */}<h1>{hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite"}{name?`, ${name}.`:"!"}</h1>{email&&<small className="ct-clean-today-email">{email}</small>}</header>
  {operational?<>
   <div className={`ct-today-op-top${notices?"":" no-notices"}`}>
    <div className="ct-today-op-cards">{tripsCard}{agendaCard}{capabilities.shortcuts?.estoque&&<Link href={`/dashboard/estoque?unidade=${unit}`} className="ct-clean-metric ct-clean-normal"><strong>{waiting("estoque")?"–":stockCount}</strong><span>Estoque</span></Link>}</div>
    {notices&&<TodayNotices store={notices.store} isAdmin={notices.isAdmin} canConfirmRead={notices.canConfirmRead} members={notices.members}/>}
   </div>
   {shortcuts}
   {/* 18/11: Reuniões também no Hoje dos acessos operacionais (ex.: Caixa). */}
   {meetingCards}
   <div className="ct-today-layout">
    <div className="ct-today-main">{tripsList}</div>
    <aside className="ct-today-side">{peopleBlock}</aside>
   </div>
  </>:<>
  {false&&<section className="ct-clean-metrics ct-today-v2-metrics" aria-label="Prioridades do dia">{cards.map(card=><Link key={card.label} href={card.href} className={`ct-clean-metric ct-clean-${card.tone}`}><strong>{waiting("purchases")?"…":card.value}</strong><span>{card.label}</span></Link>)}{capabilities.shortcuts?.estoque&&<Link href="/dashboard/estoque" className="ct-clean-metric ct-clean-normal"><strong>→</strong><span>Estoque</span></Link>}</section>}
  {shortcuts}
  {Object.keys(errors).length>0&&<div className="ct-clean-source-notice" role="status"><span>Algumas informações não puderam ser atualizadas. Os dados já carregados foram preservados.</span><button type="button" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>}

  {/* 18/11: boxes no padrão dos contadores — Motorista | Pedidos enviados | Pedidos atrasados, conforme a permissão. */}
  {(capabilities.pendingBox||capabilities.trips||capabilities.orders||capabilities.purchases||capabilities.shortcuts?.estoque)&&<section className="ct-clean-metrics ct-today-boxes" aria-label="Resumo do dia">
   {/* 21/11 (Ciça): boxes Pedidos a fazer | Pedidos enviados (em andamento) | Pedidos atrasados, cada um pela sua permissão; no acesso dela, Pedidos a fazer ocupa o lugar de Viagens hoje. */}
   {/* 23/11 (Ciça): contador Motorista (viagens de hoje) volta para o acesso dela, ao lado de Pedidos a fazer. */}
   {tripsCard}
   {(capabilities.purchases||capabilities.pendingBox)&&<Link href={`/dashboard/compras?aba=montar&unidade=${unit}`} className="ct-clean-metric ct-clean-normal"><strong>{waiting("purchases")?"–":toDoCount}</strong><span>Pedidos a fazer</span></Link>}
   {/* Demais acessos com Compras seguem só com "Pedidos a fazer" (regra de 18/11). */}
   {capabilities.orders&&allOrders&&(!capabilities.purchases||capabilities.pendingBox)&&<Link href={`/dashboard/compras?aba=acompanhar&unidade=${unit}`} className="ct-clean-metric ct-clean-normal"><strong>{waiting("orders")?"–":sentOrders.length}</strong><span>Pedidos enviados</span></Link>}
   {capabilities.orders&&<Link href={`/dashboard/compras?aba=acompanhar&filtro=atrasados&unidade=${unit}`} className={`ct-clean-metric ${lateOrders.length?"ct-clean-late":"ct-clean-normal"}`}><strong>{waiting("orders")?"–":lateOrders.length}</strong><span>Pedidos atrasados</span></Link>}
   {capabilities.shortcuts?.estoque&&<Link href={`/dashboard/estoque?unidade=${unit}`} className="ct-clean-metric ct-clean-normal"><strong>{waiting("estoque")?"–":stockCount}</strong><span>Estoque</span></Link>}
  </section>}
  {/* Duas colunas independentes: cada bloco sobe logo abaixo do anterior, sem espaço vazio. */}
  {/* Tela Hoje v2: esquerda = Agenda + Aniversários/Férias; direita = Comunicados + Pedidos pendentes. */}
  <div className={`ct-today-layout ct-today-v2${capabilities.agenda||events.length>0?"":" ct-no-side"}`}>
   <aside className="ct-today-side">
   {capabilities.trips&&<div className="ct-trips-v2">{tripsList}</div>}
   {capabilities.agenda&&<section className={`ct-clean-card ct-tone-card ${agendaTitle==="Agenda CT"?"ct-tone-blue":"ct-tone-purple"} ct-m-order-1`}><div className="ct-clean-card-heading"><h2>{agendaTitle}</h2><Link href={agendaHref}>Abrir agenda</Link></div>
    {waiting("agenda")&&<p className="ct-clean-muted">Carregando…</p>}
    {!waiting("agenda")&&!agendaEvents.length&&!meetings.length&&<p className="ct-clean-muted">Nenhum compromisso hoje.</p>}
    {agendaEvents.map(event=><Link className={`ct-clean-calendar-row${event.completed?" opacity-40":""}`} key={event.id} href={agendaHref}><b>{event.allDay?"Dia":formatTime(event.start)}</b><span>{event.summary||"(sem título)"}</span></Link>)}
    {meetings.map(meeting=><Link className="ct-clean-calendar-row" key={meeting.id} href="/dashboard/reunioes"><b>{meeting.time}</b><span>{meeting.title}</span></Link>)}
   </section>}
   {["birthday","vacation"].map(kind=>{const list=events.filter(event=>event.kind===kind);return list.length?<section key={kind} className={`ct-clean-card ct-tone-card ${kind==="birthday"?"ct-tone-green ct-m-order-3":"ct-tone-yellow ct-m-order-4"}`}><div className="ct-clean-people-group"><h2>{kind==="birthday"?"Aniversários":"Férias"}</h2>{list.map(event=><div key={event.id} className="ct-clean-calendar-row"><b>{formatDate(event.date)}</b><span>{event.name}{kind==="vacation"&&event.end?` · até ${formatDate(event.end)}`:""}</span></div>)}</div></section>:null;})}
   {/* 24/11 (Ciça): Agenda Motorista desce para baixo de Férias, na coluna da esquerda. */}
   {capabilities.pendingBox&&capabilities.trips&&renderTrips("Agenda Motorista","Ver todos"," ct-m-order-6")}
   </aside>
   <div className="ct-today-main">
   {notices&&<TodayNotices store={notices.store} isAdmin={notices.isAdmin} canConfirmRead={notices.canConfirmRead} members={notices.members}/>}
   {meetingCards}
   {/* 24/11 (Ciça): no acesso dela, "Pedidos atrasados" vira "Pedidos a fazer" — todos os pendentes, com etiqueta Urgente do Trello primeiro. */}
   {capabilities.pendingBox&&pending.length>0&&<section className="ct-clean-card ct-m-order-5"><div className="ct-clean-card-heading"><h2>Pedidos a fazer</h2><Link href={`/dashboard/compras?aba=montar&unidade=${unit}`}>Ver todos ({pending.length})</Link></div>
    {[...pending].sort((a,b)=>Number(b.urgent)-Number(a.urgent)).map(item=><div className="ct-clean-action-row" key={item.id}><strong>{item.name}</strong>{item.urgent&&<span className="ct-clean-badge ct-clean-urgent">Urgente</span>}<Link className="ct-clean-action" href={`/dashboard/compras?aba=montar&fornecedor=${item.id}&unidade=${unit}`}>Fazer pedido</Link></div>)}
   </section>}
   {!capabilities.pendingBox&&pedidosAtrasados.length>0&&<section className="ct-clean-card ct-m-order-5"><div className="ct-clean-card-heading"><h2>Pedidos atrasados</h2><Link href={`/dashboard/compras?aba=montar&unidade=${unit}`}>Ver todos ({pedidosAtrasados.length})</Link></div>
    {pedidosAtrasados.map(item=><div className="ct-clean-action-row" key={item.id}><strong>{item.name}</strong><span className="ct-clean-badge ct-clean-urgent">Urgente</span><Link className="ct-clean-action" href={`/dashboard/compras?aba=montar&fornecedor=${item.id}&unidade=${unit}`}>Fazer pedido</Link></div>)}
   </section>}
   {!capabilities.pendingBox&&pedidosAFazer.length>0&&<section className="ct-clean-card ct-m-order-6"><div className="ct-clean-card-heading"><h2>Pedidos a fazer</h2><Link href={`/dashboard/compras?aba=montar&unidade=${unit}`}>Ver todos ({pedidosAFazer.length})</Link></div>
    {pedidosAFazer.map(item=><div className="ct-clean-action-row" key={item.id}><strong>{item.name}</strong><Link className="ct-clean-action" href={`/dashboard/compras?aba=montar&fornecedor=${item.id}&unidade=${unit}`}>Fazer pedido</Link></div>)}
   </section>}
   </div>
  </div>
  </>}
  {!anyBlock&&!cards.length&&!Object.values(loading).some(Boolean)&&!Object.keys(errors).length&&<p className="ct-clean-empty">Nenhuma ação pendente para seu acesso agora.</p>}
 </div>;
}
