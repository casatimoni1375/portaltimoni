import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canAccessLeadsLocation,
  canViewBothLeadsLocations,
  hasModuleAccess,
  resolveLeadsLocation,
} from "@/lib/access-control";
import { canModuleOperation } from "@/lib/module-authorization";
import {
  getLeadsWorkspace,
  saveLeadWorkspace,
} from "@/lib/leads-workspace.server";
import { buildLeadDigest, deadline } from "@/lib/leads-workflow";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email ?? "";
  if (
    !session?.accessToken ||
    !hasModuleAccess(email, "leads", session.portalUser)
  )
    return NextResponse.json(
      { error: "Entre novamente no Portal para acessar o Leads." },
      { status: 401, headers },
    );
  const param = new URL(request.url).searchParams.get("location");
  const requested =
    param ?? resolveLeadsLocation(email, undefined, session.portalUser);
  if (requested !== "rc" && requested !== "ara")
    return NextResponse.json(
      { error: "Unidade inválida." },
      { status: 400, headers },
    );
  if (!canAccessLeadsLocation(email, requested, session.portalUser))
    return NextResponse.json(
      { error: "Sem acesso a esta unidade." },
      { status: 403, headers },
    );
  try {
    const summaryOnly = new URL(request.url).searchParams.get("summary") === "1";
    const workspace = await getLeadsWorkspace(
      session.accessToken,
      resolveLeadsLocation(email, requested, session.portalUser),
      !summaryOnly,
    );
    const canEdit =
      session.portalUser?.readOnly !== true &&
      canModuleOperation(session.portalUser, "leads", "editar", {
        unidade: requested === "ara" ? "Araras" : "Rio Claro",
      });
    const canCreate =
      session.portalUser?.readOnly !== true &&
      canModuleOperation(session.portalUser, "leads", "criar", {
        unidade: requested === "ara" ? "Araras" : "Rio Claro",
      });
    const summary = {
      pendentes: workspace.items.filter((item) =>
        ["atrasado", "hoje", "sem-data"].includes(
          deadline(item, workspace.today),
        ),
      ).length,
    };
    if (summaryOnly) return NextResponse.json({ summary, location: requested }, { headers });
    return NextResponse.json(
      {
        ...workspace,
        summary,
        digest: buildLeadDigest(workspace.items, requested, workspace.today),
        canViewBothLocations: canViewBothLeadsLocations(email),
        canEdit,
        canCreate,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o acompanhamento. Tente atualizar." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email ?? "";
  if (
    !session?.accessToken ||
    !hasModuleAccess(email, "leads", session.portalUser)
  )
    return NextResponse.json(
      { error: "Entre novamente no Portal." },
      { status: 401, headers },
    );
  try {
    const body = await request.json();
    const unit = body.location;
    if (
      (unit !== "rc" && unit !== "ara") ||
      !canAccessLeadsLocation(email, unit, session.portalUser)
    )
      return NextResponse.json(
        { error: "Sem acesso a esta unidade." },
        { status: 403, headers },
      );
    if (
      session.portalUser?.readOnly === true ||
      !canModuleOperation(
        session.portalUser,
        "leads",
        body.kind === "cadastro" ? "criar" : "editar",
        { unidade: unit === "ara" ? "Araras" : "Rio Claro" },
      )
    )
      return NextResponse.json(
        { error: "Ação não permitida." },
        { status: 403, headers },
      );
    return NextResponse.json(
      await saveLeadWorkspace(session.accessToken, unit, email, body),
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível salvar.",
      },
      { status: 400, headers },
    );
  }
}
