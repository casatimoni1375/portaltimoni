import { requireModuleAuthorization } from "@/lib/authorization-server";
import { compareOrderDocuments, validateComparisonDocument } from "@/lib/order-comparison";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request){
 const gate=await requireModuleAuthorization("conferencia","visualizar");if(!gate.current)return gate.errorResponse;
 try{
 if(!request.headers.get("content-type")?.includes("application/json"))return NextResponse.json({error:"Selecione uma planilha do pedido e uma do fornecedor (Excel ou CSV)."},{status:415});
 const text=await request.text();if(Buffer.byteLength(text,"utf8")>2_000_000)return NextResponse.json({error:"As planilhas têm dados demais para esta conferência."},{status:413});
 const body=JSON.parse(text);const result=compareOrderDocuments(validateComparisonDocument(body.order),validateComparisonDocument(body.supplier));
 return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível comparar as planilhas."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
