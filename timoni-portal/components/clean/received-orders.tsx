"use client";
import {useEffect,useState} from "react";

type ReceivedOrder={id:string;nome:string;unidade:string|null;data:string|null};

// Rio Claro à esquerda, Araras à direita (18/11). Linhas sem borda.
const COLUMNS=[
 {key:"rio_claro",label:"Rio Claro",ink:"text-[#166534]"},
 {key:"araras",label:"Araras",ink:"text-[#854f0b]"},
] as const;

export default function ReceivedOrders(){
 const[orders,setOrders]=useState<ReceivedOrder[]|null>(null);
 const[error,setError]=useState("");
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/compras/recebidos?unidade=todas",{signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);setOrders(data.orders);})
   .catch(caught=>{if(!controller.signal.aborted)setError(caught.message);});
  return()=>controller.abort();
 },[]);
 return <section className="ct-compras-tab ct-clean-card">
  <div className="ct-clean-card-heading"><h2>Pedidos recebidos</h2><span className="text-base max-md:text-[12.5px] text-slate-500">Últimos 7 dias</span></div>
  {error&&<p role="status" className="ct-notice-error">{error}</p>}
  {!orders&&!error&&<p role="status" className="text-base max-md:text-[12.5px] text-slate-500">Carregando recebidos…</p>}
  {orders&&<div className="mt-4 grid gap-5 lg:grid-cols-2">
   {COLUMNS.map(column=>{
    const list=orders.filter(order=>order.unidade===column.key);
    return <div key={column.key} className="min-w-0">
     <h3 className={`text-lg max-md:text-[14px] font-semibold ${column.ink}`}>{column.label} · {list.length}</h3>
     <div className="mt-2 grid gap-2">
      {list.map(order=><div key={order.id} className="ct-row rounded-xl bg-white px-3 py-2 md:flex md:items-center md:justify-between md:gap-3">
       <strong className="block break-words text-lg max-md:text-[14px] text-[#182443]">{order.nome}</strong>
       <small className="ct-row-line2 block shrink-0 text-base max-md:text-[12.5px] text-slate-500">Concluído em {order.data?new Date(order.data).toLocaleDateString("pt-BR"):"data não informada"}</small>
      </div>)}
     </div>
     {list.length===0&&<p className="mt-2 text-base max-md:text-[12.5px] text-slate-500">Nenhum pedido recebido nos últimos 7 dias.</p>}
    </div>;
   })}
  </div>}
 </section>;
}
