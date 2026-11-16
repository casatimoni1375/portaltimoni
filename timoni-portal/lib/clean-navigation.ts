import { hasModuleAccess, type PortalUser } from "./access-control";
export type CleanNavItem = { href: string; label: string; key: string };
export function cleanNavigation(user: PortalUser): CleanNavItem[] {
  if (user.active === false) return [];
  const has = (module: Parameters<typeof hasModuleAccess>[1]) => hasModuleAccess(user.email,module,user);
  return [
    {href:"/dashboard",label:"Hoje",key:"hoje",visible:true},
    {href:"/dashboard/estoque",label:"Estoque",key:"estoque",visible:has("estoque")},
    {href:"/dashboard/compras",label:"Compras",key:"compras",visible:has("compras")||has("pedido-de-compra")||has("estoque-rotativo")||has("conferencia")},
    {href:"/dashboard/motorista",label:"Motorista",key:"motorista",visible:has("motorista")},
    {href:"/agenda",label:"Agenda",key:"agenda",visible:has("agenda")||has("agenda-ct")},
    {href:"/dashboard/reunioes",label:"Reuniões",key:"reunioes",visible:has("reunioes")},
    {href:"/dashboard/leads",label:"Vendas Internas",key:"comercial",visible:has("leads")},
  ].filter(item=>item.visible).map(({href,label,key})=>({href,label,key}));
}
export function activeNavigation(path: string) {
  if(path.startsWith("/dashboard/estoque-rotativo")||path.startsWith("/dashboard/conferencia-pedidos")||path.startsWith("/dashboard/pedido-de-compra")||path.startsWith("/dashboard/compras"))return "compras";
  if(path.startsWith("/dashboard/estoque"))return "estoque";
  if(path.startsWith("/dashboard/motorista")||path.startsWith("/motorista"))return "motorista";
  if(path.startsWith("/dashboard/reunioes"))return "reunioes";
  if(path.startsWith("/agenda"))return "agenda";
  if(path.startsWith("/dashboard/leads"))return "comercial";
  return "hoje";
}
