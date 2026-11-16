"use client";

import { useMemo, useState } from "react";

const AGENDA_CT_ID =
  "28fddf65c061d4f277f8ee4ddee48d5118d71dadf3e45de3443a3fd898b79356@group.calendar.google.com";

type CalendarViewMode = "DAY" | "WEEK" | "MONTH";

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
  { value: "DAY", label: "Dia" },
  { value: "WEEK", label: "Semana" },
  { value: "MONTH", label: "Mês" },
];

export function AgendaCTClient() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("WEEK");

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      src: AGENDA_CT_ID,
      ctz: "America/Sao_Paulo",
      mode: viewMode,
      showTitle: "0",
      showCalendars: "0",
      showTabs: "0",
      showPrint: "0",
    });
    return "https://calendar.google.com/calendar/embed?" + params.toString();
  }, [viewMode]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="min-w-0 overflow-hidden rounded-xl border border-[#e1e6f0] bg-white p-2 sm:rounded-2xl sm:p-4">
        <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl max-md:text-[15px] font-semibold text-[#182443] sm:text-2xl md:text-[28px]">Agenda CT</h1>
            <p className="mt-1 text-sm max-md:text-[11px] text-[#65718a]">
              Calendário compartilhado da Casa Timoni. A agenda pessoal da Ciça permanece separada.
            </p>
          </div>

          <div className="inline-flex w-fit rounded-lg border border-[#d7deeb] bg-white p-1" role="group" aria-label="Visualização da Agenda CT">
            {VIEW_OPTIONS.map((option) => {
              const active = viewMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  className={active
                    ? "rounded-md bg-[#102a83] px-3 py-1.5 text-sm max-md:text-[11px] font-medium text-white transition"
                    : "rounded-md px-3 py-1.5 text-sm max-md:text-[11px] font-medium text-[#102a83] transition hover:bg-[#f5f7fd]"}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mb-3 px-1 text-sm max-md:text-[11px] text-slate-600">
          Se o Google pedir acesso no celular,{" "}
          <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-800 underline">
            abra a Agenda CT diretamente no Google
          </a>.
        </p>

        <div className="h-[72vh] min-h-[560px] w-full overflow-hidden rounded-xl border border-slate-200">
          <iframe
            key={viewMode}
            title={"Agenda CT — visualização " + (VIEW_OPTIONS.find((option) => option.value === viewMode)?.label || "")}
            src={embedUrl}
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      </section>
    </div>
  );
}
