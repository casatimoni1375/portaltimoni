import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`./timoni-portal/${path}`, import.meta.url), 'utf8');
const ctx = vm.createContext({ AbortController, setTimeout, clearTimeout });
const mod = new vm.SourceTextModule(stripTypeScriptTypes(read('lib/screen-request.ts')), { context: ctx });
await mod.link(() => { throw Error('Sem importações externas'); }); await mod.evaluate();
const { createScreenRequest, ScreenRequestError } = mod.namespace;
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('eventos próximos de foco/visibilidade fazem uma consulta por janela de cinco segundos', async () => {
  let now = 0, calls = 0;
  const loader = createScreenRequest({ now: () => now, load: async () => ++calls, onData() {}, onError() {} });
  await loader.run(); await loader.run(); now = 4999; await loader.run(); assert.equal(calls, 1);
  now = 5000; await loader.run(); assert.equal(calls, 2); loader.dispose();
});

test('requisições nunca se sobrepõem; eventos automáticos não formam uma fila', async () => {
  const work = deferred(); let calls = 0;
  const loader = createScreenRequest({ load: () => { calls++; return work.promise; }, onData() {}, onError() {} });
  const running = loader.run(); await loader.run(); await loader.run();
  assert.equal(calls, 1); work.resolve('ok'); await running; assert.equal(calls, 1); loader.dispose();
});

test('invalidações durante consulta viram uma única releitura e preservam atualização manual', async () => {
  const requests = [], data = [];
  const loader = createScreenRequest({ load: (_signal, force) => { const task = deferred(); requests.push({ task, force }); return task.promise; }, onData: value => data.push(value), onError() {} });
  const first = loader.run();
  await loader.run({ urgent: true }); await loader.run({ force: true }); await loader.run({ urgent: true });
  assert.equal(requests.length, 1); requests[0].task.resolve('primeira'); await first;
  assert.equal(requests.length, 2); assert.equal(requests[1].force, true);
  requests[1].task.resolve('nova'); await flush(); assert.deepEqual(data, ['primeira', 'nova']); loader.dispose();
});

test('sair da tela aborta consulta e impede dados, erros e mudanças de carregamento tardios', async () => {
  const task = deferred(), callbacks = []; let signal;
  const loader = createScreenRequest({ load: current => { signal = current; return task.promise; }, onData: value => callbacks.push(['data', value]), onError: error => callbacks.push(['error', error]), onBusy: busy => callbacks.push(['busy', busy]) });
  const running = loader.run(); await loader.run({ urgent: true }); loader.dispose(); assert.equal(signal.aborted, true);
  task.resolve('resposta antiga'); await running; assert.deepEqual(callbacks, [['busy', true]]);
});

test('falha temporária mantém instância disponível para nova tentativa explícita', async () => {
  let calls = 0; const data = [], failures = [];
  const loader = createScreenRequest({ load: async () => { if (++calls === 1) throw Error('offline fictício'); return 'recuperado'; }, onData: value => data.push(value), onError: error => failures.push(error.message) });
  await loader.run(); await loader.run({ urgent: true });
  assert.deepEqual(failures, ['offline fictício']); assert.deepEqual(data, ['recuperado']); loader.dispose();
});

test('consulta com timeout aborta, libera carregamento e permite recuperação', async () => {
  let fail = true; const errors = [], busy = [], data = [];
  const loader = createScreenRequest({ timeoutMs: 5, load: signal => fail ? new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelado')))) : Promise.resolve('ok'), onError: error => errors.push(error.message), onData: value => data.push(value), onBusy: value => busy.push(value) });
  await loader.run(); assert.match(errors[0], /demorou/); assert.deepEqual(busy, [true, false]);
  fail = false; await loader.run({ urgent: true }); assert.deepEqual(data, ['ok']); loader.dispose();
});

test('instâncias de duas pessoas não compartilham resposta, espera ou identidade', async () => {
  const a = [], b = [];
  const first = createScreenRequest({ load: async () => 'pessoa A', onData: value => a.push(value), onError() {} });
  const second = createScreenRequest({ load: async () => 'pessoa B', onData: value => b.push(value), onError() {} });
  await first.run(); await second.run(); assert.deepEqual(a, ['pessoa A']); assert.deepEqual(b, ['pessoa B']); first.dispose(); second.dispose();
});

const require = createRequire(import.meta.url), ts = require('./timoni-portal/node_modules/typescript');
function events() {
  const handlers = new Map();
  return { addEventListener: (type, handler) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); }, removeEventListener: (type, handler) => handlers.get(type)?.delete(handler), fire: (type, event = {}) => handlers.get(type)?.forEach(fn => fn(event)), count: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0) };
}
async function component(path, fetcher, more = {}) {
  const slots = [], effects = [], pending = []; let cursor = 0, calls = 0;
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useMemo: fn => { cursor++; return fn(); },
    useCallback: fn => { cursor++; return fn; },
    useEffect: (fn, deps) => { const i = cursor++; if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const window = { ...events(), dispatchEvent(event) { this.fire(event.type, event); return true; }, setInterval: () => 1, clearInterval() {} }, document = { ...events(), visibilityState: 'visible' }, navigator = { onLine: true };
  const mocks = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }, 'next/dynamic': { default: () => 'PedidoDetalhes' }, '@/lib/screen-request': { createScreenRequest, ScreenRequestError }, ...more };
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const context = vm.createContext({ window, document, navigator, Intl, Date, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, fetch: (...args) => { calls++; return fetcher(...args); } });
  const item = new vm.SourceTextModule(output, { context });
  await item.link(spec => { const values = mocks[spec]; assert.ok(values, spec); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); }); await item.evaluate();
  return { window, document, navigator, slots, render: (props = { visibleUnits: ['araras'] }) => { cursor = 0; const tree = item.namespace.default(props); while (pending.length) pending.shift()(); return tree; }, unmount: () => effects.forEach(effect => effect?.cleanup?.()), calls: () => calls };
}

test('Pedidos: array equivalente de unidades não reinicia leitura; tela oculta não consulta', async () => {
  const h = await component('app/dashboard/pedido-de-compra/pedido-compra-client.tsx', async () => Response.json({ ok: true, pedidosEnviados: [], excecoes: [] }));
  h.render(); await flush(); h.render({ visibleUnits: ['araras'] }); assert.equal(h.calls(), 1);
  h.document.visibilityState = 'hidden'; h.window.fire('storage', { key: 'timoni_pedido_compra_updated' }); assert.equal(h.calls(), 1);
  h.document.visibilityState = 'visible'; h.window.fire('focus'); h.document.fire('visibilitychange'); await flush(); assert.equal(h.calls(), 2);
  h.unmount(); assert.equal(h.window.count() + h.document.count(), 0);
});

test('Pedidos: retorno da rede consulta novamente sem esperar o próximo ciclo periódico', async () => {
  const h = await component('app/dashboard/pedido-de-compra/pedido-compra-client.tsx', async () => Response.json({ ok: true, pedidosEnviados: [], excecoes: [] }));
  h.navigator.onLine = false; h.render(); assert.equal(h.calls(), 0); assert.equal(h.slots[0], false);
  h.navigator.onLine = true; h.window.fire('online'); await flush(); assert.equal(h.calls(), 1);
  h.navigator.onLine = false; h.window.fire('focus'); assert.equal(h.calls(), 1);
  h.navigator.onLine = true; h.window.fire('online'); await flush(); assert.equal(h.calls(), 2); h.unmount();
});

test('Pedidos: mudança de unidade cancela resposta antiga e acesso revogado limpa dados exibidos', async () => {
  const tasks = [];
  const h = await component('app/dashboard/pedido-de-compra/pedido-compra-client.tsx', (_url, init) => { const task = deferred(); tasks.push({ ...task, init }); return task.promise; });
  h.render(); h.render({ visibleUnits: ['rio_claro'] }); assert.equal(tasks[0].init.signal.aborted, true);
  tasks[1].resolve(Response.json({ ok: true, pedidosEnviados: [{ id: 'rc', unidade: 'rio_claro', nome: 'Pedido fictício' }], excecoes: [] })); await flush();
  tasks[0].resolve(Response.json({ ok: true, pedidosEnviados: [{ id: 'ara', unidade: 'araras' }], excecoes: [] })); await flush();
  assert.equal(h.slots[2][0].id, 'rc');
  h.window.fire('storage', { key: 'timoni_pedido_compra_updated' }); tasks[2].resolve(Response.json({ ok: false, error: 'Acesso revogado' }, { status: 403 })); await flush();
  assert.equal(h.slots[2].length, 0); assert.equal(h.slots[4], null); h.unmount();
});

test('avisos: eventos simultâneos não sobrepõem leituras e resultado tardio não redireciona após sair', async () => {
  const tasks = [], redirects = [], router = { replace: path => redirects.push(path) };
  const h = await component('components/avisos-required-gate.tsx', (_url, init) => { const task = deferred(); tasks.push({ ...task, init }); return task.promise; }, { 'next/navigation': { usePathname: () => '/dashboard', useRouter: () => router } });
  h.render(); h.window.fire('avisos:read-changed'); h.window.fire('comunicados:changed'); assert.equal(h.calls(), 1);
  tasks[0].resolve(Response.json({ activeCount: 0 })); await flush(); assert.equal(h.calls(), 2);
  h.unmount(); assert.equal(tasks[1].init.signal.aborted, true);
  tasks[1].resolve(Response.json({ activeCount: 5 })); await flush(); assert.deepEqual(redirects, []); assert.equal(h.window.count(), 0);
});

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

test('Reuniões: Rio Claro vê sua unidade; permissão de criar abre formulário sem conceder edição', async () => {
  const base = { date: '9999-12-10', time: '08:00', secondDate: '', secondTime: '', additionalDates: [], status: 'agendada', frequency: 'Mensal' };
  const props = { allowedUnits: ['Rio Claro'], canCreate: true, canManage: false, canDelete: false };
  const h = await component('app/dashboard/reunioes/reunioes-client.tsx', async () => Response.json({ items: [{ ...base, id: 'ara', unit: 'Araras' }, { ...base, id: 'rc', unit: 'Rio Claro' }] }), { '@/components/ui/brazilian-date-input': { BrazilianDateInput: 'DateInput' } });
  h.render(props); await flush();
  const tree = h.render(props), nodes = elements(tree);
  const cards = nodes.filter(item => typeof item.type === 'function' && item.props.meeting);
  assert.deepEqual(cards.map(item => item.props.meeting.id), ['rc']); assert.equal(cards[0].props.canManage, false);
  nodes.find(item => item.type === 'button' && item.props.children === '+ Nova reunião').props.onClick();
  const formNodes = elements(h.render(props)); assert.ok(formNodes.find(item => item.type === 'form'));
  const select = formNodes.find(item => item.type === 'select'); assert.equal(select.props.value, 'Rio Claro');
  assert.deepEqual(elements(select).filter(item => item.type === 'option').map(item => item.props.children), ['Rio Claro']); h.unmount();
});

test('Reuniões: saída da página cancela consulta e resposta tardia não volta à lista', async () => {
  const task = deferred(); let signal;
  const h = await component('app/dashboard/reunioes/reunioes-client.tsx', (_url, init) => { signal = init.signal; return task.promise; }, { '@/components/ui/brazilian-date-input': { BrazilianDateInput: 'DateInput' } });
  h.render({ allowedUnits: ['Araras'], canCreate: false, canManage: false, canDelete: false }); h.unmount(); assert.equal(signal.aborted, true);
  task.resolve(Response.json({ items: [{ id: 'antiga', unit: 'Araras' }] })); await flush(); assert.equal(h.slots[0].length, 0);
});

test('Estoque: perfil de leitura não recebe formulário nem botões de resposta/edição', async () => {
  const props = { isManager: false, canRespond: false, canEdit: false, canDelete: false, showRequestForm: false, defaultUnit: 'araras', allowedUnits: ['araras'] };
  const h = await component('app/dashboard/estoque/estoque-client.tsx', async () => Response.json({ ok: true, necessidades: [{ id: 'pedido-ficticio', codigo: '001', descricao: 'Produto fictício', status: 'pendente', unidade: 'araras', criadoEm: '', vendedor: 'Pessoa', quantidade: '1' }], produtos: [], vendedores: [], unreadIds: [] }));
  h.render(props); await flush(); const nodes = elements(h.render(props));
  const text = JSON.stringify(nodes.filter(item => typeof item.type === 'string'));
  assert.match(text, /Produto fictício/); assert.doesNotMatch(text, /Enviar resposta|Responder à consulta|Salvar observação|Excluir|Registrar necessidade/);
  h.unmount(); assert.equal(h.window.count() + h.document.count(), 0);
});

test('Estoque: desmontar aborta leitura; foco e visibilidade não disparam consultas sobrepostas', async () => {
  const task = deferred(); let signal;
  const h = await component('app/dashboard/estoque/estoque-client.tsx', (_url, init) => { signal = init.signal; return task.promise; });
  const props = { isManager: false, canRespond: false, showRequestForm: false, defaultUnit: 'araras', allowedUnits: ['araras'] };
  h.render(props); h.window.fire('focus'); h.document.fire('visibilitychange'); assert.equal(h.calls(), 1);
  h.unmount(); assert.equal(signal.aborted, true); task.resolve(Response.json({ ok: true, necessidades: [], produtos: [], vendedores: [] })); await flush();
  assert.equal(h.window.count() + h.document.count(), 0);
});

test('Chat: histórico da Ciça é somente consulta e não marca mensagens antigas como lidas', async () => {
  const requests = [];
  const h = await component('app/dashboard/chat/chat-colaboradores.tsx', async (url, init) => {
    requests.push({ url, init });
    return Response.json(String(url).includes('conversation=') ? { messages: [{ id: '1', sender_user_id: 'compartilhado@example.test', body: 'Histórico preservado', created_at: '2026-11-05T12:00:00Z' }], before: null } : { conversations: [{ id: '1', user_a: 'compartilhado@example.test', user_b: 'outro@example.test' }], before: null });
  });
  const props = { individual: false, historyAllowed: true };
  h.render(props); await flush();
  const nav = elements(h.render(props)).find(item => item.type === 'nav');
  elements(nav).find(item => item.type === 'button').props.onClick();
  h.render(props); await flush(); const tree = h.render(props), text = JSON.stringify(tree);
  assert.match(text, /Histórico preservado/); assert.match(text, /compartilhado@example.test/);
  assert.equal(elements(tree).some(item => item.type === 'form' || item.type === 'textarea' || item.type === 'select'), false);
  assert.ok(requests.every(item => item.url.startsWith('/api/chat-historico') && !item.init.method)); h.unmount();
});

test('Chat: envio usa só destinatário e texto, não permite duplicação por dois cliques ou escolher identidade', async () => {
  const requests = [], sent = deferred();
  const h = await component('app/dashboard/chat/chat-colaboradores.tsx', async (url, init) => {
    requests.push({ url, init });
    if (init.method === 'POST') return sent.promise;
    if (init.method === 'PATCH') return Response.json({ ok: true });
    if (String(url).includes('peer=')) return Response.json({ messages: [], before: null });
    return Response.json({ currentUser: { id: 'pessoa-ficticia', name: 'Pessoa fictícia' }, contacts: [{ id: 'destinatario', name: 'Pessoa alvo', unit: 'Araras', unread: 0 }], permissions: { send: true, edit: false, remove: false } });
  });
  const props = { individual: true, historyAllowed: false };
  h.render(props); await flush();
  const nav = elements(h.render(props)).find(item => item.type === 'nav'); elements(nav).find(item => item.type === 'button').props.onClick();
  h.render(props); await flush();
  elements(h.render(props)).find(item => item.type === 'textarea').props.onChange({ target: { value: 'Mensagem fictícia' } });
  const tree = h.render(props), form = elements(tree).find(item => item.type === 'form');
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(requests.filter(item => item.init.method === 'POST').length, 1);
  assert.deepEqual(JSON.parse(requests.find(item => item.init.method === 'POST').init.body), { peer: 'destinatario', message: 'Mensagem fictícia' });
  assert.equal(elements(tree).some(item => item.type === 'select'), false); assert.doesNotMatch(JSON.stringify(tree), /Histórico antigo/);
  sent.resolve(Response.json({ message: { id: '1' } }, { status: 201 })); await flush(); h.unmount();
});

test('Conferência: falha temporária oferece nova tentativa sem pedir ou gerar chave', async () => {
  let fail = true;
  const h = await component('app/dashboard/conferencia-pedidos/ConferenciaPedidosClient.tsx', async () => fail ? Response.json({ error: 'temporário' }, { status: 503 }) : Response.json({ configured: true }), { './xlsx': { downloadWorkbook() {} } });
  h.render(); await flush();
  const tree = h.render(); const text = JSON.stringify(tree);
  assert.match(text, /Não foi possível verificar/); assert.doesNotMatch(text, /Configurar agora|Create API key|\/configurar\"/);
  const retry = elements(tree).find(item => item.type === 'button' && item.props.children === 'Tentar novamente'); assert.ok(retry);
  fail = false; retry.props.onClick(); await flush();
  assert.doesNotMatch(JSON.stringify(h.render()), /Não foi possível verificar/); h.unmount();
});

test('Configuração Gemini: mostra estado central sem formulário, senha, chave ou link externo', async () => {
  const h = await component('app/dashboard/conferencia-pedidos/configurar/ConfigurarGeminiClient.tsx', async () => Response.json({ configured: false, source: 'none' }), { 'next/link': { default: 'a' } });
  h.render(); await flush(); const tree = h.render(), nodes = elements(tree);
  assert.match(JSON.stringify(tree), /administração precisa concluir/);
  assert.equal(nodes.some(item => ['input', 'form'].includes(item.type)), false);
  assert.ok(nodes.filter(item => item.type === 'a').every(item => item.props.href.startsWith('/'))); h.unmount();
});
