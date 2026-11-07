import { redirect } from "next/navigation";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import type { Metadata } from "next";
import ConfigurarTrelloClient from "./ConfigurarTrelloClient";

export const metadata: Metadata = { title: "Configurar Trello" };

export default async function ConfigurarTrelloPage() {
  const gate = await requireModuleAuthorization("compras", "administrar");
  if (!gate.current) redirect("/dashboard/compras");
  return <ConfigurarTrelloClient />;
}
