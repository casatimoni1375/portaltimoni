import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
const source = await readFile(
  new URL("../lib/leads-workflow.ts", import.meta.url),
  "utf8",
);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);
const base = (patch = {}) => ({
  id: "base:empresa",
  empresa: "Empresa",
  segmento: "Indústria",
  cidade: "Rio Claro",
  contato: "Maria",
  telefone: "19999999999",
  oportunidade: "Stretch",
  observacoes: "Original",
  responsavel: "Jaqueline",
  etapa: "Em contato",
  proximaAcao: "Confirmar cotação",
  proximoContato: model.businessToday(),
  ultimoContato: "",
  motivo: "",
  revision: "original",
  ...patch,
});

test("Datas reais do Sheets, datas inválidas e virada do dia em Brasília", () => {
  assert.equal(model.isoDate("seg., 10/08/26"), "2026-08-10");
  assert.equal(model.isoDate("31/02/2026"), "");
  assert.equal(model.isoDate("2026-13-01"), "");
  assert.equal(
    model.businessToday(new Date("2026-11-09T02:59:00Z")),
    "2026-11-08",
  );
  assert.equal(
    model.businessToday(new Date("2026-11-09T03:00:00Z")),
    "2026-11-09",
  );
});
test("Responsáveis e campos obrigatórios por unidade; perda pede motivo", () => {
  assert.doesNotThrow(() => model.validateOpportunity(base(), "rc"));
  assert.throws(() =>
    model.validateOpportunity(base({ responsavel: "Paulo" }), "rc"),
  );
  assert.throws(() => model.validateOpportunity(base(), "ara"));
  assert.doesNotThrow(() =>
    model.validateOpportunity(base({ responsavel: "Paulo" }), "ara"),
  );
  for (const patch of [
    { proximaAcao: "" },
    { proximoContato: "" },
    { proximoContato: "2026-02-31" },
    { etapa: "Inventada" },
  ])
    assert.throws(() => model.validateOpportunity(base(patch), "rc"));
  assert.throws(() =>
    model.validateOpportunity(
      base({ etapa: "Perdido", proximoContato: "" }),
      "rc",
    ),
  );
  assert.doesNotThrow(() =>
    model.validateOpportunity(
      base({ etapa: "Perdido", motivo: "Preço", proximoContato: "" }),
      "rc",
    ),
  );
});
test("Progresso conta só contatos únicos; edição e reagendamento não aumentam realizado", () => {
  const item = base();
  const at = new Date().toISOString();
  const events = ["edicao", "agendamento"].map((kind, i) => ({
    id: `${i}`,
    item,
    at,
    kind,
  }));
  assert.equal(model.dailyProgress([item], events, "Jaqueline").done, 0);
  events.push(
    { id: "c1", item, at, kind: "contato" },
    { id: "c2", item, at, kind: "contato" },
  );
  const result = model.dailyProgress([item], events, "Jaqueline");
  assert.equal(result.done, 1);
  assert.equal(result.total, 1);
  assert.equal(model.dailyProgress([item], events, "Jeovana").done, 0);
});
test("Recarregar aplica o último evento sem duplicar ou apagar a origem", () => {
  const original = base();
  const updated = base({
    empresa: "Empresa renomeada",
    etapa: "Ganho",
    revision: "r1",
  });
  const event = { id: "r1", item: updated };
  const merged = model.mergeOpportunities([original], [event, event]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].etapa, "Ganho");
  assert.equal(original.empresa, "Empresa");
  assert.equal(model.deadline(merged[0]), "encerrado");
});
test("Resumo diário separa responsáveis e exclui oportunidades encerradas", () => {
  const digest = model.buildLeadDigest(
    [
      base({ proximoContato: "2026-01-01" }),
      base({ id: "j", responsavel: "Jeovana" }),
      base({ id: "g", etapa: "Ganho" }),
    ],
    "rc",
  );
  assert.equal(digest[0].responsavel, "Jaqueline");
  assert.equal(digest[0].atrasados, 1);
  assert.equal(digest[1].responsavel, "Jeovana");
  assert.equal(digest[1].hoje, 1);
});
async function serverHarness() {
  const rows = new Map();
  const writes = [];
  const context = vm.createContext({ console, Date, Intl, JSON, Map, Set });
  const sheets = {
    spreadsheets: {
      get: async ({ spreadsheetId }) => ({
        data: {
          sheets: rows.has(spreadsheetId)
            ? [{ properties: { title: "GESTÃO LEADS" } }]
            : [],
        },
      }),
      batchUpdate: async ({ spreadsheetId }) => {
        rows.set(spreadsheetId, []);
        writes.push(["create", spreadsheetId]);
      },
      values: {
        get: async ({ spreadsheetId }) => ({
          data: { values: rows.get(spreadsheetId) ?? [] },
        }),
        update: async ({ valueInputOption }) => {
          assert.equal(valueInputOption, "RAW");
        },
        append: async ({ spreadsheetId, requestBody, valueInputOption }) => {
          assert.equal(valueInputOption, "RAW");
          rows.get(spreadsheetId).push(...requestBody.values);
          writes.push(["append", spreadsheetId]);
        },
      },
    },
  };
  const exports = {
    "node:crypto": { randomUUID },
    googleapis: {
      google: {
        auth: {
          OAuth2: class {
            setCredentials() {}
          },
        },
        sheets: () => sheets,
      },
    },
    "@/lib/leads": {
      LEADS_SPREADSHEET_ID: "rc-sheet",
      LEADS_ARARAS_SPREADSHEET_ID: "ara-sheet",
      listLeads: async () => [
        {
          row: 2,
          cliente: "Empresa",
          segmento: "",
          contato: "",
          canal: "",
          observacoes: "Original",
          ultimoContato: "",
          proximoContato: "seg., 10/08/26",
        },
      ],
      listProspects: async () => [],
      listLeadActivities: async () => [],
    },
    "@/lib/leads-workflow": model,
  };
  const server = new vm.SourceTextModule(
    stripTypeScriptTypes(
      await readFile(
        new URL("../lib/leads-workspace.server.ts", import.meta.url),
        "utf8",
      ),
    ),
    { context },
  );
  await server.link(
    (id) =>
      new vm.SyntheticModule(
        Object.keys(exports[id]),
        function () {
          for (const [key, value] of Object.entries(exports[id]))
            this.setExport(key, value);
        },
        { context },
      ),
  );
  await server.evaluate();
  return { api: server.namespace, writes, rows };
}
test("Persistência: leitura não escreve; edição preserva último contato e só grava na nova aba", async () => {
  const { api, writes } = await serverHarness();
  const workspace = await api.getLeadsWorkspace("token", "rc");
  assert.equal(writes.length, 0);
  const item = {
    ...workspace.items[0],
    proximoContato: model.businessToday(),
    proximaAcao: "Ligar",
    responsavel: "Jaqueline",
  };
  await api.saveLeadWorkspace("token", "rc", "user@example.test", {
    requestId: randomUUID(),
    kind: "edicao",
    item,
  });
  const after = await api.getLeadsWorkspace("token", "rc");
  assert.equal(after.events.length, 1);
  assert.equal(after.events[0].kind, "edicao");
  assert.equal(after.items[0].ultimoContato, "");
  assert.equal(
    model.dailyProgress(after.items, after.events, "Jaqueline").done,
    0,
  );
  assert.deepEqual(
    writes.map((entry) => entry[0]),
    ["create", "append"],
  );
});
test("Contato: valida resultado, preserva histórico, suporta retry e nega versão antiga", async () => {
  const { api, writes } = await serverHarness();
  const item = (await api.getLeadsWorkspace("token", "rc")).items[0];
  item.proximoContato = model.businessToday();
  const payload = {
    requestId: randomUUID(),
    kind: "contato",
    item,
    resultado: "Sem resposta",
    nota: "Não atendeu",
  };
  await assert.rejects(
    api.saveLeadWorkspace("token", "rc", "user", { ...payload, nota: "" }),
  );
  assert.equal(writes.length, 0);
  await api.saveLeadWorkspace("token", "rc", "user", payload);
  await api.saveLeadWorkspace("token", "rc", "user", payload);
  assert.equal(writes.filter((w) => w[0] === "append").length, 1);
  const after = await api.getLeadsWorkspace("token", "rc");
  assert.equal(after.items[0].ultimoContato, model.businessToday());
  await assert.rejects(
    api.saveLeadWorkspace("token", "rc", "user", {
      ...payload,
      requestId: randomUUID(),
    }),
    /outra pessoa/,
  );
  const araras = await api.getLeadsWorkspace("token", "ara");
  assert.equal(araras.events.length, 0);
  assert.equal(araras.items[0].responsavel, "Paulo");
});
test("Falha de escrita não gera sucesso nem altera cadastro original", async () => {
  const { api, rows } = await serverHarness();
  rows.set("rc-sheet", [["bad", "", "", "", "", "", "{inválido"]]);
  await assert.rejects(api.getLeadsWorkspace("token", "rc"), /inválido/);
});
