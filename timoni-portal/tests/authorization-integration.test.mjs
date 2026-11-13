import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as crypto from "node:crypto";

const root = new URL("../", import.meta.url);
const person = (email, patch = {}) => ({ email, name: "Pessoa", accessLabel: "Acesso", unit: "Geral", modules: ["painel", "estoque"], boxes: ["painel"], mobileModules: [], requiresPassword: false, readOnly: false, active: true, directPainel: false, lastAccess: "", noticeRequired: false, ...patch });
const cica = person("mcrodini@gmail.com");
const marcelo = person("mrodini@gmail.com");
const member = { id: "m1", name: "Pessoa", unit: "Rio Claro", accessEmail: "vendas@example.test", active: true, noticeRequired: true, chatEnabled: true, role: "Vendas", updatedAt: "2026-01-01" };

async function harness({ actor = marcelo, realConfig = false, realAuth = false, registryFetch, extraMocks = {}, env = {} } = {}) {
  const writes = [];
  const configuration = { users: [cica, marcelo, person("vendas@example.test")], collaborators: [{ ...member }], history: [] };
  let currentActor = actor;
  let authOptions;
  const context = vm.createContext({ Response, Request, URL, URLSearchParams, AbortController, AbortSignal, Buffer, Headers, FormData, File, Uint8Array, Date, JSON, console, process: { env }, setTimeout, clearTimeout, fetch: registryFetch ?? (() => { throw Error("Rede não permitida nos testes"); }) });
  const cache = new Map();
  function synthetic(id, exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: id });
  }
  const mockConfig = {
    CICA_EMAIL: cica.email,
    getEffectivePortalUser: async (_token, email) => currentActor && currentActor.email === email ? currentActor : null,
    getPortalUserSessionState: async (_token, email) => ({ user: currentActor && currentActor.email === email ? currentActor : null, unavailable: false }),
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
    "@/lib/google-calendar": { getAccessTokenFromRefreshToken: async () => "central-test-token" },
    "next/server": { NextRequest: Request, NextResponse: class extends Response {
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
    "next-auth": { CredentialsSignin: class extends Error {}, default: options => { authOptions = options; return { handlers: {}, auth: fn => fn, signIn() {}, signOut() {} }; } },
    "next-auth/providers/credentials": { default: options => options },
    "@/lib/collaborator-auth.server": { individualLoginEnabled: () => false, authenticatePortalCollaborator: async () => null, resolvePortalCollaboratorSession: async () => ({ access: null, unavailable: false }), getPortalCentralIntegrationToken: async () => { throw Error("Não usar token individual em cenário Google"); } },
    "next-auth/providers/google": { default: options => options },
  };
  Object.assign(mocks, extraMocks);
  if (realConfig) delete mocks["@/lib/portal-config"];
  if (realAuth) delete mocks["@/lib/auth"];
  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    if (mocks[id]) {
      const m = synthetic(id, mocks[id]); cache.set(id, m); return m;
    }
    // Registra a promessa antes da leitura: importações concorrentes recebem o mesmo módulo.
    const pending = readFile(new URL(id, root), "utf8").then(source =>
      new vm.SourceTextModule(stripTypeScriptTypes(source), { context, identifier: id }));
    cache.set(id, pending);
    return pending;
  }
  async function link(specifier, parent) {
    if (mocks[specifier]) return load(specifier);
    if (specifier.startsWith("@/")) return load(`${specifier.slice(2)}.ts`);
    if (specifier.startsWith(".")) return load(new URL(`${specifier}.ts`, new URL(parent.identifier, root)).pathname.slice(root.pathname.length));
    throw Error(`Import não previsto: ${specifier}`);
  }
  async function evaluate(id) {
    const m = await load(id);
    if (m.status === "unlinked") await m.link(link);
    if (m.status !== "evaluated") await m.evaluate();
    return m.namespace;
  }
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

const moduleActor = (email = "vendas@example.test", patch = {}) => person(email, { unit: "Rio Claro", modules: ["motorista", "estoque", "leads", "compras", "agenda-ct", "reunioes", "estoque-rotativo"], ...patch });
const urlRequest = (params) => ({ nextUrl: new URL("https://portal.test/api?" + params) });
const motorPost = body => new Request("https://portal.test/api/agenda-motorista", { method: "POST", body: new URLSearchParams(body) });
function motorHarness(actor, trips = [{ id: "rc", loja: "rio_claro" }, { id: "ara", loja: "araras" }]) {
  const calls = [];
  return harness({ actor, env: { MOTORISTA_API_TOKEN: "token-apenas-teste" }, registryFetch: async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    return Response.json(init.method === "GET" ? { ok: true, viagens: trips } : { ok: true });
  }, extraMocks: { "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} } } }).then(h => ({ ...h, calls }));
}
test("Motorista: anônimo, removido e módulo não atribuído não consultam a origem", async () => {
  for (const actor of [null, moduleActor(undefined, { active: false }), moduleActor(undefined, { modules: [] })]) {
    const h = await motorHarness(actor);
    const route = await h.evaluate("app/api/agenda-motorista/route.ts");
    assert.ok([401, 403].includes((await route.GET(urlRequest("action=dia&data=2026-11-02"))).status));
    assert.equal(h.calls.length, 0);
  }
});
test("Motorista: todos com o módulo veem todas as viagens e nada arbitrário é encaminhado", async () => {
  const h = await motorHarness(moduleActor());
  const route = await h.evaluate("app/api/agenda-motorista/route.ts");
  const response = await route.GET(urlRequest("action=dia&data=2026-11-02&callback=malicioso"));
  // Um motorista só: todas as viagens aparecem para quem tem o módulo (decisão da gestão, 10/11/2026).
  assert.deepEqual((await response.json()).viagens.map(v => v.id), ["rc", "ara"]);
  assert.equal(new URL(h.calls[0].url).searchParams.has("callback"), false);
  assert.equal((await route.GET(urlRequest("action=excluir&id=ara"))).status, 400);
  assert.equal((await route.GET(urlRequest("action=mes&mes=2026-11"))).status, 403);
  assert.equal(h.calls.length, 1);
});
test("Motorista: somente leitura e Marcelo não criam/excluem via chamada direta", async () => {
  for (const actor of [moduleActor(undefined, { readOnly: true }), moduleActor("mrodini@gmail.com", { unit: "Geral" })]) {
    const h = await motorHarness(actor);
    const route = await h.evaluate("app/api/agenda-motorista/route.ts");
    for (const action of ["criar", "excluir"]) assert.equal((await route.POST(motorPost({ action, id: "rc", data: "2026-11-02", loja: "rio_claro" }))).status, 403);
    assert.equal(h.calls.length, 0);
  }
});
test("Motorista: ID de outra unidade, data forjada, unidade alterada e ID ausente não gravam", async () => {
  const h = await motorHarness(moduleActor());
  const route = await h.evaluate("app/api/agenda-motorista/route.ts");
  for (const input of [
    { action: "atualizar", id: "ara", data: "2026-11-02", loja: "rio_claro" },
    { action: "excluir", id: "desconhecido", data: "2026-11-02" },
    { action: "atualizar", id: "rc", data: "2026-11-02", loja: "araras" },
    { action: "atualizar", id: "rc" }
  ]) assert.ok((await route.POST(motorPost(input))).status >= 400);
  assert.equal(h.calls.filter(c => c.method === "POST").length, 0);
});
test("Motorista: edição autorizada e Ciça criando preservam o fluxo operacional", async () => {
  const h = await motorHarness(moduleActor("mrodini@gmail.com", { unit: "Geral" }));
  const route = await h.evaluate("app/api/agenda-motorista/route.ts");
  assert.equal((await route.POST(motorPost({ action: "atualizar", id: "rc", dataOrigem: "2026-11-02", data: "2026-11-03", loja: "rio_claro" }))).status, 200);
  assert.equal(h.calls.filter(c => c.method === "POST").length, 1);
  assert.equal(new URLSearchParams(h.calls.at(-1).body).has("dataOrigem"), false);
  h.setActor(cica);
  assert.equal((await route.POST(motorPost({ action: "criar", data: "2026-11-03", loja: "araras" }))).status, 200);
});
test("Motorista leitura: POST não encaminha nem conclui viagem", async () => {
  const h = await motorHarness(cica);
  const route = await h.evaluate("app/api/motorista-leitura/route.ts");
  assert.equal((await route.POST(motorPost({ action: "atualizar" }))).status, 405);
  assert.equal(h.calls.length, 0);
});
test("Reuniões: exige módulo e filtra a unidade; Marcelo edita sem criar/excluir", async () => {
  const operations = [];
  const h = await harness({ actor: moduleActor(), extraMocks: { "@/lib/reunioes": {
    listMeetings: async () => [{ id: "rc", unit: "Rio Claro" }, { id: "ara", unit: "Araras" }],
    listMeetingsFresh: async () => [{ id: "rc", unit: "Rio Claro" }, { id: "ara", unit: "Araras" }],
    createMeeting: async () => { operations.push("create"); return "new"; },
    updateMeeting: async () => operations.push("edit"),
    archiveMeetingOccurrence: async () => operations.push("archive"),
    deleteMeeting: async () => operations.push("delete")
  }, "@/lib/module-updates": { recordModuleUpdateSafely: async () => { throw Error("Não alterar registro legado neste teste"); } } } });
  const route = await h.evaluate("app/api/reunioes/route.ts");
  assert.deepEqual((await (await route.GET()).json()).items.map(v => v.id), ["rc"]);
  h.setActor(moduleActor("mrodini@gmail.com", { unit: "Geral" }));
  const req = body => new Request("https://portal.test/api/reunioes", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST(req({}))).status, 403);
  assert.equal((await route.DELETE(req({ id: "rc" }))).status, 403);
  assert.equal((await route.PATCH(req({ id: "rc", action: "complete" }))).status, 200);
  assert.deepEqual(operations, ["edit"]);
  h.setActor(moduleActor(undefined, { modules: [] }));
  assert.ok((await route.GET()).status >= 400);
});

test("Dashboard Motorista: usuário selecionado cria, edita e exclui viagens da própria unidade", async () => {
  const h = await motorHarness(moduleActor(), [{ id: "rc", loja: "MCR" }, { id: "ara", loja: "Casa Timoni" }]);
  const route = await h.evaluate("app/api/agenda-motorista/route.ts");
  for (const action of ["criar", "atualizar", "excluir"]) {
    const response = await route.POST(motorPost({ action, id: "rc", data: "2026-11-02", loja: "MCR" }));
    assert.equal(response.status, 200, action);
  }
  assert.equal(h.calls.filter(c => c.method === "POST").length, 3);
});

test("Estoque: leitura, resumo e mutação usam unidade persistida, ignorando unidade forjada", async () => {
  const calls = [];
  const row = (id, unit) => [id, "produto", "Descrição", "Pendente", "", "", "", "", "", false, unit, "Vendedor"];
  const sheets = { spreadsheets: { values: {
    batchGet: async () => ({ data: { valueRanges: [{ values: [["id"], row("rc", "rio_claro"), row("ara", "araras"), row("unknown", "")] }, { values: [["codigo"], ["produto", "Descrição", "UN"]] }, { values: [["nome"], ["RC", "rio_claro"], ["ARA", "araras"]] }] } }),
    batchUpdate: async value => calls.push(value), append: async value => calls.push(value)
  }, batchUpdate: async value => calls.push(value) } };
  const h = await harness({ actor: moduleActor(), extraMocks: {
    googleapis: { google: { auth: { OAuth2: class { setCredentials() {} } }, sheets: () => sheets } },
    "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} },
    "@/lib/stock-notice-reads": { pendingStockIdsForUser: (_user, needs) => needs.map(v => v.id) }
  } });
  const route = await h.evaluate("app/api/estoque/route.ts");
  const data = await (await route.GET()).json();
  assert.deepEqual(data.necessidades.map(v => v.id), ["rc"]);
  assert.deepEqual(data.unreadIds, ["rc"]);
  const req = body => new Request("https://portal.test/api/estoque", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST(req({ action: "chegou", id: "ara", unidade: "rio_claro" }))).status, 403);
  assert.equal((await route.POST(req({ action: "chegou", id: "unknown", unidade: "rio_claro" }))).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await route.POST(req({ action: "chegou", id: "rc" }))).status, 200);
  assert.equal(calls.length, 1);
  h.setActor(moduleActor("mrodini@gmail.com", { unit: "Geral" }));
  for (const action of ["criar", "excluir"]) assert.equal((await route.POST(req({ action, id: "rc", unidade: "rio_claro" }))).status, 403);
  assert.equal(calls.length, 1);
  h.setActor(moduleActor(undefined, { unit: "Araras" }));
  const existing = await route.POST(req({ action: "criar", codigo: "produto", unidade: "Araras", vendedor: "Vendedor" }));
  assert.equal(existing.status, 200);
  assert.equal((await existing.json()).id, "ara");
});
test("Agenda: GET limita calendários; Marcelo não cria/exclui e preserva edição da CT", async () => {
  const calls = [];
  const actor = moduleActor("mrodini@gmail.com", { unit: "Geral" });
  const h = await harness({ actor, extraMocks: {
    "@/lib/auth-guard": { requireAuthorizedSession: async () => ({ session: { portalUser: actor, accessToken: "token", user: { email: actor.email } }, errorResponse: null }) },
    "@/lib/google-calendar": {
      isCalendarKey: key => ["principal", "timoni"].includes(key),
      listEventsInRange: async (_token, _range, keys) => { calls.push(["read", Array.from(keys)]); return []; },
      createEvent: async () => { calls.push(["create"]); return {}; },
      updateEvent: async () => { calls.push(["edit"]); return {}; },
      deleteEvent: async () => calls.push(["delete"]),
      toApiError: () => ({ message: "Falhou", status: 500 })
    },
    "@/lib/week": { getWeekRange: () => ({ start: new Date(), end: new Date() }) },
    "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} }
  } });
  const route = await h.evaluate("app/api/events/route.ts");
  assert.equal((await route.GET(new Request("https://portal.test/api/events"))).status, 200);
  assert.deepEqual(calls, [["read", ["timoni"]]]);
  const body = { summary: "Evento", start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z", calendarKey: "timoni" };
  const req = new Request("https://portal.test/api/events", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST(req)).status, 403);
  const item = await h.evaluate("app/api/events/[eventId]/route.ts");
  const context = { params: Promise.resolve({ eventId: "evento" }) };
  assert.equal((await item.DELETE(new Request("https://portal.test/api/events/evento?calendarKey=timoni"), context)).status, 403);
  assert.equal((await item.PATCH(new Request("https://portal.test/api/events/evento?calendarKey=timoni", { method: "PATCH", body: JSON.stringify(body) }), context)).status, 200);
  assert.deepEqual(calls.map(c => c[0]), ["read", "edit"]);
});
test("Leads: Marcelo não cria/importa/gera relatório; unidade forjada não grava", async () => {
  const calls = [];
  const methods = ["addLead", "addProspect", "createLeadsReport", "importLeads", "listLeadActivities", "listLeads", "listProspects", "moveLeadToProspects", "reactivateProspect", "updateLeadFollowUp"];
  const h = await harness({ actor: moduleActor("mrodini@gmail.com", { unit: "Geral" }), extraMocks: {
    "@/lib/leads": Object.fromEntries(methods.map(name => [name, async () => { calls.push(name); return []; }])),
    "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} }
  } });
  const route = await h.evaluate("app/api/leads/route.ts");
  const req = body => new Request("https://portal.test/api/leads", { method: "POST", body: JSON.stringify(body) });
  for (const action of ["novo", "gerar_relatorio"]) assert.equal((await route.POST(req({ action, location: "rc" }))).status, 403);
  assert.equal((await route.PUT(req({ rows: [], location: "rc" }))).status, 403);
  h.setActor(moduleActor());
  assert.equal((await route.POST(req({ action: "novo", location: "ara" }))).status, 403);
  assert.equal((await route.PATCH(req({ row: 2, location: "ara" }))).status, 403);
  assert.equal(calls.length, 0);
});

test("Compras: Marcelo não finaliza pedido; usuário local não move cartão de outro quadro/unidade", async () => {
  const calls = [];
  const board = { id: "board", lists: [{ id: "pending", name: "PEDIDOS PENDENTES" }, { id: "sent-rc", name: "PEDIDOS ENVIADO RIO CLARO" }], labels: [] };
  let card = { id: "card", name: "Fornecedor", idBoard: "other", idList: "pending", labels: [{ name: "Rio Claro" }] };
  const h = await harness({ actor: moduleActor("mrodini@gmail.com", { unit: "Geral" }), extraMocks: {
    "@/lib/trello": {
      normalizeTrelloText: value => String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      TRELLO_BOARD_SHORT_LINK: "board",
      trelloFetch: async (url, options = {}) => { calls.push([url, options.method || "GET"]); return url.startsWith("/boards/") ? board : card; }
    },
    "@/lib/purchase-orders": { upsertPurchaseOrder: async () => calls.push(["snapshot", "POST"]) },
    "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} }
  } });
  const route = await h.evaluate("app/api/compras/finalizar/route.ts");
  const req = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ cardId: "card", finalTitle: "Fornecedor", unit: "rio_claro", empresa: "MCR", dataEnvio: "2026-11-02", dataEntrega: "2026-11-03", items: JSON.stringify([{ codigo: "1", descricao: "Produto", quantidade: "1" }]) })) data.set(key, value);
    return new Request("https://portal.test/api/compras/finalizar", { method: "POST", body: data });
  };
  assert.equal((await route.POST(req())).status, 403);
  assert.equal(calls.length, 0);
  h.setActor(moduleActor());
  assert.equal((await route.POST(req())).status, 403);
  card = { ...card, idBoard: "board", labels: [{ name: "Araras" }] };
  assert.equal((await route.POST(req())).status, 403);
  assert.equal(calls.filter(c => c[1] !== "GET").length, 0);
});

test("Rotativo: padronização/restauração nega Marcelo antes de ler corpo ou acionar legado", async () => {
  let writes = 0;
  const h = await harness({ actor: moduleActor("mrodini@gmail.com", { unit: "Geral" }), extraMocks: { "./route-legacy": { POST: async () => { writes++; return Response.json({ ok: true }); } } } });
  const route = await h.evaluate("app/api/estoque-rotativo/padronizacao/route.ts");
  assert.equal((await route.POST(new Request("https://portal.test/api", { method: "POST", body: "inválido" }))).status, 403);
  assert.equal(writes, 0);
  h.setActor(cica);
  assert.equal((await route.POST(new Request("https://portal.test/api", { method: "POST" }))).status, 200);
  assert.equal(writes, 1);
});

function trelloMocks(shared = null, cookieReads = []) {
  return {
    "./trello-shared-credentials": { readSharedTrelloCredentials: async () => shared, saveSharedTrelloCredentials: async () => {}, deleteSharedTrelloCredentials: async () => {} },
    "next/headers": { cookies: async () => ({ get: name => { cookieReads.push(name); return { value: name.includes("token") ? "personal-token" : "personal-key" }; } }) },
    googleapis: { google: {} }
  };
}
test("Trello: conexão central tem prioridade e Pedidos não usa cookie pessoal", async () => {
  const reads = [], calls = [];
  const h = await harness({ extraMocks: trelloMocks({ key: "central-key", token: "central-token" }, reads), registryFetch: async url => { calls.push(new URL(url)); return Response.json({ ok: true }); } });
  const lib = await h.evaluate("lib/trello.ts");
  const credentials = await lib.getStoredTrelloCredentials();
  assert.equal(credentials.token, "central-token");
  await lib.trelloFetch("/boards/UfPrTr1H", { params: { fields: "name", lists: "open", list_fields: "name,closed" } });
  assert.equal(calls[0].searchParams.get("token"), "central-token");
  assert.equal(reads.length, 0);
});
test("Trello: Pedidos sem conexão central não tenta consulta pública nem credencial individual", async () => {
  const reads = [], calls = [];
  const h = await harness({ extraMocks: trelloMocks(null, reads), registryFetch: async () => { calls.push(1); return Response.json({}); } });
  const lib = await h.evaluate("lib/trello.ts");
  await assert.rejects(lib.trelloFetch("/boards/UfPrTr1H", { params: { fields: "name", lists: "open", list_fields: "name,closed" } }), /compartilhada/);
  assert.equal(calls.length, 0);
  assert.equal(reads.length, 0);
});
test("Trello: falha transitória repete somente GET, nunca POST; 401 não repete nem expõe token", async () => {
  let attempts = 0, mode = "transient";
  const h = await harness({ extraMocks: trelloMocks({ key: "key", token: "secret-token" }), registryFetch: async () => {
    attempts++;
    if (mode === "auth") return new Response("secret-token", { status: 401 });
    if (mode === "write" || attempts === 1) throw Error("falha de rede com secret-token");
    return Response.json({ ok: true });
  } });
  const lib = await h.evaluate("lib/trello.ts");
  assert.equal((await lib.trelloFetch("/boards/UfPrTr1H")).ok, true);
  assert.equal(attempts, 2);
  attempts = 0; mode = "write";
  await assert.rejects(lib.trelloFetch("/cards", { method: "POST" }), error => !error.message.includes("secret-token"));
  assert.equal(attempts, 1);
  attempts = 0; mode = "auth";
  await assert.rejects(lib.trelloFetch("/boards/UfPrTr1H"), error => /reconectar/.test(error.message) && !error.message.includes("secret-token"));
  assert.equal(attempts, 1);
});
test("Trello: segredo é criptografado, autenticado, com nonce aleatório; leitura não cria tabela", async () => {
  let stored = null; const writes = [];
  const env = { DATABASE_URL: "mock-database", NEXTAUTH_SECRET: "mock-server-key" };
  const h = await harness({ env, extraMocks: {
    "node:crypto": crypto,
    "@neondatabase/serverless": { neon: () => async (strings, ...values) => {
      const query = strings.join("?");
      if (query.includes("SELECT")) return stored ? [{ encrypted_credentials: stored }] : [];
      writes.push(query);
      if (query.includes("INSERT")) stored = values[0];
      if (query.includes("DELETE")) stored = null;
      return [];
    } }
  } });
  const lib = await h.evaluate("lib/trello-shared-credentials.ts");
  assert.equal(await lib.readSharedTrelloCredentials(), null);
  assert.equal(writes.length, 0);
  await lib.saveSharedTrelloCredentials({ key: "key", token: "private-token" });
  const first = stored;
  assert.equal(stored.includes("private-token"), false);
  assert.equal((await lib.readSharedTrelloCredentials()).token, "private-token");
  await lib.saveSharedTrelloCredentials({ key: "key", token: "private-token" });
  assert.notEqual(first, stored);
  env.NEXTAUTH_SECRET = "different-key";
  await assert.rejects(lib.readSharedTrelloCredentials(), /reconectar/);
  env.NEXTAUTH_SECRET = "mock-server-key";
  await lib.deleteSharedTrelloCredentials();
  assert.equal(await lib.readSharedTrelloCredentials(), null);
});
test("Trello: somente Ciça salva conexão compartilhada; pode migrar a própria conexão existente", async () => {
  let saved = 0;
  const h = await harness({ extraMocks: { "@/lib/trello": {
    clearStoredTrelloCredentials: async () => { saved++; },
    getSharedTrelloCredentials: async () => null,
    getStoredTrelloCredentials: async () => ({ key: "key", token: "private-token" }),
    persistTrelloCredentials: async value => { assert.equal(value.token, "private-token"); saved++; return { sharedSaved: true }; },
    TRELLO_API_KEY: "key",
    validateTrelloCredentials: async () => ({ id: "board", name: "Compras" })
  } } });
  const route = await h.evaluate("app/api/compras/trello-config/route.ts");
  const request = () => new Request("https://portal.test/api/compras/trello-config", { method: "POST", body: JSON.stringify({ useExisting: true }) });
  assert.equal((await route.POST(request())).status, 403);
  assert.equal(saved, 0);
  h.setActor(cica);
  const result = await route.POST(request());
  assert.equal(result.status, 200);
  assert.equal(saved, 1);
  assert.equal(JSON.stringify(await result.json()).includes("private-token"), false);
});

test("Pedidos: lista ausente não transforma falha de configuração em snapshot vazio", async () => {
  const h = await harness({ extraMocks: {
    "@/lib/trello": { normalizeTrelloText: value => value.toLowerCase(), TRELLO_BOARD_SHORT_LINK: "board", trelloFetch: async () => ({ lists: [{ id: "rc", name: "PEDIDOS ENVIADO RIO CLARO" }] }) },
    "@/lib/purchase-orders": { normalizePurchaseOrders: value => value }
  } });
  const lib = await h.evaluate("lib/purchase-orders-sync.ts");
  await assert.rejects(lib.readSentPurchaseOrders(), /preservada/);
});
test("Trello: falta de chave do servidor impede gravação de credencial em texto aberto", async () => {
  let writes = 0;
  const h = await harness({ env: { DATABASE_URL: "mock" }, extraMocks: {
    "node:crypto": crypto, "@neondatabase/serverless": { neon: () => async () => { writes++; return []; } }
  } });
  const lib = await h.evaluate("lib/trello-shared-credentials.ts");
  await assert.rejects(lib.saveSharedTrelloCredentials({ key: "key", token: "token" }), /Segredo/);
  assert.equal(writes, 0);
});

test("sessão e menu compartilham uma leitura na renderização; próxima requisição revalida bloqueio e falha", async () => {
  const caches = [];
  const requestCache = fn => {
    const values = new Map(); caches.push(values);
    return (...args) => {
      const key = JSON.stringify(args);
      if (!values.has(key)) values.set(key, fn(...args));
      return values.get(key);
    };
  };
  const nextRequest = () => caches.forEach(cache => cache.clear());
  let reads = 0, active = true, fail = false;
  const h = await harness({ realConfig: true, extraMocks: { react: { cache: requestCache } }, registryFetch: async () => {
    reads++;
    if (fail) throw Error("indisponível");
    return Response.json({ values: [[cica.email, "Ciça", "Geral", "painel,estoque", "painel", "Sim", "Não", active ? "Sim" : "Não"]] });
  } });
  const config = await h.evaluate("lib/portal-config.ts");
  const [state, user] = await Promise.all([config.getPortalUserSessionState("token", cica.email), config.getEffectivePortalUser("token", cica.email)]);
  assert.equal(state.user.email, cica.email); assert.equal(user.email, cica.email);
  assert.equal(reads, 1);
  nextRequest(); active = false;
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  assert.equal(reads, 2);
  nextRequest(); fail = true;
  const unavailable = await config.getPortalUserSessionState("token", cica.email);
  assert.equal(unavailable.user, null); assert.equal(unavailable.unavailable, true);
  assert.equal(await config.getEffectivePortalUser("token", cica.email), null);
  assert.equal(reads, 4); // uma nova tentativa na falha transitória
  nextRequest(); fail = false; active = true;
  assert.equal((await config.getEffectivePortalUser("token", cica.email)).email, cica.email);
  assert.equal(reads, 5);
});

test("cadastro oficial por ID permite contato repetido e recusa ID duplicado sem semear ou gravar", async () => {
  let rows = [['id-um', 'Pessoa um', 'Araras', 'Sim', 'Não', '', 'comercialara@example.test'], ['id-dois', 'Pessoa dois', 'Araras', 'Sim', 'Não', '', 'comercialara@example.test']];
  let fail = false;
  const writes = [];
  const h = await harness({ realConfig: true, registryFetch: async (_url, init) => {
    if (init?.method && init.method !== 'GET') writes.push(init.method);
    if (fail) throw Error('indisponível');
    return Response.json({ values: rows });
  } });
  const config = await h.evaluate('lib/portal-config.ts');
  assert.equal((await config.getOfficialCollaboratorForAccess('token', 'id-um')).name, 'Pessoa um');
  assert.equal((await config.getOfficialCollaboratorForAccess('token', 'id-dois')).name, 'Pessoa dois');
  assert.equal(await config.getOfficialCollaboratorForAccess('token', 'ausente'), null);
  rows.push([...rows[0]]);
  assert.equal(await config.getOfficialCollaboratorForAccess('token', 'id-um'), null);
  fail = true;
  await assert.rejects(config.getOfficialCollaboratorForAccess('token', 'id-dois'), /indisponível/);
  assert.deepEqual(writes, []);
});

test("cadastro para acesso não presume unidade/ativação e não ignora duplicata com nome incompleto", async () => {
  let rows = [['pessoa', 'Pessoa fictícia', '', '', '', '', 'contato@example.test']];
  const h = await harness({ realConfig: true, registryFetch: async () => Response.json({ values: rows }) });
  const config = await h.evaluate('lib/portal-config.ts');
  const raw = await config.getOfficialCollaboratorForAccess('token-ficticio', 'pessoa');
  assert.equal(raw.unit, ''); assert.equal(raw.active, false);
  rows = [['pessoa', 'Pessoa fictícia', 'Araras', 'Sim'], ['pessoa', '', 'Araras', 'Sim']];
  assert.equal(await config.getOfficialCollaboratorForAccess('token-ficticio', 'pessoa'), null);
});

test("Leads: página contém 25 itens, busca alcança páginas posteriores e unidade segue o cadastro", async () => {
  const leads = Array.from({length:61},(_,i)=>({row:i+2,cliente:`Empresa ${i}`,segmento:i%2?"Cerâmica":"Ceramico",contato:"",canal:"",observacoes:"",status:"hoje"}));
  let seenLocation;
  const h=await harness({actor:person("comercialrc@casatimoni.com.br",{unit:"Rio Claro",modules:["leads"]}),extraMocks:{
    "@/lib/leads":Object.fromEntries(["addLead","addProspect","createLeadsReport","importLeads","listLeadActivities","listLeads","listProspects","moveLeadToProspects","reactivateProspect","updateLeadFollowUp"].map(name=>[name,async(_token,location)=>{if(name==="listLeads"){seenLocation=location;return leads;}return [];} ])),
    "@/lib/module-updates":{recordModuleUpdateSafely:async()=>{}},
  }});
  const api=await h.evaluate("app/api/leads/route.ts");
  const page=await(await api.GET(new Request("https://portal.test/api/leads?page=2&location=ara"))).json();
  assert.equal(seenLocation,"rc");assert.equal(page.leads.length,25);assert.equal(page.leads[0].row,27);assert.equal(page.summary.pendentes,61);assert.equal(page.pagination.leadPages,3);assert.equal(page.activities.length,0);assert.equal(page.duplicateSegments[0].length,2);
  const search=await(await api.GET(new Request("https://portal.test/api/leads?q=Empresa%2060"))).json();assert.equal(search.leads[0].row,62);assert.equal(search.pagination.leadTotal,1);
});

test("Cadastro fixo usa credencial central, sem herdar a conta Google do colaborador", async () => {
  const tokens=[];
  const h=await harness({realConfig:true,env:{GOOGLE_REFRESH_TOKEN:"test-central"},registryFetch:async(_url,init)=>{
    tokens.push(init.headers.Authorization);
    return Response.json({values:[[cica.email,"Ciça","Geral","painel","painel","Sim","Não","Sim"]]});
  }});
  const config=await h.evaluate("lib/portal-config.ts");
  const state=await config.getPortalUserSessionState("personal-test-token",cica.email);
  assert.equal(state.user.email,cica.email);assert.deepEqual(tokens,["Bearer central-test-token"]);
});

test("Navegação enxuta preserva ordem e esconde módulos sem concessão",async()=>{
 const h=await harness();const nav=await h.evaluate("lib/clean-navigation.ts");
 assert.deepEqual(Array.from(nav.cleanNavigation(cica),item=>item.label),["Hoje","Estoque","Compras","Motorista","Agenda","Vendas Internas","Equipe"]);
 const seller=person("seller@example.test",{modules:["pedido-de-compra","painel"]});
 assert.deepEqual(Array.from(nav.cleanNavigation(seller),item=>item.label),["Hoje","Compras","Equipe"]);
 assert.equal(nav.cleanNavigation({...seller,active:false}).length,0);
 assert.equal(nav.activeNavigation("/dashboard/estoque-rotativo"),"compras");assert.equal(nav.activeNavigation("/dashboard/estoque"),"estoque");assert.equal(nav.activeNavigation("/agenda-ct"),"agenda");
});
test("Rotas agrupadas não concedem módulo nem ação nova",async()=>{
 const h=await harness({realAuth:true});const m=await h.evaluate("middleware.ts");
 const personWith=(modules)=>person("seller@example.test",{modules});
 const req=(path,user)=>({nextUrl:new URL(`https://portal.test${path}`),url:`https://portal.test${path}`,auth:{user:{email:user.email},portalUser:user}});
 assert.equal(m.default(req("/dashboard/compras?aba=acompanhar",personWith(["pedido-de-compra"]))).status,200);
 assert.equal(m.default(req("/agenda?view=loja",personWith(["agenda-ct"]))).status,200);
 assert.equal(m.default(req("/dashboard/compras",personWith(["painel"]))).status,302);
 const policy=await h.evaluate("lib/authorization.ts");assert.equal(policy.can(personWith(["pedido-de-compra"]),"compras","criar"),false);
});
test("Equipe mensal filtra a unidade do cadastro, mesmo com unidade forjada na URL",async()=>{
 const actor=person("rc@example.test",{unit:"Rio Claro",modules:["painel"]});
 const roster=[{...member,name:"Adriel",unit:"Rio Claro"},{...member,id:"ara",name:"Yan",unit:"Araras"}];
 const calendar=[{id:"rc",summary:"Aniversário Adriel",start:"2026-11-14",end:"2026-11-15"},{id:"ara",summary:"Aniversário Yan",start:"2026-11-26",end:"2026-11-27"},{id:"unknown",summary:"Aniversário sem cadastro",start:"2026-11-10",end:"2026-11-11"}];
 const h=await harness({actor,extraMocks:{"@/lib/google-calendar":{getAccessTokenFromRefreshToken:async()=>"central",listEventsInRange:async()=>calendar},"@/lib/portal-config":{getEffectivePortalUser:async()=>actor,getEffectivePanelData:async()=>({user:actor,collaborators:roster})}}});
 const route=await h.evaluate("app/api/hoje/equipe/route.ts");
 const data=await(await route.GET(new Request("https://portal.test/api/hoje/equipe?unidade=todas"))).json();assert.deepEqual(data.events.map(item=>item.id),["rc"]);assert.deepEqual(data.people.map(item=>item.name),["Adriel"]);
 const foreign=await(await route.GET(new Request("https://portal.test/api/hoje/equipe?unidade=araras"))).json();assert.equal(foreign.events.length,0);assert.equal(foreign.people.length,0);
});

test("Conferência: compara com acesso autorizado e bloqueia outros perfis sem chamadas externas",async()=>{
 const h=await harness({actor:cica});const route=await h.evaluate("app/api/conferencia-pedidos/route.ts");
 const row={code:"001",description:"Produto",quantity:2,price:10,ipi:null};const document={filename:"teste.csv",sheet:"Itens",rows:[row]};
 const request=()=>new Request("https://portal.test/api/conferencia-pedidos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:document,supplier:document})});
 const response=await route.POST(request());assert.equal(response.status,200);const body=await response.json();assert.equal(body.itens[0].codigo_fornecedor_documento,"001");assert.equal(body.itens[0].divergencias.length,0);assert.equal(h.writes.length,0);
 h.setActor(marcelo);assert.equal((await route.POST(request())).status,403);
});

test('Conferência: importar PDF exige o mesmo acesso antes de ler o arquivo',async()=>{
 const h=await harness({actor:marcelo});const route=await h.evaluate('app/api/conferencia-pedidos/importar-pdf/route.ts');assert.equal((await route.POST(new Request('https://portal.test/api/conferencia-pedidos/importar-pdf',{method:'POST'}))).status,403);
});

test("Motorista: campo Vendedor usa só colaboradores ativos do cadastro, com unidade", async () => {
  const roster = [
    { id: "a", name: "Ana", unit: "Araras", active: true, accessEmail: "" },
    { id: "b", name: "Bia", unit: "Rio Claro", active: true, accessEmail: "" },
    { id: "c", name: "Inativa", unit: "Araras", active: false, accessEmail: "" },
  ];
  const h = await harness({ actor: cica, extraMocks: { "@/lib/portal-config": {
    getEffectivePortalUser: async (_token, email) => email === cica.email ? cica : null,
    getPortalUserSessionState: async (_token, email) => ({ user: email === cica.email ? cica : null, unavailable: false }),
    loadPortalConfiguration: async () => ({ users: [], collaborators: roster, history: [] }),
  } } });
  const route = await h.evaluate("app/api/agenda-motorista-vendedores/route.ts");
  const body = await (await route.GET()).json();
  assert.equal(body.fonte, "cadastro");
  assert.deepEqual(body.vendedores.map((v) => `${v.nome}-${v.unidade}`).sort(), ["Ana-araras", "Bia-rio_claro"]);
});

test("Motorista: sem cadastro legível, a lista de vendedores fica indisponível e vazia", async () => {
  const h = await harness({ actor: cica, extraMocks: { "@/lib/portal-config": {
    getEffectivePortalUser: async (_token, email) => email === cica.email ? cica : null,
    getPortalUserSessionState: async (_token, email) => ({ user: email === cica.email ? cica : null, unavailable: false }),
    loadPortalConfiguration: async () => { throw new Error("Google indisponível"); },
  } } });
  const route = await h.evaluate("app/api/agenda-motorista-vendedores/route.ts");
  const body = await (await route.GET()).json();
  assert.equal(body.fonte, "indisponivel");
  assert.deepEqual(body.vendedores, []);
});

test("Estoque: lista de vendedores vem dos colaboradores cadastrados, por unidade e ativos", async () => {
  const sheets = { spreadsheets: { values: {
    batchGet: async () => ({ data: { valueRanges: [{ values: [["id"]] }, { values: [["codigo"]] }] } }),
    batchUpdate: async () => {}, append: async () => {},
  }, batchUpdate: async () => {} } };
  const roster = [
    { id: "a", name: "Ana", unit: "Araras", active: true, accessEmail: "" },
    { id: "b", name: "Bia", unit: "Rio Claro", active: true, accessEmail: "" },
    { id: "c", name: "Inativa", unit: "Araras", active: false, accessEmail: "" },
  ];
  const h = await harness({ actor: cica, extraMocks: {
    googleapis: { google: { auth: { OAuth2: class { setCredentials() {} } }, sheets: () => sheets } },
    "@/lib/module-updates": { recordModuleUpdateSafely: async () => {} },
    "@/lib/stock-notice-reads": { pendingStockIdsForUser: () => [] },
    "@/lib/portal-config": {
      getEffectivePortalUser: async (_token, email) => email === cica.email ? cica : null,
      getPortalUserSessionState: async (_token, email) => ({ user: email === cica.email ? cica : null, unavailable: false }),
      loadPortalConfiguration: async () => ({ users: [], collaborators: roster, history: [] }),
    },
  } });
  const route = await h.evaluate("app/api/estoque/route.ts");
  const data = await (await route.GET()).json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.vendedores.map((v) => `${v.nome}-${v.unidade}`).sort(), ["Ana-araras", "Bia-rio_claro"]);
});
