import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { individualLoginEnabled } from "@/lib/collaborator-auth.server";
import { canCollaboratorAction } from "@/lib/collaborator-access";
import type { AuthorizationAction, AuthorizationResource } from "@/lib/authorization";
import Link from "next/link";

export const dynamic = "force-dynamic";

const modules: [AuthorizationResource, string][] = [["painel", "Painel"], ["agenda", "Agenda Ciça"], ["agenda-ct", "Agenda CT"], ["compras", "Compras"], ["pedido-de-compra", "Pedidos de Compra"], ["conferencia", "Conferência"], ["estoque", "Estoque"], ["estoque-rotativo", "Rotativo"], ["motorista", "Motorista"], ["reunioes", "Reuniões"], ["leads", "Leads"], ["marketing", "Marketing"], ["financeiro", "Financeiro"]];
const actions: [AuthorizationAction, string][] = [["visualizar", "Visualizar"], ["criar", "Criar"], ["editar", "Editar"], ["excluir", "Excluir"], ["administrar", "Administrar"]];

export default async function IndividualAccessPage() {
  if (!individualLoginEnabled()) redirect("/login");
  const session = await auth();
  if (session?.error === "SessionTemporarilyUnavailable") return <main className="mx-auto max-w-xl p-6"><p role="alert">Conexão temporariamente indisponível. Atualize esta página em instantes.</p></main>;
  const access = session?.collaboratorAccess;
  if (!access || session?.error) redirect("/login?error=CredentialsSignin");
  const allowed = modules.filter(([key]) => canCollaboratorAction(access, key, "visualizar"));
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
    <header className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm font-medium text-[#14038D]">Portal Timoni · Prévia do acesso individual</p>
      <h1 className="mt-2 text-2xl font-semibold">Olá, {access.name}</h1>
      <p className="mt-2 text-sm text-slate-600">Usuário: {access.username} · Unidade: {access.unit}</p>
    </header>
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Seus acessos</h2>
      <p className="mt-2 text-sm text-slate-600">Os módulos abaixo podem ser abertos nesta prévia, conforme suas permissões. Os outros módulos continuam em adaptação.</p>
      {canCollaboratorAction(access, "motorista", "visualizar") && <Link href="/dashboard/motorista" className="mt-4 inline-block rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Abrir Motorista</Link>}
      {canCollaboratorAction(access, "pedido-de-compra", "visualizar") && <Link href="/dashboard/pedido-de-compra" className="mt-4 inline-block rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Abrir Pedidos de Compra</Link>}
      {canCollaboratorAction(access, "reunioes", "visualizar") && <Link href="/dashboard/reunioes" className="mt-4 inline-block rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Abrir Reuniões</Link>}
      {canCollaboratorAction(access, "estoque", "visualizar") && <Link href="/dashboard/estoque" className="mt-4 inline-block rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Abrir Estoque</Link>}
      {canCollaboratorAction(access, "chat", "visualizar") && <Link href="/dashboard/chat" className="mt-4 inline-block rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Abrir Chat</Link>}
      <ul className="mt-5 divide-y divide-slate-200">{allowed.map(([key, label]) => <li key={key} className="py-3"><h3 className="font-medium">{label}</h3><p className="mt-1 text-sm text-slate-600">{actions.filter(([action]) => canCollaboratorAction(access, key, action)).map(([, label]) => label).join(" · ")}</p></li>)}</ul>
      {!allowed.length && <p className="mt-5 text-sm text-slate-600">Nenhum módulo liberado para este usuário.</p>}
    </section>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium">Sair do Portal</button></form>
  </main>;
}
