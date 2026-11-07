import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canReadUnit } from "@/lib/module-authorization";
import type { PortalUser } from "@/lib/access-control";
import { getPortalCentralIntegrationToken } from "@/lib/collaborator-auth.server";
import { recordModuleUpdateSafely } from "@/lib/module-updates";
import {
  archiveMeetingOccurrence,
  createMeeting,
  deleteMeeting,
  listMeetings,
  listMeetingsFresh,
  updateMeeting,
  type MeetingUnit,
} from "@/lib/reunioes";

const VALID_UNITS = new Set<MeetingUnit>(["Araras", "Rio Claro"]);
async function integrationToken(context: { user: PortalUser; accessToken: string }) {
  if (!context.user.collaboratorAccess) return context.accessToken;
  try { return await getPortalCentralIntegrationToken(); } catch { return null; }
}
function unavailable() { return NextResponse.json({ error: "Integração temporariamente indisponível. Tente novamente." }, { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }); }
async function recordChange(context: { user: PortalUser; email: string }, action: string, id: string) {
  if (context.user.collaboratorAccess) await recordModuleUpdateSafely("reunioes", context.email, `Reunião: ${action} · ${id}`);
}
function parseInput(body: Record<string, unknown>) {
  const input = {
    unit: String(body.unit || "") as MeetingUnit,
    date: String(body.date || ""),
    time: String(body.time || ""),
    secondDate: String(body.secondDate || ""),
    secondTime: String(body.secondTime || ""),
    additionalDates: Array.isArray(body.additionalDates) ? body.additionalDates.map((item) => ({ date: String(item?.date || ""), time: String(item?.time || "") })) : [],
    frequency: String(body.frequency || "Mensal"),
    leaders: String(body.leaders || ""),
    pautaUrl: String(body.pautaUrl || ""),
    ataUrl: String(body.ataUrl || ""),
    slidesUrl: String(body.slidesUrl || ""),
  };
  if (
    !VALID_UNITS.has(input.unit) || !input.date || !input.time ||
    Boolean(input.secondDate) !== Boolean(input.secondTime) ||
    (input.secondDate && input.secondDate < input.date) ||
    input.additionalDates.some((item) => Boolean(item.date) !== Boolean(item.time)) ||
    [input.secondDate, ...input.additionalDates.map((item) => item.date)].filter(Boolean).some((date, index, dates) => date < (index === 0 ? input.date : dates[index - 1]))
  ) {
    throw new Error("Preencha a primeira data e horário. As datas seguintes são opcionais; cada data preenchida precisa ter horário e estar em ordem cronológica.");
  }
  return input;
}

export async function GET() {
  const gate = await requireModuleAuthorization("reunioes", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const context = gate.current;
  try {
    const accessToken = await integrationToken(context);
    if (!accessToken) return unavailable();
    const items = (await listMeetings(accessToken)).filter(item => canReadUnit(context.user, "reunioes", item.unit));
    return NextResponse.json({ ok: true, items, canManage: canModuleOperation(context.user, "reunioes", "editar"), permissions: { canCreate: canModuleOperation(context.user, "reunioes", "criar"), canEdit: canModuleOperation(context.user, "reunioes", "editar"), canDelete: canModuleOperation(context.user, "reunioes", "excluir") } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[reunioes][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar as reuniões." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireModuleAuthorization("reunioes", "criar");
  if (!gate.current) return gate.errorResponse;
  const context = gate.current;
  try {
    const input = parseInput(await request.json());
    if (!canModuleOperation(context.user, "reunioes", "criar", { unidade: input.unit })) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    const accessToken = await integrationToken(context);
    if (!accessToken) return unavailable();
    const id = await createMeeting(accessToken, input);
    await recordChange(context, "criar", id);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireModuleAuthorization("reunioes", "editar");
  if (!gate.current) return gate.errorResponse;
  const context = gate.current;
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Reunião inválida.");
    const accessToken = await integrationToken(context);
    if (!accessToken) return unavailable();
    const existing = (await listMeetingsFresh(accessToken)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    if (!canModuleOperation(context.user, "reunioes", "editar", { unidade: existing.unit }) || (body.unit && !canReadUnit(context.user, "reunioes", body.unit))) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    if (body.action === "complete-occurrence") {
      await archiveMeetingOccurrence(accessToken, id, String(body.occurrenceDate || ""), existing.unit);
    } else if (body.action === "complete") {
      await updateMeeting(accessToken, id, { status: "concluida" }, existing.unit);
    } else if (body.action === "reopen") {
      await updateMeeting(accessToken, id, { status: "agendada" }, existing.unit);
    } else {
      await updateMeeting(accessToken, id, parseInput(body), existing.unit);
    }
    await recordChange(context, "editar", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireModuleAuthorization("reunioes", "excluir");
  if (!gate.current) return gate.errorResponse;
  const context = gate.current;
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Reunião inválida.");
    const accessToken = await integrationToken(context);
    if (!accessToken) return unavailable();
    const existing = (await listMeetingsFresh(accessToken)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    if (!canModuleOperation(context.user, "reunioes", "excluir", { unidade: existing.unit }) || (body.unit && !canReadUnit(context.user, "reunioes", body.unit))) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    await deleteMeeting(accessToken, id, existing.unit);
    await recordChange(context, "excluir", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: 400 });
  }
}
