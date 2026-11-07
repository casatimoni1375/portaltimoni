import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createGoogleTokenRefresher } from './timoni-portal/lib/google-token-refresh.ts';
import { createPortalRevisionChecker } from './timoni-portal/lib/portal-revision-checker.ts';
const read = p => readFileSync(new URL(`./timoni-portal/${p}`, import.meta.url), 'utf8');
const token = () => ({ email: 'user@test', refreshToken: 'privado', accessToken: 'antigo', expiresAt: 1 });
const success = () => Response.json({ access_token: 'novo', expires_in: 3600 });
test('renovação preserva refresh token omitido, limpa erro e calcula validade', async () => {
  const refresh = createGoogleTokenRefresher(async () => success(), () => 100000);
  const result = await refresh({ ...token(), error: 'SessionTemporarilyUnavailable' }, 'id', 'secret');
  assert.equal(result.accessToken, 'novo'); assert.equal(result.refreshToken, 'privado');
  assert.equal(result.expiresAt, 3700); assert.equal(result.error, undefined);
});
for (const failure of ['network', '429', '503', 'bad-json', 'invalid-client', 'malformed']) {
  test(`falha temporária ${failure} preserva renovação e evita repetição imediata`, async () => {
    let calls = 0, time = 100000;
    const refresh = createGoogleTokenRefresher(async () => {
      calls++;
      if (calls > 1) return success();
      if (failure === 'network') throw Error('offline privado');
      if (failure === 'bad-json') return new Response('<html>');
      if (failure === 'invalid-client') return Response.json({ error: 'invalid_client' }, { status: 401 });
      if (failure === 'malformed') return Response.json({ access_token: 'x', expires_in: -1 });
      return Response.json({}, { status: Number(failure) });
    }, () => time);
    const result = await refresh(token(), 'id', 'secret');
    assert.equal(result.error, 'SessionTemporarilyUnavailable');
    assert.equal(result.refreshToken, 'privado');
    assert.equal((await refresh(result, 'id', 'secret')).error, 'SessionTemporarilyUnavailable'); assert.equal(calls, 1);
    time += 16000;
    assert.equal((await refresh(result, 'id', 'secret')).accessToken, 'novo'); assert.equal(calls, 2);
  });
}
test('invalid_grant apaga credenciais e exige novo login sem renovação automática', async () => {
  let calls = 0;
  const refresh = createGoogleTokenRefresher(async () => { calls++; return Response.json({ error: 'invalid_grant' }, { status: 400 }); });
  const result = await refresh(token(), 'id', 'secret');
  assert.equal(result.error, 'RefreshAccessTokenError'); assert.equal(result.accessToken, undefined); assert.equal(result.refreshToken, undefined);
  await refresh(result, 'id', 'secret'); assert.equal(calls, 1);
});
test('várias abas na mesma instância compartilham renovação sem compartilhar identidade', async () => {
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const refresh = createGoogleTokenRefresher(async () => { calls++; await pending; return success(); });
  const a = refresh(token(), 'id', 'secret');
  const b = refresh({ ...token(), email: 'outro@test' }, 'id', 'secret');
  release();
  const results = await Promise.all([a,b]); assert.equal(calls, 1);
  assert.equal(results[0].email, 'user@test'); assert.equal(results[1].email, 'outro@test');
  await refresh({ ...token(), refreshToken: 'outra-conta' }, 'id', 'secret'); assert.equal(calls, 2);
});
test('timeout e configuração ausente são temporários; refresh token ausente exige login', async () => {
  const refresh = createGoogleTokenRefresher((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('timeout')))), Date.now, 5);
  assert.equal((await refresh(token(), 'id', 'secret')).error, 'SessionTemporarilyUnavailable');
  assert.equal((await refresh(token(), '', '')).error, 'SessionTemporarilyUnavailable');
  assert.equal((await refresh({ ...token(), refreshToken: undefined }, 'id', 'secret')).error, 'RefreshAccessTokenError');
});
async function moduleHarness(path, mocks, globals = {}) {
  const context = vm.createContext({ URL, URLSearchParams, AbortController, setTimeout, clearTimeout, process: { env: { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' } }, ...globals });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context });
  await mod.link(async spec => {
    const exports = mocks[spec] || (spec === '@/lib/portal-session' ? { getPortalSession: mocks['@/lib/auth'].auth } : null)
      || (spec === '@/lib/collaborator-access' ? Object.fromEntries(['canCollaboratorAction', 'resolveCollaboratorAccess', 'collaboratorModuleUser'].map(name => [name, () => { throw Error('Identidade individual não deve ser usada neste cenário OAuth'); }])) : null);
    if (!exports) throw Error(spec);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k,v] of Object.entries(exports)) this.setExport(k,v); }, { context });
  });
  await mod.evaluate(); return mod.namespace;
}
async function authHarness(fetcher = async () => success()) {
  let options, state = { user: { email: 'user@test', active: true, modules: [] }, unavailable: false };
  const mod = await moduleHarness('lib/auth.ts', {
    '@/lib/google-token-refresh': { createGoogleTokenRefresher: () => createGoogleTokenRefresher(fetcher) },
    'next-auth': { CredentialsSignin: class extends Error {}, default: config => { options = config; return { signOut: 'saida-original' }; } },
    'next-auth/providers/credentials': { default: config => config },
    '@/lib/collaborator-auth.server': { individualLoginEnabled: () => false, authenticatePortalCollaborator: async () => null, resolvePortalCollaboratorSession: async () => ({ access: null, unavailable: false }) },
    'next-auth/providers/google': { default: config => config },
    '@/lib/portal-config': { getEffectivePortalUser: async () => state.user, getPortalUserSessionState: async () => state, recordPortalAccess: async () => {} },
    '@/lib/portal-config-revision': { getPortalConfigurationRevisionSafely: async () => 'revision' },
    '@/lib/authorization': { resolveConfiguredUser: (_email, user) => user?.active === false ? null : user },
  });
  return { options, mod, setState: next => { state = next; } };
}
test('Google usa autorização automática sem forçar consentimento em cada entrada', async () => {
  const h = await authHarness();
  const params = h.options.providers[0].authorization.params;
  assert.equal(params.prompt, undefined);
  assert.equal(params.access_type, 'offline');
  assert.equal(params.include_granted_scopes, 'true');
  assert.ok(params.scope.includes('openid'));
  assert.ok(params.scope.includes('https://www.googleapis.com/auth/spreadsheets'));
});

test('sessão mantém 365 dias e saída original; falha de cadastro bloqueia sem descartar identidade JWT', async () => {
  const h = await authHarness();
  assert.equal(h.options.session.maxAge, 365*24*60*60); assert.equal(h.mod.signOut, 'saida-original');
  h.setState({ user: null, unavailable: true });
  const jwt = await h.options.callbacks.jwt({ token: { ...token(), expiresAt: Date.now()/1000+3600 } });
  assert.equal(jwt.email, 'user@test'); assert.equal(jwt.portalUser, null); assert.equal(jwt.error, 'SessionTemporarilyUnavailable');
  const session = await h.options.callbacks.session({ session: { user: { email: 'user@test' } }, token: jwt });
  assert.equal(session.user, undefined); assert.equal(session.accessToken, undefined); assert.equal(session.error, 'SessionTemporarilyUnavailable');
  h.setState({ user: { email: 'user@test', active: true }, unavailable: false });
  const recovered = await h.options.callbacks.jwt({ token: jwt }); assert.equal(recovered.error, undefined); assert.ok(recovered.portalUser);
});
test('usuário desativado continua bloqueado; novo login limpa falhas anteriores', async () => {
  const h = await authHarness();
  h.setState({ user: { email: 'user@test', active: false }, unavailable: false });
  const jwt = await h.options.callbacks.jwt({ token: { ...token(), expiresAt: Date.now()/1000+3600 } });
  const session = await h.options.callbacks.session({ session: { user: { email: 'user@test' } }, token: jwt });
  assert.equal(session.user, undefined); assert.equal(session.error, undefined);
  assert.equal(await h.options.callbacks.signIn({ user: { email: 'user@test' }, account: {} }), false);
  h.setState({ user: { email: 'user@test', active: true }, unavailable: false });
  const logged = await h.options.callbacks.jwt({ token: { ...token(), error: 'RefreshAccessTokenError', refreshRetryAt: Date.now()+999999 }, account: { access_token: 'login-novo', refresh_token: 'refresh-novo', expires_at: 9999999999 } });
  assert.equal(logged.error, undefined); assert.equal(logged.refreshRetryAt, undefined); assert.equal(logged.accessToken, 'login-novo');
});
test('guardas distinguem 503 temporário e 401 revogado sem recorrer a credencial central', async () => {
  for (const error of ['SessionTemporarilyUnavailable','RefreshAccessTokenError']) {
    let fallback = 0;
    const mod = await moduleHarness('lib/auth-guard.ts', {
      'next/server': { NextResponse: Response }, '@/lib/auth': { auth: async () => ({ error }) },
      '@/lib/access-control': { isAuthorizedUser: () => true },
      '@/lib/google-calendar': { getAccessTokenFromRefreshToken: async () => { fallback++; } },
    });
    assert.equal((await mod.requireAuthorizedSession()).errorResponse.status, error === 'SessionTemporarilyUnavailable' ? 503 : 401); assert.equal(fallback, 0);
  }
});

test('middleware devolve 503 temporário sem redirecionar para login', async () => {
  let redirects = 0;
  class NextResponse extends Response { static redirect() { redirects++; return new Response(null, { status: 307 }); } static next() { return new Response(); } }
  const mod = await moduleHarness('middleware.ts', {
    'next/server': { NextResponse }, '@/lib/auth': { auth: fn => fn },
    '@/lib/access-control': { getPortalUser: () => null, hasModuleAccess: () => false },
    '@/lib/authorization': { can: () => false },
  });
  const request = { auth: { error: 'SessionTemporarilyUnavailable' }, nextUrl: { pathname: '/dashboard' }, url: 'https://portal.test/dashboard' };
  const response = mod.default(request);
  assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '15'); assert.equal(redirects, 0);
  request.auth = null; mod.default(request); assert.equal(redirects, 1);
});

test('autorização central bloqueia indisponibilidade antes de consultar cadastro ou executar ação', async () => {
  let reads = 0;
  const mod = await moduleHarness('lib/authorization-server.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { auth: async () => ({ error: 'SessionTemporarilyUnavailable' }) },
    '@/lib/portal-config': { getEffectivePortalUser: async () => { reads++; return null; } },
    '@/lib/authorization': { can: () => true }, '@/lib/module-authorization': { canModuleOperation: () => true },
  });
  const gate = await mod.requireModuleAuthorization('motorista', 'editar');
  assert.equal(gate.current, null); assert.equal(gate.errorResponse.status, 503); assert.equal(reads, 0);
});

test('estado serializado após falha pode renovar em nova instância depois da espera', async () => {
  const first = createGoogleTokenRefresher(async () => { throw Error('offline'); }, () => 100000);
  const persisted = JSON.parse(JSON.stringify(await first(token(), 'id', 'secret')));
  const reopened = createGoogleTokenRefresher(async () => success(), () => 120000);
  const result = await reopened(persisted, 'id', 'secret');
  assert.equal(result.email, 'user@test'); assert.equal(result.accessToken, 'novo'); assert.equal(result.error, undefined);
});

test('novo login só reutiliza refresh token da mesma conta Google já identificada', async () => {
  const h = await authHarness();
  for (const [oldId, newId, expected] of [['conta-a', 'conta-a', 'privado'], ['conta-a', 'conta-b', undefined], [undefined, 'conta-b', undefined]]) {
    const result = await h.options.callbacks.jwt({ token: { ...token(), googleAccountId: oldId }, account: { providerAccountId: newId, access_token: 'novo-login', expires_at: 9999999999 } });
    assert.equal(result.refreshToken, expected);
    assert.equal(result.googleAccountId, newId);
  }
});

test('token de acesso ausente é renovado mesmo com prazo de validade futuro', async () => {
  let calls = 0;
  const h = await authHarness(async () => { calls++; return success(); });
  const result = await h.options.callbacks.jwt({ token: { ...token(), accessToken: undefined, expiresAt: Date.now()/1000 + 3600 } });
  assert.equal(calls, 1);
  assert.equal(result.accessToken, 'novo');
  assert.equal(result.error, undefined);
});

test('espera de renovação continua temporária mesmo após limpar a apresentação do erro', async () => {
  let calls = 0;
  const refresh = createGoogleTokenRefresher(async () => { calls++; throw Error('offline'); }, () => 100000);
  const first = await refresh(token(), 'id', 'secret');
  const second = await refresh({ ...first, error: undefined }, 'id', 'secret');
  assert.equal(second.error, 'SessionTemporarilyUnavailable');
  assert.equal(second.refreshToken, 'privado');
  assert.equal(calls, 1);
});

test('expiração durante espera de nova tentativa bloqueia uso sem apagar credencial de renovação', async () => {
  const h = await authHarness();
  const result = await h.options.callbacks.jwt({ token: { ...token(), error: undefined, refreshRetryAt: Date.now()+15000 } });
  assert.equal(result.error, 'SessionTemporarilyUnavailable');
  assert.equal(result.portalUser, null);
  assert.equal(result.refreshToken, 'privado');
});

test('checagem de revisão agrupa eventos próximos e só atualiza quando muda', async () => {
  let now = 0, calls = 0, refreshes = 0, revision = '1';
  const checker = createPortalRevisionChecker(() => refreshes++, async () => { calls++; return Response.json({ revision, sessionRevision: '1' }); }, () => now);
  await checker.run(); await checker.run();
  now = 4999; await checker.run();
  assert.equal(calls, 1);
  assert.equal(refreshes, 0);
  now = 5000; revision = '2'; await checker.run();
  assert.equal(calls, 2); assert.equal(refreshes, 1);
  now = 10000; await checker.run();
  assert.equal(refreshes, 1);
});

test('checagem simultânea não duplica consulta e cancelamento ignora resposta tardia', async () => {
  let resolve, calls = 0, refreshes = 0;
  const checker = createPortalRevisionChecker(() => refreshes++, () => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = checker.run();
  await checker.run();
  assert.equal(calls, 1);
  checker.dispose();
  resolve(Response.json({ revision: '2', sessionRevision: '1' }));
  await pending; await checker.run();
  assert.equal(calls, 1); assert.equal(refreshes, 0);
});

test('falha na checagem preserva revisão e permite recuperar sem sair da sessão', async () => {
  let now = 0, calls = 0, refreshes = 0;
  const checker = createPortalRevisionChecker(() => refreshes++, async () => {
    calls++;
    if (calls === 2) throw Error('offline');
    return Response.json({ revision: calls === 1 ? '1' : '2', sessionRevision: '1' });
  }, () => now);
  await checker.run(); now = 5000; await checker.run();
  assert.equal(refreshes, 0);
  now = 10000; await checker.run();
  assert.equal(refreshes, 1);
});
