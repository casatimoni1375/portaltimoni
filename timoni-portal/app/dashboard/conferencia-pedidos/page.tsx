import type { Metadata } from "next";
import ConferenciaPedidosClient from "./ConferenciaPedidosClient";

export const metadata: Metadata = { title: "Conferência de Pedidos" };

export default function ConferenciaPedidosPage() {
  return (
    <div className="ct-modern-workspace pb-10">
      <header className="mb-4">
        <p className="text-xs max-md:text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">Conferência</p>
        <h1 className="mt-1.5 text-[28px] max-md:text-[20px] font-semibold tracking-tight text-slate-950 sm:text-[28px]">Conferência de Pedidos</h1>
      </header>
      <ConferenciaPedidosClient />
    </div>
  );
}
