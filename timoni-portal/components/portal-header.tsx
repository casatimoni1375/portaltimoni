import Image from "next/image";
import { Suspense } from "react";
import WeeklyPeopleHighlights, { WeeklyPeopleCards } from "@/components/weekly-people-highlights";
import { getPortalSession as auth } from "@/lib/portal-session";
import { hasModuleAccess, type PortalModule, type PortalUser } from "@/lib/access-control";
import Link from "next/link";
import ModuleUpdatesNav from "@/components/module-updates-nav";
import MobilePortalHeader from "@/components/mobile-portal-header";
import ChatButton from "@/components/chat-button";
import PortalNotifications from "@/components/portal-notifications";
import type { UpdateModule } from "@/lib/module-updates";
import type { PortalIconName } from "@/components/portal-icon";
import { can } from "@/lib/authorization";
import { getEffectivePortalUser } from "@/lib/portal-config";

const navItems: Array<{ href: string; label: string; module: PortalModule; updateModule?: UpdateModule; icon: PortalIconName; color: string; external?: boolean }> = [
  { href: "/agenda", label: "Agenda Ciça", module: "agenda", updateModule: "agenda", icon: "star", color: "text-cyan-700" },
  { href: "/agenda-ct", label: "Agenda CT", module: "agenda-ct", icon: "star", color: "text-cyan-700" },
  { href: "/dashboard/compras", label: "Compras", module: "compras", updateModule: "compras", icon: "cart", color: "text-orange-700" },
  { href: "/dashboard/pedido-de-compra", label: "Pedidos de Compra", module: "pedido-de-compra", icon: "cart", color: "text-orange-700" },
  { href: "/dashboard/conferencia-pedidos", label: "Conferência", module: "conferencia", updateModule: "conferencia", icon: "document", color: "text-rose-700" },
  { href: "/dashboard/estoque", label: "Estoque", module: "estoque", updateModule: "estoque", icon: "stock", color: "text-amber-700" },
  { href: "/dashboard/estoque-rotativo", label: "Rotativo", module: "estoque-rotativo", updateModule: "estoque-rotativo", icon: "stock", color: "text-yellow-700" },
  { href: "/dashboard/motorista", label: "Motorista", module: "motorista", updateModule: "motorista", icon: "truck", color: "text-blue-600" },
  { href: "/dashboard/reunioes", label: "Reuniões", module: "reunioes", updateModule: "reunioes", icon: "meetings", color: "text-indigo-800" },
  { href: "/dashboard/leads", label: "Leads", module: "leads", updateModule: "leads", icon: "leads", color: "text-cyan-800" },
  { href: "/espaco-equipe", label: "Equipe", module: "painel", updateModule: "espaco-equipe", icon: "team", color: "text-indigo-800" },
];

export default async function PortalHeader({ email }: { email: string; portalUser?: PortalUser | null }) {
  const session = await auth();
  const effectivePortalUser = await getEffectivePortalUser(session?.accessToken, email);
  const isManagement = can(effectivePortalUser, "configuracoes", "visualizar");
  const canViewUpdates = isManagement;
  const canUseChat = email.trim().toLowerCase() === "mcrodini@gmail.com" && hasModuleAccess(email, "chat", effectivePortalUser);
  const mobileVisible = (module: PortalModule) => module === "motorista" || module === "pedido-de-compra" || effectivePortalUser?.mobileModules === undefined || effectivePortalUser.mobileModules.includes(module);
  const allowedItems = navItems
    .filter((item) => hasModuleAccess(email, item.module, effectivePortalUser))
    .map((item) => ({ ...item, targetHref: item.href }));
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
  const sortedAllowedItems = [...allowedItems].sort(byLabel);
  const equipeItems = sortedAllowedItems.filter((item) => item.href === "/espaco-equipe");
  const otherItems = sortedAllowedItems.filter((item) => item.href !== "/espaco-equipe");
  const desktopItems = [...otherItems, ...equipeItems];
  const mobileItems = [
    ...otherItems.filter((item) => mobileVisible(item.module)),
    ...equipeItems.filter((item) => mobileVisible(item.module)),
    ...(isManagement ? [{ href: "/configuracoes", targetHref: "/configuracoes", label: "Configurações", module: "painel" as PortalModule, updateModule: undefined, icon: "settings" as PortalIconName, color: "text-slate-800" }] : []),
  ];
  const startHref = "/dashboard";
  const initials = email.trim().toLowerCase() === "mcrodini@gmail.com" ? "CR" : email.trim().toLowerCase() === "mrodini@gmail.com" ? "MR" : "CT";

  return <div className="ct-modern-shell">
    <aside className="ct-portal-sidebar" aria-label="Navegação do Portal">
      <Link href={startHref} className="ct-portal-brand" aria-label="Casa Timoni — início"><Image src="/logo-ct-oficial.png" alt="Logotipo oficial Casa Timoni" width={132} height={132} /></Link>
      <p className="ct-portal-sidebar-label">SEU PORTAL</p>
      <nav aria-label="Menu principal">
        <Link href={startHref} className="ct-portal-nav-link">Visão geral</Link>
        {hasModuleAccess(email, "painel", effectivePortalUser) && <>
          <Link href="/colaboradores" className="ct-portal-nav-link">Painel Timoni</Link>
          <a href="#ct-aniversarios" className="ct-portal-nav-link">Aniversários</a>
          <a href="#ct-ferias" className="ct-portal-nav-link">Férias</a>
        </>}
        <ModuleUpdatesNav items={desktopItems} canViewUpdates={canViewUpdates} linkClass="ct-portal-nav-link" />
        {isManagement && <Link href="/configuracoes" className="ct-portal-nav-link">Configurações</Link>}
      </nav>
      <div className="ct-portal-aside-footer"><strong>Tudo no seu lugar.</strong>Informações claras para cuidar de cada etapa do dia.</div>
    </aside>
    <header className="ct-portal-header">
      <MobilePortalHeader items={mobileItems} showUpdates={canViewUpdates} showGuide={isManagement} showChat={canUseChat && mobileVisible("chat")} initials={initials} />
      <div className="ct-portal-desktop-top">
        <Link href={startHref} className="ct-portal-crumb">Portal Timoni <span aria-hidden="true"> / </span><strong>Seu espaço de trabalho</strong></Link>
        <div className="ct-portal-profile">
          <span className="ct-portal-profile-name">{effectivePortalUser?.name || email}</span>
          <span className="ct-portal-avatar" aria-label={effectivePortalUser?.name || email}>{initials}</span>
          <PortalNotifications items={desktopItems} showUpdates={canViewUpdates} />
          {canUseChat && <ChatButton />}
          <Link href="/login" prefetch={false} title="Sair da tela mantendo a sessão" className="ct-portal-top-link">Sair</Link>
        </div>
      </div>
    </header>
    <div className="ct-portal-spacer" aria-hidden="true" />
    <div className="ct-portal-welcome">
      <p className="ct-portal-eyebrow">Casa Timoni · seu espaço de trabalho</p>
      <p className="ct-portal-greeting">Olá, {email.trim().toLowerCase() === "mcrodini@gmail.com" ? "Ciça" : effectivePortalUser?.name?.split(" ")[0] || "equipe"}.</p>
      <p className="ct-portal-subtitle">Compras, operação e equipe. As informações do seu dia em um só lugar.</p>
      {hasModuleAccess(email, "painel", effectivePortalUser) && <Suspense fallback={<WeeklyPeopleCards events={[]} unavailable />}><WeeklyPeopleHighlights accessToken={session?.error === "RefreshAccessTokenError" ? undefined : session?.accessToken} /></Suspense>}
    </div>
  </div>;
}
