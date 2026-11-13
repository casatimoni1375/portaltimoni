"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {useSearchParams} from "next/navigation";
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
  const query=useSearchParams();
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

  useEffect(()=>{const id=query.get("pedido");if(id){const order=sentOrders.find(item=>item.id===id);if(order)setSelected(order);}},[query,sentOrders]);
  const visibleOrders=sentOrders.filter(order=>(!query.get("unidade")||query.get("unidade")==="todas"||order.unidade===query.get("unidade"))&&(query.get("filtro")!=="atrasados"||(order.previsaoEntrega&&order.previsaoEntrega.slice(0,10)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())))).sort((a,b)=>(a.previsaoEntrega||"9999").localeCompare(b.previsaoEntrega||"9999"));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isLate = (order: SentOrder) => Boolean(order.previsaoEntrega) && order.previsaoEntrega.slice(0, 10) < todayKey;
  return (
    <section className="ct-clean-card">
      <div className="ct-clean-card-heading">
        <h2>Pedidos em andamento</h2>
        <button type="button" onClick={() => void request.current?.run({ urgent: true, force: true })} disabled={loading} className="ct-clean-action">Atualizar lista</button>
      </div>
      {error && <p role="alert" className="ct-notice-error">{error}</p>}
      {!loading && exceptions.length > 0 && (
        <div className="ct-clean-exceptions">
          <strong>Pedidos que exigem atenção</strong>
          {exceptions.map((item) => (
            <div key={`${item.id}-${item.tipo}`}>
              <button type="button" onClick={() => setSelected(item)} className="ct-link-button">{item.nome} · {unitLabel(item.unidade)}</button>
              <small className="text-red-700">{item.tipo === "atrasado" ? `Entrega prevista em ${dateOnly(item.previsaoEntrega)} — atrasada.` : "Sem previsão de entrega informada."}</small>
            </div>
          ))}
        </div>
      )}
      {visibleUnits.map((currentUnit) => {
        const orders = visibleOrders.filter((order) => order.unidade === currentUnit);
        return (
          <div key={currentUnit}>
            <h3 className="ct-notice-scope">{unitLabel(currentUnit)} · {orders.length}</h3>
            {orders.map((order) => (
              <div key={order.id} className="ct-clean-action-row">
                <strong className="ct-clean-order-name">{order.nome}</strong>
                <small>Enviado: {dateOnly(order.enviadoEm)}</small>
                <small className={isLate(order) ? "font-semibold text-red-700" : undefined}>Entrega: {dateOnly(order.previsaoEntrega)}{isLate(order) ? " · atrasado" : ""}</small>
              </div>
            ))}
            {!loading && !orders.length && <p className="ct-clean-muted">Nenhum pedido em andamento.</p>}
            {loading && <p className="ct-clean-muted">Atualizando...</p>}
          </div>
        );
      })}
      {selected && <PedidoDetalhes key={selected.id} id={selected.id} name={selected.nome} onClose={() => setSelected(null)} />}
    </section>
  );
}
