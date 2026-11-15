"use client";

import clsx from "clsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CalendarEventDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Carimbo } from "@/components/clean/carimbo";

type Urgency = "urgent" | "today" | "future";

const CALENDAR_COLOR_FALLBACKS: Record<CalendarEventDTO["calendarKey"], string> = {
  principal: "#444441",
  timoni: "#185FA5",
};

export function getUrgency(startIso: string, endIso: string, nowMs: number): Urgency {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const twoHoursMs = 2 * 60 * 60 * 1000;

  const isOngoing = startMs <= nowMs && nowMs < endMs;
  const startsWithinTwoHours = startMs > nowMs && startMs - nowMs <= twoHoursMs;
  if (isOngoing || startsWithinTwoHours) return "urgent";

  const isToday = new Date(startMs).toDateString() === new Date(nowMs).toDateString();
  return isToday ? "today" : "future";
}

export function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEventDTO;
  onEdit: (event: CalendarEventDTO) => void;
  onDelete: (event: CalendarEventDTO) => void;
}) {
  const isAllDay = !event.start.includes("T");
  const calendarColor = CALENDAR_COLOR_FALLBACKS[event.calendarKey];
  // Evento que já passou conta como concluído, a menos que tenha sido editado.
  // Editado não ganha o carimbo sozinho: fica sem marcação até alguém decidir.
  const passou = new Date(event.end).getTime() < Date.now();
  const concluido = Boolean(event.completed) || (passou && !event.edited);

  const timeLabel = isAllDay
    ? `${event.start.slice(8, 10)}/${event.start.slice(5, 7)}`
    : `${format(new Date(event.start), "dd/MM HH:mm", { locale: ptBR })}–${format(
        new Date(event.end),
        "HH:mm",
        { locale: ptBR }
      )}`;

  return (
    <div
      className={clsx("min-w-0 rounded-xl border border-[#e1e6f0] bg-white p-3 sm:p-4", concluido && "opacity-60")}
      style={{ borderColor: calendarColor }}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: calendarColor }} />
            <span className="text-sm text-slate-500">{timeLabel}</span>
            <span className="inline-flex max-w-full items-center break-words rounded-full border border-[#d7deeb] px-2 py-0.5 text-xs text-[#65718a]">
              {event.calendarLabel}
            </span>
          </div>
          <p className="mt-2 break-words text-base font-medium text-[#182443]">
            {event.summary}
          </p>
          {concluido && <span className="mt-1 inline-flex"><Carimbo>Concluído</Carimbo></span>}
          {event.location && <p className="mt-1 break-words text-[15px] text-slate-500 sm:text-sm">{event.location}</p>}
        </div>
        <div className="grid w-full grid-cols-3 items-center gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center">
          <Button className="inline-flex min-h-9 min-w-0 items-center justify-center px-2 text-[13px] sm:px-3 sm:text-sm" variant="secondary" onClick={() => onEdit(event)}>
            Editar
          </Button>
          <Button className="inline-flex min-h-9 min-w-0 items-center justify-center px-2 text-[13px] text-red-700 sm:px-3 sm:text-sm" variant="secondary" onClick={() => onDelete(event)}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
