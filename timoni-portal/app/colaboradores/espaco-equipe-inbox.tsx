import EspacoEquipeActions from "@/app/colaboradores/espaco-equipe-actions";
import { listTeamMessages, type TeamMessage } from "@/lib/espaco-equipe";

function formatMessageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MessageBox({ item, index, canDelete }: { item: TeamMessage; index: number; canDelete: boolean }) {
  return (
    <article
      key={`${item.date}-${index}`}
      className="rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs max-md:text-[10px] font-semibold uppercase tracking-wider text-blue-700">
        {item.id ? <span>Mensagem #{item.id}</span> : null}
        <span>{formatMessageDate(item.date)}</span>
        {["concluído", "concluido"].includes(item.status.trim().toLowerCase()) ? <span className="rounded bg-emerald-50 px-1.5 text-emerald-700 normal-case">OK</span> : item.reply ? <span className="rounded bg-[#eef5ff] px-1.5 text-[#102a83] normal-case">Respondida</span> : <span className="rounded bg-amber-50 px-1.5 text-amber-700 normal-case">Nova</span>}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm max-md:text-[11px] leading-6 text-slate-700">{item.message}</p>
      {item.reply ? (
        <div className="mt-3 rounded-lg border border-[#c9d8f0] bg-[#eef5ff] px-3 py-2">
          <p className="text-[13px] font-semibold text-[#102a83]">Resposta da gestão{item.repliedAt ? ` · ${formatMessageDate(item.repliedAt)}` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm max-md:text-[11px] leading-6 text-slate-700">{item.reply}</p>
        </div>
      ) : null}
      {canDelete && item.id ? <EspacoEquipeActions id={item.id} status={item.status} canAct={canDelete} /> : null}
    </article>
  );
}

export default async function EspacoEquipeInbox({
  accessToken,
  canDelete = false,
}: {
  accessToken?: string;
  canDelete?: boolean;
}) {
  let messages: TeamMessage[] = [];

  try {
    messages = await listTeamMessages(accessToken);
  } catch {
    messages = [];
  }

  return (
    <section className="ct-std-card mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
      {/* 18/11: padrão do portal — título "Equipe" na página; quadro "Mensagens recebidas". */}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl max-md:text-[15px] font-semibold text-slate-950">Mensagens recebidas</h2>
          <a
            href="/api/espaco-equipe/planilha"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm max-md:text-[11px] font-semibold text-blue-800 shadow-sm transition hover:bg-blue-50"
          >
            Baixar planilha para pauta
          </a>
        </div>
      </div>

      {messages.length ? (
        <div className="ct-equipe-msgs mt-3 grid gap-3 md:grid-cols-2">
          {messages.map((item, index) => (
            <MessageBox key={`${item.date}-${index}`} item={item} index={index} canDelete={canDelete} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-white/80 p-4 text-sm max-md:text-[11px] text-slate-600">
          Nenhuma mensagem registrada ainda.
        </p>
      )}
    </section>
  );
}
