"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { EventForm } from "./event-form";
import type { CalendarEventDTO, CalendarKey } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 30_000;
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000;
const SEARCH_WINDOW_DAYS = 365;

const WEEK_DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const CALENDAR_COLOR_FALLBACKS: Record<CalendarEventDTO["calendarKey"], string> = {
  principal: "#7986CB",
  timoni: "#185FA5",
};

// Dia, Semana e Mês. Ano saiu: não era usado no dia a dia e pesava na tela.
type ViewMode = "dia" | "semana" | "mes";
const VIEW_LABELS: Record<ViewMode, string> = { dia: "Dia", semana: "Semana", mes: "Mês" };

function saoPauloTodayKey(now: Date) {
  const shifted = new Date(now.getTime() + SAO_PAULO_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function addDaysKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStartKey(key: string) {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDaysKey(key, -((weekday + 6) % 7));
}

function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function addMonthsKey(key: string, months: number) {
  const date = new Date(`${monthStartKey(key)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

// Janela buscada no servidor para cada visão: inclui a grade completa do mês.
function rangeFor(view: ViewMode, anchorKey: string) {
  if (view === "dia") return { startKey: anchorKey, endKey: addDaysKey(anchorKey, 1) };
  // 18/11/2026: a semana começa no dia de hoje (Hoje no topo) e mostra os 7 dias seguintes.
  if (view === "semana") return { startKey: anchorKey, endKey: addDaysKey(anchorKey, 7) };
  const first = monthStartKey(anchorKey);
  const gridStart = weekStartKey(first);
  return { startKey: gridStart, endKey: addDaysKey(gridStart, 42) };
}

function keyToIsoStart(key: string) {
  return new Date(`${key}T00:00:00-03:00`).toISOString();
}

function eventDateKey(iso: string) {
  if (!iso.includes("T")) return iso.slice(0, 10);
  const shifted = new Date(new Date(iso).getTime() + SAO_PAULO_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function eventDayKeys(event: CalendarEventDTO) {
  const firstKey = eventDateKey(event.start);
  let lastKey = firstKey;
  if (event.end) {
    lastKey = event.end.includes("T")
      ? eventDateKey(new Date(new Date(event.end).getTime() - 1).toISOString())
      : addDaysKey(event.end.slice(0, 10), -1);
  }
  const keys = [firstKey];
  for (let key = addDaysKey(firstKey, 1); key <= lastKey && keys.length < 62; key = addDaysKey(key, 1)) keys.push(key);
  return keys;
}

function weekDayLabel(key: string) {
  return WEEK_DAY_LABELS[(new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7];
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00-03:00`);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function eventSearchText(event: CalendarEventDTO) {
  const key = eventDateKey(event.start);
  const displayDate = format(dateFromKey(key), "dd/MM/yyyy", { locale: ptBR });
  return normalizeSearchText(
    [event.summary, event.description, event.location, event.calendarLabel, key, displayDate]
      .filter(Boolean)
      .join(" ")
  );
}

function sortDayEvents(events: CalendarEventDTO[]) {
  return [...events].sort(
    (first, second) =>
      Number(!first.start.includes("T")) - Number(!second.start.includes("T")) ||
      first.start.localeCompare(second.start)
  );
}

function AgendaRow({
  event,
  now,
  deleting,
  compact = false,
  onEdit,
  onDelete,
}: {
  event: CalendarEventDTO;
  now: number;
  deleting: boolean;
  compact?: boolean;
  onEdit: (event: CalendarEventDTO) => void;
  onDelete: (event: CalendarEventDTO) => void;
}) {
  const isAllDay = !event.start.includes("T");
  const color = CALENDAR_COLOR_FALLBACKS[event.calendarKey];
  // Mesma regra do cartão antigo: passado e não editado conta como concluído, mas continua visível.
  const passou = new Date(event.end).getTime() < now;
  const concluido = Boolean(event.completed) || (passou && !event.edited);
  const time = isAllDay
    ? "Dia todo"
    : `${format(new Date(event.start), "HH:mm", { locale: ptBR })}–${format(new Date(event.end), "HH:mm", { locale: ptBR })}`;

  return (
    <div
      className={clsx(
        "relative flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2 md:border-0",
        concluido && "opacity-40"
      )}
      style={{ borderColor: color }}
    >
      {!compact && <span className="w-[92px] shrink-0 text-[15px] font-medium tabular-nums text-slate-600">{time}</span>}
      <div className="min-w-0 flex-1">
        <p className={clsx("truncate text-[17px] font-medium text-[#182443]", !compact && "md:pr-24")}>
          {/* 19/11: no celular (cartão compacto) horário completo e compromisso na mesma linha; "Dia todo" quando for o dia inteiro. */}
          {compact && <span className="ct-agenda-time md:hidden">{time} </span>}
          {event.summary}
        </p>
        <p className="flex min-w-0 items-center gap-2 text-sm max-md:text-[11px] text-slate-500">
          {/* 19/11: no celular sem etiqueta Principal/Timoni (agendas já separadas); desktop mantém o nome da agenda. */}
          {!compact && <span className="hidden shrink-0 text-[13px] font-semibold leading-none md:inline" style={{ color }}>{event.calendarLabel}</span>}
          {event.location ? <span className="truncate">{event.location}</span> : null}
        </p>
      </div>
      {/* Celular: coluna da direita só com os botões (19/11). */}
      <div className="ct-agenda-side flex shrink-0 flex-col items-end gap-1 md:contents">
      <div className={clsx("flex shrink-0 gap-2", compact && "flex-col max-md:flex-row")}>
          <Button className="min-h-11 px-3 text-base max-md:text-[12.5px] lg:min-h-9 lg:text-sm" variant="secondary" onClick={() => onEdit(event)}>
            Editar
          </Button>
          <Button className="min-h-11 px-3 text-base max-md:text-[12.5px] lg:min-h-9 lg:text-sm" variant="danger" disabled={deleting} onClick={() => onDelete(event)}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Desktop (semana): linha do compromisso dentro do quadro do dia, sem contorno próprio.
// Horário | nome e (agenda · local) | Editar (contorno) e Cancelar (texto vermelho).
function DesktopEventRow({
  event,
  now,
  deleting,
  onEdit,
  onDelete,
}: {
  event: CalendarEventDTO;
  now: number;
  deleting: boolean;
  onEdit: (event: CalendarEventDTO) => void;
  onDelete: (event: CalendarEventDTO) => void;
}) {
  const isAllDay = !event.start.includes("T");
  const color = CALENDAR_COLOR_FALLBACKS[event.calendarKey];
  const passou = new Date(event.end).getTime() < now;
  const concluido = Boolean(event.completed) || (passou && !event.edited);
  const time = isAllDay
    ? "Dia todo"
    : `${format(new Date(event.start), "HH:mm", { locale: ptBR })}–${format(new Date(event.end), "HH:mm", { locale: ptBR })}`;
  return (
    // 18/11: etiqueta da agenda (Timoni / Ciça) acima do compromisso; hora na mesma linha do compromisso.
    <div className={clsx("grid grid-cols-[110px_minmax(0,1fr)_auto] items-start gap-3 border-t border-[#edf0f6] px-4 py-2.5 first:border-t-0", concluido && "opacity-40")}>
      <span className="mt-[26px] text-[14px] leading-6 tabular-nums text-slate-600">{time}</span>
      <div className="min-w-0">
        <span className="inline-block h-5 rounded-full border px-2 text-[12px] font-medium leading-[18px]" style={{ color, borderColor: color }}>{event.calendarKey === "principal" ? "Ciça" : "Timoni"}</span>
        <p className="mt-1.5 truncate text-[16px] leading-6 text-[#182443]">
          {event.summary}
        </p>
        {event.location ? <p className="truncate text-[14px] text-slate-500">{event.location}</p> : null}
      </div>
      <div className="mt-[22px] flex items-center gap-2">
        <button type="button" onClick={() => onEdit(event)} className="rounded-lg border border-[#c9d8f0] bg-white px-3 py-1 text-[14px] text-[#102a83] hover:bg-[#f5f8fe]">
          Editar
        </button>
        <button type="button" disabled={deleting} onClick={() => onDelete(event)} className="px-2 py-1 text-[14px] text-[#b42318] hover:underline disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function CalendarView({
  initialEvents,
  initialError,
  title = "Agenda",
  fixedCalendarKey,
  abas,
}: {
  initialEvents: CalendarEventDTO[];
  initialError: string | null;
  title?: string;
  fixedCalendarKey?: CalendarKey;
  abas?: ReactNode;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [view, setView] = useState<ViewMode>("semana");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [error, setError] = useState(initialError);
  const [now, setNow] = useState(() => Date.now());
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDTO | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSourceEvents, setSearchSourceEvents] = useState<CalendarEventDTO[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const todayKey = saoPauloTodayKey(new Date(now));
  const anchorKey = useMemo(() => {
    if (view === "dia") return addDaysKey(todayKey, periodOffset);
    if (view === "semana") return addDaysKey(todayKey, periodOffset * 7);
    return addMonthsKey(todayKey, periodOffset);
  }, [view, periodOffset, todayKey]);
  const range = rangeFor(view, anchorKey);

  async function fetchRange(startKey: string, endKey: string) {
    const calendarFilter = fixedCalendarKey ? `&calendarKey=${encodeURIComponent(fixedCalendarKey)}` : "";
    const res = await fetch(
      `/api/events?timeMin=${encodeURIComponent(keyToIsoStart(startKey))}&timeMax=${encodeURIComponent(keyToIsoStart(endKey))}${calendarFilter}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Não foi possível atualizar os eventos.");
    return data.events as CalendarEventDTO[];
  }

  async function refreshEvents(startKey: string, endKey: string) {
    try {
      setEvents(await fetchRange(startKey, endKey));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha de conexão ao atualizar os eventos.");
    }
  }

  async function refreshSearchEvents() {
    setSearchLoading(true);
    try {
      setSearchSourceEvents(
        await fetchRange(addDaysKey(todayKey, -SEARCH_WINDOW_DAYS), addDaysKey(todayKey, SEARCH_WINDOW_DAYS))
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível pesquisar os compromissos.");
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    void refreshEvents(range.startKey, range.endKey);
    const poll = setInterval(() => void refreshEvents(range.startKey, range.endKey), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startKey, range.endKey, fixedCalendarKey]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Portal Timoni`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  // Ao trocar de visão, o dia selecionado acompanha o período. No período atual, sempre o dia de hoje (18/11).
  useEffect(() => {
    setSelectedDateKey(periodOffset === 0 ? todayKey : view === "mes" ? monthStartKey(anchorKey) : anchorKey);
  }, [view, periodOffset, anchorKey, todayKey]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEventDTO[]>();
    for (const event of events) {
      // 18/11: evento de vários dias aparece em todos os dias (Google: fim de dia todo é exclusivo).
      for (const key of eventDayKeys(event)) grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    for (const [key, list] of grouped) grouped.set(key, sortDayEvents(list));
    return grouped;
  }, [events]);

  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const isSearching = normalizedSearchQuery.length > 0;
  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return [...(searchSourceEvents ?? events)]
      .filter((event) => eventSearchText(event).includes(normalizedSearchQuery))
      .sort((first, second) => first.start.localeCompare(second.start));
  }, [events, normalizedSearchQuery, searchSourceEvents]);

  const searchGroups = useMemo(() => {
    const grouped = new Map<string, CalendarEventDTO[]>();
    for (const event of searchResults) {
      const key = eventDateKey(event.start);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return Array.from(grouped.entries());
  }, [searchResults]);

  const periodLabel =
    view === "dia"
      ? format(dateFromKey(anchorKey), "EEEE, dd 'de' MMMM", { locale: ptBR })
      : view === "semana"
        ? `${format(dateFromKey(range.startKey), "dd/MM")} – ${format(dateFromKey(addDaysKey(range.startKey, 6)), "dd/MM/yyyy")}`
        : format(dateFromKey(monthStartKey(anchorKey)), "MMMM 'de' yyyy", { locale: ptBR });

  // 19/11: botões curtos em todas as agendas.
  const previousLabel = "Anterior";
  const nextLabel = "Próximo";

  function changeView(next: ViewMode) {
    setView(next);
    setPeriodOffset(0);
  }

  function openEdit(event: CalendarEventDTO) {
    setEditingEvent(event);
    setFormOpen(true);
  }

  async function handleDelete(event: CalendarEventDTO) {
    if (!window.confirm(`Cancelar o evento "${event.summary}"?`)) return;
    setDeletingId(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}?calendarKey=${event.calendarKey}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível cancelar o evento.");
        return;
      }
      await Promise.all([
        refreshEvents(range.startKey, range.endKey),
        searchSourceEvents ? refreshSearchEvents() : Promise.resolve(),
      ]);
    } catch {
      setError("Falha de conexão ao cancelar o evento.");
    } finally {
      setDeletingId(null);
    }
  }

  function renderRows(list: CalendarEventDTO[], compact = false) {
    return list.map((event) => (
      <AgendaRow
        key={`${event.calendarKey}-${event.id}`}
        event={event}
        now={now}
        compact={compact}
        deleting={deletingId === event.id}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
    ));
  }

  function renderDots(key: string) {
    const dayEvents = eventsByDate.get(key) ?? [];
    if (dayEvents.length === 0) return null;
    const colors = Array.from(new Set(dayEvents.map((event) => CALENDAR_COLOR_FALLBACKS[event.calendarKey])));
    return (
      <span className="mt-1 flex items-center justify-center gap-1" aria-label={`${dayEvents.length} evento(s)`}>
        {colors.slice(0, 3).map((color) => (
          <span key={color} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        ))}
      </span>
    );
  }

  const monthCells = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDaysKey(range.startKey, index)),
    [range.startKey]
  );
  const monthFirstKey = monthStartKey(anchorKey);
  const weekKeys = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysKey(range.startKey, index)), [range.startKey]);

  return (
    <div className="ct-clean-agenda">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {abas}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h1 className="text-xl max-md:text-[15px] font-semibold text-[#102a83]">{title}</h1>
          <p className="capitalize text-base max-md:text-[12.5px] text-slate-500">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="inline-flex overflow-hidden rounded-xl border border-[#d7deeb]" role="group" aria-label="Visão da agenda">
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => changeView(mode)}
                className={clsx(
                  "min-h-11 px-4 text-base max-md:text-[12.5px] font-medium",
                  view === mode ? "bg-[#102a83] text-white" : "bg-white text-[#102a83] hover:bg-[#f0f3fb]"
                )}
              >
                {VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
          <Button
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap text-base max-md:text-[12.5px]"
            onClick={() => {
              setEditingEvent(null);
              setFormOpen(true);
            }}
          >
            Novo evento
          </Button>
        </div>
      </div>

      <div className="relative mt-4">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          ⌕
        </span>
        <input
          type="search"
          value={searchQuery}
          onFocus={() => {
            if (!searchSourceEvents && !searchLoading) void refreshSearchEvents();
          }}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (!searchSourceEvents && !searchLoading) void refreshSearchEvents();
          }}
          placeholder="Pesquisar compromissos (±1 ano)"
          aria-label="Pesquisar compromissos"
          className="h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white pl-10 pr-24 text-base max-md:text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {searchLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm max-md:text-[11px] text-slate-400">Buscando…</span>}
        {!searchLoading && searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm max-md:text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Limpar
          </button>
        )}
      </div>

      {!isSearching && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button className="text-base max-md:text-[12.5px]" variant="secondary" onClick={() => setPeriodOffset((offset) => offset - 1)}>
            {previousLabel}
          </Button>
          <Button className="text-base max-md:text-[12.5px]" variant="secondary" onClick={() => { setView("dia"); setPeriodOffset(0); }}>
            Hoje
          </Button>
          <Button className="text-base max-md:text-[12.5px]" variant="secondary" onClick={() => setPeriodOffset((offset) => offset + 1)}>
            {nextLabel}
          </Button>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-base max-md:text-[12.5px] text-red-700">{error}</p>}

      {isSearching && (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-base max-md:text-[12.5px] font-semibold text-slate-700">
            {searchLoading
              ? "Pesquisando compromissos…"
              : `${searchResults.length} ${searchResults.length === 1 ? "compromisso encontrado" : "compromissos encontrados"}`}
          </h2>
          {!searchLoading && searchGroups.length === 0 && <p className="mt-3 text-base max-md:text-[12.5px] text-slate-500">Nenhum compromisso encontrado.</p>}
          {searchGroups.map(([dayKey, dayEvents]) => (
            <div key={dayKey} className="mt-5">
              <h3 className="text-sm max-md:text-[11px] font-semibold uppercase tracking-wide text-[#102a83]">
                {format(dateFromKey(dayKey), "EEEE, dd/MM/yyyy", { locale: ptBR })}
              </h3>
              <div className="mt-2 divide-y divide-[#edf0f6] overflow-hidden rounded-xl border border-[#e1e6f0]">{renderRows(dayEvents)}</div>
            </div>
          ))}
        </section>
      )}

      {!isSearching && view === "dia" && (
        <section className="mt-5">
          <div className="divide-y divide-[#edf0f6] overflow-hidden rounded-xl border border-[#e1e6f0]">
            {(eventsByDate.get(anchorKey) ?? []).length === 0 && (
              <p className="bg-white px-4 py-6 text-base max-md:text-[12.5px] text-slate-500">Nenhum compromisso neste dia.</p>
            )}
            {renderRows(eventsByDate.get(anchorKey) ?? [])}
          </div>
        </section>
      )}

      {!isSearching && view === "semana" && (
        // Celular: dias empilhados em lista. Desktop (lg+): sete colunas lado a lado, uso de mesa.
        <>
        {/* Desktop: um quadro por dia com compromisso (faixa azul clara com o dia). Dias sem compromisso não aparecem. */}
        <div className="mt-5 hidden space-y-3 md:block">
          {weekKeys.filter((dayKey) => (eventsByDate.get(dayKey) ?? []).length > 0).map((dayKey) => {
            const isToday = dayKey === todayKey;
            return (
              <div key={dayKey} className="overflow-hidden rounded-xl border border-[#c9d8f0] bg-white">
                <div className="flex items-baseline gap-2 border-b border-[#c9d8f0] bg-[#eef5ff] px-4 py-2">
                  <span className="text-[14px] text-slate-600">{weekDayLabel(dayKey)}</span>
                  <span className="text-[20px] font-semibold text-[#102a83]">{format(dateFromKey(dayKey), "d")}</span>
                  {isToday && <span className="ml-auto self-center rounded-md bg-[#102a83] px-2 py-0.5 text-[13px] font-semibold text-white">Hoje</span>}
                </div>
                {(eventsByDate.get(dayKey) ?? []).map((event) => (
                  <DesktopEventRow
                    key={`${event.calendarKey}-${event.id}`}
                    event={event}
                    now={now}
                    deleting={deletingId === event.id}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            );
          })}
          {weekKeys.every((dayKey) => (eventsByDate.get(dayKey) ?? []).length === 0) && (
            <p className="rounded-xl border border-[#c9d8f0] bg-white px-4 py-3 text-[14px] text-slate-500">Nenhum compromisso nestes 7 dias.</p>
          )}
        </div>
        <section className="mt-5 overflow-hidden rounded-xl border border-[#e1e6f0] bg-white md:hidden">
          {weekKeys.map((dayKey) => {
            const dayEvents = eventsByDate.get(dayKey) ?? [];
            const isToday = dayKey === todayKey;
            return (
              <div
                key={dayKey}
                className={clsx(
                  "border-t border-[#edf0f6] first:border-t-0",
                  isToday && "bg-[#eef1fa]"
                )}
              >
                <div className="flex items-baseline gap-2 px-3 py-3">
                  <p className="text-sm max-md:text-[11px] font-semibold uppercase text-slate-500">{weekDayLabel(dayKey)}</p>
                  <p className={clsx("text-2xl max-md:text-[20px] font-semibold", isToday ? "text-[#102a83]" : "text-[#182443]")}>{format(dateFromKey(dayKey), "d")}</p>
                  {isToday && <p className="ml-auto text-xs max-md:text-[10px] font-semibold text-[#102a83]">Hoje</p>}
                </div>
                <div className="min-w-0 divide-y divide-[#edf0f6]">
                  {dayEvents.length === 0 ? (
                    <p className="px-3 py-3 text-base max-md:text-[12.5px] text-slate-400">Sem compromissos</p>
                  ) : (
                    <>
                      <div className="divide-y divide-[#edf0f6] lg:hidden">{renderRows(dayEvents, true)}</div>
                      <div className="hidden divide-y divide-[#edf0f6] lg:block">{renderRows(dayEvents)}</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>
        </>
      )}

      {!isSearching && view === "mes" && (
        <section className="mt-5">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[#e1e6f0] bg-[#e1e6f0]">
            {WEEK_DAY_LABELS.map((label) => (
              <div key={label} className="bg-[#eef1fa] py-2 text-center text-sm max-md:text-[11px] font-semibold text-slate-600">
                {label}
              </div>
            ))}
            {monthCells.map((key) => {
              const inMonth = key.slice(0, 7) === monthFirstKey.slice(0, 7);
              const isToday = key === todayKey;
              const selected = key === selectedDateKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  aria-pressed={selected}
                  className={clsx(
                    "flex min-h-[64px] flex-col items-center bg-white py-2 text-base max-md:text-[12.5px]",
                    !inMonth && "text-slate-300",
                    selected && "ring-2 ring-inset ring-[#102a83]",
                    isToday && "font-semibold text-[#102a83]"
                  )}
                >
                  <span>{Number(key.slice(8, 10))}</span>
                  {renderDots(key)}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <h2 className="text-base max-md:text-[12.5px] font-semibold capitalize text-slate-700">
              {selectedDateKey ? format(dateFromKey(selectedDateKey), "EEEE, dd 'de' MMMM", { locale: ptBR }) : ""}
            </h2>
            <div className="mt-2 divide-y divide-[#edf0f6] overflow-hidden rounded-xl border border-[#e1e6f0]">
              {selectedDateKey && (eventsByDate.get(selectedDateKey) ?? []).length === 0 && (
                <p className="bg-white px-4 py-6 text-base max-md:text-[12.5px] text-slate-500">Nenhum compromisso neste dia.</p>
              )}
              {selectedDateKey && renderRows(eventsByDate.get(selectedDateKey) ?? [])}
            </div>
          </div>
        </section>
      )}

      {formOpen && (
        <EventForm
          event={editingEvent}
          fixedCalendarKey={fixedCalendarKey}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            void refreshEvents(range.startKey, range.endKey);
            if (searchSourceEvents) void refreshSearchEvents();
          }}
        />
      )}

      {deletingId && (
        <p className="fixed bottom-4 right-4 rounded-lg bg-slate-900 px-3 py-2 text-sm max-md:text-[11px] text-white">Cancelando evento…</p>
      )}
    </div>
  );
}
