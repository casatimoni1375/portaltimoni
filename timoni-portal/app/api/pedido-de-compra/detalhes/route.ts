import { requirePurchaseRead } from "@/lib/purchase-read-access";
import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import { readPurchaseOrdersSnapshot } from "@/lib/purchase-orders";
import { parsePurchaseOrderDescription } from "@/lib/purchase-order-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const gate = await requirePurchaseRead();
  if (!gate.current) return gate.errorResponse;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400, headers });
  try {
    // Abrir detalhes nunca consulta a origem externa nem atualiza o snapshot.
    const snapshot = await readPurchaseOrdersSnapshot();
    const order = snapshot?.orders.find(item => item.id === id);
    if (!order || !canReadUnit(gate.current.user, gate.resource, order.unidade)) {
      return NextResponse.json({ ok: false, error: "Pedido não encontrado para seu acesso." }, { status: 404, headers });
    }
    const description = order.descricao || "";
    return NextResponse.json({ ok: true, pedido: {
      id: order.id, nome: order.nome, enviadoEm: order.enviadoEm, previsaoEntrega: order.previsaoEntrega,
      descricaoOriginal: description, registradoEm: order.detalhesAtualizadosEm || null,
      ...parsePurchaseOrderDescription(description),
    } }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Não foi possível consultar os detalhes salvos. Tente novamente." }, { status: 503, headers: { ...headers, "Retry-After": "15" } });
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Acesso somente leitura." }, { status: 405, headers: { ...headers, Allow: "GET" } });
}
