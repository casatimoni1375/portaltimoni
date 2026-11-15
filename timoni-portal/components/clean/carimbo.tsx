import type { ReactNode } from "react";

// Carimbo de estado: texto curto em caixa alta com contorno, sem fundo colorido.
// "pendente" usa contorno tracejado para se diferenciar dos demais.
export function Carimbo({ children, tom = "normal" }: { children: ReactNode; tom?: "normal" | "pendente" }) {
  const contorno = tom === "pendente"
    ? "border-dashed border-[#65718a] text-[#65718a]"
    : "border-[#102a83] text-[#102a83]";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-[3px] border px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] ${contorno}`}>
      {children}
    </span>
  );
}
