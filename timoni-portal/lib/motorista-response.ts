// A resposta já decodificada pode conter o segredo escapado em JSON ou em URLs.
export function redactMotoristaResponse(value: unknown, token: string): unknown {
  if (!token) return value;
  const variants = [...new Set([token, encodeURIComponent(token)])].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(variants.map(text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const redact = (text: string) => text.replace(pattern, "[segredo removido]");
  function visit(item: unknown): unknown {
    if (typeof item === "string") return redact(item);
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item)
      .map(([key, nested]) => [redact(key), visit(nested)]));
    return item;
  }
  return visit(value);
}
