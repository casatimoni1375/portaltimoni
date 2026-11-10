"use client";
import {useSearchParams} from "next/navigation";
import {useEffect,useState} from "react";
export default function ReceivedOrders(){const query=useSearchParams();const unit=query.get("unidade")||"todas";const[orders,setOrders]=useState<Array<{id:string;nome:string;unidade:string|null;data:string|null}>|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/compras/recebidos?unidade=${unit}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);setOrders(data.orders);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[unit]);
 return <section className="ct-clean-card"><h2>Pedidos recebidos</h2>{error&&<p role="status">{error}</p>}{!orders&&!error&&<p role="status">Carregando recebidos…</p>}{orders?.length===0&&<p className="ct-clean-muted">Nenhum pedido recebido para seu acesso.</p>}{orders?.map(order=><div key={order.id} className="ct-clean-action-row"><strong>{order.nome}</strong><small>{order.unidade==="araras"?"Araras":order.unidade==="rio_claro"?"Rio Claro":"Unidade não informada"}</small><small>Última atualização: {order.data?new Date(order.data).toLocaleDateString("pt-BR"):"Não informada"}</small></div>)}</section>;
}
