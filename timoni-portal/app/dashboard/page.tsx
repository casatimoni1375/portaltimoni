import { redirect } from "next/navigation";
import { getPortalSession as auth } from "@/lib/portal-session";
import { hasModuleAccess, isBoxVisible, type PortalModule } from "@/lib/access-control";
import type { PortalIconName } from "@/components/portal-icon";
import DashboardOverview from "@/components/dashboard-overview";
import PortalPanel from "@/components/portal-panel";
import MotoristaPage from "./motorista/page";

type Tile = { module: PortalModule; label: string; description: string; href: string; icon: PortalIconName };
const tiles: Tile[] = [
  { module: "compras", label: "Compras", description: "Fornecedores e pedidos", href: "/dashboard/compras", icon: "cart" },
  { module: "pedido-de-compra", label: "Pedidos de Compra", description: "Acompanhamento de pedidos", href: "/dashboard/pedido-de-compra", icon: "document" },
  { module: "conferencia", label: "Conferência", description: "Conferência de pedidos", href: "/dashboard/conferencia-pedidos", icon: "document" },
  { module: "estoque", label: "Estoque", description: "Consultar estoque", href: "/dashboard/estoque", icon: "stock" },
  { module: "estoque-rotativo", label: "Rotativo", description: "Conferências do estoque", href: "/dashboard/estoque-rotativo", icon: "stock" },
  { module: "motorista", label: "Motorista", description: "Agenda e entregas", href: "/dashboard/motorista", icon: "truck" },
  { module: "agenda", label: "Agenda Ciça", description: "Compromissos", href: "/agenda", icon: "calendar" },
  { module: "agenda-ct", label: "Agenda CT", description: "Compromissos da equipe", href: "/agenda-ct", icon: "calendar" },
  { module: "reunioes", label: "Reuniões", description: "Reuniões agendadas", href: "/dashboard/reunioes", icon: "meetings" },
  { module: "leads", label: "Leads", description: "Acompanhamento existente", href: "/dashboard/leads", icon: "leads" },
  { module: "painel", label: "Equipe", description: "Avisos e comunicação", href: "/colaboradores", icon: "team" },
  { module: "marketing", label: "Marketing", description: "Atividades de marketing", href: "/dashboard/marketing", icon: "leads" },
  { module: "financeiro", label: "Financeiro", description: "Atividades financeiras", href: "/dashboard/financeiro", icon: "document" },
];

export default async function DashboardPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  if (!email) redirect("/login");
  const authorized = tiles.filter(tile => hasModuleAccess(email, tile.module, session?.portalUser));
  if (!authorized.length) redirect("/login?error=AccessDenied");
  const visible = authorized.filter(tile => isBoxVisible(email, tile.module, session?.portalUser));
  if (email.trim().toLowerCase() === "caixarctimoni@gmail.com") {
    return <div className="space-y-6">
      {hasModuleAccess(email, "painel", session?.portalUser) && <PortalPanel embedded />}
      {hasModuleAccess(email, "motorista", session?.portalUser) && <MotoristaPage />}
    </div>;
  }
  return <><DashboardOverview tiles={visible} />{hasModuleAccess(email, "painel", session?.portalUser) && <PortalPanel embedded />}</>;
}
