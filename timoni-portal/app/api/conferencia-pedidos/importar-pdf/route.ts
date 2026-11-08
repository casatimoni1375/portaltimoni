import {NextResponse} from 'next/server';
import {requireModuleAuthorization} from '@/lib/authorization-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 const gate=await requireModuleAuthorization('conferencia','visualizar');if(!gate.current)return gate.errorResponse;
 try{
  const form=await request.formData(),file=form.get('arquivo');
  if(!(file instanceof File)||!file.size||file.size>4_200_000)return NextResponse.json({error:'Selecione um PDF com até 4,2 MB.'},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());if(Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')return NextResponse.json({error:'O arquivo não é um PDF válido.'},{status:400});
  const {readOrderPdf}=await import('@/lib/read-order-pdf.server');
  return NextResponse.json(await readOrderPdf(bytes),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'Não foi possível ler o PDF.';return NextResponse.json({error:/password|senha/i.test(message)?'O PDF está protegido por senha.':message},{status:422,headers:{'Cache-Control':'no-store'}});}
}
