export type PurchaseOrderItem = { codigo: string; produto: string; quantidade: string };

// Apenas organiza o texto registrado; não calcula quantidades nem interpreta HTML.
export function parsePurchaseOrderDescription(description: string) {
  const itens: PurchaseOrderItem[] = [];
  for (const line of description.split(/\r?\n/)) {
    const columns = line.split("|").map(value => value.trim());
    if (columns.length === 3 && columns.every(Boolean)) {
      itens.push({ codigo: columns[0], produto: columns[1], quantidade: columns[2] });
    }
  }
  const match = description.match(/^\s*Total:\s*(\d+)\s+itens?\s*$/im);
  const totalInformado = match ? Number(match[1]) : null;
  return { itens, totalInformado, parcial: totalInformado !== null && totalInformado !== itens.length };
}

export type PurchaseOrderDetails = ReturnType<typeof parsePurchaseOrderDescription> & {
  id: string; nome: string; enviadoEm: string; previsaoEntrega: string;
  descricaoOriginal: string; registradoEm: string | null;
};
