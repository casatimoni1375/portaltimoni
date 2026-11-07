import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

async function load(name, failAt = -1, options = {}) {
  const calls = [], batches = [];
  let failInitAt = options.failInitAt;
  let state = { items: ['anterior'], totals: 'anteriores' };
  const sql = (strings, ...values) => {
    const q = { text: strings.join('?'), values };
    // Neon retorna consultas adiadas: fora da transação, só executam ao aguardar.
    return { ...q, then(resolve, reject) {
      calls.push(q);
      return Promise.resolve().then(() => {
        if (calls.length - 1 === failInitAt) {
          failInitAt = undefined;
          throw Error('falha de inicialização simulada');
        }
        if (/SELECT key FROM portal_chat_maintenance/.test(q.text)) {
          return options.markerPresent ? [{ key: 'existente' }] : [];
        }
        if (/INSERT INTO portal_rotating_stock_migrations/.test(q.text)) {
          return options.markerPresent ? [] : [{ key: 'novo' }];
        }
        return [];
      }).then(resolve, reject);
    } };
  };
  sql.transaction = async queries => {
    batches.push(queries);
    const staged = structuredClone(state);
    for (let i = 0; i < queries.length; i++) {
      if (i === failAt) throw Error('falha simulada');
      const q = queries[i];
      if (/DELETE FROM portal_rotating_stock_items/.test(q.text)) staged.items = [];
      if (/INSERT INTO portal_rotating_stock_items/.test(q.text)) staged.items.push(q.values);
      if (/UPDATE portal_rotating_stock_updates SET fingerprint/.test(q.text)) staged.totals = q.values;
    }
    state = staged;
  };
  const source = readFileSync(new URL(`./timoni-portal/lib/${name}.ts`, import.meta.url), 'utf8');
  const context = vm.createContext({ process: { env: { DATABASE_URL: 'simulado' } } });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await mod.link(async specifier => {
    const exports = specifier.includes('serverless') ? { neon: options.neonFactory || (() => sql) }
      : specifier.includes('access-control') ? { normalizeEmail: s => s?.trim().toLowerCase() || '', hasModuleAccess: () => true }
      : { auth: async () => null };
    const stub = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
    return stub;
  });
  await mod.evaluate();
  return { lib: mod.namespace, calls, batches, state: () => state };
}

for (const name of ['internal-chat', 'rotating-stock']) {
  for (const markerPresent of [false, true]) {
  test(`${name}: inicialização com marcador ${markerPresent ? 'presente' : 'ausente'} não executa limpeza`, async () => {
    const h = await load(name, -1, { markerPresent });
    const init = name === 'internal-chat' ? () => h.lib.getDbUserByEmail('mcrodini@gmail.com') : () => h.lib.ensureRotatingStockSchema();
    await init();
    const first = h.calls.length;
    await init();
    assert.ok(first > 0);
    assert.equal(h.calls.length, first);
    assert.equal(h.calls.some(q => /DELETE FROM|TRUNCATE|clear-test-chat|limpa-testes-iniciais/.test(q.text)), false);
  });
  }
  test(`${name}: chamadas paralelas compartilham a inicialização`, async () => {
    const h = await load(name);
    const init = name === 'internal-chat' ? () => h.lib.getDbUserByEmail('mcrodini@gmail.com') : () => h.lib.ensureRotatingStockSchema();
    await Promise.all([init(), init(), init()]);
    const table = name === 'internal-chat' ? 'portal_chat_conversations' : 'portal_rotating_stock_suppliers';
    assert.equal(h.calls.filter(q => q.text.includes(`CREATE TABLE IF NOT EXISTS ${table}`)).length, 1);
    assert.equal(h.calls.some(q => /DELETE FROM|TRUNCATE/.test(q.text)), false);
  });
  test(`${name}: falha de inicialização permite nova tentativa sem limpeza`, async () => {
    const h = await load(name, -1, { failInitAt: 1 });
    const init = name === 'internal-chat' ? () => h.lib.getDbUserByEmail('mcrodini@gmail.com') : () => h.lib.ensureRotatingStockSchema();
    await assert.rejects(init(), /falha de inicialização simulada/);
    await init();
    assert.equal(h.calls.filter(q => /CREATE TABLE IF NOT EXISTS/.test(q.text)).length > 1, true);
    assert.equal(h.calls.some(q => /DELETE FROM|TRUNCATE/.test(q.text)), false);
  });
}
const item = (source_row, situation) => ({ source_row, target_row: 10, code: 'COD', source_sale_code: 'VENDA', purchase_code: 'COMPRA', suggested_code: '', suggestion_reason: '', description: "D'água", old_stock: 1, new_stock: 2, situation });
const items = [item(1, 'encontrado'), item(2, 'nao_encontrado'), item(3, 'sem_alteracao')];
test('conferência: itens e totais na mesma transação, com bloqueio e parâmetros', async () => {
  const h = await load('rotating-stock');
  await h.lib.saveConference('id', 'ator', 'fingerprint', items);
  assert.equal(h.calls.length, 0);
  assert.equal(h.batches.length, 1);
  const queries = h.batches[0];
  assert.match(queries[0].text, /FOR UPDATE/);
  assert.match(queries[1].text, /DELETE/);
  assert.equal(h.state().items.length, 3);
  assert.deepEqual(Array.from(queries.at(-1).values), ['fingerprint', 'ator', 3, 1, 1, 1, 'id']);
  assert.ok(queries[2].values.includes("D'água"));
  assert.equal(queries[2].text.includes("D'água"), false);
});
for (let phase = 0; phase < 6; phase++) {
  test(`conferência: falha na etapa ${phase + 1} propaga erro e preserva estado simulado`, async () => {
    const h = await load('rotating-stock', phase);
    await assert.rejects(h.lib.saveConference('id', 'ator', 'fp', items), /falha simulada/);
    assert.deepEqual(h.state(), { items: ['anterior'], totals: 'anteriores' });
    assert.equal(h.calls.length, 0);
    assert.equal(h.batches.length, 1);
  });
}
test('conferência vazia: substituição e totais permanecem atômicos', async () => {
  const h = await load('rotating-stock');
  await h.lib.saveConference('id', 'ator', 'fp', []);
  assert.equal(h.batches[0].length, 3);
  assert.deepEqual(h.state().items, []);
  assert.deepEqual(Array.from(h.batches[0].at(-1).values), ['fp', 'ator', 0, 0, 0, 0, 'id']);
});

const require = createRequire(import.meta.url);
const { neon, neonConfig } = require('./timoni-portal/node_modules/@neondatabase/serverless');
for (const fail of [false, true]) {
  test(`driver instalado: lote único ${fail ? 'propaga erro sem repetir' : 'envia itens e totais juntos'}`, async () => {
    const requests = [];
    const previousFetch = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      if (fail) return { ok: false, status: 400, json: async () => ({ message: 'erro simulado no lote', code: '23505' }) };
      return { ok: true, json: async () => ({ results: body.queries.map(() => ({ fields: [], rows: [] })) }) };
    };
    try {
      const h = await load('rotating-stock', -1, {
        neonFactory: () => neon('postgresql://teste:teste@exemplo.invalid/teste'),
      });
      const action = h.lib.saveConference('00000000-0000-4000-8000-000000000001', 'ator', 'fp', items);
      if (fail) await assert.rejects(action, /erro simulado no lote/);
      else await action;
      assert.equal(requests.length, 1);
      const queries = requests[0].queries;
      assert.equal(queries.length, 6);
      assert.match(queries[0].query, /FOR UPDATE/);
      assert.match(queries[1].query, /DELETE FROM portal_rotating_stock_items/);
      assert.equal(queries.filter(q => /INSERT INTO portal_rotating_stock_items/.test(q.query)).length, 3);
      assert.match(queries.at(-1).query, /UPDATE portal_rotating_stock_updates SET fingerprint/);
      assert.ok(queries[2].params.includes("D'água"));
      assert.equal(queries[2].query.includes("D'água"), false);
    } finally {
      neonConfig.fetchFunction = previousFetch;
    }
  });
}
