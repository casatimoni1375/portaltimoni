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
// Empresa da compra pelo final do nome do pedido (CT, ROD/RODINI ou MCR).
function companyOf(name: string): { label: string; tone: "ct" | "rod" | "mcr" } | null {
  const end = name.trim().toUpperCase().replace(/[^A-Z]+$/, "").slice(-8);
  if (/(^|[^A-Z])CT$/.test(end) || end.endsWith(" CT")) return { label: "Casa Timoni", tone: "ct" };
  if (/(ROD|RODINI)$/.test(end)) return { label: "Rodini", tone: "rod" };
  if (/MCR$/.test(end)) return { label: "MCR", tone: "mcr" };
  return null;
}
function shortDate(value: string) { const full = dateOnly(value); return /^\d{2}\/\d{2}\/\d{4}$/.test(full) ? full.slice(0, 5) : full; }
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
  const [mobileUnit, setMobileUnit] = useState<"todas" | RequestUnit>("todas");
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
  const orderTone = (_order: SentOrder) => "border-[#e1e6f0]";
  const lateCount = visibleOrders.filter(isLate).length;
  // Rio Claro à esquerda, Araras à direita (desktop, 18/11).
  const columnUnits = (["rio_claro", "araras"] as const).filter((unit) => visibleUnits.includes(unit));
  return (
    <section className="ct-compras-tab ct-clean-card">
      <div className="ct-clean-card-heading">
        <h2>Pedidos enviados</h2>
        <button type="button" onClick={() => void request.current?.run({ urgent: true, force: true })} disabled={loading} className="ct-clean-action">Atualizar lista</button>
      </div>
      {error && <p role="alert" className="ct-notice-error">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md max-md:!hidden">
        <div className="ct-sent-count rounded-xl border border-[#102a83]/40 bg-white px-4 py-3">
          <p className="text-base max-md:text-[12.5px] text-slate-600">Enviados</p>
          <strong className="ct-clean-counter text-[#102a83]">{visibleOrders.length}</strong>
        </div>
        <div className="ct-sent-count rounded-xl border border-[#b12532]/40 bg-white px-4 py-3">
          <p className="text-base max-md:text-[12.5px] text-slate-600">Atrasados</p>
          <strong className="ct-clean-counter text-[#b12532]">{lateCount}</strong>
        </div>
      </div>
      {/* Celular (18/11): duas colunas — Enviados no prazo à esquerda, Atrasados à direita — com etiquetas de loja e empresa e filtro discreto de loja. */}
      <div className="ct-sent-mobile md:hidden">
        {visibleUnits.length > 1 && <select className="ct-sent-mobile-filter" aria-label="Filtrar por loja" value={mobileUnit} onChange={event => setMobileUnit(event.target.value as "todas" | RequestUnit)}>
          <option value="todas">Todas as lojas</option>
          {visibleUnits.map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
        </select>}
        {(() => {
          const pool = visibleOrders.filter(order => mobileUnit === "todas" || order.unidade === mobileUnit);
          const late = pool.filter(isLate);
          const onTime = pool.filter(order => !isLate(order));
          const card = (order: SentOrder, lateCard: boolean) => { const company = companyOf(order.nome); return (
            <button type="button" key={order.id} onClick={() => setSelected(order)} className={`ct-sent-card${lateCard ? " is-late" : ""}`}>
              <b>{order.nome}</b>
              <span className="ct-sent-tags">
                <span className="ct-sent-tag is-store">{unitLabel(order.unidade)}</span>
                {company && <span className={`ct-sent-tag is-${company.tone}`}>{company.label}</span>}
                {lateCard ? <span className="ct-sent-tag is-late">Atrasado</span> : !order.previsaoEntrega ? <span className="ct-sent-tag is-nodate">Sem data</span> : null}
              </span>
              <small>Envio {shortDate(order.enviadoEm)} · Entrega {order.previsaoEntrega ? shortDate(order.previsaoEntrega) : "sem data"}</small>
            </button>
          ); };
          return <div className="ct-sent-cols">
            <div><h3>Enviados · {onTime.length}</h3>{onTime.map(order => card(order, false))}{!loading && !onTime.length && <p className="ct-sent-empty">Nenhum pedido.</p>}</div>
            <div><h3 className="is-late">Atrasados · {late.length}</h3>{late.map(order => card(order, true))}{!loading && !late.length && <p className="ct-sent-empty">Nenhum atrasado.</p>}</div>
          </div>;
        })()}
        {loading && <p className="ct-sent-empty">Atualizando...</p>}
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2 max-md:!hidden">
        {columnUnits.map((currentUnit) => {
          const orders = visibleOrders.filter((order) => order.unidade === currentUnit);
          return (
            <div key={currentUnit} className="min-w-0">
              <h3 className="ct-notice-scope text-lg max-md:text-[14px]">{unitLabel(currentUnit)} · {orders.length}</h3>
              <div className="mt-2 grid gap-2">
                {orders.map((order) => (
                  <div key={order.id} className={`ct-row flex items-start justify-between gap-3 rounded-xl border bg-white px-3 py-3 ${orderTone(order)}`}>
                    <div className="min-w-0">
                      <strong className="block break-words text-lg max-md:text-[14px] text-[#182443]">{order.nome}</strong>
                      <small className="block text-base max-md:text-[12.5px] text-slate-500 md:hidden">Enviado: {dateOnly(order.enviadoEm)}</small>
                      <small className="block text-base max-md:text-[12.5px] text-slate-500 md:hidden">Data prevista: {order.previsaoEntrega ? dateOnly(order.previsaoEntrega) : "Sem data"}</small>
                      <small className="ct-row-line2 hidden md:block">Enviado {dateOnly(order.enviadoEm)} · previsto {order.previsaoEntrega ? dateOnly(order.previsaoEntrega) : "sem data"}</small>
                    </div>
                    {isLate(order) ? <span className="ct-notice-stamp ct-stamp-late shrink-0">Atrasado</span> : !order.previsaoEntrega ? <span className="ct-notice-stamp ct-stamp-nodate shrink-0">Sem data</span> : null}
                  </div>
                ))}
              </div>
              {!loading && !orders.length && <p className="mt-2 text-base max-md:text-[12.5px] text-slate-500">Nenhum pedido enviado.</p>}
              {loading && <p className="mt-2 text-base max-md:text-[12.5px] text-slate-500">Atualizando...</p>}
            </div>
          );
        })}
      </div>
      {selected && <PedidoDetalhes key={selected.id} id={selected.id} name={selected.nome} onClose={() => setSelected(null)} />}
    </section>
  );
}
