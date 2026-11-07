import { MANAGEMENT_EMAILS as MANAGEMENT_IDENTITIES } from "@/lib/access-control";
import { Suspense } from "react";
import { getPortalSession as auth } from "@/lib/portal-session";
import { redirect } from "next/navigation";
import StoreSwitcher from "./store-switcher";
import PortalHeader from "@/components/portal-header";
import Link from "next/link";
import { canCollaboratorAction, resolveCollaboratorAccess } from "@/lib/collaborator-access";

const STORE_SWITCHER_EMAILS = MANAGEMENT_IDENTITIES;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.collaboratorSubject) {
    if (session.error === "SessionTemporarilyUnavailable") return <main className="p-6"><p role="alert">Conexão temporariamente indisponível. Atualize esta página em instantes.</p></main>;
    const access = resolveCollaboratorAccess(session.collaboratorSubject.collaboratorId, session.collaboratorAccess ?? null);
    if (!access || session.error) redirect("/login");
    const motorista = canCollaboratorAction(access, "motorista", "visualizar");
    const pedidos = canCollaboratorAction(access, "pedido-de-compra", "visualizar");
    const reunioes = canCollaboratorAction(access, "reunioes", "visualizar");
    const estoque = canCollaboratorAction(access, "estoque", "visualizar");
    const chat = canCollaboratorAction(access, "chat", "visualizar");
    if (!motorista && !pedidos && !reunioes && !estoque && !chat) redirect("/acesso/inicio");
    return <div className="min-h-screen bg-slate-50">
      <header className="border-b border-blue-950/50 bg-[#14038D] px-4 py-4 text-white">
        <nav aria-label="Menu do acesso individual" className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <Link href="/acesso/inicio" className="font-semibold">Meus acessos</Link>
          {motorista && <Link href="/dashboard/motorista">Motorista</Link>}
          {motorista && <Link href="/motorista">Consulta do motorista</Link>}
          {pedidos && <Link href="/dashboard/pedido-de-compra">Pedidos de Compra</Link>}
          {reunioes && <Link href="/dashboard/reunioes">Reuniões</Link>}
          {estoque && <Link href="/dashboard/estoque">Estoque</Link>}
          {chat && <Link href="/dashboard/chat">Chat</Link>}
          <span className="text-sm sm:ml-auto">{access.name} · {access.unit}</span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">{children}</main>
    </div>;
  }

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email.trim().toLowerCase();
  const showStoreSwitcher = STORE_SWITCHER_EMAILS.has(email);

  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={<><div aria-busy="true" aria-label="Carregando menu" className="fixed inset-x-0 top-0 z-[90] h-16 bg-[#0F2D8F] sm:h-12" /><div aria-hidden="true" className="h-16 sm:h-12" /></>}><PortalHeader email={email} portalUser={session.portalUser} /></Suspense>

      {showStoreSwitcher && <StoreSwitcher />}

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
