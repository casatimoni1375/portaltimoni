import { listTeamMessagesBySender, type TeamMessage } from "@/lib/espaco-equipe";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

// Mensagens enviadas por este acesso, com a resposta da gestão quando houver.
export default async function EspacoEquipeMinhas({ email }: { email: string }) {
  let items: TeamMessage[] = [];
  try {
    items = await listTeamMessagesBySender(email);
  } catch {
    items = [];
  }
  if (!items.length) return null;
  return (
    <section className="ct-std-card mt-6 rounded-3xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl max-md:text-[15px] font-semibold text-slate-950">Suas mensagens</h2>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-blue-100 bg-white p-4">
            <p className="text-xs max-md:text-[10px] font-semibold text-blue-700">{formatDate(item.date)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm max-md:text-[11px] leading-6 text-slate-700">{item.message}</p>
            {item.reply ? (
              <div className="mt-3 rounded-lg border border-[#c9d8f0] bg-[#eef5ff] px-3 py-2">
                <p className="text-[13px] font-semibold text-[#102a83]">Resposta da gestão{item.repliedAt ? ` · ${formatDate(item.repliedAt)}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm max-md:text-[11px] leading-6 text-slate-700">{item.reply}</p>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-slate-500">Aguardando resposta da gestão.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
