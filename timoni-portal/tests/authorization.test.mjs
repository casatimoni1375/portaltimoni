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
const user = (email, extra = {}) => ({ email, name: "Pessoa", active: true, unit: "Geral", modules: ["painel", "estoque", "compras", "leads"], requiresPassword: false, ...extra });
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
