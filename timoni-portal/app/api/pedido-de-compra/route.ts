import { canReadUnit } from "@/lib/module-authorization";
import { requireModuleAuthorization } from "@/lib/authorization-server";
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

function dateKeyInSaoPaulo(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getExceptions(orders: PurchaseOrder[]): PurchaseException[] {
  const todayKey = dateKeyInSaoPaulo(new Date());
  const exceptions: PurchaseException[] = [];

  for (const order of orders) {
    if (!order.previsaoEntrega) {
      exceptions.push({ id: order.id, nome: order.nome, unidade: order.unidade, tipo: "sem_previsao", previsaoEntrega: "" });
      continue;
    }

    const due = new Date(order.previsaoEntrega);
    if (!Number.isNaN(due.getTime()) && dateKeyInSaoPaulo(due) < todayKey) {
      exceptions.push({ id: order.id, nome: order.nome, unidade: order.unidade, tipo: "atrasado", previsaoEntrega: order.previsaoEntrega });
    }
  }

  return exceptions;
}

export async function GET(request: Request) {
  const gate = await requireModuleAuthorization("pedido-de-compra", "visualizar");
  if (!gate.current) return gate.errorResponse;

  try {
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

    const orders = (pedidosEnviados || []).filter(order => canReadUnit(gate.current.user, "pedido-de-compra", order.unidade));
    return NextResponse.json(
      { ok: true, pedidosEnviados: orders.map(({ id, nome, enviadoEm, previsaoEntrega, unidade }) => ({ id, nome, enviadoEm, previsaoEntrega, unidade })), excecoes: getExceptions(orders), syncedAt, stale },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao carregar os pedidos." },
      { status: 502 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Pedidos de Compra é somente leitura." }, { status: 405, headers: { Allow: "GET" } });
}
