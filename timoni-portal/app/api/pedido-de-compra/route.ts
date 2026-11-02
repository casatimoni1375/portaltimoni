import { auth } from "@/lib/auth";
import { getEffectivePortalUser } from "@/lib/portal-config";
import { hasModuleAccess } from "@/lib/access-control";
import { readPurchaseOrdersSnapshot, savePurchaseOrdersSnapshot, type PurchaseOrder } from "@/lib/purchase-orders";
import { readSentPurchaseOrders } from "@/lib/purchase-orders-sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PurchaseException = {
  id: string;
  nome: string;
  unidade: PurchaseOrder["unidade"];
  tipo: "sem_previsao" | "atrasado";
  previsaoEntrega: string;
};

function getExceptions(orders: PurchaseOrder[]): PurchaseException[] {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const exceptions: PurchaseException[] = [];

  for (const order of orders) {
    if (!order.previsaoEntrega) {
      exceptions.push({ id: order.id, nome: order.nome, unidade: order.unidade, tipo: "sem_previsao", previsaoEntrega: "" });
      continue;
    }

    const due = Date.parse(order.previsaoEntrega);
    if (Number.isFinite(due) && due < startOfToday) {
      exceptions.push({ id: order.id, nome: order.nome, unidade: order.unidade, tipo: "atrasado", previsaoEntrega: order.previsaoEntrega });
    }
  }

  return exceptions;
}

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
    let syncedAt = snapshot?.syncedAt ?? null;
    let stale = false;

    if (!snapshot?.fresh || force) {
      const startedAt = new Date().toISOString();
      try {
        const orders = await readSentPurchaseOrders();
        await savePurchaseOrdersSnapshot(orders, startedAt);
        pedidosEnviados = orders;
        syncedAt = new Date().toISOString();
      } catch (error) {
        if (!snapshot) throw error;
        stale = true;
      }
    }

    const orders = pedidosEnviados || [];
    return NextResponse.json(
      { ok: true, pedidosEnviados: orders, excecoes: getExceptions(orders), syncedAt, stale },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao carregar os pedidos." },
      { status: 502 },
    );
  }
}
