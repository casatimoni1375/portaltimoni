import {NextResponse} from "next/server";
import {requirePurchaseRead} from "@/lib/purchase-read-access";
import {canReadUnit} from "@/lib/module-authorization";
import {trelloFetch,TRELLO_BOARD_SHORT_LINK,normalizeTrelloText} from "@/lib/trello";
export const dynamic="force-dynamic";
type Card={id:string;name:string;labels?:Array<{name:string}>;due?:string;dateLastActivity?:string;};
export async function GET(request:Request){
 const selected=new URL(request.url).searchParams.get("unidade");
 const gate=await requirePurchaseRead();if(!gate.current)return gate.errorResponse;
 try{
 const board=await trelloFetch<{lists:Array<{id:string;name:string}>}>(`/boards/${TRELLO_BOARD_SHORT_LINK}`,{params:{fields:"name",lists:"open",list_fields:"name"}});
 const lists=board.lists.filter(list=>normalizeTrelloText(list.name).includes("recebid"));
 const result=await Promise.all(lists.map(async list=>{const cards=await trelloFetch<Card[]>(`/lists/${list.id}/cards`,{params:{fields:"name,labels,due,dateLastActivity"}});return cards.flatMap(card=>{const labels=normalizeTrelloText(`${list.name} ${(card.labels||[]).map(label=>label.name).join(" ")}`);const unit=labels.includes("araras")?"araras":labels.includes("rio claro")?"rio_claro":null;if(!canReadUnit(gate.current.user,gate.resource,unit)||(selected&&selected!=="todas"&&unit!==selected))return[];return[{id:card.id,nome:card.name,unidade:unit,data:card.dateLastActivity||null}];});}));
 return NextResponse.json({orders:result.flat().sort((a,b)=>(b.data||"").localeCompare(a.data||""))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Não foi possível consultar os recebidos."},{status:503});}
}
