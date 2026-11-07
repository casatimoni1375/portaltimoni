import { normalizeCollaboratorLogin, resolveCollaboratorAccess, type CollaboratorAccess } from "./collaborator-access";
import { DUMMY_PORTAL_PASSWORD_HASH, verifyPortalPassword } from "./portal-password.server";

export type CollaboratorLoginRecord = {
  access: CollaboratorAccess;
  passwordHash: string;
  credentialVersion: number;
};
export type CollaboratorSessionSubject = { collaboratorId: string; credentialVersion: number };

export type CollaboratorLoginStore = {
  findByLogin: (username: string) => Promise<CollaboratorLoginRecord | null>;
  findById: (collaboratorId: string) => Promise<CollaboratorLoginRecord | null>;
  // A futura implementação persistente deve reservar a tentativa atomicamente, antes de verificar a senha.
  // clientKey deve vir de contexto confiável do servidor, nunca do formulário.
  reserveAttempt: (username: string, clientKey: string) => Promise<boolean>;
};
type LoginResult = { ok: true; subject: CollaboratorSessionSubject }
  | { ok: false; reason: "invalid_credentials" | "temporarily_unavailable" | "too_many_attempts" };

function validVersion(value: number) { return Number.isSafeInteger(value) && value > 0; }

// Núcleo ainda não conectado ao provider público. O armazenamento é injetado e não tem fallback por e-mail.
export function createCollaboratorLogin(store: CollaboratorLoginStore) {
  return {
    async authenticate(input: { username?: unknown; password?: unknown }, clientKey: string): Promise<LoginResult> {
      const username = normalizeCollaboratorLogin(input?.username);
      if (!username || typeof clientKey !== "string" || !clientKey || clientKey.length > 256) return { ok: false, reason: "invalid_credentials" };
      try {
        if (!await store.reserveAttempt(username, clientKey)) return { ok: false, reason: "too_many_attempts" };
        const record = await store.findByLogin(username);
        const snapshot = record && { collaboratorId: record.access.collaboratorId, username: record.access.username, passwordHash: record.passwordHash, credentialVersion: record.credentialVersion };
        const verified = await verifyPortalPassword(input.password, snapshot?.passwordHash ?? DUMMY_PORTAL_PASSWORD_HASH);
        if (!snapshot || !verified || normalizeCollaboratorLogin(snapshot.username) !== username || !validVersion(snapshot.credentialVersion)) return { ok: false, reason: "invalid_credentials" };
        const current = await store.findById(snapshot.collaboratorId);
        if (!current || current.passwordHash !== snapshot.passwordHash || current.credentialVersion !== snapshot.credentialVersion
          || normalizeCollaboratorLogin(current.access.username) !== username
          || !resolveCollaboratorAccess(snapshot.collaboratorId, current.access)) return { ok: false, reason: "invalid_credentials" };
        return { ok: true, subject: { collaboratorId: current.access.collaboratorId, credentialVersion: current.credentialVersion } };
      } catch { return { ok: false, reason: "temporarily_unavailable" }; }
    },
    async resolveSession(subject: CollaboratorSessionSubject): Promise<{ access: CollaboratorAccess | null; unavailable: boolean }> {
      if (!subject?.collaboratorId || !validVersion(subject.credentialVersion)) return { access: null, unavailable: false };
      try {
        const record = await store.findById(subject.collaboratorId);
        if (!record || record.credentialVersion !== subject.credentialVersion) return { access: null, unavailable: false };
        return { access: resolveCollaboratorAccess(subject.collaboratorId, record.access), unavailable: false };
      } catch { return { access: null, unavailable: true }; }
    },
  };
}
