import { randomUUID } from "node:crypto";
import type { sheets_v4 } from "googleapis";

type Cell = sheets_v4.Schema$CellData;
type Request = sheets_v4.Schema$Request;
// Modelo TERUYA (decisão de 14/11/2026): linha 4 = empresa da compra, linha 5 = data + CONT.VALORES,
// linha 6 = cabeçalho, produtos a partir da linha 7.
export const ROTATIVO_HEADERS = ["VENDA", "COMPRA", "DESCRIÇÃO", "EMB", "ESTOQUE", "UN"];
export const ROTATIVO_HEADER_ROW = 5;
const FIXED = ROTATIVO_HEADERS.length;
const COMPANY_ROW = 3, COUNT_ROW = 4, DATA_ROW = ROTATIVO_HEADER_ROW + 1;
const filledYellow = { red: 0.9843137, green: 0.9098039, blue: 0.69411767 };
const COMPANY = /^(rod|rodini|mcr|ct|ro\s*\/\s*mcr|rod\s*\/\s*mcr|mcr\s*\/\s*rod)$/i;
function dateSerial(text: string) {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const month = Number(m[2]), day = Number(m[1]);
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
}
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const occupied = (c?: Cell) => Boolean(c?.userEnteredValue && Object.values(c.userEnteredValue).some(v => v !== "" && v != null));
const label = (c?: Cell) => c?.formattedValue ?? c?.userEnteredValue?.stringValue ?? "";
export function colLetter(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
export function gridRows(sheet: sheets_v4.Schema$Sheet): Cell[][] {
  const rows: Cell[][] = [];
  for (const block of sheet.data || []) (block.rowData || []).forEach((row, r) => {
    const target = rows[r + (block.startRow || 0)] ||= [];
    (row.values || []).forEach((c, i) => { target[i + (block.startColumn || 0)] = c; });
  });
  return rows;
}
const white = { red: 1, green: 1, blue: 1 }, black = { red: 0, green: 0, blue: 0 };
const red = { red: 0.83137256, green: 0.047058824, blue: 0.050980393 };
const blue = { red: 0.07450981, green: 0.011764706, blue: 0.5529412 };
const lightBlue = { red: 0.85882354, green: 0.9137255, blue: 0.96862745 };
const yellow = { red: 1, green: 0.9019608, blue: 0.6 };

// Pure planner. Native dimension moves retain typed values, formulas and number formats.
export function planOfficialRotativoModel(sheet: sheets_v4.Schema$Sheet, title: string, now = new Date()) {
  const sheetId = sheet.properties?.sheetId;
  if (sheetId == null) throw new Error("A aba selecionada não foi encontrada.");
  const rows = gridRows(sheet);
  const aliases = [
    ["venda", "cod venda", "codigo venda", "codigo de venda", "codigo", "cod", "sku", "referencia"],
    ["compra", "cod compra", "codigo compra", "codigo de compra"],
    ["descricao", "produto", "mercadoria", "nome produto"],
    ["emb", "embalagem"],
    ["estoque", "quantidade", "qtd", "saldo", "estoque atual"], ["un", "unidade", "und", "uni"],
  ];
  const matches = (allowed: string[], n: string, slot: number) => allowed.includes(n) || (slot === 2 && n.startsWith("descricao "));
  const candidates = rows.map((row, index) => {
    const names = row.map(c => norm(label(c)));
    const columns = aliases.map((allowed, slot) => {
      const hits = names.map((n, i) => matches(allowed, n, slot) ? i : -1).filter(i => i >= 0);
      return hits.length === 1 ? hits[0] : -1;
    });
    return { index, columns, names };
  }).filter(x => x.columns[0] >= 0 && x.columns[2] >= 0 && x.columns[4] >= 0);
  if (candidates.length !== 1) throw new Error("Cabeçalho desconhecido ou ambíguo. Nenhuma alteração foi feita.");
  const { index: headerIndex, columns, names } = candidates[0];
  const official = headerIndex === ROTATIVO_HEADER_ROW && ROTATIVO_HEADERS.every((h, i) => names[i] === norm(h));
  if (headerIndex > 11) throw new Error("Cabeçalho abaixo da linha 12. Revise a estrutura antes de padronizar.");
  const rowShift = ROTATIVO_HEADER_ROW - headerIndex;
  let lastSourceRow = headerIndex;
  rows.forEach((row, i) => { if (i > headerIndex && row.some(occupied)) lastSourceRow = i; });
  if (lastSourceRow === headerIndex) throw new Error("Nenhum produto encontrado abaixo do cabeçalho.");
  const sourceWidth = Math.max(1, ...rows.slice(headerIndex).filter(Boolean).map(row => {
    let end = row.length;
    while (end && !occupied(row[end - 1])) end--;
    return end;
  }));
  const excluded = names.map((n, i) => ["item", "numero", "min", "minimo", "max", "maximo", "estoque minimo", "estoque maximo", "est min", "est max"].includes(n) ? i : -1).filter(i => i >= 0 && !columns.includes(i));
  const histories = Array.from({ length: sourceWidth }, (_, i) => i).filter(i => !columns.includes(i) && !excluded.includes(i));
  const lastRow = lastSourceRow + rowShift + 1, lastColumn = FIXED + histories.length;
  // Empresa da compra (ROD/MCR) acima dos meses: preservada na linha 4.
  const companyRow = rows.slice(0, headerIndex).map((row, i) => ({ i, hits: histories.filter(c => COMPANY.test(String(label(row?.[c])).trim())).length }))
    .sort((a, b) => b.hits - a.hits)[0];
  const companies = companyRow?.hits ? histories.map(c => rows[companyRow.i]?.[c]?.userEnteredValue) : [];
  for (const c of columns.slice(0, 2).filter(c => c >= 0)) for (let r = headerIndex + 1; r <= lastSourceRow; r++) {
    const cell = rows[r]?.[c], n = cell?.userEnteredValue?.numberValue;
    if (n != null && cell?.formattedValue != null && cell.formattedValue !== String(n)) throw new Error(`Código com formato especial em ${colLetter(c)}${r + 1}. A conversão para texto alteraria sua exibição.`);
  }
  if (excluded.length && rows.slice(headerIndex + 1).some(row => row.some(c => c.userEnteredValue?.formulaValue))) throw new Error("Planilha com fórmulas e colunas auxiliares antigas: revise as referências antes da migração.");
  const requests: Request[] = [];
  for (let i = (sheet.conditionalFormats || []).length - 1; i >= 0; i--) requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  for (const m of sheet.merges || []) requests.push({ unmergeCells: { range: m } });
  if (sheet.basicFilter) requests.push({ clearBasicFilter: { sheetId } });
  for (const f of sheet.filterViews || []) if (f.filterViewId != null) requests.push({ deleteFilterView: { filterId: f.filterViewId } });
  for (const b of sheet.bandedRanges || []) if (b.bandedRangeId != null) requests.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } });
  if ((sheet as sheets_v4.Schema$Sheet & { tables?: unknown[] }).tables?.length) throw new Error("A aba contém tabela nativa. Revise a estrutura antes de padronizar.");
  if (rowShift > 0) requests.push({ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: headerIndex, endIndex: ROTATIVO_HEADER_ROW }, inheritFromBefore: false } });
  if (rowShift < 0) requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: -rowShift } } });
  const order = Array.from({ length: sheet.properties?.gridProperties?.columnCount || sourceWidth }, (_, i) => i);
  for (let dest = 0; dest < FIXED; dest++) {
    const original = columns[dest];
    if (original < 0) {
      requests.push({ insertDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: dest, endIndex: dest + 1 }, inheritFromBefore: false } });
      order.splice(dest, 0, -dest - 1);
    } else {
      const from = order.indexOf(original);
      if (from !== dest) {
        requests.push({ moveDimension: { source: { sheetId, dimension: "COLUMNS", startIndex: from, endIndex: from + 1 }, destinationIndex: dest } });
        order.splice(dest, 0, order.splice(from, 1)[0]);
      }
    }
  }
  for (const i of excluded.map(i => order.indexOf(i)).sort((a, b) => b - a)) {
    requests.push({ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 } } });
    order.splice(i, 1);
  }
  const rowCount = (sheet.properties?.gridProperties?.rowCount || rows.length) + rowShift, columnCount = order.length;
  const range = (r: number, end: number, c: number, ce: number) => ({ sheetId, startRowIndex: r, endRowIndex: end, startColumnIndex: c, endColumnIndex: ce });
  const fmt = (r: number, end: number, c: number, ce: number, userEnteredFormat: sheets_v4.Schema$CellFormat, fields: string) => {
    if (end > r && ce > c) requests.push({ repeatCell: { range: range(r, end, c, ce), cell: { userEnteredFormat }, fields } });
  };
  // Clear visual inheritance, never numberFormat. Blank surroundings lose old borders/alignment.
  fmt(0, rowCount, 0, columnCount, {}, "userEnteredFormat(backgroundColor,backgroundColorStyle,borders,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,textDirection,padding,textRotation)");
  requests.push({ repeatCell: { range: range(0, rowCount, 0, columnCount), cell: {}, fields: "dataValidation" } });
  fmt(0, lastRow, 0, lastColumn, { backgroundColor: white, textFormat: { fontFamily: "Calibri", fontSize: 11, bold: false, foregroundColor: black }, wrapStrategy: "OVERFLOW_CELL" }, "userEnteredFormat(backgroundColor,textFormat,wrapStrategy)");
  fmt(0, DATA_ROW - 1, 0, lastColumn, { horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" }, "userEnteredFormat(horizontalAlignment,verticalAlignment)");
  fmt(0, 1, 0, 1, { textFormat: { fontFamily: "Calibri", fontSize: 16, bold: true, foregroundColor: black } }, "userEnteredFormat.textFormat");
  fmt(1, 2, 0, 2, { backgroundColor: lightBlue, textFormat: { fontFamily: "Calibri", fontSize: 11, bold: true, foregroundColor: black } }, "userEnteredFormat(backgroundColor,textFormat)");
  fmt(2, 3, 0, 2, { backgroundColor: yellow }, "userEnteredFormat.backgroundColor");
  fmt(2, 3, 0, 1, { textFormat: { fontFamily: "Calibri", fontSize: 11, bold: true, foregroundColor: black } }, "userEnteredFormat.textFormat");
  fmt(3, 5, 0, 1, { textFormat: { fontFamily: "Calibri", fontSize: 11, bold: true, foregroundColor: red } }, "userEnteredFormat.textFormat");
  fmt(COMPANY_ROW, COUNT_ROW + 1, FIXED, lastColumn, { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: { fontFamily: "Calibri", fontSize: 11, bold: true, foregroundColor: black } }, "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)");
  fmt(ROTATIVO_HEADER_ROW, lastRow, 0, lastColumn, { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" }, "userEnteredFormat(horizontalAlignment,verticalAlignment)");
  fmt(DATA_ROW, lastRow, 2, 3, { horizontalAlignment: "LEFT" }, "userEnteredFormat.horizontalAlignment");
  fmt(ROTATIVO_HEADER_ROW, DATA_ROW, 0, lastColumn, { backgroundColor: blue, textFormat: { fontFamily: "Calibri", fontSize: 11, bold: true, foregroundColor: white } }, "userEnteredFormat(backgroundColor,textFormat)");
  fmt(DATA_ROW, lastRow, 0, 2, { numberFormat: { type: "TEXT", pattern: "@" } }, "userEnteredFormat.numberFormat");
  for (let r = headerIndex + 1; r <= lastSourceRow; r++) {
    const nf = rows[r]?.[columns[4]]?.userEnteredFormat?.numberFormat;
    if (!nf || nf.type !== "NUMBER" || nf.pattern === "0.###############") {
      const value = rows[r]?.[columns[4]]?.effectiveValue?.numberValue ?? rows[r]?.[columns[4]]?.userEnteredValue?.numberValue;
      const [mantissa, exponent = "0"] = String(value ?? 0).split("e");
      const decimals = Math.min(15, Math.max(0, (mantissa.split(".")[1]?.length || 0) - Number(exponent)));
      const pattern = decimals ? `0.${"0".repeat(decimals)}` : "0";
      fmt(r + rowShift, r + rowShift + 1, 4, 5, { numberFormat: { type: "NUMBER", pattern } }, "userEnteredFormat.numberFormat");
    }
  }
  const border = { style: "SOLID", color: black };
  requests.push({ updateBorders: { range: range(ROTATIVO_HEADER_ROW, lastRow, 0, lastColumn), top: border, bottom: border, left: border, right: border, innerHorizontal: border, innerVertical: border } });
  for (const [r, end, c, ce] of [[0, 1, 0, 1], [1, 2, 0, 2], [2, 3, 0, 1]]) requests.push({ updateBorders: { range: range(r, end, c, ce), top: border, bottom: border, left: border, right: border, innerVertical: border } });
  const write = (r: number, c: number, value: sheets_v4.Schema$ExtendedValue) => requests.push({ updateCells: { start: { sheetId, rowIndex: r, columnIndex: c }, rows: [{ values: [{ userEnteredValue: value }] }], fields: "userEnteredValue" } });
  const top = rows.slice(0, headerIndex).flat();
  const standardized = top.find(c => /^Padronizada em /i.test(label(c)));
  const isUpdatedStatus = (cell?: Cell) => /^(?:Estoque\s+)?Rotativo atualizado em /i.test(label(cell));
  const updated = (headerIndex > 2 && isUpdatedStatus(rows[2]?.[0]) ? rows[2][0] : undefined)
    || top.find(isUpdatedStatus);
  let responsible: Cell | undefined = official ? rows[3]?.[0] : undefined;
  let date: Cell | undefined = official ? rows[4]?.[0] : undefined;
  if (!official) for (const row of rows.slice(0, headerIndex)) {
    const emp = row.findIndex(c => ["funcionario", "responsavel", "nome"].some(k => norm(label(c)).startsWith(k)));
    const dt = row.findIndex(c => norm(label(c)) === "data");
    if (emp >= 0) responsible = row.slice(emp + 1, dt > emp ? dt : undefined).find(occupied) || responsible;
    if (dt >= 0) date = row.slice(dt + 1).find(occupied) || date;
  }
  responsible ||= top.find(c => /^(lucas|jonatan|jonathan)$/i.test(String(label(c)).trim()));
  date ||= top.find(c => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(label(c)).trim()));
  const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(now);
  requests.push({ repeatCell: { range: range(0, ROTATIVO_HEADER_ROW, 0, columnCount), cell: {}, fields: "userEnteredValue" } });
  write(0, 0, { stringValue: official ? String(label(rows[0]?.[0])) : title.trim().toLocaleUpperCase("pt-BR") });
  write(1, 0, standardized?.userEnteredValue || { stringValue: `Padronizada em ${stamp}` });
  write(2, 0, updated?.userEnteredValue || { stringValue: "" });
  write(3, 0, responsible?.userEnteredValue || { stringValue: "" });
  // Data da contagem sempre como data dd/mm/aaaa; data inválida (ex.: 02/02/00) fica como está, para o Lucas corrigir.
  const dateSerialValue = date?.userEnteredValue?.numberValue ?? dateSerial(String(label(date)));
  write(4, 0, dateSerialValue != null ? { numberValue: dateSerialValue } : date?.userEnteredValue || { stringValue: "" });
  if (dateSerialValue != null) fmt(4, 5, 0, 1, { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } }, "userEnteredFormat.numberFormat");
  for (let c = 0; c < FIXED; c++) write(ROTATIVO_HEADER_ROW, c, { stringValue: ROTATIVO_HEADERS[c] });
  companies.forEach((value, i) => { if (value) write(COMPANY_ROW, FIXED + i, value); });
  for (let c = FIXED; c < lastColumn; c++) write(COUNT_ROW, c, { formulaValue: `=COUNTA(${colLetter(c)}${DATA_ROW + 1}:${colLetter(c)})` });
  // Única regra de cor: amarelo no que foi preenchido, só nos meses.
  if (lastColumn > FIXED) requests.push({ addConditionalFormatRule: { index: 0, rule: { ranges: [range(DATA_ROW, rowCount, FIXED, Math.max(lastColumn, columnCount))], booleanRule: { condition: { type: "NOT_BLANK" }, format: { backgroundColor: filledYellow } } } } });
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: DATA_ROW, frozenColumnCount: 0 } }, fields: "gridProperties(frozenRowCount,frozenColumnCount)" } });
  const dim = (dimension: string, a: number, b: number, pixelSize: number) => {
    if (b > a) requests.push({ updateDimensionProperties: { range: { sheetId, dimension, startIndex: a, endIndex: b }, properties: { pixelSize }, fields: "pixelSize" } });
  };
  [90, 90, 420, 70, 90, 50].forEach((px, i) => dim("COLUMNS", i, i + 1, px));
  dim("COLUMNS", FIXED, lastColumn, 75);
  dim("ROWS", 0, 1, 32); dim("ROWS", 1, ROTATIVO_HEADER_ROW, 25); dim("ROWS", ROTATIVO_HEADER_ROW, DATA_ROW, 29); dim("ROWS", DATA_ROW, lastRow, 19);
  if (Buffer.byteLength(JSON.stringify(requests)) > 1_800_000) throw new Error("Planilha excede o tamanho seguro de uma operação. Nenhuma alteração foi feita.");
  return { requests, lastRow, lastColumn, headerIndex, rowShift, columns, histories, official, products: rows.slice(headerIndex + 1, lastSourceRow + 1).filter(r => r.some(occupied)).length };
}

export async function readRotativoSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string) {
  const q = `'${sheetName.replace(/'/g, "''")}'`;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties(title),sheets(properties)" });
  const properties = meta.data.sheets?.find(s => s.properties?.title === sheetName)?.properties;
  if (!properties) throw new Error("A aba selecionada não foi encontrada.");
  const rowCount = properties.gridProperties?.rowCount || 0, columnCount = properties.gridProperties?.columnCount || 0;
  if (!rowCount || !columnCount || rowCount * columnCount > 200_000) throw new Error("A aba excede o limite seguro de leitura desta rotina.");
  const values = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${q}!A1:${colLetter(columnCount - 1)}${rowCount}`, valueRenderOption: "FORMULA" });
  const usedRows = Math.max(1, values.data.values?.length || 0);
  const usedColumns = Math.max(5, ...(values.data.values || []).map(row => row.length));
  const result = await sheets.spreadsheets.get({ spreadsheetId, ranges: [`${q}!A1:${colLetter(usedColumns - 1)}${usedRows}`], fields: "properties(title),sheets(properties,merges,conditionalFormats,basicFilter,filterViews,bandedRanges,tables,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat,dataValidation))))" });
  const sheet = result.data.sheets?.find(s => s.properties?.sheetId === properties.sheetId);
  if (!sheet) throw new Error("Não foi possível ler a aba selecionada.");
  return { sheet, title: result.data.properties?.title || sheetName };
}

export async function applyOfficialRotativoModel(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string) {
  const snapshot = await readRotativoSheet(sheets, spreadsheetId, sheetName);
  const plan = planOfficialRotativoModel(snapshot.sheet, snapshot.title);
  const sheetId = snapshot.sheet.properties!.sheetId!;
  const operationId = randomUUID(), backupName = `BKP_EXEC_${operationId.slice(0, 8)}_${sheetName}`.slice(0, 100);
  const backups = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ duplicateSheet: { sourceSheetId: sheetId, newSheetName: backupName } }] } });
  const backupId = backups.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;
  if (backupId == null) throw new Error("Backup não confirmado. A padronização foi interrompida.");
  const requests: Request[] = [...plan.requests,
    { updateSheetProperties: { properties: { sheetId: backupId, hidden: true }, fields: "hidden" } },
    { createDeveloperMetadata: { developerMetadata: { metadataKey: "rotativo_operation", metadataValue: operationId, location: { sheetId }, visibility: "DOCUMENT" } } },
  ];
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }, { retry: false });
  } catch (cause) {
    const status = (cause as { response?: { status?: number } }).response?.status;
    if (status && [400, 401, 403, 404].includes(status)) throw new Error(`Padronização recusada pela API; nenhuma alteração aplicada. Backup: ${backupName}. ${cause instanceof Error ? cause.message : ""}`);
    const check = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId),developerMetadata)" }).catch(() => null);
    const applied = check?.data.sheets?.find(s => s.properties?.sheetId === sheetId)?.developerMetadata?.some(m => m.metadataKey === "rotativo_operation" && m.metadataValue === operationId);
    if (!applied) {
      const error = new Error(`Não foi possível confirmar a execução. Não repita agora; confira a planilha e o backup ${backupName}.`);
      error.name = "RotativoUncertainWriteError";
      throw error;
    }
  }
  const verified = await readRotativoSheet(sheets, spreadsheetId, sheetName), rows = gridRows(verified.sheet);
  if (!ROTATIVO_HEADERS.every((h, i) => label(rows[ROTATIVO_HEADER_ROW]?.[i]) === h)) throw new Error("Cabeçalho não confirmado após a padronização. Preserve o backup.");
  for (let c = FIXED; c < plan.lastColumn; c++) if (rows[COUNT_ROW]?.[c]?.effectiveValue?.errorValue || rows[COUNT_ROW]?.[c]?.effectiveValue?.numberValue == null) throw new Error(`Contador ${colLetter(c)}${COUNT_ROW + 1} não calculado. Preserve o backup.`);
  const before = gridRows(snapshot.sheet);
  const mapping = [...plan.columns, ...plan.histories];
  for (let r = plan.headerIndex; r < before.length; r++) for (let c = 0; c < mapping.length; c++) {
    if ((r === plan.headerIndex && c < FIXED) || mapping[c] < 0) continue;
    const source = before[r]?.[mapping[c]] || {}, target = rows[r + plan.rowShift]?.[c] || {};
    const a = source.userEnteredValue || {}, b = target.userEnteredValue || {};
    const structural = plan.rowShift !== 0 || mapping.some((v, i) => v !== i);
    const formulaMoved = Boolean(a.formulaValue && structural);
    if (formulaMoved ? (!b.formulaValue || JSON.stringify(source.effectiveValue) !== JSON.stringify(target.effectiveValue)) : JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`Dados divergentes em ${colLetter(c)}${r + plan.rowShift + 1}. Preserve o backup e não confirme.`);
    }
    if (c >= FIXED && JSON.stringify(source.userEnteredFormat?.numberFormat || {}) !== JSON.stringify(target.userEnteredFormat?.numberFormat || {})) throw new Error("Formato do histórico divergente. Preserve o backup.");
    if (!formulaMoved && (source.formattedValue || "") !== (target.formattedValue || "")) throw new Error(`Exibição divergente em ${colLetter(c)}${r + plan.rowShift + 1}. Preserve o backup.`);
  }
  return { products: plan.products, backupUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${backupId}`, operationId };
}
