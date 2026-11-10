export type PdfTextCell={text:string;x:number;y:number;width:number};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function linesOf(items:PdfTextCell[]){
 const lines:Array<{y:number;cells:PdfTextCell[]}>=[];
 for(const cell of [...items].filter(c=>c.text.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){
  const line=lines.find(l=>Math.abs(l.y-cell.y)<2);if(line)line.cells.push(cell);else lines.push({y:cell.y,cells:[cell]});
 }
 return lines.sort((a,b)=>b.y-a.y).map(line=>({...line,cells:line.cells.sort((a,b)=>a.x-b.x)}));
}
function role(text:string){const label=normalize(text);if(/^(qtd|qtde|quantidade|quant|qtde unit kg|qtd unit kg)$/.test(label))return 'quantity';if(/^(unitario|valor unitario|preco unitario|vl unit|vlr unit|vl unitario|preco unit|preco)$/.test(label))return 'price';if(label.startsWith('descri')||label==='produto')return 'description';if(label.startsWith('cod')||/^(ref|referencia)$/.test(label))return 'code';if(/^(item|itens|n)$/.test(label))return 'index';return label;}
export function pdfPagesToGrid(pages:PdfTextCell[][]):string[][]{
 if(!pages.length||pages.length>30)throw Error('Use um PDF com até 30 páginas.');
 let headers:PdfTextCell[]|null=null;const rows:string[][]=[];
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
  const lines=linesOf(pages[pageIndex]);
  if(!lines.length)throw Error(`A página ${pageIndex+1} não tem texto legível. PDFs digitalizados precisam de leitura de imagem.`);
  const headerIndex=lines.findIndex(line=>{const roles=line.cells.map(c=>role(c.text));return roles.includes('quantity')&&roles.includes('price')&&roles.includes('description')&&roles.includes('code');});
  if(headerIndex<0)throw Error(`Não foi possível reconhecer a tabela de itens na página ${pageIndex+1}.`);
  const currentHeaders=lines[headerIndex].cells;
  if(headers&&headers.map(c=>normalize(c.text)).join('|')!==currentHeaders.map(c=>normalize(c.text)).join('|'))throw Error('O PDF contém tabelas com estruturas diferentes. Não foi feita uma leitura parcial.');
  headers=currentHeaders;
  const kinds=headers.map(c=>role(c.text)),quantity=kinds.indexOf('quantity'),price=kinds.indexOf('price'),description=kinds.indexOf('description'),itemIndex=kinds.indexOf('index');
  const codeColumns=kinds.flatMap((value,i)=>value==='code'?[i]:[]),centers=headers.map(c=>c.x+c.width/2);
  const pageRows:Array<{y:number;cells:string[]}>=[],descriptions:Array<{y:number;text:string}>=[],locations:Array<{y:number;text:string}>=[];
  for(const line of lines.slice(headerIndex+1)){
   const joined=normalize(line.cells.map(c=>c.text).join(' '));
   if(/total (dos )?produtos|total (do )?pedido|subtotal|forma de pagamento|condicoes de pagamento|observacoes|prazo de entrega/.test(joined)||/^(dados.*transport|transportador|texto da nota|informacoes adicionais|informacoes complementares|totais|resumo|peso bruto|peso liquido)/.test(joined))break;
   const location=line.cells.map(c=>c.text).join(' ').match(/\bP[0-9]+\s+L[0-9]*\b/i);
   if(location){locations.push({y:line.y,text:location[0]});continue;}
   const cells=headers.map(()=>'');
   for(const cell of line.cells){const x=cell.x+cell.width/2;let column=0;for(let i=1;i<centers.length;i++)if(Math.abs(x-centers[i])<Math.abs(x-centers[column]))column=i;
    if(/[A-Za-zÀ-ÿ]/.test(cell.text)&&cell.x>=headers[description].x-8&&cell.x<(headers[description+1]?.x??Infinity)-5)column=description;
    cells[column]+=(cells[column]?' ':'')+cell.text.trim();}
   const isItem=(itemIndex>=0&&/^\d+$/.test(cells[itemIndex]))||(codeColumns.some(i=>cells[i])&&cells[quantity]&&cells[price]);
   if(isItem){if(!cells[quantity]||!cells[price])throw Error(`Um item da página ${pageIndex+1} ficou sem quantidade ou preço legível.`);pageRows.push({y:line.y,cells:[...cells,'']});}
   else if(cells[description]&&cells.every((value,i)=>!value||i===description))descriptions.push({y:line.y,text:cells[description]});
   else if(cells[quantity]||cells[price])throw Error(`Uma linha da página ${pageIndex+1} não pôde ser identificada com segurança.`);
  }
  if(!pageRows.length)throw Error(`Não foi possível ler itens na página ${pageIndex+1}.`);
  const closest=(y:number)=>pageRows.reduce((best,row)=>Math.abs(row.y-y)<Math.abs(best.y-y)?row:best);
  const parts=new Map(pageRows.map(row=>[row,row.cells[description]?[{y:row.y,text:row.cells[description]}]:[]]));
  for(const text of descriptions)parts.get(closest(text.y))!.push(text);
  for(const row of pageRows)row.cells[description]=parts.get(row)!.sort((a,b)=>b.y-a.y).map(part=>part.text).join(' ');
  for(const text of locations)closest(text.y).cells[headers.length]=text.text;
  rows.push(...pageRows.map(row=>row.cells));
 }
 if(rows.length>2000)throw Error('O PDF excede 2.000 itens.');
 return [[...headers!.map(c=>c.text),'P-L'],...rows];
}
