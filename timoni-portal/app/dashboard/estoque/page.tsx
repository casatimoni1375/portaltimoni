import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canReadUnit, canStockOperation } from "@/lib/module-authorization";
import { getAuthorizationProfile } from "@/lib/authorization";
import EstoqueClient from "./estoque-client";

export const metadata: Metadata = { title: "Estoque" };
export default async function EstoquePage() {
  const gate = await requireModuleAuthorization("estoque", "visualizar");
  if (!gate.current) redirect("/login?error=AccessDenied");
  const user = gate.current.user;
  const units = ["rio_claro", "araras"] as const;
  const allowedUnits = units.filter(unit => canReadUnit(user, "estoque", unit));
  const profile = user.collaboratorAccess?.profile ?? getAuthorizationProfile(user);
  const target = user.unit === "Araras" ? "Araras" : "Rio Claro";
  return <EstoqueClient
    isManager={["administracao-cica", "administracao-marcelo", "estoque-rio-claro", "estoque-araras"].includes(profile)}
    canDelete={canStockOperation(user, "excluir", target)}
    canEdit={canStockOperation(user, "editar", target)}
    canRespond={canModuleOperation(user, "estoque", "editar")}
    showRequestForm={canModuleOperation(user, "estoque", "criar")}
    showManagerResponseField={profile !== "administracao-cica"}
    defaultUnit={allowedUnits[0] || "rio_claro"} allowedUnits={allowedUnits}
  />;
}
