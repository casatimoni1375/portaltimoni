import { neon } from "@neondatabase/serverless";

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
        CREATE TABLE IF NOT EXISTS portal_configuration_revision (
          singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
          revision BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO portal_configuration_revision (singleton)
        VALUES (TRUE)
        ON CONFLICT (singleton) DO NOTHING
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function getPortalConfigurationRevision(): Promise<string> {
  await ensureSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT revision::TEXT AS revision
    FROM portal_configuration_revision
    WHERE singleton = TRUE
    LIMIT 1
  ` as Array<{ revision: string }>;
  return rows[0]?.revision ?? "1";
}

// Usado na checagem de sessão (callback jwt, a cada requisição). Cache curto por processo,
// zerado quando este processo grava uma revisão. Em outras instâncias, vale em até 10 s.
// A rota /api/configuracoes/version continua lendo sem cache.
const REVISION_CACHE_TTL_MS = 10_000;
let revisionCache: { value: Promise<string>; until: number } | null = null;

function getPortalConfigurationRevisionCached(): Promise<string> {
  const now = Date.now();
  if (revisionCache && revisionCache.until > now) return revisionCache.value;
  const value = getPortalConfigurationRevision();
  revisionCache = { value, until: now + REVISION_CACHE_TTL_MS };
  value.catch(() => { if (revisionCache?.value === value) revisionCache = null; });
  return value;
}

export async function getPortalConfigurationRevisionSafely(): Promise<string | null> {
  try {
    return await getPortalConfigurationRevisionCached();
  } catch (error) {
    console.error("[portal-config-revision] Falha ao ler a versão.", error);
    return null;
  }
}

export async function bumpPortalConfigurationRevision(): Promise<void> {
  revisionCache = null;
  await ensureSchema();
  const sql = getDatabase();
  await sql`
    UPDATE portal_configuration_revision
    SET revision = revision + 1, updated_at = NOW()
    WHERE singleton = TRUE
  `;
}

export async function bumpPortalConfigurationRevisionSafely() {
  try {
    await bumpPortalConfigurationRevision();
  } catch (error) {
    console.error("[portal-config-revision] Não foi possível sinalizar a alteração.", error);
  }
}
