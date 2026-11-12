"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";

type Unit="geral"|"araras"|"rio claro";
type Notice={id:string;createdAt:string;unit:Unit;title:string;message:string;status:"ativo"|"arquivado";startsAt:string;expiresAt:string;imageDataUrl?:string};
type Reader={employee:string;unit:string;readAt:string};
export type NoticeMember={name:string;unit:string};

const SCOPE_LABEL:Record<Unit,string>={geral:"Geral · Araras + Rio Claro",araras:"Araras","rio claro":"Rio Claro"};
const fmtDate=(value:string)=>value?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"}).format(new Date(value)):"";
const fmtDateTime=(value:string)=>value?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"";
function withinEnd(value:string,now=Date.now()){if(!value)return true;const date=new Date(value);if(Number.isNaN(date.getTime()))return false;const [y,m,d]=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date).split("-").map(Number);return now<Date.UTC(y,m-1,d+1,3);}

/**
 * Comunicados na tela Hoje: um card por loja (Geral · Araras + Rio Claro, Araras ou Rio Claro),
 * em lista, um abaixo do outro. Só o mais recente de cada destino fica visível; os anteriores
 * vão para Arquivados. Passado o prazo final, arquiva (não apaga) e pode ser reativado.
 * Carimbo: "Pendente" em vermelho; some quando todos confirmarem.
 */
export default function TodayNotices({store,isAdmin,canConfirmRead,members}:{store:Unit;isAdmin:boolean;canConfirmRead:boolean;members:NoticeMember[]}){
 const [items,setItems]=useState<Notice[]>([]),[completed,setCompleted]=useState<string[]>([]),[unsigned,setUnsigned]=useState<string[]>([]),[readers,setReaders]=useState<Record<string,Reader[]>>({});
 const [open,setOpen]=useState(""),[employee,setEmployee]=useState(""),[busy,setBusy]=useState(""),[feedback,setFeedback]=useState<{id:string;text:string;ok:boolean}|null>(null),[error,setError]=useState(""),[showArchived,setShowArchived]=useState(false),[loaded,setLoaded]=useState(false),[image,setImage]=useState("");

 const load=useCallback(async()=>{try{
  const [noticesResponse,readsResponse]=await Promise.all([fetch("/api/comunicados",{cache:"no-store"}),fetch("/api/avisos-leituras",{cache:"no-store"})]);
  const notices=await noticesResponse.json();if(!noticesResponse.ok)throw Error(notices?.error||"Não foi possível carregar os comunicados.");
  setItems(Array.isArray(notices.items)?notices.items:[]);
  const reads=await readsResponse.json().catch(()=>({}));
  if(readsResponse.ok){setCompleted(Array.isArray(reads.completedAvisoIds)?reads.completedAvisoIds:[]);setUnsigned(Array.isArray(reads.noAudienceAvisoIds)?reads.noAudienceAvisoIds:[]);setReaders(reads.readersByAviso||{});}
  setError("");
 }catch(err){setError(err instanceof Error?err.message:"Não foi possível carregar os comunicados.");}finally{setLoaded(true);}},[]);
 useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener("comunicados:changed",refresh);window.addEventListener("avisos:read-changed",refresh);return()=>{window.removeEventListener("comunicados:changed",refresh);window.removeEventListener("avisos:read-changed",refresh);};},[load]);

 const now=Date.now();
 const sorted=useMemo(()=>[...items].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[items]);
 const liveActive=useMemo(()=>sorted.filter(item=>item.status==="ativo"&&(!item.startsAt||Date.parse(item.startsAt)<=now)&&withinEnd(item.expiresAt,now)),[sorted,now]);
 // Um comunicado vigente por destino: o mais recente. Os demais vão para Arquivados (reativáveis).
 const shown=useMemo(()=>{const seen=new Set<Unit>();const list:Notice[]=[];for(const item of liveActive){if(seen.has(item.unit))continue;seen.add(item.unit);list.push(item);}return list;},[liveActive]);
 const shownIds=useMemo(()=>new Set(shown.map(item=>item.id)),[shown]);
 // Loja comum vê o geral e o da própria loja; o Geral aparece uma única vez.
 const visible=shown.filter(item=>store==="geral"||item.unit===store||item.unit==="geral");
 const archived=useMemo(()=>isAdmin?sorted.filter(item=>!shownIds.has(item.id)||item.status==="arquivado"||!withinEnd(item.expiresAt,now)):[],[sorted,shownIds,isAdmin,now]);

 async function changeStatus(id:string,activate:boolean){setBusy(id);setError("");try{const response=await fetch("/api/comunicados",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:activate?"activate":"archive"})});const data=await response.json();if(!response.ok)throw Error(data?.error||"Não foi possível alterar.");await load();setOpen("");}catch(err){setError(err instanceof Error?err.message:"Não foi possível alterar.");}finally{setBusy("");}}
 async function confirmRead(item:Notice,pool:NoticeMember[]){
  const selected=pool.length===1?pool[0]:pool.find(member=>`${member.unit}::${member.name}`===employee);
  if(!selected){setFeedback({id:item.id,text:"Selecione seu nome.",ok:false});return;}
  setBusy(item.id);setFeedback(null);
  try{const response=await fetch("/api/avisos-leituras",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"read",avisoId:item.id,title:item.title,employee:selected.name,unit:selected.unit})});const data=await response.json();if(!response.ok)throw Error(data?.error||"Não foi possível registrar a leitura.");
   setFeedback({id:item.id,text:data.alreadyRegistered?"Sua leitura já estava registrada.":"Leitura registrada.",ok:true});setEmployee("");await load();window.dispatchEvent(new Event("avisos:read-changed"));
  }catch(err){setFeedback({id:item.id,text:err instanceof Error?err.message:"Não foi possível registrar a leitura.",ok:false});}finally{setBusy("");}
 }
 function membersFor(unit:Unit){return unit==="geral"?members:members.filter(member=>member.unit===(unit==="araras"?"Araras":"Rio Claro"));}
 function toggle(key:string){setOpen(current=>current===key?"":key);setFeedback(null);setEmployee("");}

 const row=(item:Notice,inArchive=false)=>{const signed=completed.includes(item.id);const key=item.id;const isOpen=open===key;const pool=membersFor(item.unit);const list=readers[item.id]||[];
  const pending=!inArchive&&!signed&&!unsigned.includes(item.id);
  return <li key={item.id} className={`ct-notice${isOpen?" is-open":""}`}>
   <button type="button" className="ct-notice-row" aria-expanded={isOpen} onClick={()=>toggle(key)}>
    <span className="ct-notice-date">{fmtDate(item.createdAt)}</span>
    <span className="ct-notice-title"><small className="ct-notice-scope">{SCOPE_LABEL[item.unit]}</small>{item.title}</span>
    {pending&&<span className="ct-notice-stamp is-pending">Pendente</span>}
   </button>
   {isOpen&&<div className="ct-notice-body">
    <p>{item.message}</p>
    {item.imageDataUrl&&<button type="button" className="ct-notice-image" onClick={()=>setImage(item.imageDataUrl!)} aria-label="Ampliar imagem"><img src={item.imageDataUrl} alt={`Imagem do comunicado ${item.title}`}/></button>}
    {item.expiresAt&&<small className="ct-clean-muted">Prazo final: {fmtDate(item.expiresAt)}</small>}
    {!inArchive&&canConfirmRead&&pool.length>0&&<div className="ct-notice-confirm">
     {pool.length>1&&<label>Seu nome<select value={employee} onChange={event=>setEmployee(event.target.value)}><option value="">Selecione</option>{pool.map(member=><option key={`${member.unit}-${member.name}`} value={`${member.unit}::${member.name}`}>{member.name}</option>)}</select></label>}
     <button type="button" className="ct-clean-action" disabled={busy===item.id} onClick={()=>void confirmRead(item,pool)}>{busy===item.id?"Registrando…":"Li e estou ciente"}</button>
    </div>}
    {feedback?.id===item.id&&<p className={feedback.ok?"ct-notice-ok":"ct-notice-error"}>{feedback.text}</p>}
    {isAdmin&&<details className="ct-notice-admin"><summary>Quem leu ({list.length}) e opções</summary>
     {list.length?<ul>{list.map(reader=><li key={`${reader.unit}-${reader.employee}`}><b>{reader.employee}</b> · {reader.unit} · {fmtDateTime(reader.readAt)}</li>)}</ul>:<p className="ct-clean-muted">Ninguém confirmou ainda.</p>}
     <div className="ct-notice-admin-actions">
      <Link href="/colaboradores#comunicados">Editar</Link>
      {inArchive?(item.status==="arquivado"&&withinEnd(item.expiresAt)?<button type="button" disabled={busy===item.id} onClick={()=>void changeStatus(item.id,true)}>Reativar</button>:<Link href="/colaboradores#comunicados">Reativar (ajustar prazo)</Link>)
       :<button type="button" disabled={busy===item.id} onClick={()=>void changeStatus(item.id,false)}>Arquivar</button>}
     </div>
    </details>}
    <button type="button" className="ct-notice-close" onClick={()=>toggle(key)}>Fechar</button>
   </div>}
  </li>;};

 return <section className="ct-clean-card ct-today-notices" aria-label="Comunicados">
  <div className="ct-clean-card-heading"><h2>Comunicados</h2>{isAdmin&&<Link href="/colaboradores#comunicados">+ Novo</Link>}</div>
  {error&&<p className="ct-notice-error">{error}</p>}
  {!loaded?<p className="ct-clean-muted">Carregando…</p>:visible.length?<ul className="ct-notice-list">{visible.map(item=>row(item,false))}</ul>:<p className="ct-clean-muted">Nenhum comunicado.</p>}
  {isAdmin&&archived.length>0&&<div className="ct-notice-archive"><button type="button" onClick={()=>setShowArchived(value=>!value)} aria-expanded={showArchived}>{showArchived?"Ocultar arquivados":`Arquivados (${archived.length})`}</button>{showArchived&&<ul>{archived.map(item=>row(item,true))}</ul>}</div>}
  {image&&<div className="ct-notice-lightbox" onClick={()=>setImage("")}><button type="button" aria-label="Fechar imagem" onClick={()=>setImage("")}>✕</button><img src={image} alt="Imagem do comunicado ampliada" onClick={event=>event.stopPropagation()}/></div>}
 </section>;
}
