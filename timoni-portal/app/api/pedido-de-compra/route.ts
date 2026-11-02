import { auth } from "@/lib/auth";
import { getEffectivePortalUser } from "@/lib/portal-config";
import { hasModuleAccess } from "@/lib/access-control";
import { readPurchaseOrdersSnapshot, savePurchaseOrdersSnapshot } from "@/lib/purchase-orders";
import { readSentPurchaseOrders } from "@/lib/purchase-orders-sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "Sessão expirada. Entre novamente no Portal." },
      { status: 401 },
    );
  }

  try {
    const portalUser = await getEffectivePortalUser(session.accessToken, session.user.email);
    if (!hasModuleAccess(session.user.email, "pedido-de-compra", portalUser)) {
      return NextResponse.json(
        { ok: false, error: "Acesso não autorizado a Pedidos de Compra." },
        { status: 403 },
      );
    }

    const snapshot = await readPurchaseOrdersSnapshot();
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    let pedidosEnviados = snapshot?.orders;
    let stale = false;

    if (!snapshot?.fresh || force) {
      const startedAt = new Date().toISOString();
      try {
        const orders = await readSentPurchaseOrders();
        await savePurchaseOrdersSnapshot(orders, startedAt);
        pedidosEnviados = orders;
      } catch (error) {
        if (!snapshot) throw error;
        stale = true;
      }
    }

    return NextResponse.json(
      { ok: true, pedidosEnviados, stale },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao carregar os pedidos." },
      { status: 502 },
    );
  }
}
