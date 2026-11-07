export class ScreenRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// Uma instância por tela: nenhuma resposta ou identidade é compartilhada entre pessoas.
export function createScreenRequest<T>(options: {
  load: (signal: AbortSignal, force: boolean) => Promise<T>;
  onData: (value: T) => void;
  onError: (error: unknown) => void;
  onBusy?: (busy: boolean) => void;
  now?: () => number;
  timeoutMs?: number;
}) {
  const now = options.now ?? Date.now;
  let busy = false, disposed = false, lastStarted = -Infinity;
  let controller: AbortController | null = null;
  let queued: { force: boolean } | null = null;
  async function run({ urgent = false, force = false } = {}) {
    if (disposed) return;
    if (busy) {
      if (urgent || force) queued = { force: force || queued?.force === true };
      return;
    }
    if (!urgent && !force && now() - lastStarted < 5_000) return;
    busy = true;
    lastStarted = now();
    const current = new AbortController();
    controller = current;
    const timeout = setTimeout(() => current.abort(), options.timeoutMs ?? 30_000);
    options.onBusy?.(true);
    try {
      const value = await options.load(current.signal, force);
      if (!disposed && !current.signal.aborted) options.onData(value);
      else if (!disposed) options.onError(new Error("A consulta demorou demais. Tente novamente."));
    } catch (error) {
      if (!disposed) options.onError(current.signal.aborted ? new Error("A consulta demorou demais. Tente novamente.") : error);
    } finally {
      clearTimeout(timeout);
      busy = false;
      if (!disposed) {
        options.onBusy?.(false);
        const next = queued;
        queued = null;
        if (next) void run({ urgent: true, force: next.force });
      }
    }
  }
  return { run, dispose() { disposed = true; queued = null; controller?.abort(); } };
}
