import type { sheets_v4 } from "googleapis";

// Restaura no mesmo sheetId; nunca renomeia, remove ou consome o backup.
export function planRotativoRestore(source: sheets_v4.Schema$Sheet, backup: sheets_v4.Schema$Sheet): sheets_v4.Schema$Request[] {
  const id = source.properties?.sheetId, backupId = backup.properties?.sheetId;
  const grid = backup.properties?.gridProperties;
  if (id == null || backupId == null || id === backupId || !grid?.rowCount || !grid.columnCount) throw new Error("Backup ou aba original inválidos.");
  for (const sheet of [source, backup]) {
    const foreignMetadata = sheet.developerMetadata?.some(metadata => metadata.metadataKey !== "rotativo_operation"
      || metadata.visibility !== "DOCUMENT" || !metadata.metadataValue
      || metadata.location?.sheetId !== sheet.properties?.sheetId || metadata.location?.dimensionRange);
    const dimensionMetadata = sheet.data?.some(block => [...(block.rowMetadata || []), ...(block.columnMetadata || [])].some(dimension => dimension.developerMetadata?.length || dimension.dataSourceColumnReference));
    if ((sheet.properties?.sheetType && sheet.properties.sheetType !== "GRID") || sheet.charts?.length || ("tables" in sheet && Array.isArray(sheet.tables) && sheet.tables.length) || sheet.protectedRanges?.length || sheet.slicers?.length || sheet.rowGroups?.length || sheet.columnGroups?.length || foreignMetadata || dimensionMetadata || sheet.data?.some(block => block.rowData?.some(row => row.values?.some(cell => cell.pivotTable || cell.dataSourceTable || cell.dataSourceFormula)))) {
      throw new Error("Esta aba contém recursos que exigem revisão da restauração. Nenhuma alteração foi feita.");
    }
  }
  const range = (sheetId: number) => ({ sheetId, startRowIndex: 0, endRowIndex: grid.rowCount, startColumnIndex: 0, endColumnIndex: grid.columnCount });
  const remap = <T>(value: T): T => JSON.parse(JSON.stringify(value), (key, item) => key === "sheetId" && item === backupId ? id : item);
  const requests: sheets_v4.Schema$Request[] = [];
  if (source.basicFilter) requests.push({ clearBasicFilter: { sheetId: id } });
  for (const filter of source.filterViews || []) if (filter.filterViewId != null) requests.push({ deleteFilterView: { filterId: filter.filterViewId } });
  for (let index = (source.conditionalFormats?.length || 0) - 1; index >= 0; index--) requests.push({ deleteConditionalFormatRule: { sheetId: id, index } });
  for (const band of source.bandedRanges || []) if (band.bandedRangeId != null) requests.push({ deleteBanding: { bandedRangeId: band.bandedRangeId } });
  requests.push({ unmergeCells: { range: { sheetId: id } } });
  requests.push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } }, fields: "gridProperties(frozenRowCount,frozenColumnCount)" } });
  requests.push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { rowCount: grid.rowCount, columnCount: grid.columnCount } }, fields: "gridProperties(rowCount,columnCount)" } });
  // Linhas visíveis podem ser omitidas no backup; desfaça a ocultação herdada antes de reaplicar as dimensões salvas.
  for (const [dimension, endIndex] of [["ROWS", grid.rowCount], ["COLUMNS", grid.columnCount]] as const) {
    requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension, startIndex: 0, endIndex }, properties: { hiddenByUser: false }, fields: "hiddenByUser" } });
  }
  requests.push({ copyPaste: { source: range(backupId), destination: range(id), pasteType: "PASTE_NORMAL" } });
  requests.push({ copyPaste: { source: range(backupId), destination: range(id), pasteType: "PASTE_DATA_VALIDATION" } });
  // Notas não fazem parte da garantia documentada de PASTE_NORMAL.
  requests.push({ repeatCell: { range: range(id), cell: {}, fields: "note" } });
  for (const block of backup.data || []) {
    if (block.rowData?.length) requests.push({ updateCells: { start: { sheetId: id, rowIndex: block.startRow || 0, columnIndex: block.startColumn || 0 }, rows: block.rowData.map(row => ({ values: (row.values || []).map(cell => ({ note: cell.note ?? null })) })), fields: "note" } });
    for (const [dimension, metadata, start] of [["ROWS", block.rowMetadata, block.startRow || 0], ["COLUMNS", block.columnMetadata, block.startColumn || 0]] as const) {
      for (let i = 0; i < (metadata?.length || 0); i++) {
        const props = metadata![i];
        requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension, startIndex: start + i, endIndex: start + i + 1 }, properties: { pixelSize: props.pixelSize, hiddenByUser: Boolean(props.hiddenByUser) }, fields: "pixelSize,hiddenByUser" } });
      }
    }
  }
  for (const [index, rule] of (backup.conditionalFormats || []).entries()) requests.push({ addConditionalFormatRule: { index, rule: remap(rule) } });
  if (backup.basicFilter) requests.push({ setBasicFilter: { filter: remap(backup.basicFilter) } });
  for (const filter of backup.filterViews || []) { const properties = { ...filter }; delete properties.filterViewId; requests.push({ addFilterView: { filter: remap(properties) } }); }
  for (const band of backup.bandedRanges || []) { const properties = { ...band }; delete properties.bandedRangeId; requests.push({ addBanding: { bandedRange: remap(properties) } }); }
  requests.push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: grid.frozenRowCount || 0, frozenColumnCount: grid.frozenColumnCount || 0, hideGridlines: Boolean(grid.hideGridlines) } }, fields: "gridProperties(frozenRowCount,frozenColumnCount,hideGridlines)" } });
  if (requests.length > 10000 || Buffer.byteLength(JSON.stringify(requests)) > 1_800_000) throw new Error("Restauração excede o tamanho seguro. Nenhuma alteração foi feita.");
  return requests;
}
