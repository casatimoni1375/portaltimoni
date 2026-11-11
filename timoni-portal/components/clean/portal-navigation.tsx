"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PortalIcon, {type PortalIconName} from "@/components/portal-icon";
import {activeNavigation,type CleanNavItem} from "@/lib/clean-navigation";
const Search = dynamic(()=>import("./portal-search"),{ssr:false});
const icons:Record<string,PortalIconName>={hoje:"home",estoque:"stock",compras:"cart",motorista:"truck",agenda:"calendar",comercial:"leads",equipe:"team"};
export default function PortalNavigation({items,name,initials,units,settings,actions,identity,searchModules}:{items:CleanNavItem[];name:string;initials:string;units:string[];settings:boolean;actions:React.ReactNode;identity:string;searchModules:string[]}) {
 const pathname=usePathname(),router=useRouter(),params=useSearchParams();
 const [search,setSearch]=useState(false),[profile,setProfile]=useState(false);
 const requested=params.get("unidade")||"todas";
 const unit=units.includes(requested)?requested:units.length>1?"todas":units[0];
 const active=activeNavigation(pathname);
 const [counts,setCounts]=useState<Record<string,number>>({});
 useEffect(()=>{const onCounts=(e:Event)=>setCounts((e as CustomEvent<Record<string,number>>).detail||{});window.addEventListener("ct-pending-counts",onCounts);return()=>window.removeEventListener("ct-pending-counts",onCounts);},[identity]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearch(value=>!value);}if(event.key==="Escape"){setSearch(false);setProfile(false);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
 useEffect(()=>{setProfile(false);},[pathname]);
 function changeUnit(value:string){if(!units.includes(value)&&!(value==="todas"&&units.length>1))return;const next=new URLSearchParams(params.toString());next.set("unidade",value);router.replace(`${pathname}?${next}`,{scroll:false});window.localStorage.setItem("portalTimoniStoreView",value);window.dispatchEvent(new CustomEvent("portal-store-view-change",{detail:value}));}
 const nav=(item:CleanNavItem)=> <Link key={item.key} href={item.href+(unit?`?unidade=${unit}`:"")} aria-current={active===item.key?"page":undefined} className="ct-clean-nav-link"><PortalIcon name={icons[item.key]} className="h-[18px] w-[18px]"/><span>{item.label}</span>{counts[item.key]>0&&<small aria-label={`${counts[item.key]} pendências`}>{counts[item.key]}</small>}</Link>;
 return <div className="ct-clean-navigation">
  <header className="ct-clean-top"><Link href="/dashboard" aria-label="Casa Timoni — Hoje" className="ct-clean-brand"><Image src="/brand/CasaTimoni_horizontal_azul.svg" width={140} height={28} alt="Casa Timoni" priority/></Link>
   <button type="button" className="ct-clean-search-trigger" aria-label="Buscar no Portal" onClick={()=>setSearch(true)}><span>Buscar pedido, fornecedor, produto, lead ou pessoa</span><PortalIcon name="search" className="h-4 w-4"/><kbd>Ctrl K</kbd></button>
   <div className={`ct-clean-unit${units.length>1?" ct-clean-unit-multi":""}`} role="group" aria-label="Unidade">{[...units,...(units.length>1?["todas"]:[])].map(value=><button key={value} type="button" aria-pressed={unit===value} disabled={units.length===1} onClick={()=>changeUnit(value)}>{value==="rio_claro"?"Rio Claro":value==="araras"?"Araras":"Todas"}</button>)}</div>
   <div className="ct-clean-top-actions">{actions}</div>
   <div className="ct-clean-profile"><button type="button" aria-label="Menu do usuário" aria-expanded={profile} aria-controls="ct-clean-profile-menu" onClick={()=>setProfile(value=>!value)}>{initials}</button>{profile&&<div id="ct-clean-profile-menu" className="ct-clean-profile-menu"><strong>{name}</strong><small className="ct-clean-profile-email">{identity}</small><nav aria-label="Menu do usuário">{items.filter(i=>["comercial","equipe"].includes(i.key)).map(nav)}{settings&&<Link href="/configuracoes">Configurações</Link>}<Link href="/login" prefetch={false}>Minha conta</Link></nav></div>}</div>
  </header>
  <aside className="ct-clean-sidebar"><nav aria-label="Menu principal">{items.map(nav)}</nav></aside>
  <nav className="ct-clean-bottom" aria-label="Menu do celular">{items.filter(i=>["hoje","estoque","compras","motorista","agenda"].includes(i.key)).map(nav)}</nav>
  <div className={`ct-clean-spacer${units.length>1?" ct-clean-spacer-units":""}`} aria-hidden="true"/>
  {search&&<Search items={items} unit={unit} modules={searchModules} close={()=>setSearch(false)}/>}
 </div>;
}
