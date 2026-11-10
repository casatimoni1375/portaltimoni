import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import {
  LEADS_SPREADSHEET_ID,
  LEADS_ARARAS_SPREADSHEET_ID,
  listLeadActivities,
  listLeads,
  listProspects,
} from "@/lib/leads";
import {
  businessToday,
  companyKey,
  isoDate,
  mergeOpportunities,
  OWNERS,
  validateOpportunity,
  type LeadUnit,
  type LeadEvent,
  type Opportunity,
} from "@/lib/leads-workflow";

const SHEET = "GESTÃO LEADS";
const spreadsheetId = (unit: LeadUnit) =>
  unit === "ara" ? LEADS_ARARAS_SPREADSHEET_ID : LEADS_SPREADSHEET_ID;
function client(token: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.sheets({ version: "v4", auth });
}
async function hasSheet(token: string, unit: LeadUnit) {
  const result = await client(token).spreadsheets.get({
    spreadsheetId: spreadsheetId(unit),
    fields: "sheets.properties.title",
  });
  return (
    result.data.sheets?.some((sheet) => sheet.properties?.title === SHEET) ??
    false
  );
}
export async function readLeadJournal(
  token: string,
  unit: LeadUnit,
): Promise<LeadEvent[]> {
  if (!(await hasSheet(token, unit))) return [];
  const result = await client(token).spreadsheets.values.get({
    spreadsheetId: spreadsheetId(unit),
    range: `'${SHEET}'!A2:G`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (result.data.values ?? []).map((row, index) => {
    try {
      const event = JSON.parse(String(row[6])) as LeadEvent;
      if (
        !event.id ||
        !event.item?.id ||
        !event.item.empresa ||
        !event.at ||
        Number.isNaN(Date.parse(event.at))
      )
        throw Error();
      return event;
    } catch {
      throw new Error(
        `Registro de acompanhamento inválido na linha ${index + 2}. Nenhum dado foi ignorado.`,
      );
    }
  });
}
export async function getLeadsWorkspace(token: string, unit: LeadUnit, withHistory = true) {
  const [leads, prospects, events, legacyActivities] = await Promise.all([
    listLeads(token, unit),
    listProspects(token, unit),
    readLeadJournal(token, unit),
    withHistory ? listLeadActivities(token, unit) : Promise.resolve([]),
  ]);
  const base = new Map<string, Opportunity>();
  const common = {
    cidade: "",
    oportunidade: "",
    motivo: "",
    revision: "original",
    proximaAcao: "",
    ultimoContato: "",
    proximoContato: "",
    responsavel: OWNERS[unit][0],
  };
  for (const lead of leads) {
    const id = `base:${companyKey(lead.cliente)}`;
    base.set(id, {
      ...common,
      id,
      empresa: lead.cliente,
      segmento: lead.segmento,
      contato: lead.contato,
      telefone: lead.canal,
      observacoes: lead.observacoes,
      etapa: "Em contato",
      proximaAcao: "Retomar contato com o cliente",
      ultimoContato: isoDate(lead.ultimoContato),
      proximoContato: isoDate(lead.proximoContato),
    });
  }
  for (const prospect of prospects) {
    const id = `base:${companyKey(prospect.cliente)}`;
    if (base.has(id)) continue;
    base.set(id, {
      ...common,
      id,
      empresa: prospect.cliente,
      segmento: prospect.segmento,
      contato: prospect.contato,
      telefone: prospect.canal,
      cidade: prospect.cidade,
      oportunidade: prospect.oportunidade,
      observacoes: prospect.observacoes,
      etapa: "A contatar",
      proximaAcao: "Fazer a primeira abordagem",
    });
  }
  return {
    items: mergeOpportunities([...base.values()], events),
    events,
    legacyActivities,
    location: unit,
    owners: OWNERS[unit],
    today: businessToday(),
  };
}
export async function saveLeadWorkspace(
  token: string,
  unit: LeadUnit,
  actor: string,
  input: Record<string, unknown>,
) {
  const workspace = await getLeadsWorkspace(token, unit);
  const requestId = String(input.requestId ?? "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))
    throw new Error("Solicitação inválida. Atualize a página.");
  if (workspace.events.some((event) => event.id === requestId))
    return { ok: true, repeated: true };
  const kind = String(input.kind);
  if (!["cadastro", "edicao", "contato", "agendamento"].includes(kind))
    throw new Error("Ação inválida.");
  const raw = input.item as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object")
    throw new Error("Informe os dados da empresa.");
  const current = workspace.items.find((item) => item.id === raw.id);
  if (kind !== "cadastro" && !current)
    throw new Error("Empresa não encontrada. Atualize a página.");
  if (current && raw.revision !== current.revision)
    throw new Error(
      "Este registro foi atualizado por outra pessoa. Atualize a página antes de salvar.",
    );
  const string = (key: string) => String(raw[key] ?? "").trim();
  const item: Opportunity = {
    id: current?.id ?? `novo:${randomUUID()}`,
    revision: requestId,
    empresa: string("empresa"),
    segmento: string("segmento"),
    cidade: string("cidade"),
    contato: string("contato"),
    telefone: string("telefone"),
    oportunidade: string("oportunidade"),
    observacoes: string("observacoes"),
    responsavel: string("responsavel"),
    etapa: string("etapa") as Opportunity["etapa"],
    proximaAcao: string("proximaAcao"),
    proximoContato: isoDate(string("proximoContato")),
    ultimoContato: current?.ultimoContato ?? "",
    motivo: string("motivo"),
  };
  if (
    workspace.items.some(
      (other) =>
        other.id !== item.id &&
        companyKey(other.empresa) === companyKey(item.empresa),
    )
  )
    throw new Error("Esta empresa já está cadastrada nesta unidade.");
  const resultado = String(input.resultado ?? "").trim();
  const nota = String(input.nota ?? "").trim();
  if (kind === "contato") {
    if (
      ![
        "Conversou com o cliente",
        "Sem resposta",
        "Cotação enviada",
        "Venda realizada",
        "Sem interesse",
      ].includes(resultado)
    )
      throw new Error("Informe o resultado do contato.");
    if (!nota)
      throw new Error("Registre uma observação curta sobre o contato.");
    item.ultimoContato = workspace.today;
  }
  if (kind === "agendamento" && !nota)
    throw new Error("Informe o motivo do reagendamento.");
  validateOpportunity(item, unit);
  if (
    ["contato", "agendamento", "cadastro"].includes(kind) &&
    item.proximoContato &&
    item.proximoContato < workspace.today &&
    item.etapa !== "Ganho" &&
    item.etapa !== "Perdido"
  )
    throw new Error("O próximo retorno deve ser hoje ou em uma data futura.");
  const event: LeadEvent = {
    id: requestId,
    at: new Date().toISOString(),
    actor,
    kind: kind as LeadEvent["kind"],
    item,
    resultado,
    nota,
  };
  const json = JSON.stringify(event);
  if (json.length > 30000)
    throw new Error("Reduza o tamanho das observações antes de salvar.");
  const sheets = client(token);
  if (!(await hasSheet(token, unit))) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId(unit),
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      if (!(await hasSheet(token, unit))) throw error;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(unit),
      range: `'${SHEET}'!A1:G1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "ID",
            "Data e hora",
            "Usuário",
            "Ação",
            "Empresa",
            "Responsável",
            "Registro completo",
          ],
        ],
      },
    });
  }
  // Um único append contém o cadastro e o histórico; as abas originais ficam preservadas.
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(unit),
    range: `'${SHEET}'!A:G`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [event.id, event.at, actor, kind, item.empresa, item.responsavel, json],
      ],
    },
  });
  return { ok: true, id: item.id };
}
