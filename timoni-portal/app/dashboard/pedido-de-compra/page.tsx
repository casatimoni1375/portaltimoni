import type { Metadata } from "next";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import { redirect } from "next/navigation";
import PedidoCompraClient from "./pedido-compra-client";

export const metadata: Metadata = { title: "Pedidos de Compra" };
type RequestUnit = "rio_claro" | "araras";

export default async function PedidoCompraPage() {
  const gate = await requireModuleAuthorization("pedido-de-compra", "visualizar");
  if (!gate.current) redirect("/login?error=AccessDenied");
  const units: RequestUnit[] = ["rio_claro", "araras"];
  const visibleUnits = units.filter(unit => canReadUnit(gate.current.user, "pedido-de-compra", unit));
  return <PedidoCompraClient visibleUnits={visibleUnits} />;
}
