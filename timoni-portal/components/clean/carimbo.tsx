import type { ReactNode } from "react";

// Status no padrão do portal: preenchido, texto curto, sem caixa alta.
// Concluído usa verde; pendente usa âmbar.
export function Carimbo({ children, tom = "normal" }: { children: ReactNode; tom?: "normal" | "pendente" }) {
  const cor = tom === "pendente"
    ? "bg-[#FAEEDA] text-[#633806]"
    : "bg-[#EAF3DE] text-[#27500A]";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs max-md:text-[10px] font-medium ${cor}`}>
      {children}
    </span>
  );
}
