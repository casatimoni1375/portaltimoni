"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createScreenRequest, ScreenRequestError } from "@/lib/screen-request";

const PedidoDetalhes = dynamic(() => import("./pedido-detalhes"), { ssr: false });

type RequestUnit = "rio_claro" | "araras";
type SentOrder = { id: string; nome: string; enviadoEm: string; previsaoEntrega: string; unidade: RequestUnit };
type PurchaseException = { id: string; nome: string; unidade: RequestUnit; tipo: "sem_previsao" | "atrasado"; previsaoEntrega: string };
function unitLabel(unit: RequestUnit) { return unit === "araras" ? "Araras" : "Rio Claro"; }
function dateOnly(value: string) {
  if (!value) return "Sem data";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export default function PedidoCompraClient({ visibleUnits }: { visibleUnits: RequestUnit[] }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sentOrders, setSentOrders] = useState<SentOrder[]>([]);
  const [exceptions, setExceptions] = useState<PurchaseException[]>([]);
  const [selected, setSelected] = useState<{ id: string; nome: string } | null>(null);
  const request = useRef<{ run: (options?: { urgent?: boolean; force?: boolean }) => Promise<void> } | null>(null);
  const unitKey = visibleUnits.join("|");
  useEffect(() => {
    setSentOrders([]); setExceptions([]); setSelected(null);
    if (!navigator.onLine) { setLoading(false); setError("Sem conexão. A lista será consultada quando a rede voltar."); }
    const units = unitKey.split("|");
    const loader = createScreenRequest({
      load: async (signal, force) => {
        const response = await fetch(`/api/pedido-de-compra${force ? "?refresh=1" : ""}`, { cache: "no-store", signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new ScreenRequestError(payload.error || "Falha ao carregar", response.status);
        return payload as { pedidosEnviados?: SentOrder[]; excecoes?: PurchaseException[]; stale?: boolean };
      },
      onData: payload => {
        const orders = (payload.pedidosEnviados || []).filter(item => units.includes(item.unidade));
        setSentOrders(orders);
        setExceptions((payload.excecoes || []).filter(item => units.includes(item.unidade)));
        setSelected(current => current && orders.some(item => item.id === current.id) ? current : null);
        setError(payload.stale ? "Exibindo a última cópia salva. Não foi possível atualizar a lista agora." : "");
      },
      onError: error => {
        setError(error instanceof Error ? error.message : "Falha ao carregar");
        if (error instanceof ScreenRequestError && [401, 403].includes(error.status)) {
          setSentOrders([]); setExceptions([]); setSelected(null);
        }
      },
      onBusy: busy => { setLoading(busy); },
    });
    request.current = loader;
    let dirty = false;
    const check = (urgent = false) => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        const shouldRefresh = urgent || dirty;
        dirty = false;
        void loader.run({ urgent: shouldRefresh });
      }
    };
    check();
    const timer = window.setInterval(() => check(), 60000);
    const onVisible = () => check();
    const onOnline = () => check(true);
    const onStorage = (event: StorageEvent) => { if (event.key === "timoni_pedido_compra_updated") { dirty = true; check(); } };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => { loader.dispose(); request.current = null; window.clearInterval(timer); window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onVisible); window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); };
  }, [unitKey]);

  return (
    <div className="ct-modern-workspace pb-10 space-y-5">
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>}
      {!loading && exceptions.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Exceções</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Pedidos que exigem atenção</h2>
          <div className="mt-3 divide-y divide-amber-200">
            {exceptions.map((item) => (
              <div key={`${item.id}-${item.tipo}`} className="py-3 text-sm">
                <button type="button" onClick={() => setSelected(item)} className="min-h-11 text-left font-semibold text-[#14038D] underline decoration-slate-300 underline-offset-4">{item.nome} · {unitLabel(item.unidade)}</button>
                <p className="mt-1 text-slate-600">{item.tipo === "atrasado" ? `Entrega prevista em ${dateOnly(item.previsaoEntrega)} — atrasada.` : "Sem previsão de entrega informada."}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Acompanhamento</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Pedidos enviados</h2>
          </div>
          <button type="button" onClick={() => void request.current?.run({ urgent: true, force: true })} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">Atualizar lista</button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {visibleUnits.map((currentUnit) => {
            const orders = sentOrders.filter((order) => order.unidade === currentUnit);
            return (
              <div key={currentUnit} className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                  <h3 className="font-semibold text-slate-950">{unitLabel(currentUnit)}</h3>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{orders.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <article key={order.id} className="px-4 py-3">
                      <button type="button" onClick={() => setSelected(order)} aria-label={`Ver itens do pedido ${order.nome}`} className="min-h-11 text-left font-semibold text-[#14038D] underline decoration-slate-300 underline-offset-4">{order.nome}</button>
                      <p className="mt-1 text-sm text-slate-500">Enviado: {dateOnly(order.enviadoEm)} · Entrega: {dateOnly(order.previsaoEntrega)}</p>
                    </article>
                  ))}
                  {!loading && !orders.length && <p className="px-4 py-5 text-sm text-slate-500">Nenhum pedido enviado.</p>}
                  {loading && <p className="px-4 py-5 text-sm text-slate-500">Atualizando...</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {selected && <PedidoDetalhes key={selected.id} id={selected.id} name={selected.nome} onClose={() => setSelected(null)} />}
    </div>
  );
}
