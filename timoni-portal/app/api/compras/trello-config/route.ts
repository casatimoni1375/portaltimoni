import { canModuleOperation } from "@/lib/module-authorization";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { auth } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/access-control";
import {
  clearStoredTrelloCredentials,
  getStoredTrelloCredentials,
  getSharedTrelloCredentials,
  persistTrelloCredentials,
  TRELLO_API_KEY,
  validateTrelloCredentials,
} from "@/lib/trello";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      response: NextResponse.json(
        { error: "Sessão expirada. Entre novamente no Portal." },
        { status: 401 },
      ),
      session: null,
    };
  }
  if (!hasModuleAccess(session.user.email, "compras", session.portalUser)) {
    return {
      response: NextResponse.json(
        { error: "Acesso não autorizado ao módulo Compras." },
        { status: 403 },
      ),
      session: null,
    };
  }
  return { response: null, session };
}

export async function GET() {
  const central = await requireModuleAuthorization("compras", "visualizar");
  if (!central.current) return central.errorResponse;
  const { response: unauthorized } = await authorize();
  if (unauthorized) return unauthorized;
  const credentials = await getSharedTrelloCredentials();
  const canConfigure = canModuleOperation(central.current.user, "compras", "administrar");
  const legacy = !credentials && canConfigure ? await getStoredTrelloCredentials() : null;
  return NextResponse.json(
    { configured: Boolean(credentials), legacyAvailable: Boolean(legacy), canConfigure },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const central = await requireModuleAuthorization("compras", "administrar");
  if (!central.current) return central.errorResponse;
  const { response: unauthorized, session } = await authorize();
  if (unauthorized || !session) return unauthorized!;

  try {
    const body = (await request.json()) as { token?: string; key?: string; useExisting?: boolean };
    const existing = body.useExisting === true ? await getStoredTrelloCredentials() : null;
    const token = existing?.token || body.token?.trim();
    const key = existing?.key || body.key?.trim() || TRELLO_API_KEY;

    if (!token) {
      return NextResponse.json(
        { error: "Cole a chave de conexão do Trello." },
        { status: 400 },
      );
    }

    const credentials = { key, token };
    const board = await validateTrelloCredentials(credentials);
    const { sharedSaved } = await persistTrelloCredentials(credentials, session.accessToken);

    return NextResponse.json({
      ok: true,
      boardName: board.name,
      persistent: sharedSaved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `O Trello não aceitou a chave: ${error.message}`
            : "Não foi possível validar o Trello.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const central = await requireModuleAuthorization("compras", "administrar");
  if (!central.current) return central.errorResponse;
  const { response: unauthorized, session } = await authorize();
  if (unauthorized || !session) return unauthorized!;

  await clearStoredTrelloCredentials(session.accessToken);
  return NextResponse.json({ ok: true });
}
