import { MANAGEMENT_EMAILS as MANAGEMENT_IDENTITIES, isCicaAccess } from "@/lib/access-control";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appendTeamMessage, deleteTeamMessage, listTeamMessages, markTeamMessageOk, replyTeamMessage } from "@/lib/espaco-equipe";

const GESTAO_EMAILS = MANAGEMENT_IDENTITIES;
const FINAL_STATUSES = new Set(["concluido", "concluído", "resolvido", "feito", "finalizado"]);

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? "";

  if (!GESTAO_EMAILS.has(email)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  try {
    const messages = await listTeamMessages();
    const pending = messages.filter((item) => {
      const status = item.status.trim().toLowerCase();
      return !FINAL_STATUSES.has(status);
    }).length;

    return NextResponse.json({ pending });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar as pendências." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const message = String(body?.message ?? "").trim();

    if (message.length < 3) {
      return NextResponse.json({ error: "Escreva a mensagem antes de registrar." }, { status: 400 });
    }

    if (message.length > 2500) {
      return NextResponse.json({ error: "A mensagem deve ter no máximo 2.500 caracteres." }, { status: 400 });
    }

    await appendTeamMessage({ message, senderEmail: session.user.email });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[Painel Timoni] Espaço Equipe / envio: ${error.name}: ${error.message}`);
    } else {
      console.error("[Painel Timoni] Espaço Equipe / envio: falha desconhecida");
    }

    return NextResponse.json(
      { error: "Não foi possível registrar agora. Tente novamente." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? "";

  if (!isCicaAccess(email)) {
    return NextResponse.json({ error: "Ação exclusiva do acesso da Ciça." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body?.id ?? "").trim();

    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
    }

    await deleteTeamMessage(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[Painel Timoni] Espaço Equipe / exclusão: ${error.name}: ${error.message}`);
    } else {
      console.error("[Painel Timoni] Espaço Equipe / exclusão: falha desconhecida");
    }

    return NextResponse.json({ error: "Não foi possível excluir a mensagem." }, { status: 500 });
  }
}

// Resposta e OK da gestão (mesma regra do Excluir: acesso da Ciça).
export async function PATCH(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? "";

  if (!isCicaAccess(email)) {
    return NextResponse.json({ error: "Ação exclusiva do acesso da Ciça." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body?.id ?? "").trim();
    const action = String(body?.action ?? "");
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
    }
    if (action === "ok") {
      await markTeamMessageOk(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "responder") {
      const reply = String(body?.reply ?? "").trim();
      if (reply.length < 1) return NextResponse.json({ error: "Escreva a resposta." }, { status: 400 });
      if (reply.length > 2500) return NextResponse.json({ error: "A resposta deve ter no máximo 2.500 caracteres." }, { status: 400 });
      await replyTeamMessage(id, reply);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error(`[Painel Timoni] Espaço Equipe / resposta: ${error instanceof Error ? error.message : "falha desconhecida"}`);
    return NextResponse.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }
}
