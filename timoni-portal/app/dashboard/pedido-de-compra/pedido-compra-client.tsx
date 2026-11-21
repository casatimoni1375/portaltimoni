"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {useSearchParams} from "next/navigation";
import { createScreenRequest, ScreenRequestError } from "@/lib/screen-request";
import { companyOf } from "@/lib/empresa-pedido";

const PedidoDetalhes = dynamic(() => import("./pedido-detalhes"), { ssr: false });

type RequestUnit = "rio_claro" | "araras";
type SentOrder = { id: string; nome: string; enviadoEm: string; previsaoEntrega: string; unidade: RequestUnit };
type PurchaseException = { id: string; nome: string; unidade: RequestUnit; tipo: "sem_previsao" | "atrasado"; previsaoEntrega: string };
function unitLabel(unit: RequestUnit) { return unit === "araras" ? "Araras" : "Rio Claro"; }
// 19/11: datas curtas dd/mm/aa nas linhas dos pedidos ("10/11/26 - 19/11/26").
function yy(value: string | null | undefined) { if (!value) return "sem data"; const full = dateOnly(value); return /^\d{2}\/\d{2}\/\d{4}$/.test(full) ? `${full.slice(0, 6)}${full.slice(8)}` : full; }
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
  const [, setExceptions] = useState<PurchaseException[]>([]);
  const [selected, setSelected] = useState<{ id: string; nome: string } | null>(null);
  // 21/11 (Ciça): filtro por fornecedor digitado — só filtra o que já está na tela, sem consulta nova.
  const [busca, setBusca] = useState("");
  const norm = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const matches = (name: string) => !norm(busca) || norm(name).includes(norm(busca));
  const [mobileStatus, setMobileStatus] = useState<"todos" | "enviados" | "atrasados">("todos");
  // 18/11 (Ciça): todos os acessos de Compras veem três colunas — Enviados (no prazo) | Atrasados | Recebidos.
  const singleUnit = true;
  const multiUnit = (["rio_claro", "araras"] as const).filter((unit) => visibleUnits.includes(unit)).length > 1;
  const [received, setReceived] = useState<Array<{ id: string; nome: string; unidade: string | null; data: string | null }> | null>(null);
  useEffect(() => {
    if (!singleUnit) return;
    const controller = new AbortController();
    void fetch("/api/compras/recebidos?unidade=todas", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (response.ok) setReceived(data.orders || []); else setReceived([]); })
      .catch(() => { if (!controller.signal.aborted) setReceived([]); });
    return () => controller.abort();
  }, [singleUnit]);
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
  const visibleOrders=sentOrders.filter(order=>matches(order.nome)&&(!query.get("unidade")||query.get("unidade")==="todas"||order.unidade===query.get("unidade"))&&(query.get("filtro")!=="atrasados"||(order.previsaoEntrega&&order.previsaoEntrega.slice(0,10)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())))).sort((a,b)=>(a.previsaoEntrega||"9999").localeCompare(b.previsaoEntrega||"9999"));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isLate = (order: SentOrder) => Boolean(order.previsaoEntrega) && order.previsaoEntrega.slice(0, 10) < todayKey;
  const orderTone = (_order: SentOrder) => "border-[#e1e6f0]";
  const lateCount = visibleOrders.filter(isLate).length;
  // Rio Claro à esquerda, Araras à direita (desktop, 18/11).
  const columnUnits = (["rio_claro", "araras"] as const).filter((unit) => visibleUnits.includes(unit));
  return (
    <section className="ct-compras-tab ct-clean-card">
      <div className="ct-clean-card-heading">
        <h2>Pedidos de compra</h2>
        <div className="ct-sent-search ml-auto mr-2 flex items-center gap-1 rounded-lg border border-[#c9d8f0] bg-white px-2 max-md:mr-0 max-md:mt-2 max-md:w-full">
          <input type="search" value={busca} onChange={event => setBusca(event.target.value)} placeholder="Filtrar fornecedor" aria-label="Filtrar por fornecedor" className="w-56 bg-transparent py-1.5 text-[14px] text-[#182443] outline-none max-md:w-full" />
          {busca && <button type="button" onClick={() => setBusca("")} aria-label="Limpar filtro" className="px-1 text-slate-400 hover:text-slate-600">×</button>}
        </div>
        <button type="button" onClick={() => void request.current?.run({ urgent: true, force: true })} disabled={loading} className="ct-clean-action">Atualizar lista</button>
      </div>
      {error && <p role="alert" className="ct-notice-error">{error}</p>}
      <div className={`mt-3 grid grid-cols-2 gap-3 sm:max-w-md max-md:!hidden${singleUnit ? " !hidden" : ""}`}>
        <div className="ct-sent-count rounded-xl border border-[#102a83]/40 bg-white px-4 py-3">
          <p className="text-base max-md:text-[12.5px] text-slate-600">Enviados</p>
          <strong className="ct-clean-counter text-[#102a83]">{visibleOrders.length}</strong>
        </div>
        <div className="ct-sent-count is-late rounded-xl border border-[#b12532]/40 bg-white px-4 py-3">
          <p className="text-base max-md:text-[12.5px] text-slate-600">Atrasados</p>
          <strong className="ct-clean-counter text-[#b12532]">{lateCount}</strong>
        </div>
      </div>
      {/* 18/11: bloco "Pedidos que exigem atenção" retirado a pedido da Ciça; atrasados ficam no filtro. */}
      {/* Celular (18/11): duas colunas — Enviados no prazo à esquerda, Atrasados à direita — com etiquetas de loja e empresa e filtro discreto de loja. */}
      <div className="ct-sent-mobile md:hidden">
        <div className="ct-sent-mobile-filters">
          <select className="ct-sent-mobile-filter" aria-label="Filtrar enviados ou atrasados" value={mobileStatus} onChange={event => setMobileStatus(event.target.value as "todos" | "enviados" | "atrasados")}>
            <option value="todos">Enviados e atrasados</option>
            <option value="enviados">Só enviados</option>
            <option value="atrasados">Só atrasados</option>
          </select>
        </div>
        {(() => {
          const pool = visibleOrders;
          const late = pool.filter(isLate);
          const onTime = pool.filter(order => !isLate(order));
          const card = (order: SentOrder, lateCard: boolean) => { return (
            <button type="button" key={order.id} onClick={() => setSelected(order)} className={`ct-sent-card${lateCard ? " is-late" : ""}`}>
              <b>{order.nome}</b>
              <small>{yy(order.enviadoEm)} - {yy(order.previsaoEntrega)}</small>
            </button>
          ); };
          return <div className={`ct-sent-cols${mobileStatus !== "todos" ? " is-single" : ""}`}>
            {mobileStatus !== "atrasados" && <div><h3>Enviados · {onTime.length}</h3>{onTime.map(order => card(order, false))}{!loading && !onTime.length && <p className="ct-sent-empty">Nenhum pedido.</p>}</div>}
            {mobileStatus !== "enviados" && <div><h3 className="is-late">Atrasados · {late.length}</h3>{late.map(order => card(order, true))}{!loading && !late.length && <p className="ct-sent-empty">Nenhum atrasado.</p>}</div>}
          </div>;
        })()}
        {loading && <p className="ct-sent-empty">Atualizando...</p>}
      </div>
      {singleUnit && (() => {
        const mine = visibleOrders.filter((order) => columnUnits.some((unit) => unit === order.unidade));
        const late = mine.filter(isLate);
        const onTime = mine.filter((order) => !isLate(order));
        const chosen = query.get("unidade");
        const got = (received || []).filter((order) => matches(order.nome) && columnUnits.some((unit) => unit === order.unidade) && (!chosen || chosen === "todas" || order.unidade === chosen));
        const store = (_value: string | null) => "";
        // 18/11: etiquetas de cor da empresa (Casa Timoni verde, Rodini amarelo, MCR laranja) e da loja.
        const row = (key: string, name: string, line: string, onClick?: () => void, unidade?: string | null) => { const company = companyOf(name); return (
          <button type="button" key={key} onClick={onClick} className="ct-row ct-row-tagged block w-full rounded-xl border border-[#e1e6f0] bg-white px-3 py-2.5 text-left">
            <span className="flex items-start justify-between gap-2"><strong className="block min-w-0 break-words text-[16px] text-[#182443]">{name}</strong>
              <span className="ct-sent-tags shrink-0">{multiUnit && unidade && <span className="ct-sent-tag is-store">{unidade === "araras" ? "Araras" : "Rio Claro"}</span>}{company && <span className={`ct-sent-tag is-${company.tone}`}>{company.label}</span>}</span></span>
            <small className="ct-row-line2 block text-[14px] text-slate-500">{line}</small>
          </button>
        ); };
        const column = (title: string, count: string | number, tone: string, items: import("react").ReactNode, empty: boolean) => (
          <div className="min-w-0">
            <div className={`ct-sent-count rounded-xl border bg-white px-4 py-3 ${tone}`}><p className="text-base">{title}</p><strong className="ct-clean-counter">{count}</strong></div>
            <div className="mt-3 grid gap-2">{items}</div>
            {empty && <p className="mt-2 text-[14px] text-slate-500">Nenhum pedido.</p>}
          </div>
        );
        return (
          <div className="ct-sent-three mt-3 grid gap-5 md:grid-cols-3 max-md:!hidden">
            {column("Enviados", loading && !sentOrders.length ? "–" : onTime.length, "border-[#c9d8f0] text-[#102a83]", onTime.map((order) => row(order.id, order.nome, `${store(order.unidade)}Enviado ${dateOnly(order.enviadoEm)} · previsto ${order.previsaoEntrega ? dateOnly(order.previsaoEntrega) : "sem data"}`, () => setSelected(order), order.unidade)), !loading && !onTime.length)}
            {column("Atrasados", loading && !sentOrders.length ? "–" : late.length, "is-late border-[#f4b9bc] text-[#b12532]", late.map((order) => row(order.id, order.nome, `${store(order.unidade)}Previsto ${dateOnly(order.previsaoEntrega)} · enviado ${dateOnly(order.enviadoEm)}`, () => setSelected(order), order.unidade)), !loading && !late.length)}
            {column("Recebidos", received === null ? "–" : got.length, "border-[#c9d8f0] text-[#102a83]", got.map((order) => row(order.id, order.nome, `${store(order.unidade)}Recebido em ${order.data ? new Date(order.data).toLocaleDateString("pt-BR") : "data não informada"}`, undefined, order.unidade)), received !== null && !got.length)}
          </div>
        );
      })()}
      <div className={`mt-4 grid gap-5 md:grid-cols-2 max-md:!hidden${singleUnit ? " !hidden" : ""}`}>
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
