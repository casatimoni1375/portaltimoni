import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`./timoni-portal/${path}`, import.meta.url), 'utf8');
async function harness(env = {}, denied = false) {
  let admin = true; const calls = [], gates = []; let cookieReads = 0;
  const context = vm.createContext({ process: { env }, Response, Request, FormData, File, Buffer, console, setTimeout, clearTimeout,
    fetch: async (url, init) => { calls.push({ url, init }); return Response.json({ error: { message: `Falha fictícia ${env.GEMINI_API_KEY || env.GOOGLE_AI_STUDIO_API_KEY || ''}` } }, { status: 403 }); },
  });
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/authorization-server': { requireModuleAuthorization: async (resource, action) => { gates.push([resource, action]); return denied || (action === 'administrar' && !admin) ? { current: null, errorResponse: Response.json({ error: 'Negado' }, { status: 403 }) } : { current: { user: {}, email: 'ficticio@example.test' }, errorResponse: null }; } },
    '@/lib/auth': { auth: async () => ({ user: { email: 'ficticio@example.test' }, portalUser: { modules: ['conferencia', 'compras'] } }) },
    '@/lib/access-control': { hasModuleAccess: () => true },
    '@/lib/module-updates': { recordModuleUpdateSafely: async () => { throw Error('Não deve gravar durante estes testes'); } },
    'next/headers': { cookies: async () => { cookieReads++; throw Error('Não usar cookie'); } },
    xlsx: {},
  };
  const cache = new Map();
  async function get(path) { if (!cache.has(path)) cache.set(path, new vm.SourceTextModule(stripTypeScriptTypes(read(path)), { context, identifier: path })); return cache.get(path); }
  async function evaluate(path) {
    const item = await get(path);
    if (item.status === 'unlinked') await item.link(async spec => {
      if (spec === '@/lib/gemini-config.server') return get('lib/gemini-config.server.ts');
      const values = mocks[spec]; assert.ok(values, spec); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
    });
    if (item.status !== 'evaluated') await item.evaluate(); return item.namespace;
  }
  return { evaluate, calls, gates, cookies: () => cookieReads, viewer: () => { admin = false; } };
}
function imageRequest() {
  const body = new FormData(); body.set('print', new File(['imagem-ficticia'], 'print.png', { type: 'image/png' }));
  return new Request('https://portal.test/api/compras/ler-print', { method: 'POST', body });
}

test('Gemini: configuração central usa prioridade das variáveis sem depender de cookies', async () => {
  const h = await harness(); const config = await h.evaluate('lib/gemini-config.server.ts');
  assert.equal(config.getGeminiServerKey({}), null);
  assert.equal(config.getGeminiServerKey({ GEMINI_API_KEY: ' ficticia-principal ', GOOGLE_AI_STUDIO_API_KEY: 'ficticia-alternativa' }), 'ficticia-principal');
  assert.equal(config.getGeminiServerKey({ GEMINI_API_KEY: ' ', GOOGLE_AI_STUDIO_API_KEY: ' ficticia-alternativa ' }), 'ficticia-alternativa');
  assert.equal(h.cookies(), 0);
});

test('Gemini: status é o mesmo em navegadores distintos e não devolve a chave', async () => {
  const h = await harness({ GEMINI_API_KEY: 'chave-central-ficticia' });
  const api = await h.evaluate('app/api/configurar-gemini/route.ts');
  for (let browser = 0; browser < 2; browser++) {
    const response = await api.GET(); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { configured: true, source: 'server' });
  }
  assert.equal(h.cookies(), 0); assert.equal(h.calls.length, 0);
});

test('Gemini: ausência de chave central não tenta usar chave pessoal nem gerar configuração externa', async () => {
  const h = await harness(); const api = await h.evaluate('app/api/configurar-gemini/route.ts');
  assert.deepEqual(await (await api.GET()).json(), { configured: false, source: 'none' });
  assert.equal(h.cookies(), 0); assert.equal(h.calls.length, 0);
});

test('Gemini: administração por navegador é desativada e usuário comum não pode alterá-la', async () => {
  const h = await harness(), api = await h.evaluate('app/api/configurar-gemini/route.ts');
  const request = { json: () => { throw Error('Não ler segredo enviado pelo navegador'); } };
  assert.equal((await api.POST(request)).status, 410); assert.equal((await api.DELETE()).status, 410);
  h.viewer(); assert.equal((await api.POST(request)).status, 403); assert.equal((await api.DELETE()).status, 403);
  assert.equal(h.cookies(), 0); assert.equal(h.calls.length, 0);
});

test('Gemini: usuário sem acesso não consegue nem consultar configuração', async () => {
  const h = await harness({ GEMINI_API_KEY: 'ficticia' }, true), api = await h.evaluate('app/api/configurar-gemini/route.ts');
  assert.equal((await api.GET()).status, 403); assert.equal(h.calls.length, 0);
});

test('Conferência e leitura de print: sem chave central não usam cookie e não chamam provedor', async () => {
  const h = await harness();
  const conference = await h.evaluate('app/api/conferencia-pedidos/route.ts');
  const print = await h.evaluate('app/api/compras/ler-print/route.ts');
  assert.equal((await conference.POST({ formData: () => { throw Error('Não ler arquivo sem configuração'); } })).status, 503);
  assert.equal((await print.POST(imageRequest())).status, 503);
  assert.equal(h.cookies(), 0); assert.equal(h.calls.length, 0);
});

test('Leitura de print: chave central é usada somente no cabeçalho e ocultada em erros', async () => {
  const key = 'chave-ficticia-que-nao-pode-voltar-na-resposta';
  const h = await harness({ GEMINI_API_KEY: key }), api = await h.evaluate('app/api/compras/ler-print/route.ts');
  const response = await api.POST(imageRequest());
  assert.equal(response.status, 502); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.headers['x-goog-api-key'], key); assert.equal(h.calls[0].url.includes(key), false);
  const text = await response.text(); assert.equal(text.includes(key), false); assert.match(text, /credencial protegida/);
  assert.equal(h.cookies(), 0);
});
