import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canReadUnit } from "@/lib/module-authorization";
import { NextRequest, NextResponse } from "next/server";
import { redactMotoristaResponse } from "@/lib/motorista-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbwy9QfpEbdGtTIiC2OFuZAUx0jIPFsXPLZKedfGp79VJ6mlzLYus_wjI2IvFPoeE6Pc/exec";
const MAX_DAYS = 14;
const REQUEST_TIMEOUT_MS = 12_000;

function periodoValido(inicio: string, quantidade: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;

  const [ano, mes, dia] = inicio.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    base.getUTCFullYear() !== ano ||
    base.getUTCMonth() !== mes - 1 ||
    base.getUTCDate() !== dia
  ) {
    return null;
  }

  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(base);
    data.setUTCDate(data.getUTCDate() + indice);
    return data.toISOString().slice(0, 10);
  });
}

async function buscarDia(webAppUrl: string, data: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(webAppUrl);
    const token = process.env.MOTORISTA_API_TOKEN?.trim();
    if (!token) throw new Error("Conexão da agenda não configurada.");
    url.searchParams.set("token", token);
    url.searchParams.set("action", "dia");
    url.searchParams.set("data", data);

    const resposta = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!resposta.ok) {
      throw new Error(`Agenda respondeu com status ${resposta.status}.`);
    }

    const dados = redactMotoristaResponse(await resposta.json(), token) as { ok?: boolean; viagens?: unknown; erro?: string } | null;

    if (!dados || dados.ok !== true) {
      throw new Error(dados?.erro || "Resposta inválida da agenda.");
    }

    if (!Array.isArray(dados.viagens) || dados.viagens.some(v => !v || typeof v !== "object" || Array.isArray(v))) throw new Error("Resposta inválida da agenda.");
    return dados.viagens;
  } finally {
    clearTimeout(timeout);
  }
}

function mensagemErro(erro: unknown) {
  if (erro instanceof Error && erro.name === "AbortError") {
    return "A agenda demorou demais para responder.";
  }

  if (erro instanceof Error && erro.message) return String(redactMotoristaResponse(erro.message, process.env.MOTORISTA_API_TOKEN?.trim() || ""));
  return "Não foi possível carregar este dia.";
}

export async function GET(request: NextRequest) {
  const gate = await requireModuleAuthorization("motorista", "visualizar");
  if (!gate.current) return gate.errorResponse;
  const inicio = request.nextUrl.searchParams.get("inicio") || "";
  const quantidadeInformada = Number(request.nextUrl.searchParams.get("dias") || "7");
  const quantidade = Number.isInteger(quantidadeInformada)
    ? Math.min(Math.max(quantidadeInformada, 1), MAX_DAYS)
    : 7;
  const datas = periodoValido(inicio, quantidade);

  if (!datas) {
    return NextResponse.json(
      { error: "Período inválido. Use uma data no formato AAAA-MM-DD." },
      { status: 400 },
    );
  }

  const webAppUrl = process.env.MOTORISTA_WEBAPP_URL?.trim() || DEFAULT_WEBAPP_URL;
  const resultados: PromiseSettledResult<Awaited<ReturnType<typeof buscarDia>>>[] = [];
  const started = Date.now();
  for (const data of datas) {
    if (Date.now() - started > 12_000) {
      resultados.push({ status: "rejected", reason: new Error("Consulta parcial. Atualize novamente para consultar os dias restantes.") });
      continue;
    }
    try { resultados.push({ status: "fulfilled", value: await buscarDia(webAppUrl, data) }); }
    catch (reason) { resultados.push({ status: "rejected", reason }); }
  }

  const dias = resultados.map((resultado, indice) => {
    if (resultado.status === "fulfilled") {
      return { data: datas[indice], viagens: resultado.value.filter((v: { loja?: string }) => canReadUnit(gate.current.user, "motorista", v.loja)) };
    }

    return {
      data: datas[indice],
      viagens: [],
      erro: mensagemErro(resultado.reason),
    };
  });

  const falhas = dias.filter((dia) => "erro" in dia).length;

  if (falhas === dias.length) {
    return NextResponse.json(
      {
        error:
          dias[0] && "erro" in dias[0]
            ? dias[0].erro
            : "Não foi possível carregar a agenda.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { ok: true, dias, parcial: falhas > 0 },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
