import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`./timoni-portal/lib/${path}.ts`, import.meta.url), 'utf8');
async function load(root, mocks = {}, globals = {}) {
  const context = vm.createContext({ Date, ...globals }), modules = new Map();
  async function get(name) { if (!modules.has(name)) modules.set(name, new vm.SourceTextModule(stripTypeScriptTypes(read(name)), { context })); return modules.get(name); }
  const mod = await get(root);
  await mod.link(async spec => {
    if (mocks[spec]) { const values = mocks[spec]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); }
    assert.ok(spec.startsWith('./'), spec); return get(spec.slice(2));
  });
  await mod.evaluate(); return mod.namespace;
}
const message = id => ({ id: String(id), sender_user_id: 'Pessoa-A', recipient_user_id: 'pessoa-a', body: 'Mensagem fictícia', created_at: '2026-11-05T12:00:00Z', read_at: null, edited_at: null });
async function store() {
  const calls = []; let rows = [message(101)];
  const sql = async (strings, ...values) => { calls.push({ query: strings.join('?'), values }); return rows; };
  const lib = await load('collaborator-chat-store.server', { '@neondatabase/serverless': { neon: () => { throw Error('Não usar banco real'); } } });
  return { api: lib.createCollaboratorChatStore(sql), calls, rows: value => { rows = value; } };
}

test('Chat novo: conversa e mensagem são inseridas na mesma instrução, sem normalizar IDs nem acessar tabelas antigas', async () => {
  const h = await store(); await h.api.send('Pessoa-A', 'pessoa-a', 'Mensagem fictícia');
  assert.equal(h.calls.length, 1); const call = h.calls[0];
  assert.match(call.query, /WITH conversation AS/); assert.match(call.query, /INSERT INTO portal_person_chat_conversations/); assert.match(call.query, /INSERT INTO portal_person_chat_messages/);
  assert.match(call.query, /LEAST/); assert.match(call.query, /GREATEST/);
  assert.ok(call.values.includes('Pessoa-A')); assert.ok(call.values.includes('pessoa-a'));
  assert.doesNotMatch(call.query, /\bportal_chat_(messages|conversations)\b|CREATE TABLE|ALTER TABLE|DELETE FROM/i);
});

test('Chat novo: leitura por par pagina cem mensagens sem marcar outras como lidas', async () => {
  const h = await store(); h.rows(Array.from({ length: 101 }, (_, i) => message(200 - i)));
  const result = await h.api.list('Pessoa-A', 'pessoa-a', '300');
  assert.equal(result.messages.length, 100); assert.equal(result.messages[0].id, '101'); assert.equal(result.before, '101');
  const call = h.calls[0]; assert.match(call.query, /c.user_a = \? AND c.user_b = \?/); assert.match(call.query, /m.id < \?::BIGINT/); assert.match(call.query, /LIMIT 101/); assert.doesNotMatch(call.query, /UPDATE|INSERT|DELETE/);
});

test('Chat novo: edição/exclusão exigem remetente próprio e par; confirmação de leitura tem limite de ID', async () => {
  const h = await store(); await h.api.edit('Pessoa-A', 'pessoa-a', '101', 'Edição fictícia'); await h.api.remove('Pessoa-A', 'pessoa-a', '101'); await h.api.read('Pessoa-A', 'pessoa-a', '101');
  for (const call of h.calls) { assert.match(call.query, /EXISTS \(SELECT 1 FROM portal_person_chat_conversations/); assert.doesNotMatch(call.query, /\bportal_chat_messages\b/); }
  assert.match(h.calls[0].query, /m.sender_id = \? AND m.recipient_id = \?/);
  assert.match(h.calls[1].query, /m.sender_id = \? AND m.recipient_id = \?/);
  assert.match(h.calls[2].query, /m.recipient_id = \? AND m.sender_id = \? AND m.id <= \?::BIGINT/);
});

test('Histórico: somente SELECT nas tabelas antigas, com paginação e sem alterar autoria ou leitura', async () => {
  const h = await store(); h.rows(Array.from({ length: 101 }, (_, i) => ({ id: String(200 - i), user_a: 'compartilhado@example.test', user_b: 'antigo@example.test' })));
  const list = await h.api.history(null, null); assert.equal(list.conversations.length, 100); assert.equal(list.before, '101');
  h.rows([message(101)]); await h.api.history('1', '200');
  for (const call of h.calls) { assert.match(call.query.trim(), /^SELECT/); assert.doesNotMatch(call.query, /UPDATE|DELETE|INSERT|ALTER|CREATE/); }
  assert.match(h.calls[0].query, /portal_chat_conversations/); assert.match(h.calls[1].query, /portal_chat_messages/);
});

async function directory(members, policies) {
  const queries = [], reads = [];
  const lib = await load('collaborator-chat-directory.server', {
    '@neondatabase/serverless': { neon: () => async strings => { queries.push(strings.join('?')); return policies; } },
    './collaborator-auth.server': { getPortalCentralIntegrationToken: async () => 'central-ficticio' },
    './portal-config': { getOfficialCollaboratorsForAccess: async token => { reads.push(token); return members; } },
  }, { process: { env: { DATABASE_URL: 'postgres://exemplo.invalid/ficticio', PORTAL_CICA_COLLABORATOR_ID: 'cica-id', PORTAL_MARCELO_COLLABORATOR_ID: 'marcelo-id' } } });
  return { people: await lib.listCollaboratorChatDirectory(), queries, reads };
}
const member = (id, patch = {}) => ({ id, name: id, unit: 'Araras', active: true, chatEnabled: true, accessEmail: 'compartilhado@example.test', ...patch });
const policy = (id, patch = {}) => ({ collaborator_id: id, username: id, profile: 'vendedores-araras', permissions: { chat: ['visualizar', 'criar'] }, ...patch });

test('Diretório: mesmo contato mantém dois IDs; só lê políticas de credenciais habilitadas e não lê senhas', async () => {
  const h = await directory([member('pessoa-a'), member('pessoa-b')], [policy('pessoa-a'), policy('pessoa-b')]);
  assert.deepEqual(Array.from(h.people, person => person.collaboratorId), ['pessoa-a', 'pessoa-b']); assert.equal(h.reads.length, 1);
  assert.match(h.queries[0], /credentials.enabled = TRUE/); assert.doesNotMatch(h.queries[0], /password_hash|INSERT|UPDATE|CREATE/i);
});

test('Diretório: inativo, chat desabilitado, ID duplicado, perfil administrativo não vinculado e ausência de concessão são recusados', async () => {
  const h = await directory([member('inativo', { active: false }), member('sem-chat', { chatEnabled: false }), member('duplicado'), member('duplicado'), member('falso-admin'), member('sem-grant')],
    [policy('inativo'), policy('sem-chat'), policy('duplicado'), policy('falso-admin', { profile: 'administracao-cica' }), policy('sem-grant', { permissions: {} })]);
  assert.equal(h.people.length, 0);
});
