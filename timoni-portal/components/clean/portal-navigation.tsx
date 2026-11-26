"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PortalIcon, {type PortalIconName} from "@/components/portal-icon";
import {activeNavigation,type CleanNavItem} from "@/lib/clean-navigation";
import UpdateButton from "@/components/update-button";
const Search = dynamic(()=>import("./portal-search"),{ssr:false});
const icons:Record<string,PortalIconName>={hoje:"home",estoque:"stock",compras:"cart",motorista:"truck",agenda:"calendar",reunioes:"calendar",comercial:"leads",equipe:"team"};
export default function PortalNavigation({items,name,initials,units,settings,actions,identity,searchModules,pinOption=false}:{items:CleanNavItem[];name:string;initials:string;units:string[];settings:boolean;actions:React.ReactNode;identity:string;searchModules:string[];pinOption?:boolean}) {
 const pathname=usePathname(),router=useRouter(),params=useSearchParams();
 const [search,setSearch]=useState(false),[profile,setProfile]=useState(false);
 // 26/11/2026: só os acessos da Ciça (computador) podem esconder/mostrar o menu lateral; a escolha fica salva no navegador.
 const [pinned,setPinned]=useState(true);
 useEffect(()=>{try{if(pinOption&&window.localStorage.getItem("portalTimoniMenuFixo")==="nao")setPinned(false);}catch{}},[pinOption]);
 function togglePinned(){setPinned(value=>{const next=!value;try{window.localStorage.setItem("portalTimoniMenuFixo",next?"sim":"nao");}catch{}return next;});}
 const menuToggle=pinOption&&<button type="button" className="ct-clean-menu-toggle" aria-pressed={!pinned} aria-label={pinned?"Esconder menu":"Mostrar menu"} title={pinned?"Esconder menu":"Mostrar menu"} onClick={togglePinned}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>;
 const requested=params.get("unidade")||"todas";
 const unit=units.includes(requested)?requested:units.length>1?"todas":units[0];
 const active=activeNavigation(pathname);
 // Agenda da loja já mostra as duas lojas: o seletor de unidade não aparece nessa aba.
 const onAgendaLoja=pathname.startsWith("/agenda")&&params.get("view")==="loja";
 const [counts,setCounts]=useState<Record<string,number>>({});
 useEffect(()=>{const onCounts=(e:Event)=>setCounts((e as CustomEvent<Record<string,number>>).detail||{});window.addEventListener("ct-pending-counts",onCounts);return()=>window.removeEventListener("ct-pending-counts",onCounts);},[identity]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearch(value=>!value);}if(event.key==="Escape"){setSearch(false);setProfile(false);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
 useEffect(()=>{setProfile(false);},[pathname]);
 function changeUnit(value:string){if(!units.includes(value)&&!(value==="todas"&&units.length>1))return;const next=new URLSearchParams(params.toString());next.set("unidade",value);router.replace(`${pathname}?${next}`,{scroll:false});window.localStorage.setItem("portalTimoniStoreView",value);window.dispatchEvent(new CustomEvent("portal-store-view-change",{detail:value}));}
 const nav=(item:CleanNavItem)=> <Link key={item.key} href={item.href+(unit?`?unidade=${unit}`:"")} aria-current={active===item.key?"page":undefined} className="ct-clean-nav-link"><PortalIcon name={icons[item.key]} className="h-[18px] w-[18px]"/><span>{item.label}</span>{counts[item.key]>0&&<small aria-label={`${counts[item.key]} pendências`}>{counts[item.key]}</small>}</Link>;
 // Menu inferior fixo em todas as páginas no celular (decisão 18/11/2026).
 return <div className={`ct-clean-navigation${pinOption&&!pinned?" ct-menu-oculto":""}`}>
  <header className="ct-clean-top">{menuToggle}<Link href="/dashboard" aria-label="Casa Timoni — Hoje" className="ct-clean-brand"><Image src="/brand/CasaTimoni_horizontal_azul.svg" width={140} height={28} alt="Casa Timoni" priority/></Link>
   <button type="button" className="ct-clean-search-trigger" aria-label="Buscar no Portal" onClick={()=>setSearch(true)}><span>Buscar</span><PortalIcon name="search" className="h-4 w-4"/></button>
   {!onAgendaLoja&&<div className={`ct-clean-unit${units.length>1?" ct-clean-unit-multi":""}`} role="group" aria-label="Unidade">{[...units,...(units.length>1?["todas"]:[])].map(value=><button key={value} type="button" aria-pressed={unit===value} disabled={units.length===1} onClick={()=>changeUnit(value)}>{value==="rio_claro"?"Rio Claro":value==="araras"?"Araras":"Todas"}</button>)}</div>}
   <div className="ct-clean-top-actions"><UpdateButton/>{actions}</div>
   <div className="ct-clean-profile"><button type="button" aria-label="Menu do usuário" aria-expanded={profile} aria-controls="ct-clean-profile-menu" onClick={()=>setProfile(value=>!value)}>{initials}</button>{profile&&<div id="ct-clean-profile-menu" className="ct-clean-profile-menu"><strong>{name}</strong><small className="ct-clean-profile-email">{identity}</small><nav aria-label="Menu do usuário">{items.filter(i=>["comercial","equipe"].includes(i.key)).map(nav)}{settings&&<Link href="/configuracoes">Configurações</Link>}<Link href="/login" prefetch={false}>Minha conta</Link></nav></div>}</div>
  </header>
  <aside className="ct-clean-sidebar"><nav aria-label="Menu principal">{items.map(nav)}</nav>
  </aside>
  <nav className="ct-clean-bottom" aria-label="Menu do celular">{items.filter(i=>["hoje","estoque","compras","motorista","agenda"].includes(i.key)).map(nav)}</nav>
  <div className={`ct-clean-spacer${units.length>1?" ct-clean-spacer-units":""}`} aria-hidden="true"/>
  {search&&<Search items={items} unit={unit} modules={searchModules} close={()=>setSearch(false)}/>}
 </div>;
}
