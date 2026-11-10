import 'pdf-parse/worker';
import {getData} from 'pdf-parse/worker';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {pdfPagesToGrid,type PdfTextCell} from './pdf-order-table';
GlobalWorkerOptions.workerSrc=getData();
export async function readOrderPdf(bytes:Uint8Array){
 const task=getDocument({data:bytes,isEvalSupported:false,disableFontFace:true,verbosity:0});
 try{
  const doc=await task.promise;if(doc.numPages>30)throw Error('Use um PDF com até 30 páginas.');
  const pages:PdfTextCell[][]=[];
  for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();pages.push(content.items.flatMap(item=>'str' in item?[{text:item.str,x:item.transform[4],y:item.transform[5],width:item.width}]:[]));}
  return {grid:pdfPagesToGrid(pages),pages:doc.numPages};
 }finally{await task.destroy();}
}
