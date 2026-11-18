import {NextResponse} from "next/server";
import {requirePurchaseRead} from "@/lib/purchase-read-access";
import {canReadUnit} from "@/lib/module-authorization";
import {trelloFetch,TRELLO_BOARD_SHORT_LINK,normalizeTrelloText} from "@/lib/trello";
import {RECEIVED_VISIBLE_DAYS,isWithinReceivedWindow} from "@/lib/received-window";
export const dynamic="force-dynamic";
type Card={id:string;name:string;labels?:Array<{name:string}>;};
type Action={date:string;type:string;data:{card?:{id:string};list?:{id:string};listAfter?:{id:string}}};
// Unidade pela etiqueta do cartão (Rio Claro/Araras). A lista "ARARAS/RIO CLARO" tem as duas no nome,
// então o nome da lista só vale quando cita uma unidade; por último, o final do nome (CT = Araras; ROD/MCR = Rio Claro).
function unitOf(card:Card,listName:string):"araras"|"rio_claro"|null{
 const pick=(text:string)=>{const a=text.includes("araras"),r=text.includes("rio claro");return a&&!r?"araras":r&&!a?"rio_claro":null;};
 const byLabel=pick(normalizeTrelloText((card.labels||[]).map(label=>label.name).join(" ")));if(byLabel)return byLabel;
 const byList=pick(normalizeTrelloText(listName));if(byList)return byList;
 const end=card.name.trim().toUpperCase();
 if(/(ROD|RODINI|MCR)\b[^A-Z]*$/.test(end)||/(ROD|MCR)\b/.test(end))return "rio_claro";
 if(/\bCT\b/.test(end))return "araras";
 return null;
}
export async function GET(request:Request){
 const selected=new URL(request.url).searchParams.get("unidade");
 const gate=await requirePurchaseRead();if(!gate.current)return gate.errorResponse;
 try{
 const board=await trelloFetch<{lists:Array<{id:string;name:string}>}>(`/boards/${TRELLO_BOARD_SHORT_LINK}`,{params:{fields:"name",lists:"open",list_fields:"name"}});
 const lists=board.lists.filter(list=>normalizeTrelloText(list.name).includes("recebid"));
 // Data de conclusão = momento em que o cartão entrou na lista Recebidos (ação do Trello).
 const since=new Date(Date.now()-(RECEIVED_VISIBLE_DAYS+1)*86_400_000).toISOString();
 const actions=lists.length?await trelloFetch<Action[]>(`/boards/${TRELLO_BOARD_SHORT_LINK}/actions`,{params:{filter:"updateCard:idList,createCard",since,limit:1000}}):[];
 const receivedAt=new Map<string,{date:string;listId:string}>();
 for(const action of actions){
  const cardId=action.data.card?.id;const listId=action.type==="createCard"?action.data.list?.id:action.data.listAfter?.id;
  if(!cardId||!listId||!lists.some(list=>list.id===listId))continue;
  const current=receivedAt.get(cardId);if(!current||action.date>current.date)receivedAt.set(cardId,{date:action.date,listId});
 }
 const result=await Promise.all(lists.map(async list=>{const cards=await trelloFetch<Card[]>(`/lists/${list.id}/cards`,{params:{fields:"name,labels"}});return cards.flatMap(card=>{const unit=unitOf(card,list.name);if(!canReadUnit(gate.current.user,gate.resource,unit)||(selected&&selected!=="todas"&&unit!==selected))return[];const completed=receivedAt.get(card.id);if(!completed||!isWithinReceivedWindow(completed.date))return[];return[{id:card.id,nome:card.name,unidade:unit,data:completed.date}];});}));
 return NextResponse.json({orders:result.flat().sort((a,b)=>(b.data||"").localeCompare(a.data||""))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Não foi possível consultar os recebidos."},{status:503});}
}
