// O limite não transforma falha em lista vazia nem mantém um temporizador após sucesso.
export async function withinDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tempo de consulta excedido.")), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
