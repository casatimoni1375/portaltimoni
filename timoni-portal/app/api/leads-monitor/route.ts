import { NextResponse } from "next/server";
import { hasLeadsMonitorAccess } from "@/lib/leads-monitor-access";
import { getAccessTokenFromRefreshToken } from "@/lib/google-calendar";
import { getLeadsWorkspace } from "@/lib/leads-workspace.server";
import { buildLeadDigest, deadline, isActive } from "@/lib/leads-workflow";

export const dynamic = "force-dynamic";
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET(request: Request) {
  if (!hasLeadsMonitorAccess(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: responseHeaders });
  const location = new URL(request.url).searchParams.get("location") ?? "rc";
  if (location !== "rc" && location !== "ara") return NextResponse.json({ error: "Unidade inválida." }, { status: 400, headers: responseHeaders });
  try {
    const token = await getAccessTokenFromRefreshToken();
    const workspace = await getLeadsWorkspace(token, location, false);
    const active = workspace.items.filter(isActive);
    const prospects = active.filter(item => item.etapa === "A contatar");
    const items = active.map(item => ({
      id: item.id,
      empresa: item.empresa,
      responsavel: item.responsavel,
      etapa: item.etapa,
      vencimento: item.proximoContato || null,
      status: deadline(item, workspace.today),
      lista: item.etapa === "A contatar" ? "A PROSPECTAR" : "FOLLOW UP",
      proximaAcao: item.proximaAcao || "Definir o próximo contato.",
    }));
    return NextResponse.json({
      fonte: "Portal Timoni — Leads", location, geradoEm: new Date().toISOString(),
      resumo: {
        atrasados: items.filter(item => item.status === "atrasado").length,
        hoje: items.filter(item => item.status === "hoje").length,
        semData: items.filter(item => item.status === "sem-data").length,
        followUp: active.length - prospects.length, aProspectar: prospects.length,
      },
      porResponsavel: buildLeadDigest(active, location, workspace.today), items,
    }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os dados de Leads." }, { status: 503, headers: responseHeaders });
  }
}
