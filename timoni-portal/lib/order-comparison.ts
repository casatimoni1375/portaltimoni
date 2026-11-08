import type { ConferenciaResult, Divergencia } from "@/app/dashboard/conferencia-pedidos/xlsx";
export type ComparisonLine = { code:string; description:string; quantity:number|null; price:number|null; ipi:number|null; internalCode?:string; location?:string };
export type ComparisonDocument = { filename:string; sheet:string; rows:ComparisonLine[] };
export const MAX_COMPARISON_ROWS = 2000;
const normalized = (value:string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
export function parseComparisonNumber(value:unknown,decimal:"auto"|"comma"|"dot"="auto"):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&value>=0?value:null;
 let text=String(value??"").trim().replace(/^R\$\s*/,"").replace(/%$/,"").replace(/\s/g,"");
 if(!text||! /^[\d.,]+$/.test(text))return null;
 if(decimal==="comma")text=text.replace(/\./g,"").replace(",",".");
 else if(decimal==="dot")text=text.replace(/,/g,"");
 else if(text.includes(",")){if(text.lastIndexOf(",")>text.lastIndexOf("."))text=text.replace(/\./g,"").replace(",",".");else text=text.replace(/,/g,"");}
 if(!/^\d+(?:\.\d+)?$/.test(text))return null;
 const result=Number(text);return Number.isFinite(result)?result:null;
}
export function validateComparisonDocument(value:unknown):ComparisonDocument {
 if(!value||typeof value!=="object")throw Error("Selecione as duas planilhas.");
 const doc=value as Record<string,unknown>;
 if(!Array.isArray(doc.rows)||!doc.rows.length||doc.rows.length>MAX_COMPARISON_ROWS)throw Error(`Cada planilha deve conter entre 1 e ${MAX_COMPARISON_ROWS} itens.`);
 const text=(v:unknown)=>String(v??"").trim().slice(0,500);
 return {filename:text(doc.filename),sheet:text(doc.sheet),rows:doc.rows.map((raw:unknown)=>{
 if(!raw||typeof raw!=="object")throw Error("Linha de planilha inválida.");const row=raw as Record<string,unknown>;
 for(const key of ["quantity","price","ipi"])if(row[key]!==null&&(typeof row[key]!=="number"||!Number.isFinite(row[key])||(row[key] as number)<0))throw Error("A planilha contém um número inválido.");
 return {code:text(row.code),description:text(row.description),quantity:row.quantity as number|null,price:row.price as number|null,ipi:row.ipi as number|null,internalCode:text(row.internalCode),location:text(row.location)};
 })};
}
export function compareOrderDocuments(order:ComparisonDocument,supplier:ComparisonDocument):ConferenciaResult {
 const index=(rows:ComparisonLine[])=>{const map=new Map<string,number[]>();rows.forEach((row,i)=>{const code=normalized(row.code);if(code)map.set(code,[...(map.get(code)??[]),i]);});return map;};
 const orderCodes=index(order.rows),supplierCodes=index(supplier.rows),used=new Set<number>();const items:ConferenciaResult["itens"]=[];
 const gross=(row?:ComparisonLine)=>row?.price!==null&&row?.price!==undefined&&row.ipi!==null?row.price*(1+row.ipi/100):null;
 const differs=(a:number,b:number,tolerance:number)=>Math.round(Math.abs(a-b)*1e6)>Math.round(tolerance*1e6);
 function item(a:ComparisonLine|undefined,b:ComparisonLine|undefined,divergences:Divergencia[],notes:string[]){return {pl:a?.location??"",codigo_mcr:a?.internalCode??"",codigo_fornecedor_pedido_mcr:a?.code??"",codigo_fornecedor_documento:b?.code??"",descricao:a?.description||b?.description||"",quantidade_mcr:a?.quantity??null,quantidade_fornecedor:b?.quantity??null,preco_mcr:a?.price??null,preco_fornecedor:b?.price??null,ipi_mcr:a?.ipi??null,ipi_fornecedor:b?.ipi??null,preco_bruto_mcr:gross(a),preco_bruto_fornecedor:gross(b),divergencias:divergences,observacao:notes.join(" ")};}
 for(const a of order.rows){const code=normalized(a.code),candidates=supplierCodes.get(code)??[];
 if(!code||(orderCodes.get(code)?.length??0)>1||candidates.length>1){items.push(item(a,undefined,["pareamento_incerto"],[!code?"Código não informado no pedido.":"Código repetido: não foi feito pareamento automático."]));continue;}
 if(!candidates.length){items.push(item(a,undefined,["item_faltante"],["Código não localizado no documento do fornecedor."]));continue;}
 const i=candidates[0],b=supplier.rows[i];used.add(i);const divergences:Divergencia[]=[],notes:string[]=[];
 for(const [key,divergence,label,tolerance] of [["quantity","quantidade","Quantidade",0.000001],["price","preco","Preço unitário",0.05],["ipi","ipi","IPI",0.000001]] as const){
 if(a[key]===null||b[key]===null){if(key!=="ipi"||a[key]!==b[key]){if(!divergences.includes("outra"))divergences.push("outra");notes.push(`${label} não informado ou ilegível em uma das planilhas.`);}}
 else if(differs(a[key],b[key],tolerance))divergences.push(divergence);
 }
 if(!a.description||!b.description){if(!divergences.includes("outra"))divergences.push("outra");notes.push("Descrição ausente em uma das planilhas.");}
 else if(normalized(a.description)!==normalized(b.description))divergences.push("descricao");
 const ga=gross(a),gb=gross(b);if(ga!==null&&gb!==null&&differs(ga,gb,0.05))divergences.push("preco_bruto");items.push(item(a,b,divergences,notes));
 }
 supplier.rows.forEach((b,i)=>{if(used.has(i))return;const code=normalized(b.code),ambiguous=!code||(supplierCodes.get(code)?.length??0)>1||(orderCodes.get(code)?.length??0)>1;items.push(item(undefined,b,ambiguous?["pareamento_incerto"]:["item_extra"],[ambiguous?"Linha do fornecedor sem pareamento seguro: código ausente ou repetido.":"Código não localizado no pedido da Casa Timoni."]));});
 const subtotal=(rows:ComparisonLine[])=>rows.every(r=>r.quantity!==null&&r.price!==null)?rows.reduce((sum,r)=>sum+r.quantity!*r.price!,0):null;
 const changed=items.filter(i=>i.divergencias.length).length,uncertain=items.filter(i=>i.divergencias.includes("pareamento_incerto")).length;
 return {pedido_numero:"",fornecedor_curto:"",fornecedor_nome:"",data_pedido:"",data_documento_fornecedor:"",documentos_pedido:[order.filename],documentos_fornecedor:[{arquivo:supplier.filename,identificador:supplier.sheet,pedido_relacionado:"",gerado_em:"",status:"considerado",substitui:""}],resumo_texto:`${order.rows.length} itens no pedido e ${supplier.rows.length} no fornecedor.\n${changed} linhas com diferença ou informação pendente.\nTotais calculados a partir de quantidade × preço unitário, sem frete, impostos ou descontos.`,pontos_atencao:["Códigos são comparados como texto; zeros à esquerda são preservados. Descrições diferentes são sinalizadas, inclusive abreviações.",...(uncertain?[`${uncertain} linhas sem pareamento seguro por código ausente ou repetido.`]:[]),"Preços: tolerância de R$ 0,05 por unidade. Campos ausentes não são tratados como zero. Frete, pagamento e entrega não foram comparados."],contagens:{itens_mcr:order.rows.length,itens_fornecedor:supplier.rows.length,precos_divergentes:items.filter(i=>i.divergencias.includes("preco")).length,outras_divergencias:items.filter(i=>i.divergencias.some(d=>d!=="preco")).length},totais:{subtotal_mcr:subtotal(order.rows),subtotal_fornecedor:subtotal(supplier.rows),impostos_fornecedor:null,frete_fornecedor:null,desconto_fornecedor:null,total_fornecedor:null},condicoes:{pagamento_mcr:"",pagamento_fornecedor:"",entrega_mcr:"",entrega_fornecedor:"",frete_mcr:"",frete_fornecedor:""},itens:items};
}
