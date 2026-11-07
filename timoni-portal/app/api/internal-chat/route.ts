// Compatibilidade de endereço: o chat antigo só oferece a consulta histórica protegida.
// Não há escolha de identidade por e-mail nem escrita nas conversas antigas.
export { GET, POST, PATCH, DELETE } from "../chat-historico/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
