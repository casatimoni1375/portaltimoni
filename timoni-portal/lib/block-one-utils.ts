export function normalizedText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function segmentKey(value: string) {
  const key = normalizedText(value);
  return /^(ceramica|ceramico|ceramicas|ceramicos)$/.test(key) ? "ceramica" : key;
}
export function possibleDuplicates<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) { const id = key(item); if (id) groups.set(id, [...(groups.get(id) || []), item]); }
  return [...groups.values()].filter(group => group.length > 1);
}
export function isFutureMeeting(date: string, time: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // Sem hora: permanece no dia até a meia-noite, sem inventar horário de término.
  const clock = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "23:59:59";
  return new Date(`${date}T${clock}-03:00`).getTime() >= now.getTime();
}
export function positivePage(value: string | null, fallback = 1) {
  const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
