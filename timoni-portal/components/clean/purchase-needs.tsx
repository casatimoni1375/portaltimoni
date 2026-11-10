import Link from "next/link";
export default function PurchaseNeeds({canRotativo,canMontar}:{canRotativo:boolean;canMontar:boolean}){
 return <section className="ct-clean-card"><h2>Necessidades de compra</h2><div className="ct-clean-action-row"><div><strong>Contagens e fornecedores pendentes</strong><small>Consulte as planilhas e as conferências no Rotativo.</small></div>{canRotativo&&<Link className="ct-clean-action" href="/dashboard/estoque-rotativo">Abrir Rotativo</Link>}{canMontar&&<Link className="ct-clean-action" href="/dashboard/compras?aba=montar">Montar pedido</Link>}</div></section>;
}
