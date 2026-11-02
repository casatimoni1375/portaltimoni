import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const person = (email, patch = {}) => ({ email, name: "Pessoa", accessLabel: "Acesso", unit: "Geral", modules: ["painel", "estoque"], boxes: ["painel"], mobileModules: [], requiresPassword: false, readOnly: false, active: true, directPainel: false, lastAccess: "", noticeRequired: false, ...patch });
const cica = person("mcrodini@gmail.com");
const marcelo = person("mrodini@gmail.com");
const member = { id: "m1", name: "Pessoa", unit: "Rio Claro", accessEmail: "vendas@example.test", active: true, noticeRequired: true, chatEnabled: true, role: "Vendas", updatedAt: "2026-01-01" };

async function harness({ actor = marcelo, realConfig = false, realAuth = false, registryFetch } = {}) {
  const writes = [];
  const configuration = { users: [cica, marcelo, person("vendas@example.test")], collaborators: [{ ...member }], history: [] };
  let currentActor = actor;
  let authOptions;
  const context = vm.createContext({ Response, Request, URL, Headers, FormData, File, Uint8Array, Date, JSON, console, process: { env: {} }, setTimeout, clearTimeout, fetch: registryFetch ?? (() => { throw Error("Rede não permitida nos testes"); }) });
  const cache = new Map();
  function synthetic(id, exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: id });
  }
  const mockConfig = {
    CICA_EMAIL: cica.email,
    getEffectivePortalUser: async (_token, email) => currentActor && currentActor.email === email ? currentActor : null,
    loadPortalConfiguration: async () => structuredClone(configuration),
    appendAudit: async (...args) => writes.push(["audit", ...args]),
    upsertPortalUser: async (...args) => writes.push(["user", ...args]),
    upsertCollaborator: async (...args) => writes.push(["collaborator", ...args]),
    updatePortalUserMetadata: async (...args) => writes.push(["user-metadata", ...args]),
    updateCollaboratorMetadata: async (...args) => writes.push(["collaborator-metadata", ...args]),
    deletePortalUser: async (...args) => writes.push(["delete-user", ...args]),
    deleteCollaborator: async (...args) => writes.push(["delete-collaborator", ...args]),
    writeUsers: async (...args) => writes.push(["write-users", ...args]),
    writeCollaborators: async (...args) => writes.push(["write-collaborators", ...args]),
    defaultPortalUsers: () => [cica],
    recordPortalAccess: async () => writes.push(["access"]),
  };
  const mocks = {
    "next/server": { NextResponse: class extends Response {
      static json(value, options) { return Response.json(value, options); }
      static redirect(url) { return Response.redirect(url); }
      static next() { return new Response(null, { status: 200 }); }
    } },
    "react": { cache: fn => fn },
    "next/cache": { unstable_cache: fn => fn, revalidateTag: () => {} },
    "@/lib/auth": { auth: async () => ({ user: { email: currentActor?.email ?? cica.email }, accessToken: "test-token", portalUser: currentActor }) },
    "@/lib/portal-config": mockConfig,
    "@/lib/portal-config-revision": { getPortalConfigurationRevisionSafely: async () => "1", bumpPortalConfigurationRevisionSafely: async () => writes.push(["revision"]) },
    "jszip": { default: class { static loadAsync() { throw Error("Backup não deveria ser lido antes de autorizar"); } } },
    "@/lib/comunicados": { listComunicados: async () => [], replaceComunicados: async () => writes.push(["replace-notices"]) },
    "@/lib/aviso-leituras": { listAvisoLeituras: async () => [], replaceAvisoLeituras: async () => writes.push(["replace-reads"]) },
    "@/lib/espaco-equipe": { listTeamMessages: async () => [], replaceTeamMessages: async () => writes.push(["replace-messages"]) },
    "next-auth": { default: options => { authOptions = options; return { handlers: {}, auth: fn => fn, signIn() {}, signOut() {} }; } },
    "next-auth/providers/google": { default: options => options },
  };
  if (realConfig) delete mocks["@/lib/portal-config"];
  if (realAuth) delete mocks["@/lib/auth"];
  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    if (mocks[id]) {
      const m = synthetic(id, mocks[id]); cache.set(id, m); return m;
    }
    const source = stripTypeScriptTypes(await readFile(new URL(id, root), "utf8"));
    const m = new vm.SourceTextModule(source, { context, identifier: id });
    cache.set(id, m);
    await m.link(async (specifier, parent) => {
      if (mocks[specifier]) return load(specifier);
      if (specifier.startsWith("@/")) return load(`${specifier.slice(2)}.ts`);
      if (specifier.startsWith(".")) return load(new URL(`${specifier}.ts`, new URL(parent.identifier, root)).pathname.slice(root.pathname.length));
      throw Error(`Import não previsto: ${specifier}`);
    });
    return m;
  }
  async function evaluate(id) { const m = await load(id); if (m.status !== "evaluated") await m.evaluate(); return m.namespace; }
  return { evaluate, writes, configuration, setActor: value => { currentActor = value; }, getAuthOptions: () => authOptions };
}

const put = item => new Request("https://portal.test/api/configuracoes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });

test("API: Marcelo edita metadados existentes, mas não cria ou concede módulos", async () => {
  const h = await harness();
  const route = await h.evaluate("app/api/configuracoes/route.ts");
  const target = h.configuration.users[2];
  assert.equal((await route.PUT(put({ section: "user", item: { ...target, name: "Nome atualizado" } }))).status, 200);
  assert.equal(h.writes.filter(w => w[0] === "user-metadata").length, 1);
  assert.equal(h.writes.filter(w => w[0] === "user").length, 0);
  h.writes.length = 0;
  for (const item of [{ ...target, email: "novo@example.test" }, { ...target, modules: ["painel", "agenda"] }, { ...target, unit: "Araras" }, { ...target, active: false }]) {
    assert.equal((await route.PUT(put({ section: "user", item }))).status, 403);
    assert.equal(h.writes.length, 0);
  }
});

test("API: Marcelo edita nome/função, não cria/exclui/revincula colaboradores", async () => {
  const h = await harness();
  const route = await h.evaluate("app/api/configuracoes/route.ts");
  assert.equal((await route.PUT(put({ section: "collaborator", item: { ...member, name: "Nome atualizado", role: "Atendimento" } }))).status, 200);
  assert.equal(h.writes.filter(w => w[0] === "collaborator-metadata").length, 1);
  assert.equal(h.writes.filter(w => w[0] === "collaborator").length, 0);
  h.writes.length = 0;
  for (const patch of [{ id: "novo" }, { accessEmail: cica.email }, { unit: "Araras" }, { active: false }]) {
    assert.equal((await route.PUT(put({ section: "collaborator", item: { ...member, ...patch } }))).status, 403);
    assert.equal(h.writes.length, 0);
  }
  assert.equal((await route.DELETE(new Request("https://portal.test", { method: "DELETE" }))).status, 403);
  assert.equal(h.writes.length, 0);
});

test("API: Ciça mantém criação e gestão, usuário removido/inativo não grava", async () => {
  const h = await harness({ actor: cica });
  const route = await h.evaluate("app/api/configuracoes/route.ts");
  assert.equal((await route.PUT(put({ section: "user", item: person("novo@example.test") }))).status, 200);
  h.writes.length = 0;
  for (const actor of [null, { ...cica, active: false }]) {
    h.setActor(actor);
    assert.ok([401, 403].includes((await route.PUT(put({ section: "user", item: person("novo@example.test") }))).status));
    assert.equal(h.writes.length, 0);
  }
});

test("API: Marcelo não restaura backup, mesmo enviando corpo inválido", async () => {
  const h = await harness();
  const route = await h.evaluate("app/api/configuracoes/backup/route.ts");
  assert.equal((await route.POST(new Request("https://portal.test", { method: "POST", body: "não é backup" }))).status, 403);
  assert.equal(h.writes.length, 0);
});

test("cadastro real: ausência de token, conta removida, inativo, planilha vazia e falha não usam base fixa nem escrevem", async () => {
  const row = email => [email, "Ciça", "Geral", "painel,estoque", "painel", "Sim", "Não", "Sim"];
  const mutations = [];
  let rows = [row(cica.email)];
  let fail = false;
  const h = await harness({ realConfig: true, registryFetch: async (_url, init) => {
    if (init?.method && init.method !== "GET") mutations.push(init.method);
    if (fail) throw Error("Sheets indisponível");
    return Response.json({ values: rows });
  } });
  const config = await h.evaluate("lib/portal-config.ts");
  assert.equal((await config.getEffectivePortalUser("token", cica.email)).email, cica.email);
  assert.equal(await config.getEffectivePortalUser(undefined, cica.email), null);
  rows = [];
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  assert.equal((await config.getEffectivePanelData("token", cica.email)).user, null);
  rows = [row(marcelo.email)];
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  rows = [row(cica.email)]; rows[0][7] = "Não";
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  fail = true;
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  assert.deepEqual(mutations, []);
});

test("JWT real: revalida cadastro mesmo quando snapshot e revisão são recentes", async () => {
  const h = await harness({ actor: cica, realAuth: true });
  await h.evaluate("lib/auth.ts");
  const callbacks = h.getAuthOptions().callbacks;
  const oldToken = { email: cica.email, accessToken: "token", portalUser: cica, portalConfigAt: Date.now(), portalConfigRevision: "1" };
  h.setActor(null);
  const revoked = await callbacks.jwt({ token: oldToken });
  assert.equal(revoked.portalUser, null);
  const session = await callbacks.session({ session: { user: { email: cica.email } }, token: revoked });
  assert.equal(session.portalUser, null);
  assert.equal(session.user, undefined);
  assert.equal(session.accessToken, undefined);
  assert.equal(await callbacks.signIn({ user: { email: cica.email }, account: { access_token: "token" } }), false);
});

test("gravação real de metadados não regrava colunas de segurança", async () => {
  const requests = [];
  const h = await harness({ realConfig: true, registryFetch: async (url, init) => {
    if (init?.method === "POST") {
      requests.push(JSON.parse(init.body));
      return Response.json({});
    }
    return Response.json({ values: [[url.includes("PortalColaboradores") ? member.id : marcelo.email]] });
  } });
  const config = await h.evaluate("lib/portal-config.ts");
  await config.updatePortalUserMetadata("token", marcelo);
  await config.updateCollaboratorMetadata("token", member);
  assert.deepEqual(requests[0].data.map(item => item.range), ["PortalUsuarios!B2", "PortalUsuarios!M2"]);
  assert.deepEqual(requests[1].data.map(item => item.range), ["PortalColaboradores!B2", "PortalColaboradores!I2", "PortalColaboradores!F2"]);
  assert.equal(requests.some(body => body.data.some(item => item.range.includes(":"))), false);
});

test("middleware real: sessão sem cadastro oficial não entra no dashboard", async () => {
  const h = await harness({ realAuth: true });
  const middleware = await h.evaluate("middleware.ts");
  const response = middleware.default({ nextUrl: new URL("https://portal.test/dashboard"), url: "https://portal.test/dashboard", auth: { user: { email: cica.email }, portalUser: null } });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://portal.test/login");
});
