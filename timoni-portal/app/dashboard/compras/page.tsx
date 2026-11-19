import {Suspense} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getPortalSession} from "@/lib/portal-session";
import {hasModuleAccess,isCicaAccess} from "@/lib/access-control";
import {canReadUnit} from "@/lib/module-authorization";
import ComprasClient from "./ComprasClient";
import Conferencia from "../conferencia-pedidos/ConferenciaPedidosClient";
import PedidoCompraClient from "../pedido-de-compra/pedido-compra-client";
import ReceivedOrders from "@/components/clean/received-orders";
import PurchaseNeeds from "@/components/clean/purchase-needs";
export default async function ComprasPage({searchParams}:{searchParams:Promise<{aba?:string;unidade?:string}>}){
 const session=await getPortalSession();const user=session?.portalUser;if(!user)redirect("/login");const query=await searchParams;
 const has=(module:Parameters<typeof hasModuleAccess>[1])=>hasModuleAccess(user.email,module,user);
 const tabs=[{key:"montar",label:"Fazer pedido",n:"1.",visible:has("compras")},{key:"conferir",label:"Conferir",n:"2.",visible:isCicaAccess(user.email)&&has("conferencia")},{key:"acompanhar",label:"Pedidos de compra",n:"3.",visible:has("pedido-de-compra")||has("compras")},{key:"necessidades",label:"Estoque rotativo",n:"4.",visible:has("compras")||has("estoque-rotativo")}].filter(tab=>tab.visible);
 if(!tabs.length)redirect("/dashboard");const selected=tabs.some(tab=>tab.key===query.aba)?query.aba:has("compras")?"montar":tabs[0].key;
 // 5. Estoque rotativo abre direto o Rotativo (17/11/2026), para quem tem acesso a ele.
 const rotativoDireto=has("estoque-rotativo");if(selected==="necessidades"&&rotativoDireto)redirect("/dashboard/estoque-rotativo");
 const resource=has("compras")?"compras":"pedido-de-compra";const units=(["rio_claro","araras"] as const).filter(unit=>canReadUnit(user,resource,unit)&&(!query.unidade||query.unidade==="todas"||unit===query.unidade));
 return <div className="ct-modern-workspace ct-compras-module pb-10"><h1 className="ct-compras-title">Compras</h1><nav className="ct-clean-module-tabs" aria-label="Etapas de Compras">{tabs.map(tab=><Link key={tab.key} href={tab.key==="necessidades"&&rotativoDireto?"/dashboard/estoque-rotativo":`/dashboard/compras?aba=${tab.key}${query.unidade?`&unidade=${query.unidade}`:""}`} aria-current={selected===tab.key?"page":undefined} className={["conferir","necessidades"].includes(tab.key)?"max-md:!hidden":undefined}>{/* 19/11: no celular só Fazer pedido e Pedidos de compra, sem número; Conferir e Estoque rotativo só no desktop. */}<span className="max-md:hidden">{tab.n} </span>{tab.label}</Link>)}</nav><Suspense fallback={<p role="status">Carregando etapa…</p>}>{selected==="necessidades"?<PurchaseNeeds canRotativo={has("estoque-rotativo")} canMontar={has("compras")}/>:selected==="conferir"?<Conferencia/>:selected==="acompanhar"?<PedidoCompraClient visibleUnits={units}/>:selected==="recebidos"?<ReceivedOrders/>:<ComprasClient/>}</Suspense></div>;
}
