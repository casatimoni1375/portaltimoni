import { NextResponse } from "next/server";
import { requireChatHistoryAdministrator } from "@/lib/chat-history-authorization.server";
import { getCollaboratorChatStore } from "@/lib/collaborator-chat-store.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const gate = await requireChatHistoryAdministrator();
  if (!gate.current) return gate.errorResponse;
  const params = new URL(request.url).searchParams, conversation = params.get("conversation"), before = params.get("before");
  for (const id of [conversation, before]) if (id !== null && (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807"))) return NextResponse.json({ error: "Página inválida." }, { status: 400, headers });
  try { return NextResponse.json(await getCollaboratorChatStore().history(conversation, before), { headers }); }
  catch { return NextResponse.json({ error: "Histórico temporariamente indisponível. Tente novamente." }, { status: 503, headers: { ...headers, "Retry-After": "15" } }); }
}
export async function POST() { return NextResponse.json({ error: "Histórico somente para consulta." }, { status: 405, headers: { ...headers, Allow: "GET" } }); }
export const PATCH = POST;
export const DELETE = POST;
