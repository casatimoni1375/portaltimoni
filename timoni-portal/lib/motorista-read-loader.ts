type Callbacks = {
  success: (pairs: [string, unknown[]][]) => void;
  error: (error: unknown) => void;
  done: () => void;
  // Chamado assim que cada dia chega, para a tela mostrar sem esperar os outros.
  day?: (day: string, viagens: unknown[]) => void;
};

// 23/11/2026: os dias eram buscados um por vez, em fila, e a tela só aparecia no fim.
// Agora busca até CONCORRENCIA dias ao mesmo tempo e entrega cada dia assim que chega.
// Um dia com erro não derruba os outros.
const CONCORRENCIA = 6;

export function createMotoristaReadLoader(fetcher: typeof fetch = fetch, timeoutMs = 30_000, endpoint: "/api/motorista-leitura" | "/api/agenda-motorista" = "/api/motorista-leitura") {
  let busy = false;
  let disposed = false;
  const controllers = new Set<AbortController>();

  async function buscarDia(day: string): Promise<unknown[]> {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${endpoint}?action=dia&data=${encodeURIComponent(day)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body?.ok !== true || !Array.isArray(body.viagens)) throw Error(body?.erro || "Não foi possível carregar a agenda.");
      return body.viagens;
    } catch (error) {
      if (controller.signal.aborted && !disposed) throw new Error("A agenda demorou demais para responder. Tente atualizar novamente.");
      throw error;
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }

  return {
    async run(days: string[], callbacks: Callbacks) {
      if (busy || disposed) return;
      busy = true;
      try {
        const pairs: [string, unknown[]][] = [];
        let primeiroErro: unknown = null;
        let proximo = 0;
        async function trabalhador() {
          while (!disposed && proximo < days.length) {
            const day = days[proximo++];
            try {
              const viagens = await buscarDia(day);
              if (disposed) return;
              pairs.push([day, viagens]);
              callbacks.day?.(day, viagens);
            } catch (error) {
              if (primeiroErro === null) primeiroErro = error;
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, days.length) }, trabalhador));
        if (disposed) return;
        pairs.sort((a, b) => days.indexOf(a[0]) - days.indexOf(b[0]));
        callbacks.success(pairs);
        if (primeiroErro !== null) callbacks.error(primeiroErro);
      } finally {
        busy = false;
        if (!disposed) callbacks.done();
      }
    },
    dispose() {
      disposed = true;
      controllers.forEach((c) => c.abort());
    },
  };
}
