import type { PortalModule } from "./access-control";

/**
 * Blocos da tela Hoje. A tela é separada da permissão: cada acesso escolhe seus blocos
 * em Configurações (coluna O da aba PortalUsuarios). Um bloco só aparece se o acesso
 * também tiver a permissão do módulo correspondente. Lista vazia = padrão pelas permissões.
 * Comunicados aparecem sempre para quem tem Avisos.
 */
export const TODAY_BLOCKS: Array<{ id: string; label: string; modules: PortalModule[] }> = [
  { id: "pedidos-atrasados", label: "Pedidos atrasados", modules: ["pedido-de-compra", "compras"] },
  { id: "pedidos", label: "Pedidos em andamento", modules: ["pedido-de-compra", "compras"] },
  { id: "compras", label: "Compras urgentes", modules: ["compras"] },
  { id: "viagens", label: "Viagens do motorista", modules: ["motorista"] },
  { id: "agenda", label: "Agenda", modules: ["agenda", "agenda-ct"] },
  { id: "aniversarios", label: "Aniversários e férias", modules: ["painel"] },
  { id: "atalho-estoque", label: "Atalho Estoque", modules: ["estoque"] },
  { id: "atalho-equipe", label: "Atalho Equipe", modules: ["painel"] },
  { id: "atalho-vendas", label: "Atalho Vendas Internas", modules: ["leads"] },
];

const KNOWN = new Set(TODAY_BLOCKS.map((block) => block.id));

export function cleanTodayBlocks(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map((item) => String(item).trim()).filter((item) => KNOWN.has(item));
  return blocks.length ? Array.from(new Set(blocks)) : undefined;
}

/** true se o bloco deve aparecer: escolhido (ou padrão) e com permissão do módulo. */
export function wantsTodayBlock(blocks: string[] | undefined, id: string, hasModule: (module: PortalModule) => boolean) {
  const block = TODAY_BLOCKS.find((item) => item.id === id);
  if (!block || !block.modules.some(hasModule)) return false;
  if (!blocks || !blocks.length) return !id.startsWith("atalho-") && id !== "pedidos";
  return blocks.includes(id);
}
