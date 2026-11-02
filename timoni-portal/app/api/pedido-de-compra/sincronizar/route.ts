import { readSentPurchaseOrders } from "@/lib/purchase-orders-sync";
import { readPurchaseOrdersSnapshot, savePurchaseOrdersSnapshot } from "@/lib/purchase-orders";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const startedAt = new Date().toISOString();
    const before = await readPurchaseOrdersSnapshot();
    const orders = await readSentPurchaseOrders();
    const { changed } = await savePurchaseOrdersSnapshot(orders, startedAt);
    return NextResponse.json({
      ok: true,
      changed,
      total: orders.length,
      previousTotal: before?.orders.length ?? 0,
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao sincronizar pedidos." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
