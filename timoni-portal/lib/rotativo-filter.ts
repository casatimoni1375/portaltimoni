import type { sheets_v4 } from "googleapis";

export function rotatingStockFilterTitle(updateId: string, supplierName: string) {
  const supplier = supplierName.replace(/[\r\n]+/g, " ").trim().slice(0, 45);
  return `Rotativo · ${supplier || "Atualização"} · ${updateId}`;
}

/** Coluna B (índice 1) da aba Produtos = código do produto. */
export const ROTATING_STOCK_CODE_COLUMN_INDEX = 1;

/**
 * Filtro por VALOR do código (coluna B), sem fórmula e sem número de linha.
 * A API de filtros não aceita lista de valores visíveis (ONE_OF_LIST só vale para
 * validação de dados), então ocultamos todos os códigos que NÃO pertencem à
 * atualização (hiddenValues). Não depende da localidade pt-BR da planilha.
 *
 * @param codeColumn valores da coluna B a partir da linha 2 (FORMATTED_VALUE)
 * @param targetRows linhas da planilha (base 1) que pertencem à atualização
 */
export function rotatingStockCodeFilter(codeColumn: unknown[][], targetRows: number[]): sheets_v4.Schema$FilterSpec {
  const codeAt = (row: number) => String(codeColumn[row - 2]?.[0] ?? "").trim();
  const visible = new Set(
    targetRows
      .filter((row) => Number.isInteger(row) && row >= 2)
      .map(codeAt)
      .filter(Boolean),
  );
  if (!visible.size) throw new Error("Esta atualização não possui itens encontrados na planilha central.");

  const hidden = new Set<string>();
  for (const cell of codeColumn) {
    // Guarda o texto exibido sem cortar espaços: o filtro compara com o texto da célula.
    const shown = String(cell?.[0] ?? "");
    const code = shown.trim();
    if (code && !visible.has(code)) hidden.add(shown);
  }
  // "" oculta as linhas sem código (vazias).
  return {
    columnIndex: ROTATING_STOCK_CODE_COLUMN_INDEX,
    filterCriteria: { hiddenValues: ["", ...hidden] },
  };
}
