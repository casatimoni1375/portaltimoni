import type {ConferenciaResult} from "./xlsx";
export async function downloadSupplierWorkbook(result:ConferenciaResult){
 const comparison=result.supplierComparison;if(!comparison)return;
 const XLSX=await import("xlsx");
 const rows:unknown[][]=[
  ["COMPARAÇÃO ENTRE FORNECEDORES"],
  ["Cotação 1",comparison.names[0]],
  ["Cotação 2",comparison.names[1]],
  ["Preços líquidos; sem frete, impostos ou descontos. Não representa o custo final de compra."],
  [],
  ["Referência 1","Referência 2","Descrição","Quantidade 1","Quantidade 2","Preço líquido 1","Preço líquido 2","IPI 1 (%)","IPI 2 (%)","Menor preço líquido","Diferença nos itens (R$)","Observação"],
  ...result.itens.map((item,i)=>{
   const row=comparison.rows[i];
   return [item.codigo_fornecedor_pedido_mcr,item.codigo_fornecedor_documento,item.descricao,item.quantidade_mcr,item.quantidade_fornecedor,item.preco_mcr,item.preco_fornecedor,item.ipi_mcr,item.ipi_fornecedor,row.cheaper==="first"?"Cotação 1":row.cheaper==="second"?"Cotação 2":row.cheaper==="equal"?"Mesmo preço":"Sem comparação direta",row.saving,row.reason];
  }),
  [],
  ["Cesta comparável: produtos",comparison.comparableItems],
  ["Subtotal líquido — cotação 1",comparison.subtotalFirst],
  ["Subtotal líquido — cotação 2",comparison.subtotalSecond],
  [],...result.pontos_atencao.map(point=>[point]),
 ];
 const sheet=XLSX.utils.aoa_to_sheet(rows);
 sheet["!cols"]=[18,18,44,14,14,20,20,14,14,24,22,70].map(wch=>({wch}));
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Fornecedores");
 XLSX.writeFile(book,"comparacao-fornecedores.xlsx");
}
