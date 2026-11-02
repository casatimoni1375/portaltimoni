import { neon } from "@neondatabase/serverless";
import { normalizeTrelloText } from "@/lib/trello";

export type PurchaseOrder = {
  id: string; nome: string; enviadoEm: string; previsaoEntrega: string;
  unidade: "rio_claro" | "araras";
  activityAt?: string;
};

function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  return neon(process.env.DATABASE_URL);
}
let ready: Promise<void> | null = null;
async function ensureSchema() {
  if (!ready) ready = (async () => {
    await database()`CREATE TABLE IF NOT EXISTS portal_purchase_orders_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      orders JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  })().catch((error) => { ready = null; throw error; });
  await ready;
}
export function normalizePurchaseOrders(orders: PurchaseOrder[]) {
  const timestamp = (order: PurchaseOrder) => {
    const sent = Date.parse(order.enviadoEm);
    if (Number.isFinite(sent)) return sent;
    const activity = Date.parse(order.activityAt || "");
    if (Number.isFinite(activity)) return activity;
    return /^[0-9a-f]{24}$/i.test(order.id) ? parseInt(order.id.slice(0, 8), 16) * 1000 : 0;
  };
  const unique = new Map<string, PurchaseOrder>();
  for (const order of [...orders].sort((a, b) => timestamp(b) - timestamp(a))) {
    const key = normalizeTrelloText(order.nome) + "|" + order.unidade;
    if (!unique.has(key)) unique.set(key, order);
  }
  return [...unique.values()];
}
function comparable(orders: PurchaseOrder[]) {
  return JSON.stringify(normalizePurchaseOrders(orders).map(({ activityAt: _activityAt, ...order }) => order));
}
export async function readPurchaseOrdersSnapshot() {
  await ensureSchema();
  const rows = await database()`SELECT orders, synced_at FROM portal_purchase_orders_snapshot WHERE id = 1`;
  if (!rows.length) return null;
  return {
    orders: normalizePurchaseOrders(Object.values(rows[0].orders) as PurchaseOrder[]),
    fresh: Date.now() - new Date(rows[0].synced_at || 0).getTime() < 60000,
    syncedAt: rows[0].synced_at ? new Date(rows[0].synced_at).toISOString() : null,
  };
}
export async function savePurchaseOrdersSnapshot(orders: PurchaseOrder[], startedAt: string) {
  await ensureSchema();
  const normalized = normalizePurchaseOrders(orders);
  const rows = await database()`SELECT orders FROM portal_purchase_orders_snapshot WHERE id = 1`;
  const current = rows.length ? normalizePurchaseOrders(Object.values(rows[0].orders) as PurchaseOrder[]) : [];
  const changed = comparable(current) !== comparable(normalized);
  const data = JSON.stringify(Object.fromEntries(normalized.map((order) => [order.id, order])));

  if (!rows.length) {
    await database()`INSERT INTO portal_purchase_orders_snapshot (id, orders, synced_at)
      VALUES (1, ${data}::jsonb, NOW())`;
    return { changed: true };
  }

  if (changed) {
    await database()`UPDATE portal_purchase_orders_snapshot
      SET orders = ${data}::jsonb, synced_at = NOW(), updated_at = NOW()
      WHERE id = 1 AND updated_at <= ${startedAt}::timestamptz`;
  } else {
    await database()`UPDATE portal_purchase_orders_snapshot SET synced_at = NOW() WHERE id = 1`;
  }
  return { changed };
}
export async function upsertPurchaseOrder(order: PurchaseOrder) {
  await ensureSchema();
  const data = JSON.stringify({ [order.id]: order });
  await database()`INSERT INTO portal_purchase_orders_snapshot (id, orders)
    VALUES (1, ${data}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      orders = portal_purchase_orders_snapshot.orders || EXCLUDED.orders, updated_at = NOW()`;
}
