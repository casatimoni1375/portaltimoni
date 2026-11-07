import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`./timoni-portal/${path}`, import.meta.url), 'utf8');
async function module(path, mocks = {}, globals = {}) {
  const ctx = vm.createContext(globals), mod = new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context: ctx });
  await mod.link(spec => { const values = mocks[spec]; assert.ok(values, spec); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate(); return mod.namespace;
}
const parser = await module('lib/purchase-order-details.ts');
const parse = value => JSON.parse(JSON.stringify(parser.parsePurchaseOrderDescription(value)));
const order = (id, patch = {}) => ({ id, nome: 'Pedido fictício', unidade: 'araras', enviadoEm: '2026-11-01', previsaoEntrega: '', ...patch });
async function store(initial = []) {
  let current = initial, writes = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('SELECT orders')) return [{ orders: Object.fromEntries(current.map(item => [item.id, item])) }];
    if (query.includes('SET orders =')) { current = Object.values(JSON.parse(values[0])); writes.push(query); }
    return [];
  };
  const api = await module('lib/purchase-orders.ts', {
    '@neondatabase/serverless': { neon: () => sql },
    '@/lib/trello': { normalizeTrelloText: value => value.toLowerCase() },
  }, { process: { env: { DATABASE_URL: 'postgres://exemplo.invalid/ficticio' } } });
  return { api, current: () => current, writes };
}

test('itens: conserva zeros, quantidade decimal e ordem, sem somar unidades desconhecidas', () => {
  const result = parse('Fornecedor fictício\r\nTotal: 2 itens\r\n001 | Produto A | 2,5\r\n002 | Produto B | 100 m');
  assert.deepEqual(result.itens, [{ codigo: '001', produto: 'Produto A', quantidade: '2,5' }, { codigo: '002', produto: 'Produto B', quantidade: '100 m' }]);
  assert.equal(result.parcial, false);
});

test('itens: texto vazio, linhas incompletas e total divergente não geram dados inventados', () => {
  assert.deepEqual(parse('').itens, []);
  const result = parse('Total: 3 itens\n01 | Produto | 1\n02 | | 4\n03 | Produto | com separador | 2');
  assert.equal(result.itens.length, 1); assert.equal(result.parcial, true); assert.equal(result.totalInformado, 3);
});

test('snapshot: atualização só de resumo preserva descrição e data por ID e unidade', async () => {
  const h = await store([order('a', { descricao: '01 | Produto | 5', detalhesAtualizadosEm: '2026-11-01' })]);
  await h.api.savePurchaseOrdersSnapshot([order('a', { nome: 'Pedido atualizado' })], '2026-11-05');
  assert.equal(h.current()[0].descricao, '01 | Produto | 5');
  assert.equal(h.current()[0].detalhesAtualizadosEm, '2026-11-01');
  assert.equal(h.current()[0].nome, 'Pedido atualizado');
});

test('snapshot: mudança só nos itens é persistida mesmo com resumo igual', async () => {
  const h = await store([order('a', { descricao: '01 | Produto | 5' })]);
  const result = await h.api.savePurchaseOrdersSnapshot([order('a', { descricao: '01 | Produto | 6' })], '2026-11-05');
  assert.equal(result.changed, true); assert.equal(h.current()[0].descricao, '01 | Produto | 6'); assert.equal(h.writes.length, 1);
});

test('snapshot: detalhes não passam para outro ID, outra unidade ou pedido de mesmo nome', async () => {
  const h = await store();
  const original = order('a', { descricao: '01 | Produto | 5' });
  for (const next of [order('b'), order('a', { unidade: 'rio_claro' })]) {
    assert.equal(h.api.preservePurchaseOrderDetails([next], [original])[0].descricao, undefined);
  }
  assert.equal(h.api.preservePurchaseOrderDetails([order('a', { descricao: '' })], [original])[0].descricao, '');
});

const require = createRequire(import.meta.url), ts = require('./timoni-portal/node_modules/typescript');
const jsx = require('./timoni-portal/node_modules/react/jsx-runtime');
const { renderToStaticMarkup } = require('./timoni-portal/node_modules/react-dom/server');
async function modal(fetcher) {
  const slots = [], effects = [], pending = []; let cursor = 0, closed = 0;
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useId: () => { cursor++; return 'detalhes-ficticios'; },
    useEffect: (fn, deps) => { const i = cursor++; if (!effects[i] || deps.some((d, k) => d !== effects[i].deps[k])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const output = ts.transpileModule(read('app/dashboard/pedido-de-compra/pedido-detalhes.tsx'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const ctx = vm.createContext({ AbortController, Intl, Date, encodeURIComponent, fetch: fetcher });
  const mod = new vm.SourceTextModule(output, { context: ctx });
  await mod.link(spec => { const values = spec === 'react' ? react : spec === 'react/jsx-runtime' ? jsx : null; assert.ok(values, spec); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  let props = { id: 'pedido-ficticio', name: 'Pedido fictício', onClose: () => closed++ };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  function render() { cursor = 0; const tree = mod.namespace.default(props); tree.props.ref.current = dialog; while (pending.length) pending.shift()(); return tree; }
  return { render, dialog, closed: () => closed, change: patch => { props = { ...props, ...patch }; }, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('janela: descrição e produtos são escapados como texto e não criam links ou etiquetas', async () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const h = await modal(async () => Response.json({ ok: true, pedido: { nome: 'Pedido fictício', enviadoEm: '', previsaoEntrega: '', registradoEm: null, descricaoOriginal: malicious, itens: [{ codigo: '001', produto: malicious, quantidade: '1' }] } }));
  h.render(); await flush();
  const html = renderToStaticMarkup(h.render());
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img|<a |Urgente|Enviado|Rio Claro/);
  assert.match(html, /Ver descrição registrada/); h.unmount();
});

test('janela: fechar cancela leitura e resposta de pedido anterior não substitui o atual', async () => {
  const requests = [];
  const h = await modal((url, init) => new Promise(resolve => requests.push({ url, init, resolve })));
  h.render(); h.change({ id: 'pedido-seguinte' }); h.render();
  assert.equal(requests[0].init.signal.aborted, true);
  requests[1].resolve(Response.json({ ok: true, pedido: { nome: 'Pedido atual', itens: [], descricaoOriginal: '' } })); await flush();
  requests[0].resolve(Response.json({ ok: true, pedido: { nome: 'Pedido antigo', itens: [], descricaoOriginal: '' } })); await flush();
  assert.match(renderToStaticMarkup(h.render()), /Pedido atual/);
  h.unmount(); assert.equal(requests[1].init.signal.aborted, true);
});

test('janela: evento de fechamento antigo não desmonta diálogo já reaberto', async () => {
  const h = await modal(async () => Response.json({ ok: false, error: 'Indisponível' }, { status: 503 }));
  const tree = h.render(); await flush();
  tree.props.onClose({ currentTarget: { open: true } }); assert.equal(h.closed(), 0);
  tree.props.onClose({ currentTarget: { open: false } }); assert.equal(h.closed(), 1);
  assert.match(renderToStaticMarkup(h.render()), /Tentar novamente/); h.unmount();
});
