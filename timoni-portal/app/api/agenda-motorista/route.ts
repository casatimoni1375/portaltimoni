import { NextRequest, NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canReadUnit, normalizeMotoristaUnit } from "@/lib/module-authorization";
import { recordModuleUpdateSafely } from "@/lib/module-updates";
import { redactMotoristaResponse } from "@/lib/motorista-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbwy9QfpEbdGtTIiC2OFuZAUx0jIPFsXPLZKedfGp79VJ6mlzLYus_wjI2IvFPoeE6Pc/exec";
const REQUEST_TIMEOUT_MS = 30_000;

async function encaminhar(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const token = process.env.MOTORISTA_API_TOKEN?.trim();
    if (!token) return NextResponse.json({ ok: false, erro: "Conexão da agenda não configurada." }, { status: 503 });
    const target = new URL(url);
    const body = init.method === "POST" ? new URLSearchParams(String(init.body || "")) : null;
    if (body) body.set("token", token);
    else target.searchParams.set("token", token);
    const resposta = await fetch(target.toString(), {
      ...init,
      ...(body ? { body: body.toString() } : {}),
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });

    let data;
    try { data = await resposta.json(); }
    catch { return NextResponse.json({ ok: false, erro: "Resposta inválida da agenda." }, { status: 502 }); }
    return NextResponse.json(redactMotoristaResponse(data, token), {
      status: resposta.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (erro) {
    const mensagem =
      erro instanceof Error && erro.name === "AbortError"
        ? "A planilha demorou demais para responder."
        : "Não foi possível acessar a planilha.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}


function denied() { return NextResponse.json({ ok: false, erro: "Seu acesso não permite esta ação." }, { status: 403 }); }
function dayUrl(data: string) {
  const url = new URL(process.env.MOTORISTA_WEBAPP_URL?.trim() || DEFAULT_WEBAPP_URL);
  url.searchParams.set("action", "dia");
  url.searchParams.set("data", data);
  return url.toString();
}
export async function GET(request: NextRequest) {
  const gate = await requireModuleAuthorization("motorista", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const action = request.nextUrl.searchParams.get("action") || "dia";
  if (action !== "dia" && action !== "mes") return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  if (action === "mes") {
    if (gate.current.user.unit !== "Geral") return denied();
    const url = new URL(process.env.MOTORISTA_WEBAPP_URL?.trim() || DEFAULT_WEBAPP_URL);
    url.searchParams.set("action", "mes");
    const month = request.nextUrl.searchParams.get("mes") || "";
    const year = request.nextUrl.searchParams.get("ano") || month.split("-")[0];
    url.searchParams.set("ano", year);
    url.searchParams.set("mes", month.includes("-") ? month.split("-")[1] : month);
    return encaminhar(url.toString(), { method: "GET" });
  }
  const response = await encaminhar(dayUrl(request.nextUrl.searchParams.get("data") || ""), { method: "GET" });
  if (!response.ok) return response;
  try {
    const body = await response.json();
    if (body.ok !== true || !Array.isArray(body.viagens)) return NextResponse.json(body, { status: 502 });
    return NextResponse.json({ ...body, viagens: body.viagens.filter((v: { loja?: string }) => canReadUnit(gate.current.user, "motorista", v.loja)) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, erro: "Resposta inválida da agenda." }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  const body = new URLSearchParams(await request.text());
  const operation = body.get("action");
  const action = operation === "criar" ? "criar" : operation === "excluir" ? "excluir" : ["atualizar", "reordenar"].includes(operation || "") ? "editar" : null;
  if (!action) return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  const gate = await requireModuleAuthorization("motorista", action);
  if (!gate.current) return gate.errorResponse;
  const { user, email } = gate.current;
  let persistedAuthor = "";
  if (operation === "reordenar") {
    if (user.unit !== "Geral") return denied();
  } else if (operation !== "criar") {
    const data = body.get("dataOrigem") || body.get("data") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ ok: false, erro: "Informe a data original da viagem." }, { status: 400 });
    const response = await encaminhar(dayUrl(data), { method: "GET" });
    if (!response.ok) return response;
    let existing;
    try {
      const snapshot = await response.json();
      if (snapshot.ok !== true || !Array.isArray(snapshot.viagens)) throw Error("Resposta inválida");
      existing = snapshot.viagens.find((v: { id?: string }) => String(v.id) === body.get("id"));
    } catch { return NextResponse.json({ ok: false, erro: "Não foi possível conferir a viagem." }, { status: 502 }); }
    if (!existing) return NextResponse.json({ ok: false, erro: "Viagem não encontrada." }, { status: 404 });
    persistedAuthor = String(existing.preenchidoPor || "");
    const unidade = normalizeMotoristaUnit(existing.loja);
    if (!unidade || !canModuleOperation(user, "motorista", action, { unidade })) return denied();
  }
  if (operation === "criar" || body.has("loja")) {
    const unidade = normalizeMotoristaUnit(body.get("loja"));
    if (!unidade || unidade === "Geral" || !canModuleOperation(user, "motorista", action, { unidade })) return denied();
  }
  body.delete("dataOrigem");
  if (user.collaboratorAccess) {
    for (const field of ["collaboratorId", "actorId", "profile", "username"]) body.delete(field);
    if (operation === "criar") body.set("preenchidoPor", user.name);
    else if (operation === "atualizar") body.set("preenchidoPor", persistedAuthor);
  }
  const response = await encaminhar(process.env.MOTORISTA_WEBAPP_URL?.trim() || DEFAULT_WEBAPP_URL, { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } });
  if (response.ok) {
    try {
      const result = await response.clone().json();
      if (result.ok === true) {
        const reference = user.collaboratorAccess ? ` · ${String(result.viagem?.id || body.get("id") || body.get("data") || "")}` : "";
        await recordModuleUpdateSafely("motorista", email, "Agenda do motorista: " + operation + "." + reference);
      }
    } catch { /* Invalid upstream responses are not recorded as successful writes. */ }
  }
  return response;
}
