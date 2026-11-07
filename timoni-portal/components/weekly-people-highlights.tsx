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

export function getExistingPeopleWindow(now: Date) {
  const week = getPanelWeekWindow(now);
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const end = new Date(`${localDay}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 61);
  return { timeMin: week.timeMin, timeMax: `${end.toISOString().slice(0, 10)}T00:00:00-03:00`, today: `${localDay}T00:00:00-03:00` };
}

export function selectUpcomingPeople(events: CalendarEventDTO[], now: Date) {
  const window = getExistingPeopleWindow(now);
  const start = new Date(window.today), end = new Date(window.timeMax);
  function select(vacations: boolean) {
    const seen = new Set<string>();
    return events.filter(event => {
      const title = normalize(event.summary);
      return (vacations ? title.includes("ferias") : title.includes("aniversario") || title.includes("aniversariante") || title.includes("birthday")) && date(event.start) < end && (vacations ? date(event.end) > start : date(event.start) >= start);
    }).sort((a, b) => date(a.start).getTime() - date(b.start).getTime()).filter(event => {
      const key = `${normalize(clean(event.summary))}-${format(event.start)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  return { birthdays: select(false), vacations: select(true) };
}

const load = cache(async (accessToken?: string) => {
  const window = getExistingPeopleWindow(new Date());
  const token = accessToken || await getAccessTokenFromRefreshToken();
  return listEventsInRange(token, { timeMin: window.timeMin, timeMax: window.timeMax, maxResults: 500 }, ["timoni"]);
});

export function WeeklyPeopleCards({ events, now = new Date(), unavailable = false, loading = false }: { events: CalendarEventDTO[]; now?: Date; unavailable?: boolean; loading?: boolean }) {
  const { birthdays, vacations } = selectWeeklyPeople(events, now);
  return <section className="ct-weekly-people" aria-label="Aniversários e férias da equipe">
    {([{ title: "Aniversários da semana", subtitle: "Datas para celebrar com a equipe", events: birthdays, vacations: false },
      { title: "Férias da semana", subtitle: "Ausências e próximos retornos", events: vacations, vacations: true }]).map(group => <article className="ct-weekly-card" id={group.vacations ? "ct-ferias" : "ct-aniversarios"} key={group.title}>
      <div className="ct-weekly-heading"><h2>{group.title}</h2><p>{group.subtitle}</p></div>
      {loading ? <p className="ct-weekly-empty" role="status">Carregando informações da semana…</p> : unavailable ? <p className="ct-weekly-empty" role="status">Não foi possível carregar agora. Tente novamente em instantes.</p> : group.events.length ? <ul>{group.events.map(event => <li key={`${event.calendarKey}-${event.id}`}>
        <div><strong>{clean(event.summary)}</strong><small>{group.vacations ? `${format(event.start)} a ${format(event.end)}` : format(event.start)}</small></div>
        <span className={group.vacations ? "ct-people-badge ct-people-vacations" : "ct-people-badge"}>{group.vacations ? "Em férias" : "Nesta semana"}</span>
      </li>)}</ul> : <p className="ct-weekly-empty">Nenhum registro nesta semana. <a className="font-medium text-[#14038D] underline" href="/colaboradores#proximas-datas">Ver próximos registros</a></p>}
    </article>)}
  </section>;
}

// O chamador aplica a mesma permissão do Painel antes de solicitar o calendário.
export default async function WeeklyPeopleHighlights({ accessToken }: { accessToken?: string }) {
  try { return <WeeklyPeopleCards events={await load(accessToken)} />; }
  catch { return <WeeklyPeopleCards events={[]} unavailable />; }
}

export async function UpcomingPeopleHighlights({ accessToken }: { accessToken?: string }) {
  let events: CalendarEventDTO[];
  try { events = await load(accessToken); }
  catch { return <p role="status">Não foi possível carregar as próximas datas. Tente novamente em instantes.</p>; }
  const { birthdays, vacations } = selectUpcomingPeople(events, new Date());
  return <section id="proximas-datas" className="ct-weekly-people mt-7" aria-label="Datas já registradas para os próximos 60 dias">
    {([{ title: "Próximos aniversários", events: birthdays, vacations: false }, { title: "Férias programadas", events: vacations, vacations: true }]).map(group => <article key={group.title} className="ct-weekly-card">
      <div className="ct-weekly-heading"><h2>{group.title}</h2><p>Registros existentes dos próximos 60 dias</p></div>
      {group.events.length ? <ul>{group.events.map(event => <li key={`${event.calendarKey}-${event.id}`}><div><strong>{clean(event.summary)}</strong><small>{group.vacations ? `${format(event.start)} a ${format(event.end)}` : format(event.start)}</small></div></li>)}</ul> : <p className="ct-weekly-empty">Nenhum registro informado para este período.</p>}
    </article>)}
  </section>;
}
