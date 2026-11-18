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
        <h1 className="mt-1 text-2xl max-md:text-[20px] font-semibold tracking-tight text-slate-950">Agenda do Motorista</h1>
        <p className="mt-1 text-sm max-md:text-[11px] text-slate-600">Entregas, retiradas e bloqueios de horário em uma agenda única.</p>
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
        /* Escala menor para leitura no celular, na fonte do portal (Roboto). */
        .motorista-agenda-controle{font-family:inherit;}
        .motorista-agenda-controle p,
        .motorista-agenda-controle span,
        .motorista-agenda-controle label,
        .motorista-agenda-controle button,
        .motorista-agenda-controle select,
        .motorista-agenda-controle input,
        .motorista-agenda-controle textarea{font-size:14px;line-height:1.4;}
        /* Desktop (18/11/2026): viagem em 16 px usando a largura toda; apoio (Preenchido por) em 14 px. */
        @media (min-width:768px){
          .motorista-agenda-controle .ct-mot-viagem p,
          .motorista-agenda-controle .ct-mot-viagem span{font-size:16px;line-height:1.45;}
          .motorista-agenda-controle .ct-mot-viagem p.ct-mot-apoio,
          .motorista-agenda-controle .ct-mot-viagem p.ct-mot-apoio *{font-size:14px;}
          .motorista-agenda-controle .ct-mot-viagem span.rounded-full{font-size:13px;}
          /* 18/11 (2): mesma escala da tela Hoje — linha principal 18, quadro do dia com faixa azul clara e título 20, barra e botões 16. */
          .motorista-agenda-controle .ct-mot-viagem p.ct-mot-linha{font-size:18px;line-height:1.4;color:#182443;}
          .motorista-agenda-controle .ct-mot-viagem button{font-size:16px;}
          .motorista-agenda-controle .ct-mot-barra button,
          .motorista-agenda-controle .ct-mot-barra p{font-size:16px;}
          .motorista-agenda-controle .ct-mot-barra p.text-lg{font-size:20px;color:#102a83;}
          .motorista-agenda-controle .ct-mot-barra p.uppercase{text-transform:none;letter-spacing:0;font-size:14px;color:#65718a;}
          .motorista-agenda-controle section.ct-mot-dia{border-radius:12px;overflow:hidden;border-color:#c9d8f0;padding:0 20px 16px;}
          .motorista-agenda-controle section.ct-mot-dia.border-\[\#102a83\]{border-color:#102a83;}
          .motorista-agenda-controle .ct-mot-dia-titulo{display:flex;align-items:center;gap:10px;margin:0 -20px;padding:12px 20px;width:calc(100% + 40px);background:#eef5ff;border-bottom:1px solid #c9d8f0;}
          .motorista-agenda-controle .ct-mot-dia-titulo p{margin:0;font-size:20px;font-weight:600;color:#102a83;text-transform:capitalize;}
          .motorista-agenda-controle .ct-mot-dia-titulo p + p{font-size:16px;font-weight:500;color:#182443;}
          .motorista-agenda-controle section.ct-mot-dia > div > p{font-size:16px;}
        }
        .motorista-agenda-controle h2,
        .motorista-agenda-controle h3{font-size:16px;line-height:1.3;}
        .motorista-agenda-controle .tracking-wide{letter-spacing:.04em;}
      `}</style>
    </div>
  );
}
