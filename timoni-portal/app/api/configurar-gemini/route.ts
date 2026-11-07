import { requireModuleAuthorization } from "@/lib/authorization-server";
import { getGeminiServerKey } from "@/lib/gemini-config.server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const gate = await requireModuleAuthorization("conferencia", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const configured = Boolean(getGeminiServerKey());
  return NextResponse.json({ configured, source: configured ? "server" : "none" }, { headers });
}

async function browserSetupDisabled() {
  const gate = await requireModuleAuthorization("conferencia", "administrar");
  if (!gate.current) return gate.errorResponse;
  return NextResponse.json({ code: "SERVER_CONFIGURATION_REQUIRED", error: "A configuração por navegador foi desativada. A administração deve configurar a integração central no servidor." }, { status: 410, headers });
}

// Não lê chaves enviadas pelo navegador, não valida externamente e não grava cookies.
export async function POST() { return browserSetupDisabled(); }
export async function DELETE() { return browserSetupDisabled(); }
