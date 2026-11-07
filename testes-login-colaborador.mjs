import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as crypto from 'node:crypto';
import vm from 'node:vm';

const context = vm.createContext({ Buffer });
const modules = new Map();
let officialReader = async () => null;
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`./timoni-portal/lib/${name}.ts`, import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source), { context, identifier: name });
  modules.set(name, mod);
  await mod.link(specifier => {
    if (specifier === './portal-config') return new vm.SyntheticModule(['getOfficialCollaboratorForAccess'], function () {
      this.setExport('getOfficialCollaboratorForAccess', (...args) => officialReader(...args));
    }, { context });
    if (specifier === 'node:crypto') return new vm.SyntheticModule(Object.keys(crypto), function () {
      for (const [key, value] of Object.entries(crypto)) this.setExport(key, value);
    }, { context });
    assert.ok(specifier.startsWith('./'), specifier);
    return load(specifier.slice(2));
  });
  return mod;
}
const root = await load('collaborator-login.server');
await root.evaluate();
const { createCollaboratorLogin } = root.namespace;
const { canCollaboratorAction: can, normalizeCollaboratorLogin, resolveCollaboratorAccess } = modules.get('collaborator-access').namespace;
const { hashPortalPassword, verifyPortalPassword } = modules.get('portal-password.server').namespace;
const password = 'senha-ficticia-para-testes-2026';
const passwordHash = await hashPortalPassword(password);
const storeModule = await load('collaborator-login-store.server');
await storeModule.evaluate();
const { createCollaboratorLoginStore } = storeModule.namespace;
const policyModule = await load('collaborator-policy.server');
await policyModule.evaluate();
const { resolveCollaboratorPolicy } = policyModule.namespace;
const runtimeModule = await load('collaborator-login-runtime.server');
await runtimeModule.evaluate();
const { createPortalCollaboratorLogin } = runtimeModule.namespace;

function person(id, permissions, patch = {}) {
  return { collaboratorId: `ficticio-${id}`, username: `pessoa.${id}`, name: `Pessoa fictícia ${id}`, contactEmail: 'comercialara@example.test',
    active: true, unit: 'Araras', profile: 'vendedores-araras', permissions, ...patch };
}
function setup(accesses = [person('um', { motorista: ['visualizar'] }), person('dois', { motorista: ['visualizar', 'editar'] }), person('tres', { estoque: ['visualizar', 'criar'] })]) {
  const records = accesses.map(access => ({ access, passwordHash, credentialVersion: 1 }));
  const calls = { attempts: 0, loginReads: 0, idReads: 0 };
  let available = true, allowAttempt = true;
  const store = {
    reserveAttempt: async () => { calls.attempts++; if (!available) throw Error('offline'); return allowAttempt; },
    findByLogin: async username => {
      calls.loginReads++;
      if (!available) throw Error('offline');
      const matches = records.filter(record => normalizeCollaboratorLogin(record.access.username) === username);
      if (matches.length > 1) throw Error('login duplicado');
      return matches[0] ?? null;
    },
    findById: async id => { calls.idReads++; if (!available) throw Error('offline'); return records.find(record => record.access.collaboratorId === id) ?? null; },
  };
  return { login: createCollaboratorLogin(store), records, calls, store,
    unavailable: () => { available = false; }, recover: () => { available = true; }, throttle: () => { allowAttempt = false; } };
}
const authenticate = (h, username, extra = {}) => h.login.authenticate({ username, password, ...extra }, 'cliente-ficticio');

test('três colaboradores com o mesmo contato entram com IDs e permissões distintos', async () => {
  const h = setup(), subjects = [];
  for (const username of ['pessoa.um', 'pessoa.dois', 'pessoa.tres']) {
    const result = await authenticate(h, username);
    assert.equal(result.ok, true);
    subjects.push(result.subject);
    assert.deepEqual(Object.keys(result.subject).sort(), ['collaboratorId', 'credentialVersion']);
    assert.equal(JSON.stringify(result).includes(passwordHash), false);
    assert.equal(JSON.stringify(result).includes('comercialara'), false);
  }
  assert.equal(new Set(subjects.map(subject => subject.collaboratorId)).size, 3);
  const states = await Promise.all(subjects.map(subject => h.login.resolveSession(subject)));
  assert.equal(can(states[0].access, 'motorista', 'editar'), false);
  assert.equal(can(states[1].access, 'motorista', 'editar'), true);
  assert.equal(can(states[2].access, 'motorista', 'visualizar'), false);
  assert.equal(can(states[2].access, 'estoque', 'criar'), true);
});

test('e-mail compartilhado não funciona como login nem concede acesso administrativo', async () => {
  const h = setup();
  assert.equal((await authenticate(h, 'comercialara@example.test')).ok, false);
  const member = person('um', { configuracoes: ['visualizar', 'administrar'] }, { contactEmail: 'mcrodini@gmail.com' });
  assert.equal(can(member, 'configuracoes', 'administrar'), false);
  assert.equal(can(member, 'configuracoes', 'visualizar'), false);
});

test('senha de uma pessoa não autentica outra com o mesmo contato', async () => {
  const h = setup();
  const secondPassword = 'outra-senha-individual-ficticia';
  h.records[1].passwordHash = await hashPortalPassword(secondPassword);
  assert.equal((await authenticate(h, 'pessoa.um')).ok, true);
  assert.equal((await authenticate(h, 'pessoa.dois')).ok, false);
  const second = await authenticate(h, 'pessoa.dois', { password: secondPassword });
  assert.equal(second.ok, true);
  assert.equal(second.subject.collaboratorId, 'ficticio-dois');
});

test('tentativa de escolher outro colaborador ou perfil no formulário é ignorada', async () => {
  const h = setup();
  const result = await authenticate(h, 'pessoa.um', { collaboratorId: 'ficticio-dois', profile: 'administracao-cica' });
  assert.equal(result.subject.collaboratorId, 'ficticio-um');
  assert.equal(can((await h.login.resolveSession(result.subject)).access, 'motorista', 'editar'), false);
});

test('senha recebe salt individual, não fica no hash e comparação recusa senha errada', async () => {
  const another = await hashPortalPassword(password);
  assert.notEqual(another, passwordHash);
  assert.equal(passwordHash.includes(password), false);
  assert.equal(await verifyPortalPassword(password, passwordHash), true);
  assert.equal(await verifyPortalPassword('outra-senha-ficticia', passwordHash), false);
});

test('hash malformado, custo alterado e senha fora dos limites são recusados', async () => {
  for (const hash of ['', 'invalido', passwordHash.replace('32768', '1073741824'), passwordHash + 'f']) assert.equal(await verifyPortalPassword(password, hash), false);
  for (const value of ['curta', 'a'.repeat(129)]) await assert.rejects(hashPortalPassword(value), /12 e 128/);
});

test('pessoa inexistente, senha incorreta e usuário inativo recebem a mesma recusa', async () => {
  const h = setup();
  const missing = await authenticate(h, 'nao.existe');
  const wrong = await authenticate(h, 'pessoa.um', { password: 'senha-incorreta-ficticia' });
  h.records[0].access.active = false;
  const disabled = await authenticate(h, 'pessoa.um');
  assert.equal(missing.reason, 'invalid_credentials');
  assert.equal(wrong.reason, missing.reason); assert.equal(disabled.reason, missing.reason);
});

test('bloquear um colaborador não bloqueia os demais que usam o mesmo contato', async () => {
  const h = setup();
  const first = await authenticate(h, 'pessoa.um');
  const second = await authenticate(h, 'pessoa.dois');
  h.records[0].access.active = false;
  assert.equal((await h.login.resolveSession(first.subject)).access, null);
  assert.equal((await h.login.resolveSession(second.subject)).access.collaboratorId, 'ficticio-dois');
});

test('troca de senha ou versão revoga sessões anteriores', async () => {
  const h = setup();
  const result = await authenticate(h, 'pessoa.um');
  h.records[0].credentialVersion++;
  assert.equal((await h.login.resolveSession(result.subject)).access, null);
  const again = await authenticate(h, 'pessoa.um');
  assert.equal(again.subject.credentialVersion, 2);
});

test('permissão é relida pelo ID; mudança não depende de renovar o login', async () => {
  const h = setup();
  const result = await authenticate(h, 'pessoa.dois');
  h.records[1].access.permissions.motorista = ['visualizar'];
  const state = await h.login.resolveSession(result.subject);
  assert.equal(can(state.access, 'motorista', 'editar'), false);
});

test('limite de tentativas é consultado antes de buscar conta ou verificar senha', async () => {
  const h = setup(); h.throttle();
  const result = await authenticate(h, 'pessoa.um');
  assert.equal(result.reason, 'too_many_attempts');
  assert.equal(h.calls.loginReads, 0); assert.equal(h.calls.idReads, 0);
});

test('cadastro indisponível bloqueia temporariamente e recupera sem mudar o sujeito da sessão', async () => {
  const h = setup();
  const result = await authenticate(h, 'pessoa.um');
  h.unavailable();
  const unavailable = await h.login.resolveSession(result.subject);
  assert.equal(unavailable.access, null); assert.equal(unavailable.unavailable, true);
  h.recover();
  assert.equal((await h.login.resolveSession(result.subject)).access.collaboratorId, 'ficticio-um');
});

test('login duplicado ou cadastro devolvido para ID diferente nunca escolhe a primeira pessoa', async () => {
  const h = setup([person('um', {}), person('dois', {}, { username: 'PESSOA.UM' })]);
  assert.equal((await authenticate(h, 'pessoa.um')).ok, false);
  assert.equal(resolveCollaboratorAccess('ficticio-um', person('dois', {})), null);
});

test('Ciça, Marcelo, unidade e mobile preservam limites centrais', () => {
  const cica = person('cica', {}, { profile: 'administracao-cica', unit: 'Geral' });
  assert.equal(can(cica, 'configuracoes', 'administrar'), true);
  const marcelo = person('marcelo', { motorista: ['visualizar', 'criar', 'editar', 'excluir'], configuracoes: ['administrar'] }, { profile: 'administracao-marcelo', unit: 'Geral' });
  assert.equal(can(marcelo, 'motorista', 'editar'), true);
  for (const action of ['criar', 'excluir']) assert.equal(can(marcelo, 'motorista', action), false);
  assert.equal(can(marcelo, 'configuracoes', 'administrar'), false);
  assert.equal(can(marcelo, 'motorista', 'editar', { operation: 'restaurar-backup' }), false);
  const araras = person('um', { motorista: ['visualizar', 'editar'] });
  assert.equal(can(araras, 'motorista', 'editar', { unidade: 'Rio Claro' }), false);
  assert.equal(can(araras, 'motorista', 'visualizar', { canal: 'mobile' }), false);
  const driver = person('motorista', { motorista: ['visualizar', 'editar'] }, { profile: 'motorista-leitura' });
  assert.equal(can(driver, 'motorista', 'visualizar', { canal: 'mobile' }), true);
  assert.equal(can(driver, 'motorista', 'editar', { canal: 'mobile' }), false);
  assert.equal(can(cica, 'pedido-de-compra', 'editar'), false);
});

test('alteração de senha durante a verificação não emite sessão com a versão nova', async () => {
  const h = setup();
  const login = createCollaboratorLogin({ ...h.store, findByLogin: async username => {
    const record = await h.store.findByLogin(username);
    setTimeout(() => { record.credentialVersion++; record.passwordHash = 'hash-substituido'; }, 1);
    return record;
  } });
  const result = await login.authenticate({ username: 'pessoa.um', password }, 'cliente-ficticio');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_credentials');
});

test('armazenamento consulta identidade por ID e não grava cadastro como efeito da leitura', async () => {
  const calls = [], access = person('um', { motorista: ['visualizar'] });
  const row = { collaborator_id: access.collaboratorId, username: access.username, password_hash: passwordHash, credential_version: 3, enabled: true };
  const sql = async (strings, ...values) => { calls.push({ text: strings.join('?'), values }); return [row]; };
  const lookups = [];
  const store = createCollaboratorLoginStore(async id => { lookups.push(id); return access; }, sql, 'chave-ficticia-para-o-teste-de-limites');
  assert.equal((await store.findByLogin(access.username)).credentialVersion, 3);
  assert.equal((await store.findById(access.collaboratorId)).access.collaboratorId, access.collaboratorId);
  assert.deepEqual(lookups, [access.collaboratorId, access.collaboratorId]);
  assert.ok(calls.every(call => /SELECT/.test(call.text) && !/INSERT|UPDATE|DELETE|CREATE/.test(call.text)));
  row.enabled = false;
  assert.equal((await store.findById(access.collaboratorId)).access.active, false);
});

test('limites por login e origem são reservados no mesmo lote, com chaves opacas e parâmetros', async () => {
  const batches = [];
  let allowed = true;
  const sql = (strings, ...values) => ({ text: strings.join('?'), values });
  sql.transaction = async queries => { batches.push(queries); return allowed ? [[{ bucket: 'a' }], [{ bucket: 'b' }]] : [[], [{ bucket: 'b' }]]; };
  const store = createCollaboratorLoginStore(async () => null, sql, 'chave-ficticia-para-o-teste-de-limites');
  assert.equal(await store.reserveAttempt('pessoa.um', 'origem-ficticia'), true);
  assert.equal(batches.length, 1); assert.equal(batches[0].length, 2);
  for (const query of batches[0]) {
    assert.match(query.text, /ON CONFLICT \(bucket\) DO UPDATE/);
    assert.match(query.text, /15 minutes/);
    assert.match(query.values[0], /^[0-9a-f]{64}$/);
    assert.equal(query.text.includes('pessoa.um'), false);
    assert.equal(query.values.includes('origem-ficticia'), false);
  }
  assert.equal(batches[0][0].values.at(-1), 10);
  assert.equal(batches[0][1].values.at(-1), 100);
  assert.notEqual(batches[0][0].values[0], batches[0][1].values[0]);
  allowed = false;
  assert.equal(await store.reserveAttempt('pessoa.um', 'origem-ficticia'), false);
  assert.throws(() => createCollaboratorLoginStore(async () => null, sql, ''), /não configurada/);
});

const officialPerson = (id, patch = {}) => ({ id, name: `Pessoa fictícia ${id}`, unit: 'Araras', active: true,
  noticeRequired: false, updatedAt: '', accessEmail: 'comercialara@example.test', chatEnabled: true, role: 'Vendas', ...patch });
const policyRow = (id, patch = {}) => ({ collaborator_id: id, username: `pessoa.${id}`, profile: 'vendedores-araras',
  permissions: { motorista: ['visualizar'] }, mobile_modules: null, ...patch });

test('política junta dados oficiais com permissões pelo ID, sem herdar permissões do contato', () => {
  const member = officialPerson('um');
  const access = resolveCollaboratorPolicy(member, policyRow('um'), {});
  assert.equal(access.name, member.name); assert.equal(access.unit, member.unit);
  assert.equal(access.contactEmail, member.accessEmail);
  assert.equal(can(access, 'motorista', 'visualizar'), true);
  assert.equal(can(access, 'motorista', 'editar'), false);
  assert.equal(resolveCollaboratorPolicy(member, policyRow('dois'), {}), null);
  assert.equal(resolveCollaboratorPolicy({ ...member, active: false }, policyRow('um'), {}), null);
});

test('política recusa perfil incompatível, regras inválidas e ações sem leitura', () => {
  for (const patch of [
    { profile: 'gestao-rio-claro' }, { profile: 'inexistente' }, { permissions: '{invalido' },
    { permissions: [] }, { permissions: { motorista: ['editar'] } }, { permissions: { motorista: ['promover'] } },
    { permissions: { desconhecido: ['visualizar'] } }, { mobile_modules: ['configuracoes'] }, { mobile_modules: ['estoque'] },
  ]) assert.equal(resolveCollaboratorPolicy(officialPerson('um'), policyRow('um', patch), {}), null);
  const valid = resolveCollaboratorPolicy(officialPerson('um'), policyRow('um', { permissions: '{"motorista":["visualizar","visualizar"]}', mobile_modules: '["motorista"]' }), {});
  assert.equal(valid.permissions.motorista.length, 1);
});

test('Ciça e Marcelo só recebem seus perfis quando vinculados aos IDs administrativos conferidos', () => {
  const member = officialPerson('cica', { unit: 'Geral', accessEmail: 'mcrodini@gmail.com' });
  const row = policyRow('cica', { profile: 'administracao-cica', permissions: {} });
  assert.equal(resolveCollaboratorPolicy(member, row, {}), null);
  assert.equal(resolveCollaboratorPolicy(member, row, { cicaId: 'outra-pessoa' }), null);
  assert.equal(resolveCollaboratorPolicy(member, row, { cicaId: 'cica', marceloId: 'cica' }), null);
  const cica = resolveCollaboratorPolicy(member, row, { cicaId: 'cica', marceloId: 'marcelo' });
  assert.equal(can(cica, 'configuracoes', 'administrar'), true);
  const marcelo = resolveCollaboratorPolicy(officialPerson('marcelo', { unit: 'Geral' }), policyRow('marcelo', {
    profile: 'administracao-marcelo', permissions: { motorista: ['visualizar', 'editar', 'criar'] },
  }), { cicaId: 'cica', marceloId: 'marcelo' });
  assert.equal(can(marcelo, 'motorista', 'editar'), true);
  assert.equal(can(marcelo, 'motorista', 'criar'), false);
});

function integratedFixture() {
  const members = ['um', 'dois', 'tres'].map(id => officialPerson(id));
  const rows = ['um', 'dois', 'tres'].map(id => ({ ...policyRow(id), password_hash: passwordHash, credential_version: 1, enabled: true }));
  rows[1].permissions = { motorista: ['visualizar', 'editar'] };
  rows[2].permissions = { estoque: ['visualizar', 'criar'] };
  const calls = [];
  const sql = (strings, ...values) => ({ then(resolve, reject) {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve().then(() => rows.filter(row => strings.join('?').includes('WHERE credentials.username') ? row.username === values[0] : row.collaborator_id === values[0])).then(resolve, reject);
  } });
  sql.transaction = async queries => queries.map(() => [{ bucket: 'simulado' }]);
  officialReader = async (token, id) => { assert.equal(token, 'conexao-central-ficticia'); const found = members.filter(member => member.id === id); return found.length === 1 ? found[0] : null; };
  const login = createPortalCollaboratorLogin(sql, 'segredo-ficticio-dos-limites-com-32-caracteres', 'conexao-central-ficticia', {});
  return { members, rows, calls, login };
}

test('fluxo integrado de núcleo/armazenamento/cadastro mantém três acessos com o mesmo contato separados', async () => {
  const h = integratedFixture(), sessions = [];
  for (const id of ['um', 'dois', 'tres']) {
    const result = await authenticate(h, `pessoa.${id}`);
    assert.equal(result.ok, true); sessions.push(result.subject);
  }
  const states = await Promise.all(sessions.map(subject => h.login.resolveSession(subject)));
  assert.equal(can(states[0].access, 'motorista', 'editar'), false);
  assert.equal(can(states[1].access, 'motorista', 'editar'), true);
  assert.equal(can(states[2].access, 'motorista', 'visualizar'), false);
  assert.ok(h.calls.every(call => call.text.includes('INNER JOIN portal_collaborator_access_policy')));
  assert.ok(h.calls.every(call => !call.values.includes('comercialara@example.test')));
  h.rows[1].permissions = { motorista: ['visualizar'] };
  assert.equal(can((await h.login.resolveSession(sessions[1])).access, 'motorista', 'editar'), false);
  h.members[0].active = false;
  assert.equal((await h.login.resolveSession(sessions[0])).access, null);
  assert.ok((await h.login.resolveSession(sessions[1])).access);
});

test('cadastro oficial ausente, duplicado ou indisponível nunca usa pessoa histórica como alternativa', async () => {
  const h = integratedFixture();
  h.members.splice(0, 1);
  assert.equal((await authenticate(h, 'pessoa.um')).ok, false);
  h.members.push(officialPerson('dois'));
  assert.equal((await authenticate(h, 'pessoa.dois')).ok, false);
  officialReader = async () => { throw Error('offline'); };
  assert.equal((await authenticate(h, 'pessoa.tres')).reason, 'temporarily_unavailable');
});
