import { neon } from "@neondatabase/serverless";

type Message = { id: string; sender_user_id: string; recipient_user_id: string; body: string; created_at: string | Date; read_at: string | Date | null; edited_at: string | Date | null };
function messages(rows: Message[]) {
  return rows.map(row => ({ ...row, id: String(row.id), created_at: new Date(row.created_at).toISOString(),
    read_at: row.read_at ? new Date(row.read_at).toISOString() : null, edited_at: row.edited_at ? new Date(row.edited_at).toISOString() : null }));
}

// Sem DDL ou limpeza automática. O esquema é preparado separadamente para revisão.
export function createCollaboratorChatStore(sql: ReturnType<typeof neon>) {
  return {
    async overview(me: string) {
      return await sql`SELECT CASE WHEN c.user_a = ${me} THEN c.user_b ELSE c.user_a END AS peer_id,
        (SELECT COUNT(*)::INTEGER FROM portal_person_chat_messages m WHERE m.conversation_id = c.id AND m.recipient_id = ${me} AND m.read_at IS NULL) AS unread,
        recent.body AS last_message_preview, recent.created_at AS last_message_at
        FROM portal_person_chat_conversations c
        LEFT JOIN LATERAL (SELECT body, created_at FROM portal_person_chat_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) recent ON TRUE
        WHERE c.user_a = ${me} OR c.user_b = ${me}` as Array<{ peer_id: string; unread: number; last_message_preview: string | null; last_message_at: string | Date | null }>;
    },
    async list(me: string, peer: string, before: string | null) {
      const rows = await sql`SELECT m.id::TEXT AS id, m.sender_id AS sender_user_id, m.recipient_id AS recipient_user_id, m.body, m.created_at, m.read_at, m.edited_at
        FROM portal_person_chat_messages m INNER JOIN portal_person_chat_conversations c ON c.id = m.conversation_id
        WHERE ((c.user_a = ${me} AND c.user_b = ${peer}) OR (c.user_b = ${me} AND c.user_a = ${peer}))
          AND (${before}::BIGINT IS NULL OR m.id < ${before}::BIGINT)
        ORDER BY m.id DESC LIMIT 101` as Message[];
      const page = messages(rows.slice(0, 100).reverse());
      return { messages: page, before: rows.length > 100 ? page[0].id : null };
    },
    async send(me: string, peer: string, body: string) {
      const rows = await sql`WITH conversation AS (
        INSERT INTO portal_person_chat_conversations (user_a, user_b)
        VALUES (LEAST(${me}, ${peer}), GREATEST(${me}, ${peer}))
        ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a RETURNING id
      ) INSERT INTO portal_person_chat_messages (conversation_id, sender_id, recipient_id, body)
        SELECT id, ${me}, ${peer}, ${body} FROM conversation
        RETURNING id::TEXT AS id, sender_id AS sender_user_id, recipient_id AS recipient_user_id, body, created_at, read_at, edited_at` as Message[];
      if (rows.length !== 1) throw new Error("Mensagem não registrada.");
      return messages(rows)[0];
    },
    async read(me: string, peer: string, through: string) {
      await sql`UPDATE portal_person_chat_messages m SET read_at = NOW()
        WHERE m.recipient_id = ${me} AND m.sender_id = ${peer} AND m.id <= ${through}::BIGINT AND m.read_at IS NULL
          AND EXISTS (SELECT 1 FROM portal_person_chat_conversations c WHERE c.id = m.conversation_id
            AND ((c.user_a = ${me} AND c.user_b = ${peer}) OR (c.user_b = ${me} AND c.user_a = ${peer})))`;
    },
    async edit(me: string, peer: string, id: string, body: string) {
      const rows = await sql`UPDATE portal_person_chat_messages m SET body = ${body}, edited_at = NOW()
        WHERE m.id = ${id}::BIGINT AND m.sender_id = ${me} AND m.recipient_id = ${peer}
          AND EXISTS (SELECT 1 FROM portal_person_chat_conversations c WHERE c.id = m.conversation_id
            AND ((c.user_a = ${me} AND c.user_b = ${peer}) OR (c.user_b = ${me} AND c.user_a = ${peer})))
        RETURNING m.id::TEXT AS id, m.sender_id AS sender_user_id, m.recipient_id AS recipient_user_id, m.body, m.created_at, m.read_at, m.edited_at` as Message[];
      return messages(rows)[0] ?? null;
    },
    async remove(me: string, peer: string, id: string) {
      const rows = await sql`DELETE FROM portal_person_chat_messages m
        WHERE m.id = ${id}::BIGINT AND m.sender_id = ${me} AND m.recipient_id = ${peer}
          AND EXISTS (SELECT 1 FROM portal_person_chat_conversations c WHERE c.id = m.conversation_id
            AND ((c.user_a = ${me} AND c.user_b = ${peer}) OR (c.user_b = ${me} AND c.user_a = ${peer}))) RETURNING m.id` as Array<{ id: string }>;
      return rows.length === 1;
    },
    async history(conversation: string | null, before: string | null) {
      if (!conversation) {
        const rows = await sql`SELECT c.id::TEXT AS id, c.user_a, c.user_b
          FROM portal_chat_conversations c WHERE (${before}::BIGINT IS NULL OR c.id < ${before}::BIGINT) ORDER BY c.id DESC LIMIT 101` as Array<{ id: string; user_a: string; user_b: string }>;
        return { conversations: rows.slice(0, 100), before: rows.length > 100 ? String(rows[99].id) : null };
      }
      const rows = await sql`SELECT id::TEXT AS id, sender_user_id, recipient_user_id, body, created_at, read_at, edited_at
        FROM portal_chat_messages WHERE conversation_id = ${conversation}::BIGINT
          AND (${before}::BIGINT IS NULL OR id < ${before}::BIGINT) ORDER BY id DESC LIMIT 101` as Message[];
      const page = messages(rows.slice(0, 100).reverse());
      return { messages: page, before: rows.length > 100 ? page[0].id : null };
    },
  };
}

export function getCollaboratorChatStore() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Chat indisponível.");
  return createCollaboratorChatStore(neon(url));
}
