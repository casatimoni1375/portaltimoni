"use client";

import { useState } from "react";
import Link from "next/link";
import PortalIcon, { type PortalIconName } from "@/components/portal-icon";

type Tile = { href: string; label: string; description: string; icon: PortalIconName };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function DashboardOverview({ tiles }: { tiles: Tile[] }) {
  const [search, setSearch] = useState("");
  const query = normalize(search.trim());
  const filtered = tiles.filter(tile => normalize(`${tile.label} ${tile.description}`).includes(query));
  return <div className="ct-modern-shell pb-10">
    <div className="ct-overview-search"><label htmlFor="ct-module-search">Buscar módulo</label><input id="ct-module-search" type="search" placeholder="Compras, pedidos, estoque ou agenda…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <section className="ct-overview-banner"><div><h1>O que precisa da sua atenção hoje</h1><p>Acompanhe pedidos, próximos horários e solicitações da equipe.</p></div><a className="ct-yellow-button" href="#ct-overview-modules">Ver acompanhamento ↓</a></section>
    <p role="status" className="mb-4 text-sm text-slate-600">{filtered.length} módulos disponíveis no seu acesso</p>
    {!tiles.length && <p className="ct-overview-empty">Seus módulos continuam disponíveis no menu.</p>}
    {!!tiles.length && !filtered.length && <p className="ct-overview-empty">Nenhum módulo encontrado para esta busca.</p>}
    <nav id="ct-overview-modules" className="ct-overview-modules" aria-label="Acesso rápido">
      {filtered.map(tile => <Link href={tile.href} key={tile.href} className="ct-overview-module"><PortalIcon name={tile.icon} className="mb-4 h-7 w-7 text-[#14038D]" /><h2>{tile.label}</h2><p>{tile.description}</p><span className="mt-5 inline-block text-sm font-semibold text-[#14038D]">Abrir acompanhamento →</span></Link>)}
    </nav>
  </div>;
}
