import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import type { PortalUser } from "@/lib/access-control";
import { loadPortalConfiguration } from "@/lib/portal-config";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getPortalCentralIntegrationToken } from "@/lib/collaborator-auth.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPREADSHEET_ID = "1cESMTRx98e6AbY5vxPCcT7VrqYAbgH0xGUk87ybqHUo";

type Seller = { nome: string; unidade: string };
type Responsible = { email: string; name: string; unit: string };

const fixedSellers: Seller[] = [
  { nome: "Ciça", unidade: "araras" },
  { nome: "Marcelo", unidade: "araras" },
];

// Fallback sincronizado com a aba Vendedores em 14/08/2026.
// A leitura da planilha continua sendo a fonte principal; esta lista evita
// que o formulário fique vazio se o token Google do usuário estiver temporariamente indisponível.
const fallbackSellers: Seller[] = [
  { nome: "Adriel", unidade: "rio_claro" },
  { nome: "Carina", unidade: "rio_claro" },
  { nome: "Ciça", unidade: "rio_claro" },
  { nome: "Davi", unidade: "rio_claro" },
  { nome: "Jaqueline", unidade: "rio_claro" },
  { nome: "Jeovana", unidade: "rio_claro" },
  { nome: "João", unidade: "rio_claro" },
  { nome: "José Roberto", unidade: "rio_claro" },
  { nome: "Marcelo", unidade: "rio_claro" },
  { nome: "Raffaela", unidade: "rio_claro" },
  { nome: "San", unidade: "rio_claro" },
  { nome: "Yan", unidade: "araras" },
  { nome: "Lyra", unidade: "araras" },
  { nome: "Carolina", unidade: "araras" },
  { nome: "Paulo", unidade: "araras" },
  { nome: "Reginaldo", unidade: "araras" },
  { nome: "Reinaldo", unidade: "araras" },
  ...fixedSellers,
];

function dedupeSellers(vendedores: Seller[]) {
  const vistos = new Set<string>();
  return vendedores.filter((seller) => {
    const key = `${seller.nome.trim().toLowerCase()}-${seller.unidade.trim().toLowerCase()}`;
    if (!seller.nome.trim() || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function resposta(vendedores: Seller[], responsaveis: Responsible[], fallback = false, actor: PortalUser) {
  return NextResponse.json(
    { ok: true, vendedores: dedupeSellers(vendedores).filter(v => canReadUnit(actor, "motorista", v.unidade)), responsaveis: responsaveis.filter(v => canReadUnit(actor, "motorista", v.unit)), fallback },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const gate = await requireModuleAuthorization("motorista", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const { user: actor } = gate.current;
  try {
    const accessToken = actor.collaboratorAccess ? await getPortalCentralIntegrationToken() : gate.current.accessToken;
    const configuration = actor.collaboratorAccess ? null : await loadPortalConfiguration(accessToken);
    const responsaveis: Responsible[] = actor.collaboratorAccess ? [{ email: actor.email, name: actor.name, unit: actor.unit || "" }] : configuration!.users
      .filter((user) => user.active !== false && user.readOnly !== true && user.modules.includes("motorista"))
      .map((user) => ({ email: user.email, name: user.name, unit: user.unit || "Geral" }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth: oauth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Vendedores!A:B",
      valueRenderOption: "FORMATTED_VALUE",
    });

    const rows = response.data.values ?? [];
    const vendedores: Seller[] = rows
      .slice(1)
      .map((row) => ({ nome: String(row[0] ?? "").trim(), unidade: String(row[1] ?? "").trim().toLowerCase() }))
      .filter((item) => item.nome);

    return resposta([...vendedores, ...fixedSellers], responsaveis, false, actor);
  } catch (error) {
    console.error("[Agenda Motorista] Falha ao carregar vendedores; usando fallback.", error);
    return resposta(fallbackSellers, [], true, actor);
  }
}
