import { getAccessTokenFromRefreshToken } from "@/lib/google-calendar";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import type { PortalUser } from "@/lib/access-control";
import { loadPortalConfiguration } from "@/lib/portal-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Seller = { nome: string; unidade: string };
type Responsible = { email: string; name: string; unit: string };
type Configuration = Awaited<ReturnType<typeof loadPortalConfiguration>>;

// Vendedores = colaboradores ativos cadastrados em Configurações, a mesma base das permissões.
// A aba Vendedores da planilha não é mais usada: ela tinha nomes que não batiam com o cadastro.

function dedupeSellers(vendedores: Seller[]) {
  const vistos = new Set<string>();
  return vendedores.filter((seller) => {
    const key = `${seller.nome.trim().toLowerCase()}-${seller.unidade.trim().toLowerCase()}`;
    if (!seller.nome.trim() || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function resposta(vendedores: Seller[], responsaveis: Responsible[], disponivel: boolean, actor: PortalUser) {
  return NextResponse.json(
    {
      ok: true,
      vendedores: dedupeSellers(vendedores).filter((v) => canReadUnit(actor, "motorista", v.unidade)),
      responsaveis: responsaveis.filter((v) => canReadUnit(actor, "motorista", v.unit)),
      fonte: disponivel ? "cadastro" : "indisponivel",
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
      console.error("[Agenda Motorista] Falha ao ler o cadastro do Portal.", error);
    }
  }
  throw ultimoErro;
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

  if (!configuration) return resposta([], responsaveis, false, actor);
  return resposta(vendedoresDoCadastro(configuration), responsaveis, true, actor);
}
