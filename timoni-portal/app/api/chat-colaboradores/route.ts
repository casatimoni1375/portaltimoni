import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canCollaboratorAction, type CollaboratorAccess } from "@/lib/collaborator-access";
import { listCollaboratorChatDirectory } from "@/lib/collaborator-chat-directory.server";
import { getCollaboratorChatStore } from "@/lib/collaborator-chat-store.server";
import type { AuthorizationAction } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const numericId = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
type Context = { me: CollaboratorAccess; peers: CollaboratorAccess[]; store: ReturnType<typeof getCollaboratorChatStore> };

async function handle(action: AuthorizationAction, work: (context: Context) => Promise<Response>) {
  const gate = await requireModuleAuthorization("chat", action);
  if (!gate.current) return gate.errorResponse;
  const subject = gate.current.user.collaboratorAccess;
  if (!subject) return json({ error: "Use seu login individual para as novas conversas." }, 403);
  try {
    const directory = await listCollaboratorChatDirectory();
    const own = directory.filter(person => person.collaboratorId === subject.collaboratorId);
    if (own.length !== 1 || !canCollaboratorAction(own[0], "chat", action)) return json({ error: "Acesso ao chat indisponível para este colaborador." }, 403);
    const me = own[0];
    const peers = directory.filter(person => person.collaboratorId !== me.collaboratorId
      && (person.unit === me.unit || person.unit === "Geral" || me.unit === "Geral"));
    return await work({ me, peers, store: getCollaboratorChatStore() });
  } catch (failure) {
    if (failure instanceof SyntaxError) return json({ error: "Corpo da solicitação inválido." }, 400);
    return NextResponse.json({ error: "Chat temporariamente indisponível. Tente novamente." }, { status: 503, headers: { ...headers, "Retry-After": "15" } });
  }
}
const publicPerson = (person: CollaboratorAccess) => ({ id: person.collaboratorId, name: person.name, unit: person.unit });
function peerFor(context: Context, id: unknown) { return context.peers.find(person => person.collaboratorId === id); }
async function overview(context: Context) {
  const rows = await context.store.overview(context.me.collaboratorId);
  const contacts = context.peers.map(person => {
    const row = rows.find(item => item.peer_id === person.collaboratorId);
    return { ...publicPerson(person), unread: row?.unread || 0, lastMessagePreview: row?.last_message_preview || "",
      lastMessageAt: row?.last_message_at ? new Date(row.last_message_at).toISOString() : null };
  });
  return { currentUser: publicPerson(context.me), contacts, totalUnread: contacts.reduce((sum, person) => sum + person.unread, 0),
    permissions: { send: canCollaboratorAction(context.me, "chat", "criar"), edit: canCollaboratorAction(context.me, "chat", "editar"), remove: canCollaboratorAction(context.me, "chat", "excluir") } };
}

export async function GET(request: Request) {
  return handle("visualizar", async context => {
    const params = new URL(request.url).searchParams;
    const actor = params.get("actor");
    if (actor && actor !== context.me.collaboratorId) return json({ error: "A identidade é definida pelo login." }, 403);
    const peerId = params.get("peer"), before = params.get("before");
    if (peerId) {
      const peer = peerFor(context, peerId);
      if (!peer) return json({ error: "Destinatário não disponível para seu acesso." }, 404);
      if (before !== null && !numericId(before)) return json({ error: "Página inválida." }, 400);
      if (params.get("overview") === "1") {
        const [page, summary] = await Promise.all([context.store.list(context.me.collaboratorId, peer.collaboratorId, before), overview(context)]);
        return json({ ...page, ...summary });
      }
      return json(await context.store.list(context.me.collaboratorId, peer.collaboratorId, before));
    }
    return json(await overview(context));
  });
}

export async function POST(request: Request) {
  return handle("criar", async context => {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Corpo da solicitação inválido." }, 400);
    if (body.actor && body.actor !== context.me.collaboratorId) return json({ error: "A identidade é definida pelo login." }, 403);
    const peer = peerFor(context, body.peer), message = typeof body.message === "string" ? body.message.trim() : "";
    if (!peer) return json({ error: "Destinatário não disponível para seu acesso." }, 404);
    if (!message || message.length > 4000) return json({ error: "Escreva uma mensagem de até 4000 caracteres." }, 400);
    return json({ message: await context.store.send(context.me.collaboratorId, peer.collaboratorId, message) }, 201);
  });
}

export async function PATCH(request: Request) {
  return handle("visualizar", async context => {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Corpo da solicitação inválido." }, 400);
    if (body.actor && body.actor !== context.me.collaboratorId) return json({ error: "A identidade é definida pelo login." }, 403);
    const peer = peerFor(context, body.peer);
    if (!peer) return json({ error: "Destinatário não disponível para seu acesso." }, 404);
    if (body.action === "read" && numericId(body.through)) {
      await context.store.read(context.me.collaboratorId, peer.collaboratorId, body.through);
      return json({ ok: true });
    }
    if (body.action !== "edit" || !numericId(body.messageId)) return json({ error: "Ação inválida." }, 400);
    if (!canCollaboratorAction(context.me, "chat", "editar")) return json({ error: "Seu acesso não permite editar mensagens." }, 403);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) return json({ error: "Mensagem inválida." }, 400);
    const updated = await context.store.edit(context.me.collaboratorId, peer.collaboratorId, body.messageId, message);
    return updated ? json({ message: updated }) : json({ error: "Mensagem não encontrada para seu acesso." }, 404);
  });
}

export async function DELETE(request: Request) {
  return handle("excluir", async context => {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Corpo da solicitação inválido." }, 400);
    if (body.actor && body.actor !== context.me.collaboratorId) return json({ error: "A identidade é definida pelo login." }, 403);
    const peer = peerFor(context, body.peer);
    if (!peer || !numericId(body.messageId)) return json({ error: "Mensagem não encontrada para seu acesso." }, 404);
    return await context.store.remove(context.me.collaboratorId, peer.collaboratorId, body.messageId) ? json({ ok: true }) : json({ error: "Mensagem não encontrada para seu acesso." }, 404);
  });
}
