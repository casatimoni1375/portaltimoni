import { normalizedText, segmentKey, positivePage } from "@/lib/block-one-utils";
import { canModuleOperation } from "@/lib/module-authorization";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessLeadsLocation, canViewBothLeadsLocations, hasModuleAccess, resolveLeadsLocation } from "@/lib/access-control";
import { addLead, addProspect, createLeadsReport, importLeads, listLeadActivities, listLeads, listProspects, moveLeadToProspects, reactivateProspect, updateLeadFollowUp } from "@/lib/leads";
import { recordModuleUpdateSafely } from "@/lib/module-updates";

function writeLocation(context: { email: string; portalUser?: import("@/lib/access-control").PortalUser | null }, value: unknown) {
  if (value !== undefined && value !== "ara" && value !== "rc") return null;
  const requested = value === "ara" ? "ara" : "rc";
  if (value !== undefined && !canAccessLeadsLocation(context.email, requested, context.portalUser)) return null;
  return resolveLeadsLocation(context.email, requested, context.portalUser);
}

async function authorizedContext() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  if (!hasModuleAccess(email, "leads", session?.portalUser)) return null;
  if (!session?.accessToken) return null;
  return { accessToken: session.accessToken, email, portalUser: session.portalUser };
}

export async function GET(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Sessão Google sem acesso à planilha. Entre novamente no Portal." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const location = resolveLeadsLocation(context.email, params.get("location"), context.portalUser);
    const summaryOnly = params.get("summary") === "1";
    if (summaryOnly) {
      const leads = await listLeads(context.accessToken, location);
      const atrasados = leads.filter((x) => x.status === "atrasado").length;
      const hoje = leads.filter((x) => x.status === "hoje").length;
      return NextResponse.json(
        { summary: { pendentes: atrasados + hoje }, location, canViewBothLocations: canViewBothLeadsLocations(context.email) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [leads, prospects, activities] = await Promise.all([listLeads(context.accessToken, location), listProspects(context.accessToken, location), params.get("purpose") === "report" ? listLeadActivities(context.accessToken, location) : Promise.resolve([])]);
    const atrasados = leads.filter((x) => x.status === "atrasado").length;
    const hoje = leads.filter((x) => x.status === "hoje").length;
    const semData = leads.filter((x) => x.status === "sem-data").length;
    const summary = { atrasados, hoje, semData, pendentes: atrasados + hoje, prospectar: prospects.length };
    if (params.get("purpose") === "report") return NextResponse.json({ leads, prospects, activities, location, canViewBothLocations: canViewBothLeadsLocations(context.email), summary }, { headers: { "Cache-Control": "private, no-store" } });
    const variants = new Map<string, Set<string>>();
    for (const item of [...leads, ...prospects]) {
      if (item.segmento) { const key = segmentKey(item.segmento); const values = variants.get(key) || new Set<string>(); values.add(item.segmento); variants.set(key, values); }
    }
    const status = params.get("status") || "pendentes", segment = params.get("segment") || "";
    const query = normalizedText(params.get("q") || ""), company = normalizedText(params.get("company") || "");
    const selectedLeads = leads.filter(item => (status === "todos" || (status === "pendentes" ? item.status === "hoje" || item.status === "atrasado" : item.status === status)) && (!segment || item.segmento === segment) && (!query || normalizedText(`${item.cliente} ${item.segmento} ${item.contato} ${item.canal} ${item.observacoes}`).includes(query)));
    const selectedProspects = prospects.filter(item => (!company || normalizedText(item.cliente).includes(company)) && (!query || normalizedText(`${item.cliente} ${item.segmento} ${item.cidade} ${item.oportunidade} ${item.observacoes}`).includes(query)));
    const pageSize = 25, leadPages = Math.max(1, Math.ceil(selectedLeads.length / pageSize)), prospectPages = Math.max(1, Math.ceil(selectedProspects.length / pageSize));
    const page = Math.min(positivePage(params.get("page")), leadPages), prospectPage = Math.min(positivePage(params.get("prospectPage")), prospectPages);
    return NextResponse.json({
      leads: selectedLeads.slice((page - 1) * pageSize, page * pageSize), prospects: selectedProspects.slice((prospectPage - 1) * pageSize, prospectPage * pageSize), activities: [],
      location, canViewBothLocations: canViewBothLeadsLocations(context.email), summary,
      segments: [...new Set(leads.map(item => item.segmento).filter(Boolean))].sort(),
      duplicateSegments: [...variants.values()].filter(values => values.size > 1).map(values => [...values]),
      // Só nomes para a conferência de importação; detalhes completos são carregados sob demanda.
      existingClients: [...new Set([...leads, ...prospects].map(item => item.cliente.trim().toLocaleLowerCase("pt-BR")))],
      pagination: { page, prospectPage, pageSize, leadPages, prospectPages, leadTotal: selectedLeads.length, prospectTotal: selectedProspects.length },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os leads." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Sessão Google sem acesso à planilha. Entre novamente no Portal." }, { status: 401 });
  try {
    const body = await request.json();
    const location = writeLocation(context, body?.location);
    if (!location) return NextResponse.json({ error: "Acesso permitido somente à unidade vinculada a este usuário." }, { status: 403 });
    if (!canModuleOperation(context.portalUser, "leads", (["reativar", "mover_para_prospectar"].includes(String(body?.action)) ? "editar" : "criar"), { unidade: location === "ara" ? "Araras" : "Rio Claro" })) return NextResponse.json({ error: "Ação não permitida nesta unidade." }, { status: 403 });
    if (body?.action === "gerar_relatorio") {
      const result = await createLeadsReport({
        startDate: String(body?.startDate ?? "").trim(),
        endDate: String(body?.endDate ?? "").trim(),
      }, context.accessToken, location);
      return NextResponse.json({ ok: true, ...result });
    }
    if (body?.action === "reativar") {
      await reactivateProspect({
        id: String(body?.id ?? ""),
        cliente: String(body?.cliente ?? "").trim(),
        segmento: String(body?.segmento ?? "").trim(),
        contato: String(body?.contato ?? "").trim(),
        canal: String(body?.canal ?? "").trim(),
        proximoContato: String(body?.proximoContato ?? "").trim(),
        observacoes: String(body?.observacoes ?? "").trim(),
      }, context.accessToken, location);
      await recordModuleUpdateSafely("leads", context.email, "Cliente reativado no Follow Up.");
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "mover_para_prospectar") {
      await moveLeadToProspects({ row: Number(body?.row) }, context.accessToken, location);
      await recordModuleUpdateSafely("leads", context.email, "Cliente transferido para A Prospectar.");
      return NextResponse.json({ ok: true });
    }
    const destino = String(body?.destino ?? "prospectar");
    const common = {
      cliente: String(body?.cliente ?? "").trim(),
      segmento: String(body?.segmento ?? "").trim(),
      contato: String(body?.contato ?? "").trim(),
      canal: String(body?.canal ?? "").trim(),
      observacoes: String(body?.observacoes ?? "").trim(),
    };
    if (destino === "followup") {
      await addLead({ ...common, proximoContato: String(body?.proximoContato ?? "").trim() }, context.accessToken, location);
    } else {
      await addProspect({ ...common, cidade: String(body?.cidade ?? "").trim(), oportunidade: String(body?.oportunidade ?? "").trim() }, context.accessToken, location);
    }
    await recordModuleUpdateSafely("leads", context.email, `Cliente cadastrado: ${common.cliente || "sem nome"}.`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Sessão Google sem acesso à planilha. Entre novamente no Portal." }, { status: 401 });
  try {
    const body = await request.json();
    const location = writeLocation(context, body?.location);
    if (!location) return NextResponse.json({ error: "Acesso permitido somente à unidade vinculada a este usuário." }, { status: 403 });
    if (!canModuleOperation(context.portalUser, "leads", "editar", { unidade: location === "ara" ? "Araras" : "Rio Claro" })) return NextResponse.json({ error: "Ação não permitida nesta unidade." }, { status: 403 });
    const row = Number(body?.row);
    const cliente = String(body?.cliente ?? "").trim();
    const segmento = String(body?.segmento ?? "").trim();
    const contato = String(body?.contato ?? "").trim();
    const canal = String(body?.canal ?? "").trim();
    const ultimoContato = String(body?.ultimoContato ?? "").trim();
    const proximoContato = String(body?.proximoContato ?? "").trim();
    const observacoes = String(body?.observacoes ?? "").trim();
    if (!proximoContato) return NextResponse.json({ error: "Informe a data do próximo contato." }, { status: 400 });
    await updateLeadFollowUp({ row, cliente, segmento, contato, canal, ultimoContato, proximoContato, observacoes }, context.accessToken, location);
    await recordModuleUpdateSafely("leads", context.email, `Follow Up atualizado: ${cliente || "cliente"}.`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o follow-up." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Sessão Google sem acesso à planilha. Entre novamente no Portal." }, { status: 401 });
  try {
    const body = await request.json();
    const location = writeLocation(context, body?.location);
    if (!location) return NextResponse.json({ error: "Acesso permitido somente à unidade vinculada a este usuário." }, { status: 403 });
    if (!canModuleOperation(context.portalUser, "leads", "criar", { unidade: location === "ara" ? "Araras" : "Rio Claro" })) return NextResponse.json({ error: "Ação não permitida nesta unidade." }, { status: 403 });
    const result = await importLeads(body?.rows, context.accessToken, location);
    await recordModuleUpdateSafely("leads", context.email, "Lista de Leads importada.");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível importar o arquivo." }, { status: 400 });
  }
}
