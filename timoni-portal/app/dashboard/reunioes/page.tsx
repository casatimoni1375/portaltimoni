import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canReadUnit } from "@/lib/module-authorization";
import { redirect } from "next/navigation";
import ReunioesClient from "./reunioes-client";

export default async function ReunioesPage() {
  const gate = await requireModuleAuthorization("reunioes", "visualizar");
  if (!gate.current) redirect("/login?error=AccessDenied");
  const units = ["Araras", "Rio Claro"] as const;
  return <div className="ct-modern-workspace pb-10"><ReunioesClient
    allowedUnits={units.filter(unit => canReadUnit(gate.current.user, "reunioes", unit))}
    canManage={canModuleOperation(gate.current.user, "reunioes", "editar")}
    canCreate={canModuleOperation(gate.current.user, "reunioes", "criar")}
    canDelete={canModuleOperation(gate.current.user, "reunioes", "excluir")}
  /></div>;
}
