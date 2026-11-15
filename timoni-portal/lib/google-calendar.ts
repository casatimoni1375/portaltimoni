import { createGoogleTokenRefresher } from "@/lib/google-token-refresh";
import { google, type calendar_v3 } from "googleapis";
import { CALENDAR_LABELS, type CalendarEventDTO, type CalendarEventInput, type CalendarKey } from "@/lib/types";

export const TIME_ZONE = "America/Sao_Paulo";

export const CALENDARS: Record<CalendarKey, { id: string; label: string }> = {
  // Agenda da Ciça lida pelo endereço, e não como "primary": assim ela aparece igual nas duas
  // contas da Ciça (mcrodini@gmail.com e cecilia@casatimoni.com.br, com a agenda compartilhada).
  principal: { id: process.env.CICA_CALENDAR_ID || "mcrodini@gmail.com", label: CALENDAR_LABELS.principal },
  timoni: {
    id:
      process.env.TIMONI_CALENDAR_ID ||
      "28fddf65c061d4f277f8ee4ddee48d5118d71dadf3e45de3443a3fd898b79356@group.calendar.google.com",
    label: CALENDAR_LABELS.timoni,
  },
};

const CALENDAR_COLOR_FALLBACKS: Record<CalendarKey, string> = {
  principal: "#7986CB",
  timoni: "#F6BF26",
};

function getCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

const renewCentralToken = createGoogleTokenRefresher();
let centralToken: { refreshToken?: string; accessToken?: string; expiresAt?: number; error?: "RefreshAccessTokenError" | "SessionTemporarilyUnavailable"; refreshRetryAt?: number } = {};

export async function getAccessTokenFromRefreshToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN não configurado no servidor.");
  if (centralToken.refreshToken !== refreshToken) centralToken = { refreshToken };
  if (!centralToken.expiresAt || Date.now() / 1000 >= centralToken.expiresAt - 120) {
    centralToken = await renewCentralToken(centralToken, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  }
  if (!centralToken.accessToken || !centralToken.expiresAt || Date.now() / 1000 >= centralToken.expiresAt) {
    throw new Error("A conexão Google do Portal precisa ser renovada. Avise a gestão.");
  }
  return centralToken.accessToken;
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toEventDateTime(value: string): calendar_v3.Schema$EventDateTime {
  return isDateOnly(value)
    ? { date: value }
    : { dateTime: value, timeZone: TIME_ZONE };
}

// Editado = alterado mais de 1 minuto depois da criação (folga para a própria criação).
function isEditado(created?: string | null, updated?: string | null): boolean {
  if (!created || !updated) return false;
  return new Date(updated).getTime() - new Date(created).getTime() > 60_000;
}

function toDTO(
  event: calendar_v3.Schema$Event,
  calendarKey: CalendarKey,
  calendarColor = CALENDAR_COLOR_FALLBACKS[calendarKey]
): CalendarEventDTO | null {
  if (!event.id || !event.start || !event.end) return null;
  const start = event.start.dateTime ?? event.start.date;
  const end = event.end.dateTime ?? event.end.date;
  if (!start || !end) return null;
  const originalStartTime = event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? undefined;
  return {
    id: event.id,
    summary: event.summary || "(sem título)",
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start,
    end,
    htmlLink: event.htmlLink ?? undefined,
    calendarKey,
    calendarLabel: CALENDARS[calendarKey].label,
    calendarColor,
    completed: event.extendedProperties?.private?.completed === "true",
    edited: isEditado(event.created, event.updated),
    recurringEventId: event.recurringEventId ?? undefined,
    originalStartTime,
    allDay: Boolean(event.start.date),
  };
}

// Google devolve no máximo 2500 por página; sem paginar, o corte de 500 escondia os eventos mais recentes e futuros.
const CALENDAR_PAGE_SIZE = 250;
const CALENDAR_MAX_EVENTS_PER_AGENDA = 5000;

async function listAllCalendarEvents(
  calendar: ReturnType<typeof getCalendarClient>,
  calendarId: string,
  timeMin: string,
  timeMax?: string
) {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults: CALENDAR_PAGE_SIZE,
      singleEvents: true,
      orderBy: "startTime",
      pageToken,
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && items.length < CALENDAR_MAX_EVENTS_PER_AGENDA);
  return items;
}

export async function listEventsInRange(
  accessToken: string,
  opts: { timeMin: string; timeMax?: string },
  onlyCalendarKeys?: CalendarKey[]
): Promise<CalendarEventDTO[]> {
  const calendar = getCalendarClient(accessToken);
  const calendarKeys = onlyCalendarKeys?.length
    ? onlyCalendarKeys
    : (Object.keys(CALENDARS) as CalendarKey[]);
  const [results, calendarColors] = await Promise.all([
    Promise.all(
      calendarKeys.map((key) => listAllCalendarEvents(calendar, CALENDARS[key].id, opts.timeMin, opts.timeMax))
    ),
    Promise.all(
      calendarKeys.map(async (key) => {
        try {
          const entry = await calendar.calendarList.get({
            calendarId: CALENDARS[key].id,
          });
          return entry.data.backgroundColor || CALENDAR_COLOR_FALLBACKS[key];
        } catch {
          return CALENDAR_COLOR_FALLBACKS[key];
        }
      })
    ),
  ]);
  const events = calendarKeys.flatMap((key, i) =>
    results[i]
      .map((event) => toDTO(event, key, calendarColors[i]))
      .filter((event): event is CalendarEventDTO => event !== null)
  );
  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function createEvent(
  accessToken: string,
  calendarKey: CalendarKey,
  input: CalendarEventInput
): Promise<CalendarEventDTO> {
  const calendar = getCalendarClient(accessToken);
  const res = await calendar.events.insert({
    calendarId: CALENDARS[calendarKey].id,
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: toEventDateTime(input.start),
      end: toEventDateTime(input.end),
      recurrence: input.recurrence,
    },
  });
  const dto = toDTO(res.data, calendarKey);
  if (!dto) throw new Error("Resposta inesperada do Google Calendar ao criar evento.");
  return dto;
}

export async function updateEvent(
  accessToken: string,
  calendarKey: CalendarKey,
  eventId: string,
  input: Partial<CalendarEventInput>
): Promise<CalendarEventDTO> {
  const calendar = getCalendarClient(accessToken);
  const res = await calendar.events.patch({
    calendarId: CALENDARS[calendarKey].id,
    eventId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      ...(input.start ? { start: toEventDateTime(input.start) } : {}),
      ...(input.end ? { end: toEventDateTime(input.end) } : {}),
      ...(input.completed !== undefined
        ? { extendedProperties: { private: { completed: String(input.completed) } } }
        : {}),
    },
  });
  const dto = toDTO(res.data, calendarKey);
  if (!dto) throw new Error("Resposta inesperada do Google Calendar ao editar evento.");
  return dto;
}

export async function deleteEvent(
  accessToken: string,
  calendarKey: CalendarKey,
  eventId: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken);
  await calendar.events.delete({ calendarId: CALENDARS[calendarKey].id, eventId });
}

export function toApiError(error: unknown): { message: string; status: number } {
  const typedError = error as {
    code?: number;
    message?: string;
    response?: { data?: { error?: { message?: string } } };
  };
  const status = typedError.code ?? 500;
  const googleMessage = typedError.response?.data?.error?.message || typedError.message;
  if (status === 400) {
    return {
      message: googleMessage
        ? `Não foi possível salvar o evento: ${googleMessage}`
        : "Os dados do evento são inválidos.",
      status: 400,
    };
  }
  if (status === 401) return { message: "Sessão expirada. Faça login novamente.", status: 401 };
  if (status === 403) return { message: "Sem permissão para acessar a agenda.", status: 403 };
  if (status === 404) return { message: "Evento não encontrado.", status: 404 };
  return { message: "Erro ao falar com o Google Calendar. Tente novamente.", status: 500 };
}

export function isCalendarKey(value: unknown): value is CalendarKey {
  return value === "principal" || value === "timoni";
}
