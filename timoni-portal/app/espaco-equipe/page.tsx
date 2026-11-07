import { MANAGEMENT_EMAILS as MANAGEMENT_IDENTITIES, isCicaAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import EspacoEquipeForm from "@/app/colaboradores/espaco-equipe-form";
import EspacoEquipeInbox from "@/app/colaboradores/espaco-equipe-inbox";

const GESTAO_EMAILS = MANAGEMENT_IDENTITIES;

export default async function EspacoEquipePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email.trim().toLowerCase();
  const isGestao = GESTAO_EMAILS.has(email);
  const canDelete = isCicaAccess(email);

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader email={email} portalUser={session.portalUser} />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {isGestao ? (
          <EspacoEquipeInbox accessToken={session.accessToken} canDelete={canDelete} />
        ) : (
          <EspacoEquipeForm />
        )}
      </main>
    </div>
  );
}
