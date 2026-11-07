import { canReadUnit } from "@/lib/module-authorization";
import { NextResponse } from "next/server";
import { getPortalSession as auth } from "@/lib/portal-session";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { getPortalCentralIntegrationToken } from "@/lib/collaborator-auth.server";
import { hasModuleAccess } from "@/lib/access-control";
import { listStockAlerts } from "@/lib/estoque-alerts";
import { canReceiveStockNotice, pendingStockIds, pendingStockIdsForUser } from "@/lib/stock-notice-reads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() || "";
  const headers = {"Cache-Control":"private, no-store"};
  if (session?.collaboratorSubject) {
    const gate = await requireModuleAuthorization("estoque", "visualizar");
    if (!gate.current) return gate.errorResponse;
    const profile = gate.current.user.collaboratorAccess?.profile;
    if (profile !== "administracao-cica" && profile !== "estoque-rio-claro") return NextResponse.json({ ok: true, ids: [] }, { headers });
    try {
      const token = await getPortalCentralIntegrationToken();
      const needs = await listStockAlerts(token);
      const visible = needs.filter(item => canReadUnit(gate.current.user, "estoque", item.unidadeOriginal ?? item.unidade));
      return NextResponse.json({ ok: true, ids: pendingStockIdsForUser(gate.current.user, visible) }, { headers });
    } catch { return NextResponse.json({ ok: false }, { status: 503, headers: { ...headers, "Retry-After": "15" } }); }
  }
  if (!session || !hasModuleAccess(email, "estoque", session.portalUser) || !canReceiveStockNotice(email)) return NextResponse.json({ok:true, ids:[]}, {headers});
  try {
    const needs = await listStockAlerts(session.accessToken);
    return NextResponse.json({ok:true, ids:pendingStockIds(email, needs.filter(item => session.portalUser && canReadUnit(session.portalUser, "estoque", item.unidade)))}, {headers});
  } catch {
    return NextResponse.json({ok:false}, {status:503,headers});
  }
}
