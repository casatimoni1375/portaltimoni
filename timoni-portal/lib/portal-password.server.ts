import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const COST = 32768, BLOCK_SIZE = 8, PARALLELISM = 1, KEY_BYTES = 64;
const PREFIX = `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}`;
// Comparação de custo equivalente para usuário inexistente; não é uma credencial utilizável.
export const DUMMY_PORTAL_PASSWORD_HASH = `${PREFIX}$${"0".repeat(32)}$${"0".repeat(KEY_BYTES * 2)}`;

function passwordInBounds(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value, "utf8") <= 512;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, KEY_BYTES, {
    N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 64 * 1024 * 1024,
  }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPortalPassword(password: string): Promise<string> {
  if (!passwordInBounds(password)) throw new Error("Use uma senha entre 12 e 128 caracteres.");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPortalPassword(password: unknown, encoded: string): Promise<boolean> {
  if (!passwordInBounds(password) || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== PREFIX
    || !/^[0-9a-f]{32}$/.test(parts[4]) || !/^[0-9a-f]{128}$/.test(parts[5])) return false;
  const actual = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}
