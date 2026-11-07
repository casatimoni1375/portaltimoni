// Semana civil de segunda a domingo no horário da Casa Timoni.
export function getPanelWeekWindow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  const monday = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const timeMin = `${monday.toISOString().slice(0, 10)}T00:00:00-03:00`;
  const timeMax = `${nextMonday.toISOString().slice(0, 10)}T00:00:00-03:00`;
  return { start: new Date(timeMin), endExclusive: new Date(timeMax), timeMin, timeMax };
}
