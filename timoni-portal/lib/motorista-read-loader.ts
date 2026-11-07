type Callbacks = {
  success: (pairs: [string, unknown[]][]) => void;
  error: (error: unknown) => void;
  done: () => void;
};

export function createMotoristaReadLoader(fetcher: typeof fetch = fetch, timeoutMs = 30_000, endpoint: "/api/motorista-leitura" | "/api/agenda-motorista" = "/api/motorista-leitura") {
  let busy = false;
  let disposed = false;
  let controller: AbortController | null = null;
  return {
    async run(days: string[], callbacks: Callbacks) {
      if (busy || disposed) return;
      busy = true;
      try {
        const pairs: [string, unknown[]][] = [];
        for (const day of days) {
          if (disposed) return;
          controller = new AbortController();
          const timer = setTimeout(() => controller?.abort(), timeoutMs);
          try {
            const response = await fetcher(`${endpoint}?action=dia&data=${encodeURIComponent(day)}`, { cache: "no-store", signal: controller.signal });
            const body = await response.json();
            if (!response.ok || body?.ok !== true || !Array.isArray(body.viagens)) throw Error(body?.erro || "Não foi possível carregar a agenda.");
            pairs.push([day, body.viagens]);
          } finally { clearTimeout(timer); }
        }
        if (!disposed) callbacks.success(pairs);
      } catch (error) { if (!disposed) callbacks.error(controller?.signal.aborted ? new Error("A agenda demorou demais para responder. Tente atualizar novamente.") : error); }
      finally { busy = false; if (!disposed) callbacks.done(); }
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
