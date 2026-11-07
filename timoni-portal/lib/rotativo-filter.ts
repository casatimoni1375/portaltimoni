import type { sheets_v4 } from "googleapis";

export function rotatingStockFilterTitle(updateId: string, supplierName: string) {
  const supplier = supplierName.replace(/[\r\n]+/g, " ").trim().slice(0, 45);
  return `Rotativo · ${supplier || "Atualização"} · ${updateId}`;
}

export function rotatingStockRowFilter(targetRows: number[], rowCount: number): sheets_v4.Schema$FilterSpec {
  const rows = [...new Set(targetRows.filter(row => Number.isInteger(row) && row >= 2 && row <= rowCount))].sort((a, b) => a - b);
  if (!rows.length) throw new Error("Esta atualização não possui itens encontrados na planilha central.");
  const intervals: number[][] = [];
  for (const row of rows) {
    const last = intervals.at(-1);
    if (last && row === last[1] + 1) last[1] = row;
    else intervals.push([row, row]);
  }
  const formula = `=OR(${intervals.map(([a, b]) => a === b ? `ROW()=${a}` : `AND(ROW()>=${a},ROW()<=${b})`).join(",")})`;
  if (formula.length > 45000) throw new Error("Esta atualização excede o tamanho seguro do filtro. Reduza a seleção.");
  return { columnIndex: 0, filterCriteria: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] } } };
}
