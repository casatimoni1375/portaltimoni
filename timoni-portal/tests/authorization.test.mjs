import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/authorization.ts", import.meta.url), "utf8"));
const policyUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { can, canEditConfigurationRecord, resolveConfiguredUser, resolveOfficialPortalUser, AUTHORIZATION_PROFILES } = await import(policyUrl);
const accessSource = stripTypeScriptTypes(await readFile(new URL("../lib/access-control.ts", import.meta.url), "utf8")).replace('"./authorization"', JSON.stringify(policyUrl));
const access = await import(`data:text/javascript;base64,${Buffer.from(accessSource).toString("base64")}`);
const actions = ["visualizar", "criar", "editar", "excluir", "administrar"];
const user = (email, extra = {}) => ({ email, name: "Pessoa", active: true, unit: "Geral", modules: ["painel", "estoque", "compras", "leads", "motorista"], requiresPassword: false, ...extra });
const cica = user("mcrodini@gmail.com");
const marcelo = user("mrodini@gmail.com");

for (const action of actions) {
  test(`Ciça: ${action} permitido`, () => assert.equal(can(cica, "estoque", action), true));
  test(`Marcelo: ${action}`, () => assert.equal(can(marcelo, "estoque", action), ["visualizar", "editar"].includes(action)));
  test(`Inativo: ${action} negado mesmo com compatibilidade`, () => assert.equal(can({ ...cica, active: false }, "estoque", action, { legacyAllowed: true }), false));
}

test("restrições críticas de Marcelo não são anuladas pela regra legada", () => {
  for (const action of ["criar", "excluir", "administrar"]) assert.equal(can(marcelo, "configuracoes", action, { legacyAllowed: true }), false);
  for (const operation of ["permissoes", "restaurar-backup", "publicar-codigo"]) assert.equal(can(marcelo, "sistema", "editar", { operation }), false);
  assert.equal(can(marcelo, "publicacao", "editar"), false);
  assert.equal(can(marcelo, "agenda", "visualizar"), false);
});

test("usuário removido não reaparece na base histórica", async () => {
  assert.ok(access.portalUsers[cica.email]);
  for (const value of [undefined, null]) {
    assert.equal(access.getPortalUser(cica.email, value), null);
    assert.equal(access.isAuthorizedUser(cica.email, value), false);
    assert.equal(access.hasModuleAccess(cica.email, "motorista", value), false);
    assert.equal(access.canManageMotorista(cica.email, value), false);
    assert.equal(access.isBoxVisible(cica.email, "motorista", value), false);
  }
  assert.equal(await resolveOfficialPortalUser(cica.email, async () => []), null);
  assert.equal(await resolveOfficialPortalUser(cica.email, async () => [marcelo]), null);
});

test("falha de leitura, registro duplicado, identidade divergente e inativo negam", async () => {
  assert.equal(await resolveOfficialPortalUser(cica.email, async () => { throw Error("Sheets indisponível"); }), null);
  assert.equal(await resolveOfficialPortalUser(cica.email, async () => [cica, cica]), null);
  assert.equal(await resolveOfficialPortalUser(cica.email, async () => [{ ...cica, active: false }]), null);
  assert.equal(resolveConfiguredUser(cica.email, marcelo), null);
  assert.equal(resolveConfiguredUser("fotoscasatimoni@gmail.com", user("fotoscasatimoni@gmail.com")), null);
  assert.equal(resolveConfiguredUser(" MRODINI@GMAIL.COM ", marcelo).profile, "administracao-marcelo");
});

test("unidade: incompatível nega, compatível permite, Geral abrange as duas", () => {
  const rc = user("estoquetimoni@gmail.com", { unit: "Rio Claro" });
  assert.equal(can(rc, "estoque", "editar", { unidade: "Araras", legacyAllowed: true }), false);
  assert.equal(can(rc, "estoque", "editar", { unidade: "Rio Claro", legacyAllowed: true }), true);
  assert.equal(can(cica, "estoque", "editar", { unidade: "Araras" }), true);
  assert.equal(can(user("sem-unidade", { unit: undefined }), "estoque", "visualizar", { unidade: "Rio Claro" }), false);
});

test("mobile: Ciça, Marcelo, Estoque RC; motorista só leitura", () => {
  for (const u of [cica, marcelo, user("estoquetimoni@gmail.com", { unit: "Rio Claro" })]) assert.equal(can(u, "motorista", "visualizar", { canal: "mobile" }), true);
  const driver = user("motorista@example.test", { profile: "motorista-leitura", modules: ["motorista"] });
  assert.equal(can(driver, "motorista", "visualizar", { canal: "mobile" }), true);
  for (const action of actions.slice(1)) assert.equal(can(driver, "motorista", action, { canal: "mobile", legacyAllowed: true }), false);
  assert.equal(can(driver, "estoque", "visualizar", { canal: "mobile" }), false);
  for (const profile of AUTHORIZATION_PROFILES.filter(p => !["administracao-cica", "administracao-marcelo", "estoque-rio-claro", "motorista-leitura"].includes(p))) {
    assert.equal(can(user("operacao@example.test", { profile }), "motorista", "visualizar", { canal: "mobile" }), false);
  }
  assert.equal(can({ ...cica, mobileModules: [] }, "estoque", "visualizar", { canal: "mobile" }), false);
});

test("operacionais: não inventa ações; aceita decisão legada explícita sem ampliar módulos/unidade", () => {
  const seller = user("balcaotimoni@gmail.com", { unit: "Rio Claro" });
  assert.equal(can(seller, "estoque", "visualizar"), true);
  assert.equal(can(seller, "estoque", "editar"), false);
  assert.equal(can(seller, "estoque", "editar", { legacyAllowed: true }), true);
  assert.equal(can(seller, "reunioes", "editar", { legacyAllowed: true }), false);
  assert.equal(can(seller, "configuracoes", "editar", { legacyAllowed: true }), false);
  assert.equal(can(seller, "publicacao", "editar", { legacyAllowed: true }), false);
});

test("cards são apresentação; retirar um box não revoga o módulo", () => {
  const u = user("balcaotimoni@gmail.com", { boxes: [] });
  assert.equal(access.hasModuleAccess(u.email, "estoque", u), true);
  assert.equal(access.isBoxVisible(u.email, "estoque", u), false);
  assert.equal(can({ ...u, boxes: ["reunioes"] }, "reunioes", "visualizar"), false);
});

test("perfil não vem do nome/rótulo; identidades administrativas continuam restritas", () => {
  const fake = user("outra@example.test", { name: "Ciça", accessLabel: "Administração", profile: "administracao-cica" });
  assert.equal(can(fake, "configuracoes", "administrar"), false);
  assert.equal(can({ ...marcelo, profile: "administracao-cica" }, "estoque", "criar"), false);
});

test("edição cadastral não cria usuários nem altera campos de segurança", () => {
  const before = user("vendas@example.test", { unit: "Rio Claro", boxes: ["painel"], mobileModules: [] });
  assert.equal(canEditConfigurationRecord(marcelo, "user", before, { ...before, name: "Nome ajustado", accessLabel: "Rótulo" }), true);
  assert.equal(canEditConfigurationRecord(marcelo, "user", undefined, before), false);
  for (const patch of [{ unit: "Geral" }, { active: false }, { readOnly: true }, { profile: "administracao-cica" }, { modules: ["painel", "agenda"] }, { mobileModules: ["painel"] }, { requiresPassword: true }, { email: "novo@example.test" }, { noticeRequired: true }]) {
    assert.equal(canEditConfigurationRecord(marcelo, "user", before, { ...before, ...patch }), false);
  }
  const member = { id: "m1", name: "Pessoa", role: "Vendas", unit: "Rio Claro", accessEmail: before.email, active: true };
  assert.equal(canEditConfigurationRecord(marcelo, "collaborator", member, { ...member, name: "Outro nome", role: "Atendimento" }), true);
  for (const patch of [{ id: "m2" }, { unit: "Araras" }, { accessEmail: cica.email }, { active: false }]) assert.equal(canEditConfigurationRecord(marcelo, "collaborator", member, { ...member, ...patch }), false);
  assert.equal(canEditConfigurationRecord(cica, "user", undefined, before), true);
});

const collaboratorSource = stripTypeScriptTypes(await readFile(new URL("../lib/collaborator-access.ts", import.meta.url), "utf8")).replace('"./authorization"', JSON.stringify(policyUrl));
const collaboratorUrl = "data:text/javascript;base64," + Buffer.from(collaboratorSource).toString("base64");
const moduleSource = stripTypeScriptTypes(await readFile(new URL("../lib/module-authorization.ts", import.meta.url), "utf8")).replace('"./authorization"', JSON.stringify(policyUrl)).replace('"./collaborator-access"', JSON.stringify(collaboratorUrl));
const modulePolicy = await import("data:text/javascript;base64," + Buffer.from(moduleSource).toString("base64"));
test("1B: módulo oficial é obrigatório inclusive Motorista e Pedidos", () => {
  for (const resource of ["motorista", "pedido-de-compra", "reunioes"]) assert.equal(can(user("vendas@example.test", { modules: [] }), resource, "visualizar"), false);
});
test("1B: módulos preservam edição de Marcelo e bloqueiam criação/exclusão/administração", () => {
  const actor = { ...marcelo, modules: ["motorista", "estoque", "leads", "compras", "reunioes", "agenda-ct"] };
  for (const resource of actor.modules) {
    assert.equal(modulePolicy.canModuleOperation(actor, resource, "editar"), true, resource);
    // Motorista: agendamento liberado para quem tem o módulo (13/11/2026).
    const bloqueados = resource === "motorista" ? ["administrar"] : ["criar", "excluir", "administrar"];
    for (const action of bloqueados) assert.equal(modulePolicy.canModuleOperation(actor, resource, action), false, resource + ":" + action);
    if (resource === "motorista") for (const action of ["criar", "excluir"]) assert.equal(modulePolicy.canModuleOperation(actor, resource, action), true, resource + ":" + action);
  }
});
test("1B: unidade desconhecida falha para contas locais e nenhuma ação amplia módulos", () => {
  const actor = user("vendas@example.test", { unit: "Rio Claro", modules: ["motorista", "estoque"] });
  // Motorista: quem tem o módulo vê todas as viagens; sem o módulo, nenhuma.
  for (const unit of ["araras", "desconhecida", undefined, "rio_claro"]) assert.equal(modulePolicy.canReadUnit(actor, "motorista", unit), true);
  const semModulo = user("vendas@example.test", { unit: "Rio Claro", modules: ["estoque"] });
  assert.equal(modulePolicy.canReadUnit(semModulo, "motorista", "rio_claro"), false);
  // Unidade desconhecida continua negada nos demais módulos.
  for (const unit of ["araras", "desconhecida", undefined]) assert.equal(modulePolicy.canReadUnit(actor, "estoque", unit), false);
  assert.equal(modulePolicy.canModuleOperation(actor, "leads", "criar"), false);
});
test("1B: Estoque preserva transições operacionais, edição restrita e proibição de exclusão", () => {
  const actor = user("vendas@example.test", { unit: "Rio Claro" });
  for (const op of ["criar", "em_compra", "consulta", "pedido", "observacao", "resposta_vendedor", "chegou"]) assert.equal(modulePolicy.canStockOperation(actor, op, "Rio Claro"), true, op);
  for (const op of ["editar", "editar_observacao", "reabrir", "excluir", "inventada"]) assert.equal(modulePolicy.canStockOperation(actor, op, "Rio Claro"), false, op);
  assert.equal(modulePolicy.canStockOperation(marcelo, "editar", "Rio Claro"), true);
  assert.equal(modulePolicy.canStockOperation(marcelo, "excluir", "Rio Claro"), false);
});
test("1B: Rotativo preserva papéis operacionais, sem gestão/backup para Marcelo", () => {
  const lucas = user("estoquetimoni@gmail.com", { unit: "Rio Claro", modules: ["estoque-rotativo"] });
  const carolina = user("carolina@casatimoni.com.br", { modules: ["estoque-rotativo"] });
  const manager = { ...marcelo, modules: ["estoque-rotativo"] };
  assert.equal(modulePolicy.canRotativoOperation(lucas, "report", "criar"), true);
  assert.equal(modulePolicy.canRotativoOperation(lucas, "conference", "editar"), false);
  assert.equal(modulePolicy.canRotativoOperation(carolina, "conference", "editar"), true);
  assert.equal(modulePolicy.canRotativoOperation(carolina, "manage", "administrar"), false);
  assert.equal(modulePolicy.canRotativoOperation(manager, "conference", "editar"), true);
  for (const action of ["criar", "excluir", "administrar"]) assert.equal(modulePolicy.canRotativoOperation(manager, "manage", action), false);
});

test("Motorista: nomes reais das lojas respeitam a unidade sem alterar o formulário", () => {
  const rc = user("vendas@example.test", { unit: "Rio Claro" });
  const ara = user("araras@example.test", { unit: "Araras" });
  // Todos veem todas as viagens; o limite por empresa vale para agendar/editar/excluir.
  for (const store of ["MCR", "Rodini"]) {
    assert.equal(modulePolicy.canReadUnit(rc, "motorista", store), true);
    assert.equal(modulePolicy.canReadUnit(ara, "motorista", store), true);
  }
  // Casa Timoni é agendada por Araras e também por Rio Claro (decisão da gestão, 10/11/2026).
  assert.equal(modulePolicy.canReadUnit(ara, "motorista", "Casa Timoni"), true);
  assert.equal(modulePolicy.canReadUnit(rc, "motorista", "Casa Timoni"), true);
  assert.deepEqual(modulePolicy.motoristaUnitsForStore("Casa Timoni"), ["Araras", "Rio Claro"]);
  assert.deepEqual(modulePolicy.motoristaUnitsForStore("MCR"), ["Rio Claro"]);
});


test("Ciça corporativa mantém administração e Conferência exige identidade Ciça ativa", () => {
  const corporate = user("cecilia@casatimoni.com.br");
  for (const action of actions) assert.equal(can(corporate, "configuracoes", action), true);
  assert.equal(can(corporate, "conferencia", "visualizar"), true);
  assert.equal(can({ ...corporate, active: false }, "conferencia", "visualizar"), false);
  assert.equal(can(user("mrodini@gmail.com", { modules: ["conferencia"] }), "conferencia", "visualizar"), false);
  assert.equal(can(user("vendas@example.test", { modules: ["conferencia"] }), "conferencia", "visualizar"), false);
  assert.equal(access.isCicaAccess(" CECILIA@CASATIMONI.COM.BR "), true);
  assert.equal(access.isManagementEmail("mrodini@gmail.com"), true);
  assert.equal(access.isCicaAccess("mrodini@gmail.com"), false);
  assert.equal(access.getPortalUser(corporate.email, null), null);
});
test("Somente leitura por módulo: só o módulo marcado bloqueia criar/editar/excluir (inclusive administração)", () => {
  const actor = user("vendas@example.test", { unit: "Rio Claro", modules: ["motorista", "estoque"], readOnlyModules: ["estoque"] });
  assert.equal(modulePolicy.canModuleOperation(actor, "estoque", "visualizar"), true);
  assert.equal(modulePolicy.canModuleOperation(actor, "estoque", "editar"), false);
  assert.equal(modulePolicy.canModuleOperation(actor, "motorista", "criar"), true);
  const admin = user("mcrodini@gmail.com", { modules: ["motorista", "estoque"], readOnlyModules: ["motorista"] });
  assert.equal(modulePolicy.canModuleOperation(admin, "motorista", "visualizar"), true);
  assert.equal(modulePolicy.canModuleOperation(admin, "motorista", "criar"), false);
  assert.equal(modulePolicy.canModuleOperation(admin, "estoque", "editar"), true);
});
