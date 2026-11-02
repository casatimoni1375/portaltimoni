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

async function harness({ actor = marcelo, realConfig = false, realAuth = false, registryFetch, extraMocks = {} } = {}) {
  const writes = [];
  const configuration = { users: [cica, marcelo, person("vendas@example.test")], collaborators: [{ ...member }], history: [] };
  let currentActor = actor;
  let authOptions;
  const context = vm.createContext({ Response, Request, URL, URLSearchParams, AbortController, Headers, FormData, File, Uint8Array, Date, JSON, console, process: { env: {} }, setTimeout, clearTimeout, fetch: registryFetch ?? (() => { throw Error("Rede não permitida nos testes"); }) });
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
    "next-auth": { default: options => { authOptions = options; return { handlers: {}, auth: fn => fn, signIn() {}, signOut() {} }; } },
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

const moduleActor = (email = "vendas@example.test", patch = {}) => person(email, { unit: "Rio Claro", modules: ["motorista", "estoque", "leads", "compras", "agenda-ct", "reunioes", "estoque-rotativo"], ...patch });
const urlRequest = (params) => ({ nextUrl: new URL("https://portal.test/api?" + params) });
const motorPost = body => new Request("https://portal.test/api/agenda-motorista", { method: "POST", body: new URLSearchParams(body) });
function motorHarness(actor, trips = [{ id: "rc", loja: "rio_claro" }, { id: "ara", loja: "araras" }]) {
  const calls = [];
  return harness({ actor, registryFetch: async (url, init) => {
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
test("Motorista: leitura filtra a unidade e não encaminha ações ou parâmetros arbitrários", async () => {
  const h = await motorHarness(moduleActor());
  const route = await h.evaluate("app/api/agenda-motorista/route.ts");
  const response = await route.GET(urlRequest("action=dia&data=2026-11-02&callback=malicioso"));
  assert.deepEqual((await response.json()).viagens.map(v => v.id), ["rc"]);
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
    createMeeting: async () => { operations.push("create"); return "new"; },
    updateMeeting: async () => operations.push("edit"),
    archiveMeetingOccurrence: async () => operations.push("archive"),
    deleteMeeting: async () => operations.push("delete")
  } } });
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
    "@/lib/stock-notice-reads": { pendingStockIds: (_email, needs) => needs.map(v => v.id) }
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
