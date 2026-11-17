import { neon } from "@neondatabase/serverless";

export type TeamMessage = {
  id?: string;
  date: string;
  unit: string;
  employee: string;
  message: string;
  status: string;
  note: string;
  reply?: string;
  repliedAt?: string;
};

type TeamMessageRow = {
  id: string | number;
  created_at: Date | string;
  unit: string;
  employee: string;
  message: string;
  status: string;
  note: string;
  reply?: string | null;
  replied_at?: Date | string | null;
};

let database: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada no servidor.");
  if (!database) database = neon(databaseUrl);
  return database;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      await sql`
        CREATE TABLE IF NOT EXISTS portal_team_messages (
          id BIGSERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          unit TEXT NOT NULL,
          employee TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Novo',
          note TEXT NOT NULL DEFAULT ''
        )
      `;
      // Desde 17/11/2026 a mensagem guarda de qual acesso veio (decisão da gestão) e a resposta da gestão.
      await sql`ALTER TABLE portal_team_messages ADD COLUMN IF NOT EXISTS sender_email TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE portal_team_messages ADD COLUMN IF NOT EXISTS reply TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE portal_team_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`;
      await sql`
        CREATE INDEX IF NOT EXISTS portal_team_messages_created_at_idx
        ON portal_team_messages (created_at DESC)
      `;
      await sql`
        UPDATE portal_team_messages
        SET unit = '', employee = ''
        WHERE unit <> '' OR employee <> ''
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function appendTeamMessage(input: {
  message: string;
  senderEmail?: string;
}, _accessToken?: string) {
  void _accessToken;
  await ensureSchema();
  const sql = getDatabase();
  await sql`
    INSERT INTO portal_team_messages (unit, employee, message, sender_email)
    VALUES ('', '', ${input.message}, ${(input.senderEmail || "").trim().toLowerCase()})
  `;
}

function mapRow(row: TeamMessageRow): TeamMessage {
  return {
    id: String(row.id),
    date: new Date(row.created_at).toISOString(),
    unit: row.unit,
    employee: row.employee,
    message: row.message,
    status: row.status,
    note: row.note,
    reply: row.reply || "",
    repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : "",
  };
}

// Mensagens enviadas por um acesso (para mostrar a resposta da gestão só para ele).
export async function listTeamMessagesBySender(email: string): Promise<TeamMessage[]> {
  const sender = email.trim().toLowerCase();
  if (!sender) return [];
  await ensureSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT id, created_at, unit, employee, message, status, note, reply, replied_at
    FROM portal_team_messages
    WHERE sender_email = ${sender}
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  ` as TeamMessageRow[];
  return rows.map(mapRow);
}

export async function replyTeamMessage(id: string, reply: string) {
  await ensureSchema();
  const sql = getDatabase();
  await sql`
    UPDATE portal_team_messages
    SET reply = ${reply}, replied_at = NOW(), status = 'Respondido'
    WHERE id = ${id}
  `;
}

export async function markTeamMessageOk(id: string) {
  await ensureSchema();
  const sql = getDatabase();
  await sql`
    UPDATE portal_team_messages
    SET status = 'Concluído'
    WHERE id = ${id}
  `;
}

export async function listTeamMessages(_accessToken?: string): Promise<TeamMessage[]> {
  void _accessToken;
  await ensureSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT id, created_at, unit, employee, message, status, note, reply, replied_at
    FROM portal_team_messages
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  ` as TeamMessageRow[];

  return rows.map(mapRow);
}

export async function deleteTeamMessage(id: string) {
  await ensureSchema();
  const sql = getDatabase();
  await sql`
    DELETE FROM portal_team_messages
    WHERE id = ${id}
  `;
}

export async function replaceTeamMessages(_accessToken: string, messages: TeamMessage[]) {
  await ensureSchema();
  const sql = getDatabase();
  await sql`DELETE FROM portal_team_messages`;

  for (const item of messages) {
    await sql`
      INSERT INTO portal_team_messages (created_at, unit, employee, message, status, note)
      VALUES (
        ${item.date || new Date().toISOString()},
        ${""},
        ${""},
        ${item.message},
        ${item.status || "Novo"},
        ${item.note || ""}
      )
    `;
  }
}
