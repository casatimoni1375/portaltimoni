import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const source = readFileSync(new URL('./timoni-portal/lib/reunioes.ts', import.meta.url), 'utf8');
const row = (patch = {}) => {
  const item = { id: 'reuniao-ficticia', unit: 'Araras', date: '2026-12-10', time: '08:00', secondDate: '2026-12-20', secondTime: '09:00', frequency: 'Mensal', leaders: 'Liderança atual', pautaUrl: '', ataUrl: '', slidesUrl: '', status: 'agendada', createdAt: '2026-11-01', updatedAt: '2026-11-05', additionalDates: '[]', ...patch };
  return ['id', 'unit', 'date', 'time', 'secondDate', 'secondTime', 'frequency', 'leaders', 'pautaUrl', 'ataUrl', 'slidesUrl', 'status', 'createdAt', 'updatedAt', 'additionalDates'].map(key => item[key]);
};
async function harness(initial = [row()]) {
  let rows = initial, fail = false, sheetId = 77, invalidations = 0;
  const writes = [], cached = new Map();
  const sheets = { spreadsheets: {
    values: { get: async () => ({ data: { values: rows } }), update: async value => writes.push(['update', value]), append: async () => { throw Error('Não usar append separado'); } },
    get: async () => ({ data: { sheets: [{ properties: { title: 'Reunioes', sheetId } }] } }),
    batchUpdate: async value => { writes.push(['batch', value]); if (fail) throw Error('Falha fictícia do lote'); },
  } };
  const mocks = {
    'next/cache': { unstable_cache: fn => async token => { if (!cached.has(token)) cached.set(token, fn(token)); return cached.get(token); }, revalidateTag: () => { invalidations++; cached.clear(); } },
    googleapis: { google: { auth: { OAuth2: class { setCredentials() {} } }, sheets: () => sheets } },
    '@/lib/google-calendar': { getAccessTokenFromRefreshToken: () => { throw Error('Não buscar credencial real'); } },
    '@/lib/comunicados': { COMUNICADOS_SPREADSHEET_ID: 'planilha-ficticia' },
  };
  const ctx = vm.createContext({ Date, Math });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source), { context: ctx });
  await mod.link(spec => { const values = mocks[spec]; assert.ok(values, spec); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  return { api: mod.namespace, writes, invalidations: () => invalidations, setRows: value => { rows = value; }, failBatch: () => { fail = true; }, noSheet: () => { sheetId = undefined; } };
}

test('Reuniões: edição usa campos atuais da linha e não restaura dados antigos do cache', async () => {
  const h = await harness([row({ leaders: 'Liderança antiga' })]);
  await h.api.listMeetings('token-ficticio'); h.setRows([row({ leaders: 'Liderança atual' })]);
  await h.api.updateMeeting('token-ficticio', 'reuniao-ficticia', { status: 'concluida' }, 'Araras');
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][1].requestBody.values[0][7], 'Liderança atual');
  assert.equal(h.writes[0][1].requestBody.values[0][11], 'concluida');
});

test('Reuniões: mudança de unidade após a guarda impede editar, excluir ou concluir ocorrência', async () => {
  const h = await harness([row({ unit: 'Rio Claro' })]);
  await assert.rejects(h.api.updateMeeting('ficticio', 'reuniao-ficticia', { status: 'concluida' }, 'Araras'), /mudou de unidade/);
  await assert.rejects(h.api.deleteMeeting('ficticio', 'reuniao-ficticia', 'Araras'), /mudou de unidade/);
  await assert.rejects(h.api.archiveMeetingOccurrence('ficticio', 'reuniao-ficticia', '2026-12-10', 'Araras'), /mudou de unidade/);
  assert.equal(h.writes.length, 0);
});

test('Reuniões: histórico e próxima ocorrência seguem no mesmo lote preservando demais campos', async () => {
  const h = await harness();
  await h.api.archiveMeetingOccurrence('ficticio', 'reuniao-ficticia', '2026-12-10', 'Araras');
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][0], 'batch');
  const requests = h.writes[0][1].requestBody.requests;
  assert.equal(requests.length, 2); assert.equal(requests[0].appendCells.sheetId, 77);
  const history = requests[0].appendCells.rows[0].values.map(cell => cell.userEnteredValue.stringValue);
  const current = requests[1].updateCells.rows[0].values.map(cell => cell.userEnteredValue.stringValue);
  assert.equal(history[0], 'history-reuniao-ficticia-2026-12-10'); assert.equal(history[2], '2026-12-10'); assert.equal(history[11], 'concluida');
  assert.equal(current[2], '2026-12-20'); assert.equal(current[3], '09:00'); assert.equal(current[7], 'Liderança atual');
  assert.equal(requests[1].updateCells.range.startRowIndex, 1); assert.equal(h.invalidations(), 1);
});

test('Reuniões: histórico existente não é duplicado e falha de lote não dispara segunda gravação', async () => {
  const h = await harness([row(), row({ id: 'history-reuniao-ficticia-2026-12-10', status: 'concluida' })]);
  h.failBatch();
  await assert.rejects(h.api.archiveMeetingOccurrence('ficticio', 'reuniao-ficticia', '2026-12-10', 'Araras'), /Falha fictícia/);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][1].requestBody.requests.length, 1); assert.equal(h.invalidations(), 0);
});

test('Reuniões: aba ausente e ocorrência inválida não iniciam gravação parcial', async () => {
  const h = await harness();
  await assert.rejects(h.api.archiveMeetingOccurrence('ficticio', 'reuniao-ficticia', '2020-01-01', 'Araras'), /não encontrada/);
  h.noSheet();
  await assert.rejects(h.api.archiveMeetingOccurrence('ficticio', 'reuniao-ficticia', '2026-12-10', 'Araras'), /Aba de reuniões/);
  assert.equal(h.writes.length, 0);
});
