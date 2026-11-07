"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PurchaseOrderDetails } from "@/lib/purchase-order-details";

function dateLabel(value: string) {
  if (!value) return "Não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date);
}

export default function PedidoDetalhes({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [details, setDetails] = useState<PurchaseOrderDetails | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
    return () => { modal?.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDetails(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/pedido-de-compra/detalhes?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível abrir o pedido.");
        if (!controller.signal.aborted) setDetails(payload.pedido);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível abrir o pedido.");
      }
    })();
    return () => controller.abort();
  }, [id, attempt]);

  return <dialog ref={dialog} aria-labelledby={titleId} onClose={event => { if (!event.currentTarget.open) onClose(); }}
    className="fixed inset-0 m-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto bg-white p-0 text-slate-900 backdrop:bg-slate-950/50 sm:m-auto sm:h-auto sm:max-h-[85dvh] sm:w-[min(56rem,calc(100vw-3rem))] sm:rounded-2xl sm:shadow-xl">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
      <h2 id={titleId} className="break-words text-xl font-semibold text-[#14038D]">{details?.nome || name}</h2>
      <button type="button" autoFocus onClick={() => dialog.current?.close()} className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14038D]">Fechar</button>
    </header>
    <div className="space-y-5 p-5">
      {!details && !error && <p role="status">Carregando itens do pedido…</p>}
      {error && <div role="alert" className="space-y-3"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg bg-[#14038D] px-4 text-white">Tentar novamente</button></div>}
      {details && <>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Data de envio</dt><dd className="mt-1 font-medium">{dateLabel(details.enviadoEm)}</dd></div>
          <div><dt className="text-slate-500">Previsão de entrega</dt><dd className="mt-1 font-medium">{dateLabel(details.previsaoEntrega)}</dd></div>
        </dl>
        {details.itens.length > 0 ? <section aria-label="Itens do pedido">
          <p className="mb-3 text-sm font-medium">{details.itens.length} {details.itens.length === 1 ? "item identificado" : "itens identificados"}</p>
          {details.parcial && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O total informado é {details.totalInformado}. Confira a descrição registrada para ver todas as informações.</p>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
            <caption className="sr-only">Produtos e quantidades registrados neste pedido</caption>
            <thead className="bg-slate-50"><tr><th scope="col" className="px-3 py-3">Código</th><th scope="col" className="px-3 py-3">Produto</th><th scope="col" className="px-3 py-3 text-right">Quantidade</th></tr></thead>
            <tbody className="divide-y divide-slate-200">{details.itens.map((item, index) => <tr key={`${index}-${item.codigo}`}><td className="px-3 py-3 align-top">{item.codigo}</td><td className="min-w-40 break-words px-3 py-3">{item.produto}</td><td className="px-3 py-3 text-right align-top">{item.quantidade}</td></tr>)}</tbody>
          </table></div>
        </section> : <p className="rounded-lg bg-slate-50 p-4 text-sm">{details.descricaoOriginal ? "Os itens não estão em formato de tabela. Confira a descrição registrada abaixo." : "Os itens deste pedido ainda não estão disponíveis na cópia salva no Portal."}</p>}
        {details.descricaoOriginal && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-medium">Ver descrição registrada</summary><p className="mt-4 whitespace-pre-wrap break-words text-sm">{details.descricaoOriginal}</p></details>}
        <p className="text-xs text-slate-500">Informações da cópia salva no Portal{details.registradoEm ? ` em ${dateLabel(details.registradoEm)}` : ""}.</p>
      </>}
    </div>
  </dialog>;
}
