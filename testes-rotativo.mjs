import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { planRotativoRestore } from './timoni-portal/lib/rotativo-restore.ts';
import { rotatingStockFilterTitle, rotatingStockRowFilter } from './timoni-portal/lib/rotativo-filter.ts';
import { planOfficialRotativoModel } from './timoni-portal/lib/rotativo-official-model.ts';
const sheet = (sheetId, title) => ({ properties: { sheetId, title, gridProperties: { rowCount: 100, columnCount: 10, frozenRowCount: 2 } } });
test('reversão mantém gid, título e backup; cópia e formatos usam a aba original', () => {
  const source = sheet(0, 'Produtos'), backup = sheet(42, 'BKP_ROTATIVO_Produtos');
  const original = JSON.stringify([source, backup]);
  const requests = planRotativoRestore(source, backup);
  assert.equal(JSON.stringify([source, backup]), original);
  assert.ok(!requests.some(r => r.deleteSheet || r.duplicateSheet || r.updateSheetProperties?.properties.title));
  for (const r of requests.filter(r => r.copyPaste)) {
    assert.equal(r.copyPaste.source.sheetId, 42);
    assert.equal(r.copyPaste.destination.sheetId, 0);
  }
  assert.ok(requests.some(r => r.copyPaste?.pasteType === 'PASTE_DATA_VALIDATION'));
});
test('reversão remapeia filtros, bandas, regras, dimensões e notas', () => {
  const source = { ...sheet(3, 'P'), basicFilter: {}, conditionalFormats: [{}, {}], filterViews: [{ filterViewId: 11 }], bandedRanges: [{ bandedRangeId: 12 }] };
  const range = { sheetId: 42, startRowIndex: 1, endRowIndex: 5 };
  const backup = { ...sheet(42, 'B'), basicFilter: { range }, conditionalFormats: [{ ranges: [range] }], filterViews: [{ filterViewId: 13, title: 'F', range }], bandedRanges: [{ bandedRangeId: 14, range }], data: [{ rowData: [{ values: [{ note: 'preservar' }] }], rowMetadata: [{ pixelSize: 33, hiddenByUser: true }] }] };
  const requests = planRotativoRestore(source, backup);
  assert.deepEqual(requests.filter(r => r.deleteConditionalFormatRule).map(r => r.deleteConditionalFormatRule.index), [1, 0]);
  assert.equal(requests.find(r => r.addFilterView).addFilterView.filter.range.sheetId, 3);
  assert.equal(requests.find(r => r.addFilterView).addFilterView.filter.filterViewId, undefined);
  assert.equal(requests.find(r => r.addBanding).addBanding.bandedRange.bandedRangeId, undefined);
  assert.equal(requests.find(r => r.updateCells).updateCells.rows[0].values[0].note, 'preservar');
  assert.equal(requests.find(r => r.updateDimensionProperties?.properties.pixelSize === 33).updateDimensionProperties.properties.hiddenByUser, true);
});
test('reversão interrompe recursos não cobertos antes de preparar gravação', () => {
  for (const key of ['charts', 'tables', 'protectedRanges', 'slicers', 'rowGroups', 'columnGroups', 'developerMetadata']) {
    assert.throws(() => planRotativoRestore({ ...sheet(1, 'P'), [key]: [{}] }, sheet(2, 'B')), /revisão/);
  }
  assert.throws(() => planRotativoRestore(sheet(1, 'P'), sheet(1, 'B')), /inválidos/);
});
test('filtro diferencia UUIDs de mesmo prefixo e seleciona linhas exatas', () => {
  assert.notEqual(rotatingStockFilterTitle('12345678-aaaa', 'F'), rotatingStockFilterTitle('12345678-bbbb', 'F'));
  const spec = rotatingStockRowFilter([2, 3, 8, 8, -1, 101, 3.5], 100);
  assert.equal(spec.filterCriteria.condition.values[0].userEnteredValue, '=OR(AND(ROW()>=2,ROW()<=3),ROW()=8)');
  assert.throws(() => rotatingStockRowFilter([], 100), /não possui/);
});
const route = readFileSync(new URL('./timoni-portal/app/api/estoque-rotativo/route-legacy.ts', import.meta.url), 'utf8');
function extract(name, next) { return route.slice(route.indexOf(`async function ${name}(`), route.indexOf(`async function ${next}(`)); }
test('filtro existente recalcula critérios e intervalo inclusive com id zero', async () => {
  const writes = [];
  const sheets = { spreadsheets: { get: async () => ({ data: { sheets: [{ ...sheet(1, 'Produtos'), filterViews: [{ filterViewId: 0, title: rotatingStockFilterTitle('uuid', 'F') }] }] } }), batchUpdate: async r => { writes.push(r); return { data: {} }; } } };
  const fn = vm.runInNewContext(stripTypeScriptTypes(extract('ensureRotatingStockFilterView', 'ensurePendingStatuses')) + ';ensureRotatingStockFilterView', { rotatingStockFilterTitle, rotatingStockRowFilter, ROTATING_STOCK_CENTRAL: { spreadsheetId: 'simulada', sheetName: 'Produtos' } });
  assert.equal(await fn(sheets, 'uuid', 'F', [2]), 0);
  assert.equal(await fn(sheets, 'uuid', 'F', [5]), 0);
  assert.equal(writes.length, 2);
  assert.match(writes[1].requestBody.requests[0].updateFilterView.filter.filterSpecs[0].filterCriteria.condition.values[0].userEnteredValue, /ROW\(\)=5/);
  assert.ok(writes[1].requestBody.requests[0].updateFilterView.fields.includes('criteria'));
  await assert.rejects(fn(sheets, 'uuid', 'F', []));
  assert.equal(writes.length, 2);
});
test('status gravado e formatado em A3, preservado pelo modelo oficial', () => {
  assert.match(route, /!A3`/);
  assert.doesNotMatch(route, /!C2`/);
  assert.match(route, /startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1/);
  const cell = value => ({ userEnteredValue: { stringValue: value }, formattedValue: value });
  for (const [r, c] of [[1, 2], [2, 0]]) {
    const fixture = { ...sheet(1, 'Produtos'), data: [{ rowData: Array.from({ length: 8 }, () => ({ values: [] })) }] };
    fixture.data[0].rowData[r].values[c] = cell('Rotativo atualizado em 03/11/2026');
    fixture.data[0].rowData[6].values = ['VENDA','COMPRA','DESCRIÇÃO','ESTOQUE','UN'].map(cell);
    fixture.data[0].rowData[7].values = ['1','2','Produto','3','UN'].map(cell);
    const plan = planOfficialRotativoModel(fixture, 'F');
    const status = plan.requests.find(request => request.updateCells?.start?.rowIndex === 2 && request.updateCells?.start?.columnIndex === 0);
    assert.equal(status.updateCells.rows[0].values[0].userEnteredValue.stringValue, 'Rotativo atualizado em 03/11/2026');
  }
});

test('reversão sem backup não grava; falha da API é propagada sem repetir', async () => {
  const source = readFileSync(new URL('./timoni-portal/app/api/estoque-rotativo/padronizacao/route-legacy.ts', import.meta.url), 'utf8');
  const fn = vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('async function restoreBackup('), source.indexOf('function apiError('))) + ';restoreBackup', {
    spreadsheetSheets: async sheets => sheets.available,
    backupTitle: name => `BKP_ROTATIVO_${name}`,
    planRotativoRestore,
  });
  let writes = 0;
  const sheets = { available: [sheet(0, 'P')], spreadsheets: {
    get: async () => ({ data: { sheets: sheets.available } }),
    batchUpdate: async (_request, options) => { writes++; assert.equal(options.retry, false); throw Error('falha de rede simulada'); },
  } };
  assert.equal(await fn(sheets, 'simulada', 'P'), false);
  assert.equal(writes, 0);
  sheets.available.push(sheet(2, 'BKP_ROTATIVO_P'));
  await assert.rejects(fn(sheets, 'simulada', 'P'), error => error.name === 'RotativoUncertainWriteError' && /Não repita/.test(error.message));
  assert.equal(writes, 1);
  assert.match(source, /if \(restored\) await deleteSupplierStandardization/);
});

test('reversão aceita e preserva apenas o marcador da própria padronização', () => {
  const source = { ...sheet(0, 'P'), developerMetadata: [{ metadataKey: 'rotativo_operation', metadataValue: 'operacao', visibility: 'DOCUMENT', location: { sheetId: 0 } }] };
  const backup = sheet(42, 'B');
  const requests = planRotativoRestore(source, backup);
  assert.equal(requests.some(r => r.deleteDeveloperMetadata || r.updateDeveloperMetadata), false);
  for (const patch of [{ metadataKey: 'outra' }, { visibility: 'PROJECT' }, { location: { sheetId: 42 } }]) {
    assert.throws(() => planRotativoRestore({ ...source, developerMetadata: [{ ...source.developerMetadata[0], ...patch }] }, backup), /revisão/);
  }
  assert.throws(() => planRotativoRestore(source, { ...backup, data: [{ rowMetadata: [{ developerMetadata: [{}] }] }] }), /revisão/);
});

test('reversão desoculta dimensões mesmo quando o backup omite metadados padrão', () => {
  const requests = planRotativoRestore(sheet(0, 'P'), sheet(42, 'B'));
  const resets = requests.filter(r => r.updateDimensionProperties?.fields === 'hiddenByUser');
  assert.equal(resets.length, 2);
  assert.deepEqual(resets.map(r => [r.updateDimensionProperties.range.dimension, r.updateDimensionProperties.range.endIndex]), [['ROWS', 100], ['COLUMNS', 10]]);
  assert.ok(resets.every(r => r.updateDimensionProperties.range.sheetId === 0 && r.updateDimensionProperties.properties.hiddenByUser === false));
});

test('status atual em A3 prevalece sobre status legado em C2 ao reaplicar o modelo', () => {
  const cell = text => ({ userEnteredValue: { stringValue: text }, formattedValue: text });
  const fixture = { ...sheet(0, 'P'), data: [{ rowData: Array.from({ length: 8 }, () => ({ values: [] })) }] };
  const rows = fixture.data[0].rowData;
  rows[1].values[2] = cell('Rotativo atualizado em 01/11/2026');
  rows[2].values[0] = cell('Rotativo atualizado em 04/11/2026');
  rows[6].values = ['VENDA', 'COMPRA', 'DESCRIÇÃO', 'ESTOQUE', 'UN'].map(cell);
  rows[7].values = ['1', '2', 'Produto', '3', 'UN'].map(cell);
  const plan = planOfficialRotativoModel(fixture, 'P');
  const status = plan.requests.find(r => r.updateCells?.start?.rowIndex === 2 && r.updateCells?.start?.columnIndex === 0);
  assert.equal(status.updateCells.rows[0].values[0].userEnteredValue.stringValue, 'Rotativo atualizado em 04/11/2026');
});

test('filtro novo aceita identificador zero e mantém o UUID completo', async () => {
  const writes = [];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [sheet(0, 'Produtos')] } }),
    batchUpdate: async request => { writes.push(request); return { data: { replies: [{ addFilterView: { filter: { filterViewId: 0 } } }] } }; },
  } };
  const fn = vm.runInNewContext(stripTypeScriptTypes(extract('ensureRotatingStockFilterView', 'ensurePendingStatuses')) + ';ensureRotatingStockFilterView', { rotatingStockFilterTitle, rotatingStockRowFilter, ROTATING_STOCK_CENTRAL: { spreadsheetId: 'simulada', sheetName: 'Produtos' } });
  const uuid = '12345678-1234-4000-8000-123456789012';
  assert.equal(await fn(sheets, uuid, 'Fornecedor', [2, 7]), 0);
  assert.ok(writes[0].requestBody.requests[0].addFilterView.filter.title.endsWith(uuid));
});

test('filtro compacto cobre milhares de linhas; fórmula excessiva bloqueia', () => {
  const contiguous = rotatingStockRowFilter(Array.from({ length: 6402 }, (_, i) => i + 2), 6403);
  assert.equal(contiguous.filterCriteria.condition.values[0].userEnteredValue, '=OR(AND(ROW()>=2,ROW()<=6403))');
  assert.throws(() => rotatingStockRowFilter(Array.from({ length: 6000 }, (_, i) => 2 + i * 2), 12002), /tamanho seguro/);
});

test('reversão mantém bloqueio se a gravação não puder ser confirmada', async () => {
  const source = readFileSync(new URL('./timoni-portal/lib/rotativo-standardization-lock.ts', import.meta.url), 'utf8');
  const calls = [];
  const sql = async strings => {
    const query = strings.join('?');
    calls.push(query);
    return /RETURNING resource/.test(query) ? [{ resource: 'simulada' }] : [];
  };
  // Error precisa pertencer ao mesmo contexto usado pela função de bloqueio.
  const context = vm.createContext({ randomUUID: () => '00000000-0000-4000-8000-000000000001', neon: () => sql, process: { env: { DATABASE_URL: 'simulada' } } });
  const locked = vm.runInContext(stripTypeScriptTypes(source.slice(source.indexOf('export async function'))).replace('export async function', 'async function') + ';withStandardizationLock', context);
  const run = vm.runInContext('(async () => { const e = new Error("incerto"); e.name = "RotativoUncertainWriteError"; throw e; })', context);
  await assert.rejects(locked('simulada', run), /incerto/);
  assert.equal(calls.some(q => /DELETE FROM/.test(q)), false);
  calls.length = 0;
  assert.equal(await locked('simulada', async () => true), true);
  assert.equal(calls.filter(q => /DELETE FROM/.test(q)).length, 1);
});

for (const outcome of ['sem_backup', 'sucesso', 'falha']) {
  test(`rota de reversão: ${outcome} só remove cadastro após confirmação e dentro do bloqueio`, async () => {
    const source = readFileSync(new URL('./timoni-portal/app/api/estoque-rotativo/padronizacao/route-legacy.ts', import.meta.url), 'utf8');
    let locked = false, removed = 0;
    const fn = vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('export async function POST('))).replace('export async function', 'async function') + ';POST', {
      context: async () => ({ sheets: {} }),
      withStandardizationLock: async (_key, run) => { locked = true; try { return await run(); } finally { locked = false; } },
      restoreBackup: async () => { assert.equal(locked, true); if (outcome === 'falha') throw Error('simulada'); return outcome === 'sucesso'; },
      deleteSupplierStandardization: async () => { assert.equal(locked, true); removed++; },
      NextResponse: { json: data => data }, apiError: () => ({ ok: false }),
    });
    const result = await fn({ json: async () => ({ action: 'reverter', spreadsheetId: 'simulada', sheetName: 'P' }) });
    assert.equal(result.ok, outcome !== 'falha');
    assert.equal(removed, outcome === 'sucesso' ? 1 : 0);
    assert.equal(locked, false);
  });
}
