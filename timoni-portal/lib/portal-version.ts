/** Há versão nova quando o servidor informa uma versão diferente da que esta tela carregou. */
export function hasNewVersion(loaded: string | undefined, published: unknown): boolean {
  if (!loaded || loaded === "dev") return false;
  if (typeof published !== "string" || !published || published === "dev") return false;
  return published !== loaded;
}
