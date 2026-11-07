type Credentials = { accessToken?: string; refreshToken?: string; expiresAt?: number; error?: "RefreshAccessTokenError" | "SessionTemporarilyUnavailable"; refreshRetryAt?: number };
type Patch = Partial<Credentials>;

// Deduplicação curta por processo. Não substitui coordenação entre instâncias.
export function createGoogleTokenRefresher(fetcher: typeof fetch = fetch, now = Date.now, timeoutMs = 10_000) {
  const pending = new Map<string, { until: number; result: Promise<Patch> }>();
  return async function refresh<T extends Credentials>(token: T, clientId?: string, clientSecret?: string): Promise<T> {
    if (token.error === "RefreshAccessTokenError") return token;
    if (token.refreshRetryAt && now() < token.refreshRetryAt) return { ...token, error: "SessionTemporarilyUnavailable" };
    const transient = (): Patch => ({ error: "SessionTemporarilyUnavailable", refreshRetryAt: now() + 15_000 });
    const revoked = (): Patch => ({ accessToken: undefined, refreshToken: undefined, expiresAt: undefined, error: "RefreshAccessTokenError", refreshRetryAt: undefined });
    if (!token.refreshToken) return { ...token, ...revoked() };
    if (!clientId || !clientSecret) return { ...token, ...transient() };
    for (const [key, entry] of pending) if (entry.until <= now()) pending.delete(key);
    const key = JSON.stringify([clientId, token.refreshToken]);
    let entry = pending.get(key);
    if (!entry) {
      const result = (async (): Promise<Patch> => {
        for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetcher("https://oauth2.googleapis.com/token", {
            method: "POST", cache: "no-store", signal: controller.signal,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: token.refreshToken! }),
          });
          const body = await response.json();
          if (!response.ok) {
            if (response.status === 400 && body?.error === "invalid_grant") return revoked();
            if (attempt === 0) continue;
            return transient();
          }
          const duration = Number(body?.expires_in);
          if (typeof body?.access_token !== "string" || !body.access_token || !Number.isFinite(duration) || duration <= 0) return transient();
          return { accessToken: body.access_token, refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : token.refreshToken, expiresAt: Math.floor(now() / 1000) + duration, error: undefined, refreshRetryAt: undefined };
        } catch { if (attempt === 1) return transient(); }
        finally { clearTimeout(timer); }
        }
        return transient();
      })();
      entry = { until: now() + 15_000, result };
      if (pending.size >= 256) pending.delete(pending.keys().next().value!);
      pending.set(key, entry);
    }
    return { ...token, ...await entry.result };
  };
}
