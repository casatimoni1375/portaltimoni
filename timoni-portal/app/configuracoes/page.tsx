import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PortalHeader from "@/components/portal-header";
import ConfiguracoesClient from "./configuracoes-client";
import GuiaBackupClient from "./guia-backup-client";
import { can } from "@/lib/authorization";
import { getEffectivePortalUser } from "@/lib/portal-config";


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConfiguracoesPage() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() || "";
  const user = await getEffectivePortalUser(session?.accessToken, email);
  if (!can(user, "configuracoes", "visualizar")) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader email={email} portalUser={session?.portalUser} />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <GuiaBackupClient />
        <ConfiguracoesClient canAdministerPermissions={can(user, "configuracoes", "administrar", { operation: "permissoes" })} />
      </main>
    </div>
  );
}
