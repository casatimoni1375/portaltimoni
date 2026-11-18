// Empresa da compra pelo final do nome do pedido (CT, ROD/RODINI ou MCR). Usado nas etiquetas de Compras.
export function companyOf(name: string): { label: string; tone: "ct" | "rod" | "mcr" } | null {
  const end = name.trim().toUpperCase().replace(/[^A-Z]+$/, "").slice(-8);
  if (/(^|[^A-Z])CT$/.test(end)) return { label: "Casa Timoni", tone: "ct" };
  if (/(ROD|RODINI)$/.test(end)) return { label: "Rodini", tone: "rod" };
  if (/MCR$/.test(end)) return { label: "MCR", tone: "mcr" };
  return null;
}
