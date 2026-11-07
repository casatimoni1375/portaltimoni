import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { Auth } from './timoni-portal/node_modules/@auth/core/index.js';
import Credentials from './timoni-portal/node_modules/@auth/core/providers/credentials.js';
import Google from './timoni-portal/node_modules/@auth/core/providers/google.js';
import { CredentialsSignin } from './timoni-portal/node_modules/@auth/core/errors.js';
import { decode, encode } from './timoni-portal/node_modules/@auth/core/jwt.js';

const read = path => readFileSync(new URL(`./timoni-portal/${path}`, import.meta.url), 'utf8');
const secret = 'segredo-ficticio-de-sessao-para-testes-isolados-2026';
const password = 'senha-ficticia-para-conexao-2026';
const context = vm.createContext({ Buffer });
const cache = new Map();
async function load(name) {
  if (cache.has(name)) return cache.get(name);
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(read(`lib/${name}.ts`)), { context });
  cache.set(name, mod);
  await mod.link(spec => {
    if (spec === 'node:crypto') return new vm.SyntheticModule(Object.keys(crypto), function () { for (const [key, value] of Object.entries(crypto)) this.setExport(key, value); }, { context });
    assert.ok(spec.startsWith('./'), spec);
    return load(spec.slice(2));
  });
  return mod;
}
const core = await load('collaborator-login.server'); await core.evaluate();
const { createCollaboratorLogin } = core.namespace;
const passwordHash = await cache.get('portal-password.server').namespace.hashPortalPassword(password);
const moduleRules = await load('module-authorization'); await moduleRules.evaluate();
const responseRules = await load('motorista-response'); await responseRules.evaluate();
const purchaseDetails = await load('purchase-order-details'); await purchaseDetails.evaluate();
const stockNotices = await load('stock-notice-reads'); await stockNotices.evaluate();

async function setup(enabled = true) {
  let options, unavailable = false, googleReads = 0, attempts = true;
  const record = { credentialVersion: 1, passwordHash, access: { collaboratorId: 'pessoa-ficticia-um', username: 'pessoa.um', name: 'Pessoa fictícia', contactEmail: 'compartilhado@example.test',
    unit: 'Araras', profile: 'vendedores-araras', active: true, permissions: { motorista: ['visualizar'] } } };
  const runtime = createCollaboratorLogin({
    reserveAttempt: async () => attempts,
    findByLogin: async username => { if (unavailable) throw Error('offline'); return username === record.access.username ? record : null; },
    findById: async id => { if (unavailable) throw Error('offline'); return id === record.access.collaboratorId ? record : null; },
  });
  const mocks = {
    'next-auth': { CredentialsSignin, default: config => { options = config; return {}; } },
    'next-auth/providers/credentials': { default: Credentials }, 'next-auth/providers/google': { default: Google },
    '@/lib/collaborator-auth.server': { individualLoginEnabled: () => enabled,
      authenticatePortalCollaborator: input => runtime.authenticate(input, 'origem-ficticia'), resolvePortalCollaboratorSession: subject => runtime.resolveSession(subject) },
    '@/lib/google-token-refresh': { createGoogleTokenRefresher: () => async token => token },
    '@/lib/portal-config': { getEffectivePortalUser: async () => { googleReads++; return null; }, getPortalUserSessionState: async () => { googleReads++; return { user: null, unavailable: false }; }, recordPortalAccess() {} },
    '@/lib/portal-config-revision': { getPortalConfigurationRevisionSafely: async () => '1' },
    '@/lib/authorization': { resolveConfiguredUser: () => null },
  };
  const ctx = vm.createContext({ process: { env: { AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'ficticio', GOOGLE_CLIENT_SECRET: 'ficticio' } } });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(read('lib/auth.ts')), { context: ctx });
  await mod.link(spec => { const exports = mocks[spec]; assert.ok(exports, spec); return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  const jar = new Map();
  async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await Auth(new Request(`https://portal.test/api/auth/${path}`, { ...init, headers }), { ...options, basePath: '/api/auth', logger: { error() {}, warn() {}, debug() {} } });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async function login(extra = {}) {
    const csrf = await (await request('csrf')).json();
    return request('callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, username: 'pessoa.um', password, callbackUrl: 'https://portal.test/acesso/inicio', ...extra }) });
  }
  return { options, record, jar, request, login, unavailable: () => { unavailable = true; }, recover: () => { unavailable = false; }, throttle: () => { attempts = false; }, googleReads: () => googleReads };
}

test('fluxo HTTP real Auth.js: CSRF, senha, cookie protegido e sessão por colaborador', async () => {
  const h = await setup(); const response = await h.login();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://portal.test/acesso/inicio');
  const cookie = response.headers.getSetCookie().find(value => value.includes('authjs.session-token='));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/i);
  const data = await (await h.request('session')).json();
  assert.equal(data.collaboratorSubject.collaboratorId, 'pessoa-ficticia-um');
  assert.equal(data.collaboratorAccess.username, 'pessoa.um');
  assert.equal(data.user, undefined); assert.equal(data.accessToken, undefined); assert.equal(data.portalUser, null);
  assert.equal(JSON.stringify(data).includes(passwordHash), false); assert.equal(JSON.stringify(data).includes(password), false);
  assert.equal(h.googleReads(), 0);
});

test('JWT criptografado contém sujeito mínimo, sem contato, perfil, senha ou token Google', async () => {
  const h = await setup(); await h.login();
  const [name, value] = [...h.jar].find(([name]) => name.includes('session-token'));
  const jwt = await decode({ token: value, secret, salt: name });
  assert.equal(jwt.collaboratorSubject.credentialVersion, 1);
  for (const field of ['email', 'accessToken', 'refreshToken', 'portalUser', 'collaboratorAccess']) assert.equal(jwt[field], undefined);
  assert.equal(JSON.stringify(jwt).includes('compartilhado@example.test'), false);
});

test('senha errada e CSRF inválido não criam cookie de sessão', async () => {
  const wrong = await setup(); const response = await wrong.login({ password: 'senha-errada-ficticia' });
  assert.match(response.headers.get('location'), /CredentialsSignin/);
  assert.equal([...wrong.jar.keys()].some(name => name.includes('session-token')), false);
  const csrf = await setup(); const rejected = await csrf.login({ csrfToken: 'forjado' });
  assert.equal([...csrf.jar.keys()].some(name => name.includes('session-token')), false);
  assert.notEqual(rejected.headers.get('location'), 'https://portal.test/acesso/inicio');
});

test('bloqueio e troca de versão passam a negar a sessão já emitida', async () => {
  const h = await setup(); await h.login();
  h.record.access.active = false;
  const disabled = await (await h.request('session')).json();
  assert.equal(disabled.collaboratorAccess, null); assert.equal(disabled.error, 'CollaboratorAccessRevoked');
  h.record.access.active = true; h.record.credentialVersion++;
  const revoked = await (await h.request('session')).json();
  assert.equal(revoked.collaboratorAccess, null);
});

test('falha temporária preserva cookie e permite recuperar o mesmo acesso', async () => {
  const h = await setup(); await h.login();
  h.unavailable();
  const failed = await (await h.request('session')).json();
  assert.equal(failed.error, 'SessionTemporarilyUnavailable'); assert.equal(failed.collaboratorAccess, null);
  h.recover();
  assert.equal((await (await h.request('session')).json()).collaboratorAccess.collaboratorId, 'pessoa-ficticia-um');
});

test('cookie adulterado ou expirado não autentica', async () => {
  const h = await setup(); await h.login();
  const [name, value] = [...h.jar].find(([key]) => key.includes('session-token'));
  h.jar.set(name, 'forjado.' + value.slice(8));
  assert.equal((await (await h.request('session')).json())?.collaboratorSubject, undefined);
  const expired = await encode({ token: { collaboratorSubject: { collaboratorId: 'pessoa-ficticia-um', credentialVersion: 1 } }, secret, salt: name, maxAge: -3600 });
  h.jar.set(name, expired);
  assert.equal((await (await h.request('session')).json())?.collaboratorSubject, undefined);
});

test('saída voluntária remove a sessão do navegador', async () => {
  const h = await setup(); await h.login();
  const csrf = await (await h.request('csrf')).json();
  await h.request('signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: 'https://portal.test/login' }) });
  assert.equal((await (await h.request('session')).json())?.collaboratorSubject, undefined);
});

test('limite de tentativas é comunicado sem emitir sessão', async () => {
  const h = await setup(); h.throttle();
  const response = await h.login();
  assert.match(response.headers.get('location'), /too_many_attempts/);
  assert.equal([...h.jar.keys()].some(key => key.includes('session-token')), false);
});

test('sem ativação explícita o provider individual não é registrado', async () => {
  const h = await setup(false);
  assert.equal(h.options.providers.some(provider => provider.id === 'credentials'), false);
});

async function page(path, session, searchParams = {}, extraMocks = {}) {
  const require = createRequire(import.meta.url), ts = require('./timoni-portal/node_modules/typescript');
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const calls = [];
  const mocks = {
    '@/lib/auth': { auth: async () => session, signIn: async (...args) => calls.push(['signIn', ...args]), signOut: async (...args) => calls.push(['signOut', ...args]) },
    '@/lib/collaborator-auth.server': { individualLoginEnabled: () => true },
    '@/lib/collaborator-access': { canCollaboratorAction: cache.get('collaborator-access').namespace.canCollaboratorAction },
    'next-auth': { AuthError: class extends Error {} },
    'next/navigation': { redirect: url => { throw Error('redirect:' + url); } },
    'next/link': { default: 'a' },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    ...extraMocks,
  };
  const ctx = vm.createContext({}), mod = new vm.SourceTextModule(output, { context: ctx });
  await mod.link(spec => { const exports = mocks[spec]; assert.ok(exports, spec); return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  return { tree: await mod.namespace.default({ searchParams: Promise.resolve(searchParams) }), calls };
}
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

test('formulário real envia apenas usuário e senha ao provider de credenciais', async () => {
  const { tree, calls } = await page('app/login/page.tsx', null);
  const nodes = elements(tree);
  assert.equal(nodes.find(node => node.type === 'input' && node.props.name === 'username').props.autoComplete, 'username');
  assert.equal(nodes.find(node => node.type === 'input' && node.props.name === 'password').props.type, 'password');
  const form = nodes.find(node => node.type === 'form');
  const data = new FormData(); data.set('username', 'pessoa.um'); data.set('password', password); data.set('collaboratorId', 'outra-pessoa');
  await form.props.action(data);
  assert.equal(calls[0][0], 'signIn'); assert.equal(calls[0][1], 'credentials');
  assert.equal(calls[0][2].redirectTo, '/acesso/inicio');
  assert.equal(calls[0][2].collaboratorId, undefined);
});

test('tela protegida mostra a pessoa da sessão e só as permissões individuais', async () => {
  const h = await setup(); await h.login(); const session = await (await h.request('session')).json();
  const { tree } = await page('app/acesso/inicio/page.tsx', session);
  const text = JSON.stringify(tree);
  assert.match(text, /Pessoa fictícia/); assert.match(text, /Motorista/);
  assert.doesNotMatch(text, /"Estoque"/);
  assert.deepEqual(elements(tree).filter(node => node.type === 'a' && node.props.href?.startsWith('/dashboard')).map(node => node.props.href), ['/dashboard/motorista']);
  await assert.rejects(page('app/acesso/inicio/page.tsx', null), /redirect:\/login/);
});

test('módulos ainda não adaptados recusam sessão individual antes de consultar cadastro por e-mail', async () => {
  for (const path of ['lib/authorization-server.ts', 'lib/auth-guard.ts']) {
    let reads = 0;
    const mocks = {
      'next/server': { NextResponse: Response },
      '@/lib/auth': { auth: async () => ({ collaboratorSubject: { collaboratorId: 'pessoa-ficticia-um', credentialVersion: 1 }, collaboratorAccess: { collaboratorId: 'pessoa-ficticia-um', username: 'pessoa.um', name: 'Fictícia', active: true, unit: 'Araras', profile: 'vendedores-araras', permissions: { motorista: ['visualizar'], financeiro: ['visualizar'] } }, user: undefined, portalUser: null }) },
      '@/lib/collaborator-access': cache.get('collaborator-access').namespace,
      '@/lib/portal-config': { getEffectivePortalUser: async () => { reads++; return null; } },
      '@/lib/authorization': { can: () => { throw Error('não deve autorizar'); } },
      '@/lib/module-authorization': { canModuleOperation: () => { throw Error('não deve autorizar'); } },
      '@/lib/access-control': { isAuthorizedUser: () => { throw Error('não deve autorizar'); } },
      '@/lib/google-calendar': { getAccessTokenFromRefreshToken: async () => { reads++; } },
    };
    mocks['@/lib/portal-session'] = { getPortalSession: mocks['@/lib/auth'].auth };
    const ctx = vm.createContext({}), mod = new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context: ctx });
    await mod.link(spec => { const exports = mocks[spec]; assert.ok(exports, spec); return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx }); });
    await mod.evaluate();
    const result = path.includes('authorization-server') ? await mod.namespace.requireModuleAuthorization('financeiro', 'visualizar') : await mod.namespace.requireAuthorizedSession();
    assert.equal(result.errorResponse.status, 403); assert.equal(reads, 0);
  }
});

async function bridge(env) {
  let renewals = 0, builds = 0;
  const mocks = {
    '@neondatabase/serverless': { neon: () => ({}) },
    './collaborator-login-runtime.server': { createPortalCollaboratorLogin: () => {
      builds++;
      return { authenticate: async () => ({ ok: true, subject: { collaboratorId: 'ficticio', credentialVersion: 1 } }), resolveSession: async () => ({ access: { collaboratorId: 'ficticio' }, unavailable: false }) };
    } },
    './google-token-refresh': { createGoogleTokenRefresher: () => async token => { renewals++; return { ...token, accessToken: 'integracao-central-ficticia', expiresAt: Date.now()/1000 + 3600 }; } },
  };
  const ctx = vm.createContext({ process: { env } }), mod = new vm.SourceTextModule(stripTypeScriptTypes(read('lib/collaborator-auth.server.ts')), { context: ctx });
  await mod.link(spec => { const exports = mocks[spec]; assert.ok(exports, spec); return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  return { api: mod.namespace, renewals: () => renewals, builds: () => builds };
}

test('ponte desabilitada ou incompleta não conecta ao Google nem ao banco', async () => {
  for (const env of [{}, { PORTAL_INDIVIDUAL_LOGIN_ENABLED: 'true' }]) {
    const h = await bridge(env);
    assert.equal((await h.api.authenticatePortalCollaborator({ username: 'pessoa.um', password })).ok, false);
    assert.equal(h.renewals(), 0); assert.equal(h.builds(), 0);
  }
});

test('ponte compartilha só token da integração; resolução de acesso continua sendo executada', async () => {
  const h = await bridge({ PORTAL_INDIVIDUAL_LOGIN_ENABLED: 'true', DATABASE_URL: 'ficticio', PORTAL_LOGIN_RATE_SECRET: secret, GOOGLE_REFRESH_TOKEN: 'refresh-ficticio', GOOGLE_CLIENT_ID: 'id-ficticio', GOOGLE_CLIENT_SECRET: 'secret-ficticio' });
  const login = await h.api.authenticatePortalCollaborator({ username: 'pessoa.um', password });
  await h.api.resolvePortalCollaboratorSession(login.subject);
  assert.equal(h.renewals(), 1); assert.equal(h.builds(), 2);
  assert.equal(JSON.stringify(login).includes('integracao-central-ficticia'), false);
});

async function motorista({ permissions = ['visualizar'], profile = 'vendedores-araras', id = 'pessoa-ficticia-um', extraMocks = {} } = {}) {
  const h = await setup();
  Object.assign(h.record.access, { collaboratorId: id, profile, permissions: { motorista: permissions } });
  assert.equal((await h.login()).headers.get('location'), 'https://portal.test/acesso/inicio');
  const calls = [], audit = [], credentials = [];
  let legacyReads = 0;
  const trips = [{ id: 'ara', loja: 'araras', preenchidoPor: 'Autor original' }, { id: 'rc', loja: 'rio_claro', preenchidoPor: 'Outra unidade' }];
  const getSession = async () => (await h.request('session')).json();
  const mocks = {
    'next/server': { NextResponse: Response, NextRequest: Request },
    '@/lib/portal-session': { getPortalSession: getSession },
    '@/lib/portal-config': { getEffectivePortalUser: async () => { legacyReads++; throw Error('Não deve procurar acesso por e-mail'); }, loadPortalConfiguration: async () => { legacyReads++; throw Error('Não deve procurar responsáveis por caixa de e-mail'); } },
    '@/lib/authorization': cache.get('authorization').namespace,
    '@/lib/collaborator-access': cache.get('collaborator-access').namespace,
    '@/lib/module-authorization': moduleRules.namespace,
    '@/lib/module-updates': { recordModuleUpdateSafely: async (...args) => audit.push(args) },
    '@/lib/motorista-response': responseRules.namespace,
    '@/lib/purchase-order-details': purchaseDetails.namespace,
    '@/lib/collaborator-auth.server': { getPortalCentralIntegrationToken: async () => 'central-ficticio' },
    googleapis: { google: { auth: { OAuth2: class { setCredentials(value) { credentials.push(value); } } }, sheets: () => ({ spreadsheets: { values: { get: async () => ({ data: { values: [['nome', 'unidade'], ['Pessoa Araras', 'araras'], ['Pessoa RC', 'rio_claro']] } }) } } }) } },
    ...extraMocks,
  };
  const ctx = vm.createContext({ URL, URLSearchParams, Response, AbortController, setTimeout, clearTimeout,
    process: { env: { MOTORISTA_API_TOKEN: 'token-motorista-ficticio', MOTORISTA_WEBAPP_URL: 'https://exemplo.invalid/exec' } },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === 'POST') return Response.json({ ok: true, viagem: { id: 'gravacao-ficticia' } });
      return Response.json({ ok: true, viagens: trips });
    },
  });
  const modules = new Map();
  async function get(path) {
    if (!modules.has(path)) modules.set(path, new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context: ctx, identifier: path }));
    return modules.get(path);
  }
  async function evaluate(path) {
    const mod = await get(path);
    if (mod.status === 'unlinked') await mod.link(async (specifier) => {
      if (specifier === '@/lib/authorization-server') return get('lib/authorization-server.ts');
      if (specifier === './authorization-server') return get('lib/authorization-server.ts');
      if (specifier === './authorization') return new vm.SyntheticModule(Object.keys(cache.get('authorization').namespace), function () { for (const key of Object.keys(cache.get('authorization').namespace)) this.setExport(key, cache.get('authorization').namespace[key]); }, { context: ctx });
      if (specifier === '@/lib/chat-history-authorization.server') return get('lib/chat-history-authorization.server.ts');
      if (specifier === '../chat-historico/route') return get('app/api/chat-historico/route.ts');
      if (specifier === '../agenda-motorista/route') return get('app/api/agenda-motorista/route.ts');
      const exports = mocks[specifier]; assert.ok(exports, specifier);
      return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx });
    });
    if (mod.status !== 'evaluated') await mod.evaluate();
    return mod.namespace;
  }
  const api = await evaluate('app/api/agenda-motorista/route.ts');
  const request = query => ({ nextUrl: new URL(`https://portal.test/api/agenda-motorista?${query}`) });
  const post = body => api.POST(new Request('https://portal.test/api/agenda-motorista', { method: 'POST', body: new URLSearchParams(body) }));
  return { ...h, api, evaluate, getSession, calls, audit, credentials, post, request, legacyReads: () => legacyReads };
}

test('Motorista com cookie real: leitura filtra unidade e não consulta acesso por e-mail', async () => {
  const h = await motorista();
  const response = await h.api.GET(h.request('action=dia&data=2026-11-04&token=forjado'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).viagens.map(item => item.id), ['ara']);
  assert.equal(h.legacyReads(), 0);
  assert.equal(new URL(h.calls[0].url).searchParams.get('token'), 'token-motorista-ficticio');
  assert.equal((await h.post({ action: 'criar', loja: 'araras' })).status, 403);
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 0);
});

test('Motorista individual: criação força autor autenticado e auditoria por ID', async () => {
  const h = await motorista({ permissions: ['visualizar', 'criar'], id: 'Pessoa-A' });
  assert.equal((await h.post({ action: 'criar', loja: 'araras', data: '2026-11-04', preenchidoPor: 'Outra pessoa', collaboratorId: 'id-forjado' })).status, 200);
  const body = new URLSearchParams(h.calls.find(call => call.init.method === 'POST').init.body);
  assert.equal(body.get('preenchidoPor'), 'Pessoa fictícia'); assert.equal(body.has('collaboratorId'), false);
  const key = cache.get('collaborator-access').namespace.collaboratorActorKey('Pessoa-A');
  assert.equal(h.audit[0][1], key); assert.match(h.audit[0][2], /gravacao-ficticia/);
  assert.notEqual(key, cache.get('collaborator-access').namespace.collaboratorActorKey('pessoa-a'));
  assert.equal(key.toLowerCase(), key);
});

test('Motorista individual: edição preserva autor original e impede trocar unidade', async () => {
  const h = await motorista({ permissions: ['visualizar', 'editar'] });
  assert.equal((await h.post({ action: 'atualizar', id: 'ara', dataOrigem: '2026-11-04', preenchidoPor: 'Forjado' })).status, 200);
  const body = new URLSearchParams(h.calls.find(call => call.init.method === 'POST').init.body);
  assert.equal(body.get('preenchidoPor'), 'Autor original');
  assert.equal((await h.post({ action: 'atualizar', id: 'ara', dataOrigem: '2026-11-04', loja: 'rio_claro' })).status, 403);
  assert.equal((await h.post({ action: 'atualizar', id: 'rc', dataOrigem: '2026-11-04' })).status, 403);
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 1);
});

test('Motorista individual: concessões não removem restrições de Marcelo ou Motorista leitura', async () => {
  for (const profile of ['administracao-marcelo', 'motorista-leitura']) {
    const h = await motorista({ profile, permissions: ['visualizar', 'criar', 'editar', 'excluir'] });
    assert.equal((await h.post({ action: 'criar', loja: 'araras' })).status, 403);
    assert.equal((await h.post({ action: 'excluir', id: 'ara', dataOrigem: '2026-11-04' })).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test('Motorista individual: revogação e indisponibilidade param a consulta antes da origem', async () => {
  const h = await motorista();
  h.record.access.active = false;
  assert.equal((await h.api.GET(h.request('action=dia&data=2026-11-04'))).status, 401);
  h.record.access.active = true; h.unavailable();
  const unavailable = await h.api.GET(h.request('action=dia&data=2026-11-04'));
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('Retry-After'), '15');
  assert.equal(h.calls.length, 0);
});

test('aliases de leitura do Motorista aceitam sessão individual sem abrir escrita', async () => {
  const h = await motorista({ permissions: ['visualizar', 'editar'] });
  const readApi = await h.evaluate('app/api/motorista-leitura/route.ts');
  assert.equal((await readApi.POST()).status, 405);
  assert.deepEqual((await (await readApi.GET(h.request('action=dia&data=2026-11-04'))).json()).viagens.map(item => item.id), ['ara']);
  const period = await h.evaluate('app/api/motorista-agenda/route.ts');
  const body = await (await period.GET(h.request('inicio=2026-11-04&dias=1'))).json();
  assert.deepEqual(body.dias[0].viagens.map(item => item.id), ['ara']);
});

test('vendedores usam integração central só no servidor e não listam acessos por caixa de e-mail', async () => {
  const h = await motorista(); const sellers = await h.evaluate('app/api/agenda-motorista-vendedores/route.ts');
  const body = await (await sellers.GET()).json();
  assert.equal(h.legacyReads(), 0);
  assert.equal(h.credentials[0].access_token, 'central-ficticio');
  assert.ok(body.vendedores.every(item => item.unidade === 'araras'));
  assert.equal(body.responsaveis.length, 1); assert.equal(body.responsaveis[0].name, 'Pessoa fictícia');
  assert.equal(JSON.stringify(body).includes('central-ficticio'), false);
});

test('página Motorista passa controles individuais e identidade para a interface', async () => {
  const h = await motorista({ permissions: ['visualizar', 'editar'] });
  const gate = await h.evaluate('lib/authorization-server.ts');
  const result = await page('app/dashboard/motorista/page.tsx', await h.getSession(), {}, {
    '@/lib/authorization-server': gate, '@/lib/module-authorization': moduleRules.namespace, './motorista-agenda': { default: 'MotoristaAgenda' },
  });
  const agenda = elements(result.tree).find(node => node.type === 'MotoristaAgenda');
  assert.equal(agenda.props.canEdit, true); assert.equal(agenda.props.canCreate, false); assert.equal(agenda.props.canDelete, false);
  assert.equal(agenda.props.actorName, 'Pessoa fictícia');
});

async function pedidos(options = {}) {
  const orders = [
    { id: 'pedido-ara', nome: 'Pedido Araras', unidade: 'araras', enviadoEm: '2026-11-01', previsaoEntrega: '', descricao: 'Total: 2 itens\n001 | Produto A | 100\n002 | Produto B | 2,5', detalhesAtualizadosEm: '2026-11-01T15:00:00Z' },
    { id: 'pedido-rc', nome: 'Pedido RC', unidade: 'rio_claro', enviadoEm: '2026-11-01', previsaoEntrega: '', descricao: '003 | Produto RC | 5' },
  ];
  let reads = 0, refreshes = 0, saves = 0, failRefresh = false, snapshot = { orders, fresh: true, syncedAt: '2026-11-04T12:00:00.000Z' };
  const h = await motorista({ id: options.id ?? 'pessoa-ficticia-um', extraMocks: {
    '@/lib/purchase-orders': {
      readPurchaseOrdersSnapshot: async () => { reads++; return snapshot; },
      savePurchaseOrdersSnapshot: async () => { saves++; },
    },
    '@/lib/purchase-orders-sync': { readSentPurchaseOrders: async () => { refreshes++; if (failRefresh) throw Error('origem fictícia offline'); return orders; } },
  } });
  Object.assign(h.record.access, { unit: options.unit ?? 'Araras', profile: options.profile ?? 'vendedores-araras', permissions: { 'pedido-de-compra': options.permissions ?? ['visualizar'] } });
  const api = await h.evaluate('app/api/pedido-de-compra/route.ts');
  return { ...h, api, counts: () => ({ reads, refreshes, saves }),
    read: (query = '') => api.GET(new Request(`https://portal.test/api/pedido-de-compra?${query}`)),
    stale: () => { snapshot.fresh = false; failRefresh = true; },
    noSnapshot: () => { snapshot = null; failRefresh = true; },
    orders,
  };
}

test('Pedidos: mesmo contato, IDs distintos e unidades independentes na resposta e nas exceções', async () => {
  for (const [id, unit, profile, expected] of [['pessoa-ara', 'Araras', 'vendedores-araras', 'pedido-ara'], ['pessoa-rc', 'Rio Claro', 'vendedores-rio-claro', 'pedido-rc']]) {
    const h = await pedidos({ id, unit, profile });
    assert.equal(h.record.access.contactEmail, 'compartilhado@example.test');
    const response = await h.read('unidade=Geral&collaboratorId=outra-pessoa');
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(body.pedidosEnviados.map(item => item.id), [expected]);
    assert.deepEqual(body.excecoes.map(item => item.id), [expected]);
    assert.equal(h.legacyReads(), 0); assert.deepEqual(h.counts(), { reads: 1, refreshes: 0, saves: 0 });
  }
});

test('Pedidos: nem Ciça recebe escrita neste módulo; POST não chama banco ou origem', async () => {
  const h = await pedidos({ unit: 'Geral', profile: 'administracao-cica', permissions: ['visualizar', 'criar', 'editar', 'excluir', 'administrar'] });
  const gate = await h.evaluate('lib/authorization-server.ts');
  for (const action of ['criar', 'editar', 'excluir', 'administrar']) {
    assert.equal((await gate.requireModuleAuthorization('pedido-de-compra', action)).errorResponse.status, 403);
  }
  const response = await h.api.POST();
  assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET');
  assert.deepEqual(h.counts(), { reads: 0, refreshes: 0, saves: 0 });
  assert.deepEqual((await (await h.read()).json()).pedidosEnviados.map(item => item.id), ['pedido-ara', 'pedido-rc']);
});

test('Pedidos: permissão ausente, revogação e indisponibilidade negam antes de ler pedidos', async () => {
  const h = await pedidos({ permissions: [] });
  assert.equal((await h.read()).status, 403);
  h.record.access.permissions['pedido-de-compra'] = ['visualizar']; h.record.access.active = false;
  assert.equal((await h.read()).status, 401);
  h.record.access.active = true; h.unavailable();
  const offline = await h.read();
  assert.equal(offline.status, 503); assert.equal(offline.headers.get('Retry-After'), '15');
  assert.deepEqual(h.counts(), { reads: 0, refreshes: 0, saves: 0 });
});

test('Pedidos: atualização usa leitura existente e devolve somente a unidade permitida', async () => {
  const h = await pedidos(); const body = await (await h.read('refresh=1')).json();
  assert.deepEqual(body.pedidosEnviados.map(item => item.id), ['pedido-ara']);
  assert.deepEqual(h.counts(), { reads: 1, refreshes: 1, saves: 1 });
  h.stale(); const stale = await (await h.read()).json();
  assert.equal(stale.stale, true); assert.deepEqual(stale.excecoes.map(item => item.id), ['pedido-ara']);
  h.noSnapshot(); assert.equal((await h.read()).status, 502);
});

test('Pedidos: página e menu exibem apenas o módulo e a unidade individuais', async () => {
  const h = await pedidos(), session = await h.getSession(), gate = await h.evaluate('lib/authorization-server.ts');
  const result = await page('app/dashboard/pedido-de-compra/page.tsx', session, {}, {
    '@/lib/authorization-server': gate, '@/lib/module-authorization': moduleRules.namespace, './pedido-compra-client': { default: 'Pedidos' },
  });
  assert.deepEqual(Array.from(result.tree.props.visibleUnits), ['araras']);
  const home = await page('app/acesso/inicio/page.tsx', session);
  assert.deepEqual(elements(home.tree).filter(node => node.type === 'a').map(node => node.props.href), ['/dashboard/pedido-de-compra']);
  const layout = await page('app/dashboard/layout.tsx', session, {}, {
    '@/lib/portal-session': { getPortalSession: h.getSession },
    '@/lib/collaborator-access': cache.get('collaborator-access').namespace,
    react: { Suspense: 'Suspense' }, './store-switcher': { default: 'StoreSwitcher' }, '@/components/portal-header': { default: 'PortalHeader' },
  });
  assert.deepEqual(elements(layout.tree).filter(node => node.type === 'a').map(node => node.props.href), ['/acesso/inicio', '/dashboard/pedido-de-compra']);
});

test('Pedidos: middleware permite só o caminho adaptado e não abre módulo vizinho', async () => {
  const h = await pedidos();
  const mocks = {
    'next/server': { NextResponse: class extends Response { static next() { return new Response(null, { status: 204 }); } static redirect(url) { return Response.redirect(url); } } },
    '@/lib/auth': { auth: fn => fn },
    '@/lib/access-control': { getPortalUser: () => { throw Error('Não usar acesso por e-mail'); }, hasModuleAccess: () => { throw Error('Não usar acesso por e-mail'); } },
    '@/lib/authorization': cache.get('authorization').namespace,
    '@/lib/collaborator-access': cache.get('collaborator-access').namespace,
  };
  const ctx = vm.createContext({ URL }), mod = new vm.SourceTextModule(stripTypeScriptTypes(read('middleware.ts')), { context: ctx });
  await mod.link(spec => { const exports = mocks[spec]; assert.ok(exports, spec); return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: ctx }); });
  await mod.evaluate();
  async function go(path) { return mod.namespace.default({ auth: await h.getSession(), nextUrl: new URL(`https://portal.test${path}`), url: `https://portal.test${path}` }); }
  assert.equal((await go('/dashboard/pedido-de-compra')).status, 204);
  for (const path of ['/dashboard/pedido-de-compra/administrar', '/dashboard/estoque', '/dashboard/motorista']) {
    assert.equal((await go(path)).headers.get('location'), 'https://portal.test/acesso/inicio');
  }
  h.record.access.permissions = {};
  assert.equal((await go('/dashboard/pedido-de-compra')).headers.get('location'), 'https://portal.test/acesso/inicio');
  h.record.access.permissions = { reunioes: ['visualizar'] };
  assert.equal((await go('/dashboard/reunioes')).status, 204);
  assert.equal((await go('/dashboard/reunioes/administrar')).headers.get('location'), 'https://portal.test/acesso/inicio');
  h.record.access.permissions = { estoque: ['visualizar'] };
  assert.equal((await go('/dashboard/estoque')).status, 204);
  assert.equal((await go('/dashboard/estoque/administrar')).headers.get('location'), 'https://portal.test/acesso/inicio');
  h.record.access.permissions = { chat: ['visualizar'] };
  assert.equal((await go('/dashboard/chat')).status, 204);
  assert.equal((await go('/dashboard/chat/administrar')).headers.get('location'), 'https://portal.test/acesso/inicio');
});

test('Pedidos: entrada Google existente mantém filtro de unidade e exige cadastro oficial ativo', async () => {
  let actor = { email: 'estoqueararascasatimoni@gmail.com', name: 'Pessoa legado fictícia', unit: 'Araras', modules: ['pedido-de-compra'], active: true };
  let reads = 0;
  const h = await motorista({ extraMocks: {
    '@/lib/portal-session': { getPortalSession: async () => ({ user: { email: 'estoqueararascasatimoni@gmail.com' }, accessToken: 'google-ficticio' }) },
    '@/lib/portal-config': { getEffectivePortalUser: async () => actor },
    '@/lib/purchase-orders': { readPurchaseOrdersSnapshot: async () => { reads++; return { fresh: true, orders: [
      { id: 'ara', nome: 'Pedido fictício Araras', unidade: 'araras', previsaoEntrega: '' },
      { id: 'rc', nome: 'Pedido fictício RC', unidade: 'rio_claro', previsaoEntrega: '' },
    ] }; }, savePurchaseOrdersSnapshot: async () => { throw Error('Não gravar'); } },
    '@/lib/purchase-orders-sync': { readSentPurchaseOrders: async () => { throw Error('Não consultar origem'); } },
  } });
  const api = await h.evaluate('app/api/pedido-de-compra/route.ts');
  const read = () => api.GET(new Request('https://portal.test/api/pedido-de-compra'));
  assert.deepEqual((await (await read()).json()).pedidosEnviados.map(item => item.id), ['ara']);
  const gate = await h.evaluate('lib/authorization-server.ts');
  const result = await page('app/dashboard/pedido-de-compra/page.tsx', null, {}, {
    '@/lib/authorization-server': gate, '@/lib/module-authorization': moduleRules.namespace, './pedido-compra-client': { default: 'Pedidos' },
  });
  assert.deepEqual(Array.from(result.tree.props.visibleUnits), ['araras']);
  const legacyCica = { ...actor, email: 'mcrodini@gmail.com', unit: 'Geral' };
  for (const action of ['criar', 'editar', 'excluir', 'administrar']) {
    assert.equal(moduleRules.namespace.canModuleOperation(legacyCica, 'pedido-de-compra', action), false);
  }
  actor = null;
  assert.equal((await read()).status, 401); assert.equal(reads, 1);
});

test('detalhes do pedido: consulta local por cookie real sem origem externa, etiquetas ou links', async () => {
  const h = await pedidos(); h.stale();
  const api = await h.evaluate('app/api/pedido-de-compra/detalhes/route.ts');
  const response = await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-ara'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.pedido.itens, [{ codigo: '001', produto: 'Produto A', quantidade: '100' }, { codigo: '002', produto: 'Produto B', quantidade: '2,5' }]);
  assert.equal(body.pedido.parcial, false); assert.equal(body.pedido.descricaoOriginal, h.orders[0].descricao);
  for (const field of ['url', 'labels', 'unidade', 'accessToken', 'token']) assert.equal(body.pedido[field], undefined);
  assert.deepEqual(h.counts(), { reads: 1, refreshes: 0, saves: 0 });
  assert.equal(h.calls.length, 0);
});

test('detalhes do pedido: não revela se ID de outra unidade existe e recusa métodos de escrita', async () => {
  const h = await pedidos(), api = await h.evaluate('app/api/pedido-de-compra/detalhes/route.ts');
  const other = await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-rc&unidade=Geral'));
  const missing = await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=nao-existe'));
  assert.equal(other.status, 404); assert.equal(missing.status, 404);
  assert.deepEqual(await other.json(), await missing.json());
  assert.equal((await api.POST()).status, 405); assert.equal((await api.POST()).headers.get('Allow'), 'GET');
  assert.equal(h.counts().saves, 0); assert.equal(h.counts().refreshes, 0);
});

test('detalhes do pedido: valida identidade e ID antes de consultar dados locais', async () => {
  const h = await pedidos(), api = await h.evaluate('app/api/pedido-de-compra/detalhes/route.ts');
  assert.equal((await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=../outro'))).status, 400);
  h.record.access.permissions = {};
  assert.equal((await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-ara'))).status, 403);
  h.record.access.active = false;
  assert.equal((await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-ara'))).status, 401);
  h.record.access.active = true; h.unavailable();
  assert.equal((await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-ara'))).status, 503);
  assert.deepEqual(h.counts(), { reads: 0, refreshes: 0, saves: 0 });
});

test('detalhes: pedido antigo sem descrição não inventa itens e lista não entrega descrições antecipadamente', async () => {
  const h = await pedidos(); delete h.orders[0].descricao;
  const api = await h.evaluate('app/api/pedido-de-compra/detalhes/route.ts');
  const body = await (await api.GET(new Request('https://portal.test/api/pedido-de-compra/detalhes?id=pedido-ara'))).json();
  assert.deepEqual(body.pedido.itens, []); assert.equal(body.pedido.descricaoOriginal, '');
  h.orders[0].descricao = '001 | Produto novo | 1';
  const summary = await (await h.read()).json();
  assert.equal(summary.pedidosEnviados[0].descricao, undefined);
  assert.equal(summary.pedidosEnviados[0].itens, undefined);
});

async function reunioes(options = {}) {
  const operations = [], reads = [], tokens = [];
  let unavailable = false;
  const meetings = [{ id: 'reuniao-ara', unit: 'Araras' }, { id: 'reuniao-rc', unit: 'Rio Claro' }];
  let fresh = meetings;
  const h = await motorista({ id: options.id ?? 'pessoa-ficticia-um', extraMocks: {
    '@/lib/collaborator-auth.server': { getPortalCentralIntegrationToken: async () => { tokens.push('token solicitado'); if (unavailable) throw Error('integração indisponível'); return 'central-reunioes-ficticio'; } },
    '@/lib/reunioes': {
      listMeetings: async token => { reads.push(['cache', token]); return meetings; },
      listMeetingsFresh: async token => { reads.push(['atual', token]); return fresh; },
      createMeeting: async (...args) => { operations.push(['criar', ...args]); return 'reuniao-nova'; },
      updateMeeting: async (...args) => operations.push(['editar', ...args]),
      deleteMeeting: async (...args) => operations.push(['excluir', ...args]),
      archiveMeetingOccurrence: async (...args) => operations.push(['concluir-ocorrencia', ...args]),
    },
  } });
  Object.assign(h.record.access, { unit: options.unit ?? 'Araras', profile: options.profile ?? 'vendedores-araras', permissions: { reunioes: options.permissions ?? ['visualizar'] } });
  const api = await h.evaluate('app/api/reunioes/route.ts');
  const input = { unit: 'Araras', date: '2026-12-10', time: '08:00', leaders: 'Pessoa fictícia' };
  const send = (method, body = {}) => api[method](new Request('https://portal.test/api/reunioes', { method: method === 'GET' ? 'GET' : method, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }));
  return { ...h, api, input, send, operations, reads, tokens, integrationUnavailable: () => { unavailable = true; }, changeFresh: value => { fresh = value; } };
}

test('Reuniões individual: mesmo contato permite unidades independentes e token central só no servidor', async () => {
  for (const [unit, profile, id] of [['Araras', 'vendedores-araras', 'reuniao-ara'], ['Rio Claro', 'vendedores-rio-claro', 'reuniao-rc']]) {
    const h = await reunioes({ unit, profile }); const response = await h.send('GET');
    const body = await response.json(); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(body.items.map(item => item.id), [id]); assert.equal(JSON.stringify(body).includes('central-reunioes-ficticio'), false);
    assert.equal(h.reads[0][1], 'central-reunioes-ficticio'); assert.equal(h.legacyReads(), 0);
  }
});

test('Reuniões: Marcelo edita com autoria por ID, sem criar ou excluir, mesmo com concessões excessivas', async () => {
  const h = await reunioes({ unit: 'Geral', profile: 'administracao-marcelo', permissions: ['visualizar', 'criar', 'editar', 'excluir'] });
  assert.equal((await h.send('POST', h.input)).status, 403); assert.equal((await h.send('DELETE', { id: 'reuniao-ara' })).status, 403);
  assert.equal(h.tokens.length, 0); assert.equal(h.reads.length, 0);
  assert.equal((await h.send('PATCH', { id: 'reuniao-ara', action: 'complete', collaboratorId: 'outra-pessoa' })).status, 200);
  assert.equal(h.operations[0][0], 'editar'); assert.equal(h.operations[0][4], 'Araras');
  assert.equal(h.audit[0][1], cache.get('collaborator-access').namespace.collaboratorActorKey(h.record.access.collaboratorId));
  assert.match(h.audit[0][2], /reuniao-ara/);
});

test('Reuniões: ação e unidade são conferidas no servidor inclusive com cache antigo', async () => {
  const h = await reunioes({ permissions: ['visualizar', 'criar', 'editar', 'excluir'] });
  assert.equal((await h.send('POST', { ...h.input, unit: 'Rio Claro' })).status, 403);
  assert.equal((await h.send('PATCH', { id: 'reuniao-ara', ...h.input, unit: 'Rio Claro' })).status, 403);
  assert.equal((await h.send('DELETE', { id: 'reuniao-rc', unit: 'Araras' })).status, 403);
  h.changeFresh([{ id: 'reuniao-ara', unit: 'Rio Claro' }]);
  assert.equal((await h.send('PATCH', { id: 'reuniao-ara', action: 'complete' })).status, 403);
  assert.equal(h.operations.length, 0); assert.ok(h.reads.every(([source]) => source === 'atual'));
});

test('Reuniões: criação, edição e conclusão autorizadas não recebem perfil ou identidade do formulário', async () => {
  const h = await reunioes({ permissions: ['visualizar', 'criar', 'editar', 'excluir'] });
  assert.equal((await h.send('POST', { ...h.input, username: 'outra-pessoa', profile: 'administracao-cica' })).status, 200);
  assert.equal(h.operations[0][2].profile, undefined); assert.equal(h.operations[0][2].username, undefined);
  assert.equal((await h.send('PATCH', { id: 'reuniao-ara', action: 'complete-occurrence', occurrenceDate: '2026-12-10' })).status, 200);
  assert.equal(h.operations[1][0], 'concluir-ocorrencia'); assert.equal(h.operations[1][4], 'Araras');
  assert.equal((await h.send('DELETE', { id: 'reuniao-ara' })).status, 200);
  assert.equal(h.audit.length, 3);
});

test('Reuniões: falta de permissão, revogação e falha temporária preservam os códigos da guarda', async () => {
  const h = await reunioes({ permissions: [] });
  assert.equal((await h.send('GET')).status, 403);
  h.record.access.permissions.reunioes = ['visualizar', 'criar', 'editar', 'excluir']; h.record.access.active = false;
  assert.equal((await h.send('GET')).status, 401);
  h.record.access.active = true; h.unavailable();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await h.send(method, h.input); assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '15');
  }
  assert.equal(h.tokens.length, 0); assert.equal(h.reads.length, 0); assert.equal(h.operations.length, 0);
});

test('Reuniões: indisponibilidade da integração central retorna 503 sem consultar ou gravar', async () => {
  const h = await reunioes(); h.integrationUnavailable();
  const response = await h.send('GET'); assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '15');
  assert.equal(h.reads.length, 0); assert.equal(h.operations.length, 0);
});

test('Reuniões: página e menu usam unidade e permissões individuais, incluindo criar sem editar', async () => {
  const h = await reunioes({ permissions: ['visualizar', 'criar'] }), gate = await h.evaluate('lib/authorization-server.ts');
  const session = await h.getSession();
  const result = await page('app/dashboard/reunioes/page.tsx', session, {}, { '@/lib/authorization-server': gate, '@/lib/module-authorization': moduleRules.namespace, './reunioes-client': { default: 'Reunioes' } });
  const client = elements(result.tree).find(item => item.type === 'Reunioes');
  assert.deepEqual(Array.from(client.props.allowedUnits), ['Araras']); assert.equal(client.props.canCreate, true); assert.equal(client.props.canManage, false); assert.equal(client.props.canDelete, false);
  const home = await page('app/acesso/inicio/page.tsx', session);
  assert.deepEqual(elements(home.tree).filter(item => item.type === 'a').map(item => item.props.href), ['/dashboard/reunioes']);
  const layout = await page('app/dashboard/layout.tsx', session, {}, { '@/lib/portal-session': { getPortalSession: h.getSession }, '@/lib/collaborator-access': cache.get('collaborator-access').namespace, react: { Suspense: 'Suspense' }, './store-switcher': { default: 'StoreSwitcher' }, '@/components/portal-header': { default: 'PortalHeader' } });
  assert.deepEqual(elements(layout.tree).filter(item => item.type === 'a').map(item => item.props.href), ['/acesso/inicio', '/dashboard/reunioes']);
});

async function estoque(options = {}) {
  const writes = [], tokens = []; let reads = 0, integrationFails = false;
  const row = (id, unit) => [id, 'existente', 'Produto fictício', 'pendente', '', '', '', '', '', false, unit, 'Vendedor registrado', '2', '', ''];
  const rows = [row('necessidade-ara', 'araras'), row('necessidade-rc', 'rio_claro'), row('sem-unidade', '')];
  const sheets = { spreadsheets: {
    values: {
      batchGet: async () => { reads++; return { data: { valueRanges: [{ values: [['id'], ...rows] }, { values: [['codigo'], ['existente', 'Produto fictício', 'UN'], ['novo', 'Produto novo fictício', 'UN']] }, { values: [['nome', 'unidade'], ['Pessoa Araras', 'araras'], ['Pessoa RC', 'rio_claro']] }] } }; },
      batchUpdate: async value => writes.push(['editar', value]), append: async value => writes.push(['criar', value]),
    },
    get: async () => ({ data: { sheets: [{ properties: { title: 'Necessidades', sheetId: 77 } }] } }),
    batchUpdate: async value => writes.push(['excluir', value]),
  } };
  const h = await motorista({ id: options.id ?? 'pessoa-ficticia-um', extraMocks: {
    '@/lib/collaborator-auth.server': { getPortalCentralIntegrationToken: async () => { tokens.push('central solicitado'); if (integrationFails) throw Error('ponte indisponível'); return 'central-estoque-ficticio'; } },
    '@/lib/stock-notice-reads': stockNotices.namespace,
    '@/lib/estoque-alerts': { listStockAlerts: async () => { reads++; return rows.map(row => ({ id: row[0], unidade: row[10] === 'araras' ? 'araras' : 'rio_claro', unidadeOriginal: row[10], status: 'pendente' })); } },
    '@/lib/access-control': { hasModuleAccess: () => { throw Error('Não buscar identidade por e-mail'); } },
    googleapis: { google: { auth: { OAuth2: class { setCredentials(value) { assert.equal(value.access_token, 'central-estoque-ficticio'); } } }, sheets: () => sheets } },
  } });
  Object.assign(h.record.access, { unit: options.unit ?? 'Araras', profile: options.profile ?? 'vendedores-araras', permissions: { estoque: options.permissions ?? ['visualizar'] } });
  const api = await h.evaluate('app/api/estoque/route.ts');
  const send = body => api.POST(new Request('https://portal.test/api/estoque', { method: 'POST', body: JSON.stringify(body) }));
  return { ...h, api, send, writes, tokens, reads: () => reads, integrationFail: () => { integrationFails = true; } };
}

test('Estoque individual: contatos iguais mantêm necessidades, vendedores e resumo por unidade', async () => {
  for (const [unit, profile, expected] of [['Araras', 'vendedores-araras', 'necessidade-ara'], ['Rio Claro', 'vendedores-rio-claro', 'necessidade-rc']]) {
    const h = await estoque({ unit, profile }); const response = await h.api.GET(); const body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(body.necessidades.map(item => item.id), [expected]);
    assert.equal(body.summary.geral.emAberto, 1); assert.equal(body.vendedores.every(item => item.unidade === (unit === 'Araras' ? 'araras' : 'rio_claro')), true);
    assert.equal(h.legacyReads(), 0); assert.equal(JSON.stringify(body).includes('central-estoque-ficticio'), false);
  }
});

test('Estoque individual: somente leitura nega escrita antes de conectar à integração', async () => {
  const h = await estoque();
  for (const action of ['criar', 'editar', 'excluir', 'chegou', 'resposta_vendedor']) assert.equal((await h.send({ action, id: 'necessidade-ara', unidade: 'araras' })).status, 403);
  assert.equal(h.tokens.length, 0); assert.equal(h.reads(), 0); assert.equal(h.writes.length, 0);
});

test('Estoque: Marcelo edita e reabre, mas concessões excessivas não permitem criar ou excluir', async () => {
  const h = await estoque({ unit: 'Geral', profile: 'administracao-marcelo', permissions: ['visualizar', 'criar', 'editar', 'excluir'] });
  assert.equal((await h.send({ action: 'criar', codigo: 'novo', vendedor: 'Pessoa', unidade: 'araras' })).status, 403);
  assert.equal((await h.send({ action: 'excluir', id: 'necessidade-ara' })).status, 403); assert.equal(h.tokens.length, 0);
  assert.equal((await h.send({ action: 'editar', id: 'necessidade-ara', quantidade: '5' })).status, 200);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][0], 'editar');
  assert.equal(h.audit[0][1], cache.get('collaborator-access').namespace.collaboratorActorKey(h.record.access.collaboratorId));
});

test('Estoque: unidade persistida limita edição/transição e perfil operacional não ganha edição administrativa', async () => {
  const h = await estoque({ profile: 'estoque-araras', permissions: ['visualizar', 'editar', 'excluir'] });
  for (const id of ['necessidade-rc', 'sem-unidade']) assert.equal((await h.send({ action: 'chegou', id, unidade: 'araras' })).status, 403);
  assert.equal((await h.send({ action: 'editar', id: 'necessidade-ara' })).status, 403);
  assert.equal((await h.send({ action: 'excluir', id: 'necessidade-ara' })).status, 403); assert.equal(h.writes.length, 0);
  assert.equal((await h.send({ action: 'chegou', id: 'necessidade-ara' })).status, 200); assert.equal(h.writes.length, 1);
});

test('Estoque: criação autorizada mantém vendedor operacional separado do ator autenticado', async () => {
  const h = await estoque({ permissions: ['visualizar', 'criar'] });
  assert.equal((await h.send({ action: 'criar', codigo: 'novo', vendedor: 'Vendedor informado', quantidade: '3', unidade: 'araras', collaboratorId: 'outra-pessoa' })).status, 200);
  assert.equal(h.writes[0][0], 'criar'); assert.equal(h.writes[0][1].requestBody.values[0][11], 'Vendedor informado');
  assert.equal(h.audit[0][1], cache.get('collaborator-access').namespace.collaboratorActorKey(h.record.access.collaboratorId));
  assert.equal((await h.send({ action: 'criar', codigo: 'novo', vendedor: 'Pessoa', unidade: 'rio_claro' })).status, 403);
  assert.equal(h.writes.length, 1);
});

test('Estoque: ausência de concessão, desativação e falha de sessão são recusadas antes de ler a planilha', async () => {
  const h = await estoque({ permissions: [] }); assert.equal((await h.api.GET()).status, 403);
  h.record.access.permissions.estoque = ['visualizar']; h.record.access.active = false; assert.equal((await h.api.GET()).status, 401);
  h.record.access.active = true; h.unavailable(); const response = await h.api.GET(); assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '15');
  assert.equal(h.tokens.length, 0); assert.equal(h.reads(), 0);
});

test('Estoque: indisponibilidade da integração é temporária e não pede novo login individual', async () => {
  const h = await estoque(); h.integrationFail(); const response = await h.api.GET();
  assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '15'); assert.doesNotMatch((await response.json()).error, /saia|entre novamente/i);
  assert.equal(h.reads(), 0);
});

test('Estoque: alertas individuais preservam perfis elegíveis e não atribuem unidade ausente a Rio Claro', async () => {
  const h = await estoque({ unit: 'Rio Claro', profile: 'estoque-rio-claro' });
  const body = await (await h.api.GET()).json(); assert.deepEqual(body.unreadIds, ['necessidade-rc']);
  const notifications = await h.evaluate('app/api/stock-notifications/route.ts');
  assert.deepEqual((await (await notifications.GET()).json()).ids, ['necessidade-rc']);
  const other = await estoque({ profile: 'estoque-araras' }); const noNotifications = await other.evaluate('app/api/stock-notifications/route.ts');
  assert.deepEqual((await (await noNotifications.GET()).json()).ids, []); assert.equal(other.tokens.length, 0); assert.equal(other.reads(), 0);
});

test('Estoque: controles da página seguem colaborador e ações, sem listas paralelas por e-mail', async () => {
  const h = await estoque({ unit: 'Geral', profile: 'administracao-marcelo', permissions: ['visualizar', 'editar'] });
  const gate = await h.evaluate('lib/authorization-server.ts'), session = await h.getSession();
  const result = await page('app/dashboard/estoque/page.tsx', session, {}, { '@/lib/authorization-server': gate, '@/lib/module-authorization': moduleRules.namespace, '@/lib/authorization': cache.get('authorization').namespace, './estoque-client': { default: 'Estoque' } });
  assert.equal(result.tree.props.canEdit, true); assert.equal(result.tree.props.canDelete, false); assert.equal(result.tree.props.showRequestForm, false);
  assert.equal(result.tree.props.canRespond, true); assert.deepEqual(Array.from(result.tree.props.allowedUnits), ['rio_claro', 'araras']);
  const home = await page('app/acesso/inicio/page.tsx', session); assert.deepEqual(elements(home.tree).filter(item => item.type === 'a').map(item => item.props.href), ['/dashboard/estoque']);
});

async function chat(options = {}) {
  const calls = [], directoryReads = []; let directoryUnavailable = false, excludeMe = false, ownMessage = true;
  const access = (id, unit = 'Araras') => ({ collaboratorId: id, username: id.toLowerCase(), name: id, contactEmail: 'compartilhado@example.test', active: true, unit, profile: unit === 'Geral' ? 'administracao-cica' : unit === 'Araras' ? 'vendedores-araras' : 'vendedores-rio-claro', permissions: { chat: ['visualizar', 'criar', 'editar', 'excluir'] } });
  const peers = [access('pessoa-a'), access('pessoa-b'), access('pessoa-rc', 'Rio Claro'), access('cica-ficticia', 'Geral')];
  let h;
  const store = {
    overview: async me => { calls.push(['overview', me]); return [{ peer_id: 'pessoa-a', unread: 2 }, { peer_id: 'pessoa-rc', unread: 9, last_message_preview: 'Mensagem de outra unidade' }, { peer_id: 'antigo@example.test', unread: 10, last_message_preview: 'Histórico que não pode ser transferido' }]; },
    list: async (...args) => { calls.push(['list', ...args]); return { messages: [], before: null }; },
    send: async (...args) => { calls.push(['send', ...args]); return { id: '101', sender_user_id: args[0], body: args[2] }; },
    read: async (...args) => calls.push(['read', ...args]),
    edit: async (...args) => { calls.push(['edit', ...args]); return ownMessage ? { id: args[2], body: args[3] } : null; },
    remove: async (...args) => { calls.push(['remove', ...args]); return ownMessage; },
    history: async (...args) => { calls.push(['history', ...args]); return { conversations: [{ id: '1', user_a: 'compartilhado@example.test', user_b: 'antigo@example.test' }], before: null }; },
  };
  h = await motorista({ id: options.id ?? 'pessoa-ficticia-um', extraMocks: {
    '@/lib/collaborator-chat-directory.server': { listCollaboratorChatDirectory: async () => { directoryReads.push('read'); if (directoryUnavailable) throw Error('offline'); return [...(excludeMe ? [] : [h.record.access]), ...peers]; } },
    '@/lib/collaborator-chat-store.server': { getCollaboratorChatStore: () => store },
  } });
  Object.assign(h.record.access, { unit: options.unit ?? 'Araras', profile: options.profile ?? 'vendedores-araras', permissions: { chat: options.permissions ?? ['visualizar', 'criar', 'editar', 'excluir'] } });
  const api = await h.evaluate('app/api/chat-colaboradores/route.ts');
  const get = query => api.GET(new Request(`https://portal.test/api/chat-colaboradores?${query ?? ''}`));
  const send = (method, body) => api[method](new Request('https://portal.test/api/chat-colaboradores', { method, body: JSON.stringify(body) }));
  return { ...h, api, get, send, calls, directoryReads, failDirectory: () => { directoryUnavailable = true; }, removeFromDirectory: () => { excludeMe = true; }, otherMessage: () => { ownMessage = false; } };
}

test('Chat individual: mesmo contato gera pessoas distintas e não transfere identidades ou prévias antigas', async () => {
  const h = await chat(), response = await h.get(), body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(body.contacts.map(person => person.id), ['pessoa-a', 'pessoa-b', 'cica-ficticia']); assert.equal(body.totalUnread, 2);
  assert.equal(body.identities, undefined); assert.equal(body.currentUser.id, h.record.access.collaboratorId);
  assert.doesNotMatch(JSON.stringify(body), /compartilhado@example|Histórico que|outra unidade/);
});

test('Chat: ator vem do cookie e não do corpo; e-mail ou destinatário de outra unidade não selecionam pessoa', async () => {
  const h = await chat();
  assert.equal((await h.get('actor=pessoa-a')).status, 403);
  assert.equal((await h.send('POST', { actor: 'pessoa-a', peer: 'pessoa-b', message: 'Não enviar' })).status, 403);
  for (const peer of ['pessoa-rc', 'compartilhado@example.test', h.record.access.collaboratorId]) assert.equal((await h.send('POST', { peer, message: 'Não enviar' })).status, 404);
  assert.equal(h.calls.length, 0);
  const result = await h.send('POST', { peer: 'pessoa-a', message: 'Mensagem fictícia', profile: 'administracao-cica' });
  assert.equal(result.status, 201); assert.deepEqual(h.calls[0], ['send', h.record.access.collaboratorId, 'pessoa-a', 'Mensagem fictícia']);
});

test('Chat: Marcelo consulta/edita sem criar/excluir; só a própria mensagem pode ser alterada', async () => {
  const h = await chat({ unit: 'Geral', profile: 'administracao-marcelo' });
  assert.equal((await h.send('POST', { peer: 'pessoa-a', message: 'Não enviar' })).status, 403);
  assert.equal((await h.send('DELETE', { peer: 'pessoa-a', messageId: '1' })).status, 403); assert.equal(h.directoryReads.length, 0);
  assert.equal((await h.send('PATCH', { action: 'edit', peer: 'pessoa-a', messageId: '1', message: 'Edição fictícia' })).status, 200);
  h.otherMessage(); assert.equal((await h.send('PATCH', { action: 'edit', peer: 'pessoa-a', messageId: '2', message: 'Não alterar' })).status, 404);
  assert.deepEqual(h.calls[0], ['edit', h.record.access.collaboratorId, 'pessoa-a', '1', 'Edição fictícia']);
});

test('Chat: consulta, paginação e leitura se limitam ao par e ao último ID exibido', async () => {
  const h = await chat({ permissions: ['visualizar'] });
  assert.equal((await h.get('peer=pessoa-a&before=100')).status, 200);
  assert.deepEqual(h.calls[0], ['list', h.record.access.collaboratorId, 'pessoa-a', '100']);
  assert.equal((await h.get('peer=pessoa-a&before=9223372036854775808')).status, 400);
  assert.equal((await h.send('PATCH', { action: 'read', peer: 'pessoa-a', through: '101' })).status, 200);
  assert.deepEqual(h.calls[1], ['read', h.record.access.collaboratorId, 'pessoa-a', '101']);
  assert.equal((await h.send('PATCH', { action: 'edit', peer: 'pessoa-a', messageId: '101', message: 'Não editar' })).status, 403);
});

test('Chat: revogação, diretório indisponível e remoção da lista não permitem consultas de mensagens', async () => {
  const h = await chat(); h.record.access.active = false; assert.equal((await h.get()).status, 401);
  h.record.access.active = true; h.failDirectory(); const failure = await h.get(); assert.equal(failure.status, 503); assert.equal(failure.headers.get('Retry-After'), '15'); assert.equal(h.calls.length, 0);
  const removed = await chat(); removed.removeFromDirectory(); assert.equal((await removed.get()).status, 403); assert.equal(removed.calls.length, 0);
});

test('Histórico: só Ciça consulta; contatos compartilhados e Marcelo não herdam acesso', async () => {
  for (const profile of ['vendedores-araras', 'administracao-marcelo']) {
    const h = await chat({ profile, unit: profile === 'administracao-marcelo' ? 'Geral' : 'Araras' });
    const api = await h.evaluate('app/api/chat-historico/route.ts');
    assert.equal((await api.GET(new Request('https://portal.test/api/chat-historico?conversation=1'))).status, 403); assert.equal(h.calls.length, 0);
  }
  const cica = await chat({ profile: 'administracao-cica', unit: 'Geral' });
  const api = await cica.evaluate('app/api/chat-historico/route.ts');
  assert.equal((await api.GET(new Request('https://portal.test/api/chat-historico?conversation=1'))).status, 200);
  assert.deepEqual(cica.calls[0], ['history', '1', null]);
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await api[method]()).status, 405);
  const old = await cica.evaluate('app/api/internal-chat/route.ts');
  assert.equal((await old.POST()).status, 405); assert.equal((await old.GET(new Request('https://portal.test/api/internal-chat'))).status, 200);
  assert.ok(cica.calls.every(([method]) => method === 'history'));
});

test('Chat: página individual não apresenta seletor de identidade e não libera histórico a operador', async () => {
  const h = await chat(), gate = await h.evaluate('lib/authorization-server.ts');
  const result = await page('app/dashboard/chat/page.tsx', await h.getSession(), {}, { '@/lib/authorization-server': gate, '@/lib/authorization': cache.get('authorization').namespace, './chat-colaboradores': { default: 'Chat' } });
  assert.equal(result.tree.props.individual, true); assert.equal(result.tree.props.historyAllowed, false);
});

test('Chat: uma consulta combina conversa/contatos e solicitações inválidas não criam mensagens', async () => {
  const h = await chat(); const response = await h.get('peer=pessoa-a&overview=1');
  const body = await response.json(); assert.deepEqual(body.messages, []); assert.ok(body.contacts); assert.equal(h.directoryReads.length, 1);
  assert.equal((await h.send('POST', null)).status, 400);
  assert.equal((await h.send('POST', { peer: 'pessoa-a', message: '' })).status, 400);
  assert.equal((await h.send('POST', { peer: 'pessoa-a', message: 'a'.repeat(4001) })).status, 400);
  assert.ok(h.calls.every(([method]) => !['send', 'edit', 'remove', 'read'].includes(method)));
});
