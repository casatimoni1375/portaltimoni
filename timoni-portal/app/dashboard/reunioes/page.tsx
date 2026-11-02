import { auth } from "@/lib/auth";
import { canModuleOperation } from "@/lib/module-authorization";
import ReunioesClient from "./reunioes-client";

const GESTAO_EMAILS = new Set(["mcrodini@gmail.com", "mrodini@gmail.com"]);

export default async function ReunioesPage() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() || "";
  return (
    <div className="pb-10">
      <ReunioesClient
        isGestao={GESTAO_EMAILS.has(email)}
        canManage={canModuleOperation(session?.portalUser, "reunioes", "editar")}
        canCreate={canModuleOperation(session?.portalUser, "reunioes", "criar")}
        canDelete={canModuleOperation(session?.portalUser, "reunioes", "excluir")}
      />
    </div>
  );
}
