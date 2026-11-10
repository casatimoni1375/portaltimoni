import { getAccessTokenFromRefreshToken } from "@/lib/google-calendar";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import type { PortalUser } from "@/lib/access-control";
import { loadPortalConfiguration } from "@/lib/portal-config";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPREADSHEET_ID = "1cESMTRx98e6AbY5vxPCcT7VrqYAbgH0xGUk87ybqHUo";

type Seller = { nome: string; unidade: string };
type Responsible = { email: string; name: string; unit: string };
type Configuration = Awaited<ReturnType<typeof loadPortalConfiguration>>;
type Fonte = "planilha" | "cadastro" | "indisponivel";

// Nenhum nome de pessoa fica escrito aqui. A lista vem da aba Vendedores da planilha
// e, se ela não puder ser lida, do cadastro de colaboradores do Portal.

function dedupeSellers(vendedores: Seller[]) {
  const vistos = new Set<string>();
  return vendedores.filter((seller) => {
    const key = `${seller.nome.trim().toLowerCase()}-${seller.unidade.trim().toLowerCase()}`;
    if (!seller.nome.trim() || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function resposta(vendedores: Seller[], responsaveis: Responsible[], fonte: Fonte, actor: PortalUser) {
  return NextResponse.json(
    {
      ok: true,
      vendedores: dedupeSellers(vendedores).filter((v) => canReadUnit(actor, "motorista", v.unidade)),
      responsaveis: responsaveis.filter((v) => canReadUnit(actor, "motorista", v.unit)),
      fallback: fonte !== "planilha",
      fonte,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Tenta a conexão central do Portal e, se falhar, a conexão do próprio usuário logado.
async function comConexao<T>(userToken: string, run: (token: string) => Promise<T>): Promise<T> {
  const tokens: string[] = [];
  try {
    tokens.push(await getAccessTokenFromRefreshToken());
  } catch (error) {
    console.error("[Agenda Motorista] Conexão central do Portal indisponível.", error);
  }
  if (userToken) tokens.push(userToken);
  let ultimoErro: unknown = new Error("Nenhuma conexão Google disponível.");
  for (const token of tokens) {
    try {
      return await run(token);
    } catch (error) {
      ultimoErro = error;
      console.error("[Agenda Motorista] Falha ao ler dados do Google.", error);
    }
  }
  throw ultimoErro;
}

async function lerAbaVendedores(token: string): Promise<Seller[]> {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: "v4", auth: oauth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Vendedores!A:B",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = response.data.values ?? [];
  return rows
    .slice(1)
    .map((row) => ({ nome: String(row[0] ?? "").trim(), unidade: String(row[1] ?? "").trim().toLowerCase() }))
    .filter((item) => item.nome);
}

function vendedoresDoCadastro(configuration: Configuration): Seller[] {
  const lista: Seller[] = [];
  for (const colaborador of configuration.collaborators) {
    const nome = String(colaborador.name ?? "").trim();
    if (!nome || colaborador.active === false) continue;
    const unidades = colaborador.unit === "Araras" ? ["araras"] : colaborador.unit === "Rio Claro" ? ["rio_claro"] : ["rio_claro", "araras"];
    for (const unidade of unidades) lista.push({ nome, unidade });
  }
  return lista;
}

export async function GET() {
  const gate = await requireModuleAuthorization("motorista", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const { user: actor, accessToken: userToken } = gate.current;

  let configuration: Configuration | null = null;
  try {
    configuration = await comConexao(userToken, (token) => loadPortalConfiguration(token));
  } catch (error) {
    console.error("[Agenda Motorista] Falha ao ler o cadastro do Portal.", error);
  }

  const responsaveis: Responsible[] = actor.collaboratorAccess
    ? [{ email: actor.email, name: actor.name, unit: actor.unit || "" }]
    : (configuration?.users ?? [])
        .filter((user) => user.active !== false && user.readOnly !== true && user.modules.includes("motorista"))
        .map((user) => ({ email: user.email, name: user.name, unit: user.unit || "Geral" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  try {
    const vendedores = await comConexao(userToken, lerAbaVendedores);
    return resposta(vendedores, responsaveis, "planilha", actor);
  } catch (error) {
    console.error("[Agenda Motorista] Falha ao carregar a aba Vendedores; usando o cadastro de colaboradores.", error);
  }

  if (configuration) return resposta(vendedoresDoCadastro(configuration), responsaveis, "cadastro", actor);
  return resposta([], responsaveis, "indisponivel", actor);
}
