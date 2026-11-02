import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canReadUnit } from "@/lib/module-authorization";
import type { AuthorizationAction } from "@/lib/authorization";
import {
  archiveMeetingOccurrence,
  createMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
  type MeetingUnit,
} from "@/lib/reunioes";

const VALID_UNITS = new Set<MeetingUnit>(["Araras", "Rio Claro"]);
async function getContext(action: AuthorizationAction = "visualizar") {
  const gate = await requireModuleAuthorization("reunioes", action);
  return gate.current;
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
  const context = await getContext();
  if (!context) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const items = (await listMeetings(context.accessToken)).filter(item => canReadUnit(context.user, "reunioes", item.unit));
    return NextResponse.json({ ok: true, items, canManage: canModuleOperation(context.user, "reunioes", "editar"), permissions: { canCreate: canModuleOperation(context.user, "reunioes", "criar"), canEdit: canModuleOperation(context.user, "reunioes", "editar"), canDelete: canModuleOperation(context.user, "reunioes", "excluir") } });
  } catch (error) {
    console.error("[reunioes][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar as reuniões." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getContext("criar");
  if (!context) {
    return NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 });
  }
  try {
    const input = parseInput(await request.json());
    if (!canModuleOperation(context.user, "reunioes", "criar", { unidade: input.unit })) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    const id = await createMeeting(context.accessToken, input);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const context = await getContext("editar");
  if (!context) {
    return NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Reunião inválida.");
    const existing = (await listMeetings(context.accessToken)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    if (!canModuleOperation(context.user, "reunioes", "editar", { unidade: existing.unit }) || (body.unit && !canReadUnit(context.user, "reunioes", body.unit))) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    if (body.action === "complete-occurrence") {
      await archiveMeetingOccurrence(context.accessToken, id, String(body.occurrenceDate || ""));
    } else if (body.action === "complete") {
      await updateMeeting(context.accessToken, id, { status: "concluida" });
    } else if (body.action === "reopen") {
      await updateMeeting(context.accessToken, id, { status: "agendada" });
    } else {
      await updateMeeting(context.accessToken, id, parseInput(body));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const context = await getContext("excluir");
  if (!context) {
    return NextResponse.json({ error: "Seu acesso não permite esta ação." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Reunião inválida.");
    const existing = (await listMeetings(context.accessToken)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    if (!canModuleOperation(context.user, "reunioes", "excluir", { unidade: existing.unit }) || (body.unit && !canReadUnit(context.user, "reunioes", body.unit))) return NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 });
    await deleteMeeting(context.accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: 400 });
  }
}
