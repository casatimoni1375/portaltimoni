import { cache } from "react";
import { getPanelWeekWindow } from "@/lib/panel-week";
import { getAccessTokenFromRefreshToken, listEventsInRange } from "@/lib/google-calendar";
import type { CalendarEventDTO } from "@/lib/types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const date = (value: string) => new Date(value.includes("T") ? value : `${value}T12:00:00-03:00`);
const format = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(date(value));
const clean = (value: string) => value.replace(/^anivers[aá]rio\s*/i, "").replace(/\s*-\s*f[eé]rias\s*$/i, "").trim();

export function selectWeeklyPeople(events: CalendarEventDTO[], now: Date) {
  const window = getPanelWeekWindow(now);
  function select(kind: "birthdays" | "vacations") {
    const seen = new Set<string>();
    return events.filter(event => {
      const title = normalize(event.summary);
      return kind === "birthdays"
        ? (title.includes("aniversario") || title.includes("aniversariante") || title.includes("birthday")) && date(event.start) >= window.start && date(event.start) < window.endExclusive
        : title.includes("ferias") && date(event.start) < window.endExclusive && date(event.end) > window.start;
    }).sort((a, b) => date(a.start).getTime() - date(b.start).getTime()).filter(event => {
      const key = `${normalize(clean(event.summary))}-${format(event.start)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
  }
  return { birthdays: select("birthdays"), vacations: select("vacations") };
}

const load = cache(async (accessToken?: string) => {
  const window = getPanelWeekWindow(new Date());
  const token = accessToken || await getAccessTokenFromRefreshToken();
  return listEventsInRange(token, { timeMin: window.timeMin, timeMax: window.timeMax, maxResults: 500 }, ["timoni"]);
});

export function WeeklyPeopleCards({ events, now = new Date(), unavailable = false }: { events: CalendarEventDTO[]; now?: Date; unavailable?: boolean }) {
  const { birthdays, vacations } = selectWeeklyPeople(events, now);
  return <section className="ct-weekly-people" aria-label="Aniversários e férias da equipe">
    {([{ title: "Aniversários da semana", subtitle: "Datas para celebrar com a equipe", events: birthdays, vacations: false },
      { title: "Férias da semana", subtitle: "Ausências e próximos retornos", events: vacations, vacations: true }]).map(group => <article className="ct-weekly-card" id={group.vacations ? "ct-ferias" : "ct-aniversarios"} key={group.title}>
      <div className="ct-weekly-heading"><h2>{group.title}</h2><p>{group.subtitle}</p></div>
      {unavailable ? <p className="ct-weekly-empty" role="status">Não foi possível carregar agora. Tente novamente em instantes.</p> : group.events.length ? <ul>{group.events.map(event => <li key={`${event.calendarKey}-${event.id}`}>
        <div><strong>{clean(event.summary)}</strong><small>{group.vacations ? `${format(event.start)} a ${format(event.end)}` : format(event.start)}</small></div>
        <span className={group.vacations ? "ct-people-badge ct-people-vacations" : "ct-people-badge"}>{group.vacations ? "Em férias" : "Nesta semana"}</span>
      </li>)}</ul> : <p className="ct-weekly-empty">Nenhum registro nesta semana.</p>}
    </article>)}
  </section>;
}

// O chamador aplica a mesma permissão do Painel antes de solicitar o calendário.
export default async function WeeklyPeopleHighlights({ accessToken }: { accessToken?: string }) {
  try { return <WeeklyPeopleCards events={await load(accessToken)} />; }
  catch { return <WeeklyPeopleCards events={[]} unavailable />; }
}
