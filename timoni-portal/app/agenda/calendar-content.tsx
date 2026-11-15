import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getAccessTokenFromRefreshToken, listEventsInRange } from "@/lib/google-calendar";
import { getWeekRange } from "@/lib/week";
import { CalendarView } from "@/app/dashboard/calendar-view";
import type { CalendarEventDTO } from "@/lib/types";

export const metadata: Metadata = {
  title: "Agenda",
};

export default async function CalendarContent({company=false, abas}:{company?:boolean; abas?:ReactNode}) {
  const session = await auth();

  let initialEvents: CalendarEventDTO[] = [];
  let loadError: string | null = null;

  if (session?.accessToken && session.error !== "RefreshAccessTokenError") {
    try {
      const { start, end } = getWeekRange();
      initialEvents = await listEventsInRange(company ? await getAccessTokenFromRefreshToken() : session.accessToken, {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
      },company?["timoni"]:["principal"]);
    } catch {
      loadError = "Não foi possível carregar os eventos agora.";
    }
  } else {
    loadError = "Sessão expirada. Saia e entre novamente.";
  }

  return (
    <div className="ct-modern-calendar mx-auto w-full max-w-5xl">
      <section className="min-w-0 overflow-hidden rounded-xl border border-[#e1e6f0] bg-white p-3 sm:rounded-2xl sm:p-5 [&_button]:py-2 [&_section]:mt-4 sm:[&_section]:mt-6 [&_.space-y-3]:space-y-2 sm:[&_.space-y-3]:space-y-3">
        <CalendarView initialEvents={initialEvents} initialError={loadError} title={company?"Agenda da loja":"Minha agenda"} fixedCalendarKey={company?"timoni":"principal"} abas={abas} />
      </section>
    </div>
  );
}
