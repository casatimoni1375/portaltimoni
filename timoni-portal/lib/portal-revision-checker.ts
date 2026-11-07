type RevisionResponse = { revision?: string; sessionRevision?: string };

// Uma instância por tela; não compartilha identidade ou revisão entre usuários.
export function createPortalRevisionChecker(onChange: () => void, fetcher: typeof fetch = fetch, now = Date.now) {
  let busy = false, disposed = false;
  let lastStarted = -Infinity;
  let lastRevision: string | null = null;
  let controller: AbortController | null = null;
  return {
    async run() {
      if (busy || disposed || now() - lastStarted < 5_000) return;
      busy = true;
      lastStarted = now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetcher("/api/configuracoes/version", { cache: "no-store", signal: controller.signal });
        if (!response.ok || disposed || controller.signal.aborted) return;
        const result = await response.json() as RevisionResponse;
        if (disposed || controller.signal.aborted || typeof result?.revision !== "string" || !result.revision) return;
        const changed = lastRevision === null ? result.sessionRevision !== result.revision : lastRevision !== result.revision;
        lastRevision = result.revision;
        if (changed) onChange();
      } catch {
        // Falhas temporárias não encerram a sessão nem apagam a revisão conhecida.
      } finally { clearTimeout(timeout); busy = false; }
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
