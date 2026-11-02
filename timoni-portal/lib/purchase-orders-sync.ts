import { normalizeTrelloText, trelloFetch, TRELLO_BOARD_SHORT_LINK } from "@/lib/trello";
import { normalizePurchaseOrders, type PurchaseOrder } from "@/lib/purchase-orders";

type TrelloList = { id: string; name: string; closed?: boolean };
type TrelloCard = {
  id: string;
  name: string;
  start?: string | null;
  due?: string | null;
  dateLastActivity?: string;
  closed?: boolean;
};
type TrelloBoard = { lists?: TrelloList[] };

function hasAllTokens(value: string, tokens: string[]) {
  const normalized = normalizeTrelloText(value);
  return tokens.every((token) => normalized.includes(token));
}

async function readListCards(listId: string): Promise<TrelloCard[]> {
  return trelloFetch<TrelloCard[]>(`/lists/${listId}/cards`, {
    params: { fields: "name,start,due,dateLastActivity,closed" },
  });
}

export async function readSentPurchaseOrders(): Promise<PurchaseOrder[]> {
  // Leitura compartilhada: primeiro carrega somente as listas e depois os cartões
  // das duas listas de pedidos enviados. Assim a sincronização não depende do
  // navegador de um colaborador nem de uma conexão pessoal com o Trello.
  const board = await trelloFetch<TrelloBoard>(`/boards/${TRELLO_BOARD_SHORT_LINK}`, {
    params: {
      fields: "name",
      lists: "open",
      list_fields: "name,closed",
    },
  });

  const lists = (board.lists || []).filter((list) => !list.closed);
  const rioClaro = lists.find((list) => hasAllTokens(list.name, ["pedidos", "enviado", "rio", "claro"]));
  const araras = lists.find((list) => hasAllTokens(list.name, ["pedidos", "enviado", "araras"]));

  const [rioClaroCards, ararasCards] = await Promise.all([
    rioClaro ? readListCards(rioClaro.id) : Promise.resolve([]),
    araras ? readListCards(araras.id) : Promise.resolve([]),
  ]);

  const toOrders = (
    cards: TrelloCard[],
    unidade: "rio_claro" | "araras",
  ): PurchaseOrder[] =>
    cards
      .filter((card) => !card.closed)
      .map((card) => ({
        id: card.id,
        nome: card.name,
        enviadoEm: card.start || "",
        previsaoEntrega: card.due || "",
        unidade,
        activityAt: card.dateLastActivity,
      }));

  return normalizePurchaseOrders([
    ...toOrders(rioClaroCards, "rio_claro"),
    ...toOrders(ararasCards, "araras"),
  ]);
}
