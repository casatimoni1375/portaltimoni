import { readSharedTrelloCredentials, saveSharedTrelloCredentials, deleteSharedTrelloCredentials } from "./trello-shared-credentials";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";

export const TRELLO_BOARD_SHORT_LINK = "UfPrTr1H";
export const TRELLO_BOARD_URL = "https://trello.com/b/UfPrTr1H/compras";
export const TRELLO_API_KEY = "6d6dfd3e5a2a67b5a99006ae2825a5df";

const TRELLO_APPDATA_FILE = "portal-timoni-trello-config";

export type TrelloCredentials = {
  key: string;
  token: string;
};

function getServerTrelloCredentials(): TrelloCredentials | null {
  const key = (process.env.TRELLO_API_KEY || TRELLO_API_KEY).trim();
  const token = (
    process.env.TRELLO_TOKEN ||
    process.env.TRELLO_API_TOKEN ||
    process.env.TRELLO_ACCESS_TOKEN ||
    ""
  ).trim();
  return key && token ? { key, token } : null;
}

async function driveClient(accessToken?: string) {
  const token = accessToken || (await auth())?.accessToken;
  if (!token) return null;
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: token });
  return google.drive({ version: "v3", auth: oauth });
}

async function findAppDataFile(accessToken?: string) {
  const drive = await driveClient(accessToken);
  if (!drive) return { drive: null, file: null };
  const response = await drive.files.list({
    spaces: "appDataFolder",
    q: `name='${TRELLO_APPDATA_FILE}' and trashed=false`,
    pageSize: 1,
    fields: "files(id,appProperties)",
  });
  return { drive, file: response.data.files?.[0] || null };
}

async function getDriveTrelloCredentials(): Promise<TrelloCredentials | null> {
  try {
    const { file } = await findAppDataFile();
    const key = file?.appProperties?.trelloKey?.trim();
    const token = file?.appProperties?.trelloToken?.trim();
    return key && token ? { key, token } : null;
  } catch {
    return null;
  }
}

async function saveDriveTrelloCredentials(
  credentials: TrelloCredentials,
  accessToken?: string,
): Promise<boolean> {
  try {
    const { drive, file } = await findAppDataFile(accessToken);
    if (!drive) return false;
    const requestBody = {
      name: TRELLO_APPDATA_FILE,
      appProperties: {
        trelloKey: credentials.key,
        trelloToken: credentials.token,
      },
    };
    if (file?.id) {
      await drive.files.update({ fileId: file.id, requestBody });
    } else {
      await drive.files.create({
        requestBody: {
          ...requestBody,
          parents: ["appDataFolder"],
        },
        fields: "id",
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function deleteDriveTrelloCredentials(accessToken?: string) {
  try {
    const { drive, file } = await findAppDataFile(accessToken);
    if (drive && file?.id) await drive.files.delete({ fileId: file.id });
  } catch {
    // A remoção do cookie continua sendo suficiente para encerrar a sessão local.
  }
}

export async function getSharedTrelloCredentials(): Promise<TrelloCredentials | null> {
  return getServerTrelloCredentials() || await readSharedTrelloCredentials();
}

export async function getStoredTrelloCredentials(): Promise<TrelloCredentials | null> {
  const shared = await getSharedTrelloCredentials();
  if (shared) return shared;
  const cookieStore = await cookies();
  const key = cookieStore.get("timoni_trello_key")?.value?.trim();
  const token = cookieStore.get("timoni_trello_token")?.value?.trim();
  if (key && token) {
    // Migração automática para armazenamento privado no Drive quando o novo escopo já estiver autorizado.
    await saveDriveTrelloCredentials({ key, token });
    return { key, token };
  }

  return getDriveTrelloCredentials();
}

export async function persistTrelloCredentials(
  credentials: TrelloCredentials,
  accessToken?: string,
) {
  const managed = getServerTrelloCredentials();
  if (managed && (managed.key !== credentials.key || managed.token !== credentials.token)) throw new Error("A conexão é gerenciada no ambiente do servidor. Altere-a na Vercel.");
  await saveSharedTrelloCredentials(credentials);
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
  cookieStore.set("timoni_trello_key", credentials.key, cookieOptions);
  cookieStore.set("timoni_trello_token", credentials.token, cookieOptions);
  const cloudSaved = await saveDriveTrelloCredentials(credentials, accessToken);
  return { cloudSaved, sharedSaved: true };
}

export async function clearStoredTrelloCredentials(accessToken?: string) {
  if (getServerTrelloCredentials()) throw new Error("A conexão é gerenciada no ambiente do servidor. Altere-a na Vercel.");
  await deleteSharedTrelloCredentials();
  const cookieStore = await cookies();
  const clearOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  cookieStore.set("timoni_trello_key", "", clearOptions);
  cookieStore.set("timoni_trello_token", "", clearOptions);
  await deleteDriveTrelloCredentials(accessToken);
}

function buildUrl(
  path: string,
  credentials: TrelloCredentials,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const url = new URL(`https://api.trello.com/1${path}`);
  url.searchParams.set("key", credentials.key);
  url.searchParams.set("token", credentials.token);
  Object.entries(params || {}).forEach(([name, value]) => {
    if (value !== undefined) url.searchParams.set(name, String(value));
  });
  return url;
}

function isPurchaseOrderSharedRead(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | undefined,
  params?: Record<string, string | number | boolean | undefined>,
) {
  if (method && method !== "GET") return false;
  if (
    path === `/boards/${TRELLO_BOARD_SHORT_LINK}` &&
    params?.fields === "name" &&
    params?.lists === "open" &&
    params?.list_fields === "name,closed" &&
    params?.labels === undefined
  ) {
    return true;
  }
  return /^\/lists\/[^/]+\/cards$/.test(path) && params?.fields === "name,start,due,dateLastActivity,closed";
}

export async function trelloFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    params?: Record<string, string | number | boolean | undefined>;
    body?: BodyInit | null;
    credentials?: TrelloCredentials;
  } = {},
): Promise<T> {

  const sharedRead = isPurchaseOrderSharedRead(path, options.method, options.params);
  const credentials = options.credentials || (sharedRead ? await getSharedTrelloCredentials() : await getStoredTrelloCredentials());
  if (!credentials) throw new Error("A administração precisa configurar a conexão compartilhada do Trello.");
  const method = options.method || "GET";
  const attempts = method === "GET" ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(buildUrl(path, credentials, options.params), {
        method, body: options.body, cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (attempt + 1 < attempts) continue;
      throw new Error("Conexão com o Trello temporariamente indisponível. Tente novamente.");
    }
    if (attempt + 1 < attempts && (response.status === 429 || response.status >= 500)) {
      await response.body?.cancel();
      const delay = Math.min(2000, Math.max(250, Number(response.headers.get("retry-after") || 0) * 1000));
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new Error("A conexão Trello expirou ou perdeu permissão. A administração precisa reconectar.");
      if (response.status === 429) throw new Error("O Trello está limitando as consultas. A última atualização permanece disponível.");
      throw new Error("Trello respondeu HTTP " + response.status + ".");
    }
    try { return await response.json() as T; }
    catch { throw new Error("O Trello retornou uma resposta inválida."); }
  }
  throw new Error("Não foi possível consultar o Trello.");

}

export async function validateTrelloCredentials(credentials: TrelloCredentials) {
  return trelloFetch<{ id: string; name: string }>(`/boards/${TRELLO_BOARD_SHORT_LINK}`, {
    credentials,
    params: { fields: "name" },
  });
}

export function normalizeTrelloText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
