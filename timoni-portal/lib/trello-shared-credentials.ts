import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { TrelloCredentials } from "./trello";

const AAD = "portal-timoni:trello:v1";
function encryptionKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Segredo do servidor não configurado para proteger a conexão Trello.");
  return createHash("sha256").update(AAD + secret).digest();
}
function database() {
  if (!process.env.DATABASE_URL) throw new Error("Banco da conexão compartilhada não configurado.");
  return neon(process.env.DATABASE_URL);
}
function encrypt(value: TrelloCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(AAD));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
function decrypt(value: string): TrelloCredentials {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error("Conexão Trello armazenada inválida.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(AAD));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8"));
  if (typeof parsed.key !== "string" || typeof parsed.token !== "string" || !parsed.key || !parsed.token) throw new Error("Conexão Trello armazenada inválida.");
  return { key: parsed.key, token: parsed.token };
}
export async function readSharedTrelloCredentials(): Promise<TrelloCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  let rows;
  try { rows = await database()`SELECT encrypted_credentials FROM portal_trello_credentials WHERE id = 1`; }
  catch (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw new Error("Não foi possível consultar a conexão compartilhada do Trello.");
  }
  if (!rows.length) return null;
  try { return decrypt(String(rows[0].encrypted_credentials)); }
  catch { throw new Error("Não foi possível abrir a conexão Trello. A administração precisa reconectar."); }
}
export async function saveSharedTrelloCredentials(credentials: TrelloCredentials) {
  const encrypted = encrypt(credentials);
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS portal_trello_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1), encrypted_credentials TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO portal_trello_credentials (id, encrypted_credentials) VALUES (1, ${encrypted})
    ON CONFLICT (id) DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials, updated_at = NOW()`;
}
export async function deleteSharedTrelloCredentials() {
  try { await database()`DELETE FROM portal_trello_credentials WHERE id = 1`; }
  catch (error) { if ((error as { code?: string }).code !== "42P01") throw new Error("Não foi possível desconectar o Trello compartilhado."); }
}
