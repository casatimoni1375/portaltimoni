import {NextResponse} from "next/server";
import {requireModuleAuthorization} from "@/lib/authorization-server";
import {canReadUnit} from "@/lib/module-authorization";
import {getAccessTokenFromRefreshToken,listEventsInRange} from "@/lib/google-calendar";
import {getEffectivePanelData} from "@/lib/portal-config";
import {normalizedText} from "@/lib/block-one-utils";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const gate=await requireModuleAuthorization("painel","visualizar");if(!gate.current)return gate.errorResponse;
 const {user,accessToken}=gate.current;const now=new Date();const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);const [year,month]=parts.split("-").map(Number);const start=`${year}-${String(month).padStart(2,"0")}-01T00:00:00-03:00`;const endDate=new Date(Date.UTC(year,month,1));const end=`${endDate.toISOString().slice(0,10)}T00:00:00-03:00`;const selected=new URL(request.url).searchParams.get("unidade");
 const visibleUnit=(value:string)=>canReadUnit(user,"painel",value)&&(!selected||selected==="todas"||selected===(value==="Araras"?"araras":"rio_claro"));
 try{
 const [calendar,panel]=await Promise.all([getAccessTokenFromRefreshToken().then(token=>listEventsInRange(token,{timeMin:start,timeMax:end,maxResults:500},["timoni"])),getEffectivePanelData(accessToken,user.email)]);
 const people=panel.collaborators.filter(person=>person.active&&visibleUnit(person.unit));
 const events=calendar.flatMap(event=>{const title=normalizedText(event.summary);const kind=title.includes("ferias")?"vacation":title.includes("anivers")||title.includes("birthday")?"birthday":null;if(!kind)return[];
 const indicated=title.includes("araras")?"Araras":title.includes("rio claro")?"Rio Claro":null;
 const members=panel.collaborators.filter(person=>person.active&&title.includes(normalizedText(person.name)));
 // Férias: evento de dia inteiro termina no dia seguinte ao último dia (fim exclusivo).
 // Último dia = fim - 1; férias que já acabaram não aparecem.
 let lastDay=event.end?event.end.slice(0,10):"";
 if(event.end&&!event.end.includes("T")){const d=new Date(`${lastDay}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);lastDay=d.toISOString().slice(0,10);}
 if(kind==="vacation"&&lastDay&&lastDay<parts)return[];
 if(indicated?!visibleUnit(indicated):members.length?!members.some(person=>visibleUnit(person.unit)):user.unit!=="Geral"||Boolean(selected&&selected!=="todas"))return[];
 return[{id:event.id,name:event.summary.replace(/^anivers[aá]rio\s*(?:de\s*)?/i,""),date:event.start,end:lastDay||event.end,kind,unit:indicated==="Araras"?"araras":indicated==="Rio Claro"?"rio_claro":members[0]?.unit==="Araras"?"araras":members[0]?.unit==="Rio Claro"?"rio_claro":"geral"}];
 });
 const meetings=calendar.filter(event=>event.start.slice(0,10)===parts&&["reuniao mensal rio claro","reuniao mensal araras"].includes(normalizedText(event.summary))&&visibleUnit(normalizedText(event.summary).includes("araras")?"Araras":"Rio Claro")).map(event=>({id:event.id,title:event.summary,date:event.start,time:event.start.includes("T")?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(event.start)):"Hoje"}));
 return NextResponse.json({events,meetings,people:people.map(person=>({name:person.name,unit:person.unit}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Não foi possível atualizar as datas da equipe."},{status:503,headers:{"Cache-Control":"private, no-store"}});}
}
