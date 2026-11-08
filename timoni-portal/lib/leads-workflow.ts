export type LeadUnit = "rc" | "ara";
export const STAGES = [
  "A contatar",
  "Em contato",
  "Cotação enviada",
  "Negociação",
  "Pós-venda / Recompra",
  "Ganho",
  "Perdido",
] as const;
export type LeadStage = (typeof STAGES)[number];
export const OWNERS = { rc: ["Jaqueline", "Jeovana"], ara: ["Paulo"] } as const;
export type Opportunity = {
  id: string;
  empresa: string;
  segmento: string;
  cidade: string;
  contato: string;
  telefone: string;
  oportunidade: string;
  observacoes: string;
  responsavel: string;
  etapa: LeadStage;
  proximaAcao: string;
  proximoContato: string;
  ultimoContato: string;
  motivo: string;
  revision: string;
};
export type LeadEvent = {
  id: string;
  at: string;
  actor: string;
  kind: "cadastro" | "edicao" | "contato" | "agendamento";
  item: Opportunity;
  resultado: string;
  nota: string;
};
export const companyKey = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
export const isActive = (item: Opportunity) =>
  item.etapa !== "Ganho" && item.etapa !== "Perdido";
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function isoDate(value: string): string {
  const clean = value.trim().replace(/^[a-zá-ú]{3}\.,\s*/i, "");
  const br = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  const input = br
    ? `${br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : businessToday().slice(0, 4)}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
    : clean;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return "";
  const date = new Date(`${input}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === input
    ? input
    : "";
}
export function deadline(item: Opportunity, today = businessToday()) {
  if (!isActive(item)) return "encerrado";
  if (!isoDate(item.proximoContato)) return "sem-data";
  return item.proximoContato < today
    ? "atrasado"
    : item.proximoContato === today
      ? "hoje"
      : "proximo";
}
export function prioritySort(a: Opportunity, b: Opportunity) {
  const rank = {
    atrasado: 0,
    hoje: 1,
    "sem-data": 2,
    proximo: 3,
    encerrado: 4,
  };
  return (
    rank[deadline(a)] - rank[deadline(b)] ||
    a.proximoContato.localeCompare(b.proximoContato) ||
    a.empresa.localeCompare(b.empresa, "pt-BR")
  );
}
export function validateOpportunity(item: Opportunity, unit: LeadUnit) {
  if (!item.empresa.trim()) throw new Error("Informe a empresa.");
  if (!(OWNERS[unit] as readonly string[]).includes(item.responsavel))
    throw new Error("Selecione um responsável desta unidade.");
  if (!(STAGES as readonly string[]).includes(item.etapa))
    throw new Error("Selecione uma etapa válida.");
  if (isActive(item)) {
    if (!item.proximaAcao.trim()) throw new Error("Descreva a próxima ação.");
    if (!isoDate(item.proximoContato))
      throw new Error("Agende uma data válida para o próximo contato.");
  }
  if (item.etapa === "Perdido" && !item.motivo.trim())
    throw new Error("Informe o motivo da perda.");
  if (item.ultimoContato && !isoDate(item.ultimoContato))
    throw new Error("Data do contato inválida.");
}
export function mergeOpportunities(base: Opportunity[], events: LeadEvent[]) {
  const items = new Map(base.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    items.set(event.item.id, event.item);
  }
  return [...items.values()].sort(prioritySort);
}
export function dailyProgress(
  items: Opportunity[],
  events: LeadEvent[],
  owner: string,
  today = businessToday(),
) {
  const selected = items.filter((item) => !owner || item.responsavel === owner);
  const ids = new Set(selected.map((item) => item.id));
  const done = new Set(
    events
      .filter(
        (event) =>
          event.kind === "contato" &&
          businessToday(new Date(event.at)) === today &&
          ids.has(event.item.id),
      )
      .map((event) => event.item.id),
  );
  const pending = selected.filter(
    (item) =>
      isActive(item) &&
      ["atrasado", "hoje", "sem-data"].includes(deadline(item, today)),
  );
  const remaining = pending.filter((item) => !done.has(item.id));
  return {
    done: done.size,
    total: new Set([...done, ...pending.map((item) => item.id)]).size,
    remaining: remaining.length,
  };
}
export function buildLeadDigest(
  items: Opportunity[],
  unit: LeadUnit,
  today = businessToday(),
) {
  return OWNERS[unit].map((responsavel) => {
    const pending = items
      .filter((item) => item.responsavel === responsavel && isActive(item))
      .sort(prioritySort);
    return {
      responsavel,
      atrasados: pending.filter((item) => deadline(item, today) === "atrasado")
        .length,
      hoje: pending.filter((item) => deadline(item, today) === "hoje").length,
      semData: pending.filter((item) => deadline(item, today) === "sem-data")
        .length,
      prioridades: pending
        .filter((item) =>
          ["atrasado", "hoje", "sem-data"].includes(deadline(item, today)),
        )
        .slice(0, 5)
        .map((item) => ({
          empresa: item.empresa,
          proximaAcao: item.proximaAcao,
          retorno: item.proximoContato,
        })),
    };
  });
}
