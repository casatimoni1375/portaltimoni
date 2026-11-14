import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { canModuleOperation, canMotoristaStore } from "@/lib/module-authorization";
import MotoristaAgenda from "./motorista-agenda";

export const metadata: Metadata = {
  title: "Agenda Motorista",
};

export default async function MotoristaPage() {
  const gate = await requireModuleAuthorization("motorista", "visualizar");
  if (!gate.current) {
    // Diagnóstico: registra o motivo do redirecionamento para a Tela Hoje (sem e-mail nem dados pessoais).
    console.warn("[motorista] acesso negado na página; redirecionando para /dashboard", { status: gate.errorResponse?.status ?? null });
    redirect("/dashboard");
  }
  const canCreate = canModuleOperation(gate.current.user, "motorista", "criar");
  const canEdit = canModuleOperation(gate.current.user, "motorista", "editar");
  const canDelete = canModuleOperation(gate.current.user, "motorista", "excluir");
  const readOnly = !canEdit;
  // Cada acesso só vê as empresas que pode agendar: Rio Claro = Casa Timoni, MCR e Rodini; Araras = Casa Timoni.
  const empresas = ["Casa Timoni", "MCR", "Rodini"].filter((empresa) => canMotoristaStore(gate.current!.user, "criar", empresa));

  return (
    <div className="ct-modern-calendar mx-auto w-full max-w-6xl space-y-4">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Casa Timoni</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Agenda do Motorista</h1>
        <p className="mt-1 text-sm text-slate-600">Entregas, retiradas e bloqueios de horário em uma agenda única.</p>
      </header>
      <div className="motorista-agenda-controle">
        <MotoristaAgenda readOnly={readOnly} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} actorName={gate.current.user.collaboratorAccess?.name} empresas={empresas.length ? empresas : undefined} />
      </div>
      <style>{`
        .motorista-agenda-controle button.bg-emerald-700,
        .motorista-agenda-controle button.bg-amber-600,
        .motorista-agenda-controle button.border-blue-200,
        .motorista-agenda-controle button.border-red-200 {
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          color: #334155 !important;
        }
        .motorista-agenda-controle button.bg-emerald-700:hover,
        .motorista-agenda-controle button.bg-amber-600:hover,
        .motorista-agenda-controle button.border-blue-200:hover,
        .motorista-agenda-controle button.border-red-200:hover {
          background: #f8fafc !important;
        }
      `}</style>
    </div>
  );
}
