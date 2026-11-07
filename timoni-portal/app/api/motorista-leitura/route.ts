import { NextResponse } from "next/server";
export { GET } from "../agenda-motorista/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  return NextResponse.json({ ok: false, erro: "Acesso somente leitura." }, { status: 405, headers: { Allow: "GET" } });
}
