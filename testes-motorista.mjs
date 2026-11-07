import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { escapePrintHtml, safePrintUrl } from './timoni-portal/lib/motorista-print.ts';
import { createMotoristaReadLoader } from './timoni-portal/lib/motorista-read-loader.ts';
import { redactMotoristaResponse } from './timoni-portal/lib/motorista-response.ts';
const read = p => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
test('impressão trata marcação e quebra de atributo como texto', () => {
  assert.equal(escapePrintHtml(`<img src=x onerror=alert(1)>"'&`), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'invalida']) assert.equal(safePrintUrl(url), '');
  assert.equal(safePrintUrl('https://maps.google.com/?q=Casa'), 'https://maps.google.com/?q=Casa');
});
test('HTML final da impressão escapa os campos de viagem', () => {
  const source = read('timoni-portal/app/dashboard/motorista/motorista-agenda.tsx');
  const code = source.slice(source.indexOf('  function imprimirDia()'), source.indexOf('  const itensDia ='));
  let html;
  const attack = '<img src=x onerror=alert(1)>';
  const trip = Object.fromEntries(['clienteFornecedor','numeroPedido','contatoNome','volumes','info','preenchidoPor'].map(k => [k, attack]));
  const context = { viagens: { dia: [trip] }, selecionado: 'dia', setErro: () => {}, dateFromString: () => new Date(2026, 10, 3), lerMetaMotorista: () => ({}), formatarEnderecoExibicao: () => attack, separarEndereco: () => ({ link: 'https://maps.google.com/?q=" onclick="bad' }), linhaPrincipalRelatorio: () => attack, documentoTexto: () => attack, pagamentoTexto: () => attack, escapePrintHtml, safePrintUrl, window: { open: () => ({ document: { write: s => { html = s; }, close() {} } }) } };
  vm.runInNewContext(code + ';imprimirDia()', context);
  assert.doesNotMatch(html, /<img|<IMG|href="[^"]*" onclick=/);
  assert.match(html, /&lt;img/);
  assert.match(source, /length: 42/);
});
function gas(token = 'segredo') {
  const effects = [];
  const context = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => token }) }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return JSON.parse(text); } }) } });
  vm.runInContext(read('motorista/apps-script/Codigo.gs'), context);
  for (const name of ['resumoMes','lerDia','criar','atualizar','excluir','reordenar']) context[name] = () => { effects.push(name); return []; };
  context.comLock = fn => fn();
  return { context, effects };
}
test('Apps Script nega token ausente, incorreto e configuração ausente antes de ler/gravar', () => {
  for (const configured of ['', 'segredo']) for (const token of ['', 'errado']) for (const method of ['doGet','doPost']) {
    const h = gas(configured);
    assert.equal(h.context[method]({ parameter: { action: 'criar', token } }).ok, false);
    assert.equal(h.effects.length, 0);
  }
});
test('Apps Script GET autenticado só lê; POST autenticado mantém as quatro gravações', () => {
  const h = gas();
  for (const action of ['criar','atualizar','excluir','reordenar']) assert.equal(h.context.doGet({ parameter: { action, token: 'segredo' } }).codigo, 405);
  assert.equal(h.effects.length, 0);
  for (const action of ['dia','mes']) assert.equal(h.context.doGet({ parameter: { action, token: 'segredo' } }).ok, true);
  for (const action of ['criar','atualizar','excluir','reordenar']) assert.equal(h.context.doPost({ parameter: { action, token: 'segredo' } }).ok, true);
  assert.equal(h.effects.length, 6);
});
test('leitura executa dias em série e ignora atualização sobreposta', async () => {
  let release, calls = 0, successes = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const loader = createMotoristaReadLoader(async () => { calls++; if (calls === 1) await wait; return Response.json({ ok: true, viagens: [] }); });
  const cb = { success: () => successes++, error: e => { throw e; }, done() {} };
  const pending = loader.run(['1','2'], cb);
  await loader.run(['3'], cb);
  assert.equal(calls, 1);
  release(); await pending;
  assert.equal(calls, 2); assert.equal(successes, 1);
});
test('falha parcial não substitui dados exibidos; desmontagem cancela e não atualiza estado', async () => {
  let successes = 0, errors = 0;
  const cb = { success: () => successes++, error: () => errors++, done() {} };
  let calls = 0;
  const loader = createMotoristaReadLoader(async () => { if (++calls === 2) throw Error('offline'); return Response.json({ ok: true, viagens: [] }); });
  await loader.run(['1','2'], cb);
  assert.equal(successes, 0); assert.equal(errors, 1);
  const cancelled = createMotoristaReadLoader((_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(Error('cancelado'))); }));
  const pending = cancelled.run(['1'], cb); cancelled.dispose(); await pending;
  assert.equal(errors, 1); assert.equal(successes, 0);
});

async function routeHarness({ allowed = true, token = 'segredo', upstream, webAppUrl, route = 'timoni-portal/app/api/motorista-leitura/route.ts' } = {}) {
  const calls = [];
  const context = vm.createContext({ URL, URLSearchParams, Response, Error, AbortController, setTimeout, clearTimeout, process: { env: { MOTORISTA_API_TOKEN: token, MOTORISTA_WEBAPP_URL: webAppUrl } }, fetch: async (url, init) => { calls.push({ url, init }); return upstream ? upstream(url, init) : Response.json({ ok: true, viagens: [{ id: 'rc', loja: 'rio_claro' }, { id: 'ara', loja: 'araras' }] }); } });
  const mocks = {
    'next/server': { NextResponse: Response, NextRequest: class {} },
    '@/lib/authorization-server': { requireModuleAuthorization: async () => allowed ? { current: { user: { unit: 'Rio Claro' }, email: 'teste' } } : { current: null, errorResponse: Response.json({ ok: false }, { status: 401 }) } },
    '@/lib/module-authorization': { canReadUnit: (_u,_m,unit) => unit === 'rio_claro', normalizeMotoristaUnit: u => u, canModuleOperation: () => true },
    '@/lib/module-updates': { recordModuleUpdateSafely: async () => {} },
    '@/lib/motorista-response': { redactMotoristaResponse },
  };
  const cache = new Map();
  async function evaluate(path) {
    if (cache.has(path)) return cache.get(path);
    const mod = new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context }); cache.set(path, mod);
    await mod.link(async spec => {
      if (spec === '../agenda-motorista/route') return evaluate('timoni-portal/app/api/agenda-motorista/route.ts');
      const exports = mocks[spec]; if (!exports) throw Error(spec);
      return new vm.SyntheticModule(Object.keys(exports), function() { for (const [k,v] of Object.entries(exports)) this.setExport(k,v); }, { context });
    });
    return mod;
  }
  const mod = await evaluate(route); await mod.evaluate();
  return { api: mod.namespace, calls };
}
const request = query => ({ nextUrl: new URL('https://portal.test/api/motorista-leitura?' + query) });
test('/motorista e API exigem o mesmo módulo; sem sessão não consulta origem', async () => {
  assert.match(read('timoni-portal/app/motorista/page.tsx'), /requireModuleAuthorization\("motorista", "visualizar"\)/);
  const h = await routeHarness({ allowed: false });
  assert.equal((await h.api.GET(request('action=dia&data=2026-11-03'))).status, 401);
  assert.equal(h.calls.length, 0);
});
test('leitura autorizada filtra unidade, token fica no servidor e POST não grava', async () => {
  const h = await routeHarness();
  const response = await h.api.GET(request('action=dia&data=2026-11-03&token=forjado'));
  const body = await response.json();
  assert.deepEqual(body.viagens.map(v => v.id), ['rc']);
  assert.equal(JSON.stringify(body).includes('segredo'), false);
  assert.equal(new URL(h.calls[0].url).searchParams.get('token'), 'segredo');
  assert.equal((await h.api.POST()).status, 405);
  assert.equal(h.calls.length, 1);
});
test('ação inválida e token não configurado impedem consulta externa', async () => {
  const h = await routeHarness({ token: '' });
  assert.equal((await h.api.GET(request('action=excluir'))).status, 400);
  assert.equal((await h.api.GET(request('action=dia&data=2026-11-03'))).status, 503);
  assert.equal(h.calls.length, 0);
});

test('segredo escapado em JSON é removido também de campos aninhados e nomes', async () => {
  const h = await routeHarness({ upstream: () => new Response('{"ok":true,"viagens":[],"eco":{"s\\u0065gredo":"s\\u0065gredo"}}', { headers: { 'Content-Type': 'application/json' } }) });
  const response = await h.api.GET(request('action=dia&data=2026-11-04'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes('segredo"'), false);
  assert.deepEqual(body.eco, { '[segredo removido]': '[segredo removido]' });
  const token = 'abc"\\/ç';
  const clean = redactMotoristaResponse({ nested: [token, encodeURIComponent(token)] }, token);
  assert.deepEqual(clean, { nested: ['[segredo removido]', '[segredo removido]'] });
});

test('origem com resposta HTML não é devolvida ao navegador', async () => {
  const h = await routeHarness({ upstream: () => new Response('<script>segredo</script>') });
  const response = await h.api.GET(request('action=dia&data=2026-11-04'));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).erro, 'Resposta inválida da agenda.');
});

for (const route of ['timoni-portal/app/api/motorista-leitura/route.ts', 'timoni-portal/app/api/motorista-agenda/route.ts']) {
  test(`${route}: usa a URL configurada e mantém o token no servidor`, async () => {
    const h = await routeHarness({ route, webAppUrl: ' https://exemplo.invalid/exec ' });
    const query = route.includes('motorista-agenda') ? 'inicio=2026-11-04&dias=1' : 'action=dia&data=2026-11-04';
    const response = await h.api.GET(request(query));
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.equal(new URL(h.calls[0].url).origin, 'https://exemplo.invalid');
    assert.equal(new URL(h.calls[0].url).searchParams.get('token'), 'segredo');
    assert.equal(JSON.stringify(await response.json()).includes('segredo'), false);
  });
}

test('leitura por período rejeita viagens ausentes ou inválidas em vez de anunciar dia vazio', async () => {
  for (const viagens of [undefined, {}, [null], [42]]) {
    const h = await routeHarness({ route: 'timoni-portal/app/api/motorista-agenda/route.ts', upstream: () => Response.json({ ok: true, viagens }) });
    assert.equal((await h.api.GET(request('inicio=2026-11-04&dias=1'))).status, 502);
  }
});

test('leitura por período remove token de exceções da conexão', async () => {
  const h = await routeHarness({ route: 'timoni-portal/app/api/motorista-agenda/route.ts', upstream: () => { throw Error('falha em https://exemplo.invalid?token=segredo'); } });
  const response = await h.api.GET(request('inicio=2026-11-04&dias=1'));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.doesNotMatch(body.error, /token=segredo/);
  assert.match(body.error, /removido/);
});

test('timeout encerra leitura e permite nova tentativa sem substituir dados', async () => {
  let calls = 0, success = 0, done = 0;
  const errors = [];
  const loader = createMotoristaReadLoader((_url, init) => {
    if (++calls > 1) return Promise.resolve(Response.json({ ok: true, viagens: [] }));
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('cancelado'))));
  }, 5);
  const cb = { success: () => success++, error: e => errors.push(e), done: () => done++ };
  await loader.run(['2026-11-04'], cb);
  assert.equal(success, 0);
  assert.match(errors[0].message, /demorou demais/);
  await loader.run(['2026-11-04'], cb);
  assert.equal(success, 1);
  assert.equal(done, 2);
});

test('agenda administrativa cancela leitura anterior e ignora resposta atrasada', async () => {
  const source = read('timoni-portal/app/dashboard/motorista/motorista-agenda.tsx');
  const start = source.indexOf('  const carregarDias = useCallback(');
  const code = stripTypeScriptTypes(source.slice(start, source.indexOf('  async function carregarDia(', start)));
  let resolveOld, requests = 0, data = {}, loading;
  const load = vm.runInNewContext(code + ';carregarDias', {
    useCallback: fn => fn, ativo: { current: true }, leituraAtual: { current: null }, createMotoristaReadLoader,
    fetch: () => {
      if (++requests === 1) return new Promise(resolve => { resolveOld = resolve; });
      return Promise.resolve(Response.json({ ok: true, viagens: [{ id: 'atual' }] }));
    },
    setLoading: value => { loading = value; }, setErro() {}, setViagens: fn => { data = fn(data); },
  });
  const old = load(['2026-11-03']);
  await load(['2026-11-04']);
  resolveOld(Response.json({ ok: true, viagens: [{ id: 'antigo' }] }));
  await old;
  assert.equal(data['2026-11-04'][0].id, 'atual');
  assert.equal(data['2026-11-03'], undefined);
  assert.equal(loading, false);
});

test('calendário preserva 42 dias e a leitura mensal não dispara dias em paralelo', async () => {
  const source = read('timoni-portal/app/dashboard/motorista/motorista-agenda.tsx');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('function monthDays('), source.indexOf('function weekDays(')));
  const monthDays = vm.runInNewContext(code + ';monthDays', { Date });
  let calls = 0, active = 0, maxActive = 0;
  const days = monthDays(new Date(2026, 10, 4));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);
  const loader = createMotoristaReadLoader(async url => {
    assert.match(url, /^\/api\/agenda-motorista\?/);
    calls++; active++; maxActive = Math.max(maxActive, active);
    await Promise.resolve(); active--;
    return Response.json({ ok: true, viagens: [] });
  }, 30_000, '/api/agenda-motorista');
  await loader.run(days.map(day => day.toISOString().slice(0, 10)), { success: pairs => assert.equal(pairs.length, 42), error: e => { throw e; }, done() {} });
  assert.equal(calls, 42);
  assert.equal(maxActive, 1);
});

test('Apps Script normaliza configuração do token sem abrir leitura com valor vazio', () => {
  const h = gas('  segredo  ');
  assert.equal(h.context.doGet({ parameter: { action: 'dia', token: 'segredo' } }).ok, true);
  const empty = gas('   ');
  assert.equal(empty.context.doGet({ parameter: { action: 'dia', token: '' } }).ok, false);
  assert.equal(empty.effects.length, 0);
});

test('/motorista renderiza apenas após autorização e encaminha ausência de acesso para login', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('./timoni-portal/node_modules/typescript');
  const { outputText } = ts.transpileModule(read('timoni-portal/app/motorista/page.tsx'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  for (const allowed of [true, false]) {
    const context = vm.createContext({});
    const mod = new vm.SourceTextModule(outputText, { context });
    const screen = () => null;
    const mocks = {
      'react/jsx-runtime': { jsx: component => ({ component }) },
      'next/navigation': { redirect: path => { throw Error('redirect:' + path); } },
      '@/lib/authorization-server': { requireModuleAuthorization: async (module, action) => {
        assert.equal(module, 'motorista'); assert.equal(action, 'visualizar');
        return { current: allowed ? { user: { unit: 'Rio Claro' } } : null };
      } },
      './motorista-leitura': { default: screen },
    };
    await mod.link(specifier => {
      const exports = mocks[specifier];
      assert.ok(exports, specifier);
      return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    });
    await mod.evaluate();
    if (allowed) assert.equal((await mod.namespace.default()).component, screen);
    else await assert.rejects(mod.namespace.default(), /redirect:\/login/);
  }
});
