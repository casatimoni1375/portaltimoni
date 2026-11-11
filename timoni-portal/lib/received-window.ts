// Pedidos recebidos ficam visíveis por 7 dias corridos depois da conclusão (dia do Trello, fuso de São Paulo).
export const RECEIVED_VISIBLE_DAYS = 7;
const TIME_ZONE = "America/Sao_Paulo";

function localDay(value: Date | string): number {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
}

export function isWithinReceivedWindow(completedAt: string | Date, now: Date = new Date()): boolean {
  const completed = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  if (Number.isNaN(completed.getTime())) return false;
  const days = localDay(now) - localDay(completed);
  return days >= 0 && days <= RECEIVED_VISIBLE_DAYS;
}
