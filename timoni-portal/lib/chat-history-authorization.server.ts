import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "./authorization-server";
import { getAuthorizationProfile } from "./authorization";

export async function requireChatHistoryAdministrator() {
  const gate = await requireModuleAuthorization("chat", "visualizar");
  if (!gate.current) return gate;
  const profile = gate.current.user.collaboratorAccess?.profile ?? getAuthorizationProfile(gate.current.user);
  if (profile !== "administracao-cica") return { current: null, errorResponse: NextResponse.json({ error: "O histórico antigo está reservado à Ciça até a revisão dos destinatários." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) };
  return gate;
}
