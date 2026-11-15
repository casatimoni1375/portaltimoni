"use client";
import { isFutureMeeting } from "@/lib/block-one-utils";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrazilianDateInput } from "@/components/ui/brazilian-date-input";
import { Carimbo } from "@/components/clean/carimbo";
import { createScreenRequest, ScreenRequestError } from "@/lib/screen-request";

type Meeting = {
  id: string;
  unit: "Araras" | "Rio Claro";
  date: string;
  time: string;
  secondDate: string;
  secondTime: string;
  additionalDates: Array<{ date: string; time: string }>;
  frequency: string;
  leaders: string;
  pautaUrl: string;
  ataUrl: string;
  slidesUrl: string;
  status: "agendada" | "concluida" | "mesclada";
};

type FormState = Omit<Meeting, "status">;
const EMPTY: FormState = {
  id: "", unit: "Araras", date: "", time: "07:40", secondDate: "",
  secondTime: "", additionalDates: [], frequency: "Mensal", leaders: "",
  pautaUrl: "", ataUrl: "", slidesUrl: "",
};

// Paleta limpa do padrão aprovado (mesma das agendas).
const INPUT = "mt-1 w-full rounded-lg border border-[#d7deeb] bg-white px-3 py-2 text-sm text-[#182443] outline-none focus:border-[#102a83]";
const LABEL = "text-xs font-semibold text-[#182443]";
const AJUDA = "mt-1 block text-[11px] font-normal text-[#65718a]";
const BOTAO_PRIMARIO = "rounded-lg bg-[#102a83] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const BOTAO_SECUNDARIO = "rounded-lg border border-[#102a83] bg-white px-4 py-2 text-sm font-semibold text-[#102a83] disabled:opacity-50";
const BOTAO_TEXTO = "text-sm font-semibold text-[#102a83] underline-offset-2 hover:underline";

function formatDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

// Mesma semana do mês e mesmo dia da semana, no mês seguinte.
function proximoMesMesmoDia(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const diaDaSemana = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const semanaDoMes = Math.floor((day - 1) / 7);
  const primeiroDoProximo = new Date(Date.UTC(year, month, 1));
  const deslocamento = (diaDaSemana - primeiroDoProximo.getUTCDay() + 7) % 7;
  const alvo = new Date(Date.UTC(year, month, 1 + deslocamento + semanaDoMes * 7));
  // Se a quinta semana não existir no mês seguinte, usa a última do mês.
  if (alvo.getUTCMonth() !== month % 12) alvo.setUTCDate(alvo.getUTCDate() - 7);
  return alvo.toISOString().slice(0, 10);
}

function ultimaReuniaoDaLoja(items: Meeting[], unit: Meeting["unit"]): Meeting | undefined {
  return items
    .filter((item) => item.unit === unit && item.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function pastOccurrences(meeting: Meeting) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return [
    { date: meeting.date, time: meeting.time },
    { date: meeting.secondDate, time: meeting.secondTime },
    ...(meeting.additionalDates || []),
  ]
    .filter((item) => item.date && item.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatTime(value: string) {
  return value ? value.replace(/^0/, "") : "";
}

// Reunião sem nenhuma data futura continua na tela enquanto tiver data passada
// aguardando arquivamento. Sem isso, o botão "Arquivar" da última reunião da série some.
function semDataFutura(meeting: Meeting): Meeting | null {
  if (meeting.status !== "agendada" || pastOccurrences(meeting).length === 0) return null;
  return { ...meeting, date: "", time: "", secondDate: "", secondTime: "", additionalDates: [] };
}

function upcomingMeeting(meeting: Meeting): Meeting | null {
  if (meeting.status !== "agendada") return null;
  const dates = [
    { date: meeting.date, time: meeting.time },
    { date: meeting.secondDate, time: meeting.secondTime },
    ...(meeting.additionalDates || []),
  ].filter((item) => item.date);

  const upcoming = dates
    .filter((item) => isFutureMeeting(item.date, item.time))
    .sort((a, b) => a.date.localeCompare(b.date));
  const schedule = upcoming;
  const selected = schedule[0];
  if (!selected) return null;

  return {
    ...meeting,
    date: selected.date,
    time: selected.time,
    secondDate: schedule[1]?.date || "",
    secondTime: schedule[1]?.time || "",
    additionalDates: schedule.slice(2),
  };
}

function DataDaReuniao({ rotulo, data, hora }: { rotulo: string; data: string; hora: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-[#65718a]">{rotulo}</p>
      <p className="mt-1 text-base font-bold text-[#182443]">{data ? formatDate(data) : "A definir"}</p>
      {data && hora && <p className="text-xs text-[#65718a]">{formatTime(hora)}</p>}
    </div>
  );
}

function MeetingCard({
  meeting, canManage, pendingOccurrences, onArchiveOccurrence,
}: {
  meeting: Meeting;
  canManage: boolean;
  pendingOccurrences: Array<{ date: string; time: string }>;
  onArchiveOccurrence: (id: string, date: string) => void;
}) {
  const links = [
    { label: "Pauta", url: meeting.pautaUrl },
    { label: "Ata", url: meeting.ataUrl },
    { label: "Apresentação", url: meeting.slidesUrl },
  ];

  return (
    <article className="rounded-xl border border-[#e1e6f0] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-base font-bold text-[#182443]">{meeting.unit}</h3>
        <span className="text-xs text-[#65718a]">{meeting.frequency}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <DataDaReuniao rotulo="Próxima" data={meeting.date} hora={meeting.time} />
        <DataDaReuniao rotulo="Seguinte" data={meeting.secondDate} hora={meeting.secondTime} />
      </div>

      {(meeting.additionalDates || []).length > 0 && (
        <p className="mt-3 text-xs text-[#65718a]">
          Outras datas: {meeting.additionalDates.map((item) => `${formatDate(item.date)}${item.time ? ` · ${formatTime(item.time)}` : ""}`).join("  ·  ")}
        </p>
      )}

      {pendingOccurrences.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[#e1e6f0] pt-3">
          {pendingOccurrences.map((occurrence) => (
            <div key={occurrence.date} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#65718a]">
              <span className="flex items-center gap-2">
                <Carimbo tom="pendente">Pendente</Carimbo>
                Anterior: {formatDate(occurrence.date)}{occurrence.time ? ` · ${formatTime(occurrence.time)}` : ""}
              </span>
              {canManage && (
                <button onClick={() => onArchiveOccurrence(meeting.id, occurrence.date)} className={BOTAO_TEXTO}>Arquivar</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#e1e6f0] pt-4 text-sm font-semibold">
        {links.map((link) => link.url ? (
          <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="text-[#102a83] hover:underline">{link.label}</a>
        ) : (
          <span key={link.label} className="text-[#9aa4b8]">{link.label}</span>
        ))}
      </div>
    </article>
  );
}

export default function ReunioesClient({
  allowedUnits, canManage, canCreate, canDelete,
}: {
  allowedUnits: Meeting["unit"][];
  canManage: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [items, setItems] = useState<Meeting[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const request = useRef<{ run: (options?: { urgent?: boolean }) => Promise<void> } | null>(null);
  const unitKey = allowedUnits.join("|");
  const load = () => request.current?.run({ urgent: true });
  useEffect(() => {
    setItems([]); setShowForm(false);
    const units = unitKey.split("|");
    const loader = createScreenRequest({
      load: async signal => {
        const response = await fetch("/api/reunioes", { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok) throw new ScreenRequestError(data.error || "Erro ao carregar reuniões.", response.status);
        return data as { items?: Meeting[] };
      },
      onData: data => { setItems((data.items || []).filter(item => units.includes(item.unit))); setError(""); },
      onError: error => {
        setError(error instanceof Error ? error.message : "Erro ao carregar reuniões.");
        if (error instanceof ScreenRequestError && [401, 403].includes(error.status)) { setItems([]); setShowForm(false); }
      },
      onBusy: setLoading,
    });
    request.current = loader;
    void loader.run();
    return () => { loader.dispose(); request.current = null; };
  }, [unitKey]);

  const visible = useMemo(
    () => items
      .filter((item) => allowedUnits.includes(item.unit))
      .map((item) => upcomingMeeting(item) ?? semDataFutura(item))
      .filter((item): item is Meeting => Boolean(item)),
    [items, allowedUnits],
  );
  const history = useMemo(() => {
    const completed = items
      .filter((item) => item.status === "concluida" && allowedUnits.includes(item.unit));
    const unique = new Map<string, Meeting>();
    completed.forEach((item) => unique.set(`${item.unit}-${item.date}`, item));
    return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [items, allowedUnits]);

  const scheduled = useMemo(
    () => items.filter((item) => item.status === "agendada" && allowedUnits.includes(item.unit)),
    [items, allowedUnits],
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Nova reunião da loja: herda horário e periodicidade da última reunião dela
  // e sugere a data no mesmo dia da semana do mês seguinte.
  function baseNova(unit: Meeting["unit"]): FormState {
    const ultima = ultimaReuniaoDaLoja(items, unit);
    return {
      ...EMPTY,
      unit,
      frequency: ultima?.frequency || EMPTY.frequency,
      time: ultima?.time || EMPTY.time,
      date: ultima ? proximoMesMesmoDia(ultima.date) : "",
    };
  }

  function startNew() {
    setForm(baseNova(allowedUnits[0] || "Araras"));
    setShowForm(true);
  }

  // Troca de loja em cadastro novo: atualiza horário e periodicidade da loja escolhida
  // e a data sugerida, mas preserva a data se a pessoa já tiver digitado uma.
  function trocarLoja(unit: Meeting["unit"]) {
    setForm((current) => {
      if (current.id) return { ...current, unit };
      const sugestaoAnterior = baseNova(current.unit).date;
      const nova = baseNova(unit);
      return {
        ...current,
        unit,
        frequency: nova.frequency,
        time: nova.time,
        date: current.date && current.date !== sugestaoAnterior ? current.date : nova.date,
      };
    });
  }

  function edit(meeting: Meeting) {
    const { status: _status, ...editable } = meeting;
    setForm(editable);
    setShowForm(true);
    window.setTimeout(() => document.getElementById("form-reuniao")?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  async function salvar(criarProxima: boolean) {
    if (criarProxima && !formRef.current?.reportValidity()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/reunioes", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      if (criarProxima) {
        // Próxima reunião já com os dados herdados desta.
        setForm({
          ...EMPTY,
          unit: form.unit,
          frequency: form.frequency,
          time: form.time,
          date: proximoMesMesmoDia(form.date),
        });
        setShowForm(true);
      } else {
        setForm(EMPTY);
        setShowForm(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(id: string, action: "complete" | "complete-occurrence" | "reopen" | "delete", occurrenceDate?: string) {
    if (action === "delete" && !window.confirm("Excluir esta reunião definitivamente?")) return;
    setError("");
    const response = await fetch("/api/reunioes", {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...(occurrenceDate ? { occurrenceDate } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Não foi possível concluir a operação.");
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="ct-clean-today-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--ct-font-page-title)] font-semibold text-[#102a83]">Reuniões{allowedUnits.length === 1 ? ` ${allowedUnits[0]}` : ""}</h1>
          <p className="mt-1 text-base text-[#65718a]">Pautas, atas e apresentações.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="https://drive.google.com/drive/folders/1a90BS_9nnf_9_o9VZyNDICfPyAxxyYOg" target="_blank" rel="noreferrer" className={BOTAO_SECUNDARIO}>Abrir pasta oficial</a>
          {canCreate && <button onClick={startNew} className={BOTAO_PRIMARIO}>+ Nova reunião</button>}
        </div>
      </header>

      {(form.id ? canManage : canCreate) && showForm && (
        <form
          id="form-reuniao"
          ref={formRef}
          onSubmit={(event) => { event.preventDefault(); void salvar(false); }}
          className="mt-6 rounded-xl border border-[#e1e6f0] bg-white p-5"
        >
          <h2 className="text-base font-bold text-[#182443]">{form.id ? "Editar reunião" : "Nova reunião"}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={LABEL}>Loja
              <select value={form.unit} onChange={(e) => trocarLoja(e.target.value as Meeting["unit"])} className={INPUT}>
                {allowedUnits.map(unit => <option key={unit}>{unit}</option>)}
              </select>
            </label>
            <label className={LABEL}>Periodicidade
              <input value={form.frequency} onChange={(e) => setField("frequency", e.target.value)} className={INPUT} required />
              <span className={AJUDA}>Padrão: mensal</span>
            </label>
            <label className={LABEL}>Horário
              <input type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} className={INPUT} required />
              <span className={AJUDA}>Vem da última reunião da loja</span>
            </label>
            <label className={LABEL}>Próxima data
              <BrazilianDateInput value={form.date} onChange={(value) => setField("date", value)} className={INPUT} required />
              <span className={AJUDA}>Mesmo dia da semana no mês seguinte</span>
            </label>

            <label className={LABEL}>Data seguinte
              <BrazilianDateInput value={form.secondDate} onChange={(value) => setField("secondDate", value)} className={INPUT} />
              <span className={AJUDA}>Opcional. Pode ficar em &quot;A definir&quot;</span>
            </label>
            <label className={LABEL}>Horário da seguinte
              <input type="time" value={form.secondTime} onChange={(e) => setField("secondTime", e.target.value)} className={INPUT} />
            </label>
            {form.additionalDates.map((item, index) => (
              <div key={index} className="contents">
                <label className={LABEL}>Outra data
                  <BrazilianDateInput value={item.date} onChange={(value) => setField("additionalDates", form.additionalDates.map((date, i) => i === index ? { ...date, date: value } : date))} className={INPUT} />
                </label>
                <label className={LABEL}>Horário
                  <div className="flex gap-2">
                    <input type="time" value={item.time} onChange={(e) => setField("additionalDates", form.additionalDates.map((date, i) => i === index ? { ...date, time: e.target.value } : date))} className={INPUT} />
                    <button type="button" onClick={() => setField("additionalDates", form.additionalDates.filter((_, i) => i !== index))} className="mt-1 rounded-lg border border-[#e1e6f0] bg-white px-3 text-sm font-semibold text-[#65718a] hover:text-[#182443]">Remover</button>
                  </div>
                </label>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setField("additionalDates", [...form.additionalDates, { date: "", time: "" }])} className={`${BOTAO_TEXTO} mt-3`}>+ Adicionar outra data</button>

          <div className="mt-5 grid gap-4 border-t border-[#e1e6f0] pt-5 md:grid-cols-3">
            <label className={LABEL}>Link da pauta
              <input type="url" value={form.pautaUrl} onChange={(e) => setField("pautaUrl", e.target.value)} className={INPUT} />
            </label>
            <label className={LABEL}>Link da ata
              <input type="url" value={form.ataUrl} onChange={(e) => setField("ataUrl", e.target.value)} className={INPUT} />
            </label>
            <label className={LABEL}>Link da apresentação
              <input type="url" value={form.slidesUrl} onChange={(e) => setField("slidesUrl", e.target.value)} className={INPUT} />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className={BOTAO_PRIMARIO}>{saving ? "Salvando..." : "Salvar reunião"}</button>
            {!form.id && <button type="button" disabled={saving} onClick={() => void salvar(true)} className={BOTAO_SECUNDARIO}>Salvar e criar a próxima</button>}
            <button type="button" onClick={() => setShowForm(false)} className={BOTAO_TEXTO}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 rounded-lg border border-[#f3c4c4] bg-white px-3 py-2 text-sm text-[#b42318]">{error}</p>}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-[#65718a]">Reuniões agendadas</h2>
        {loading ? <p className="mt-3 text-sm text-[#65718a]">Carregando...</p> :
          visible.length ? <div className={`mt-3 grid gap-4 ${allowedUnits.length > 1 ? "md:grid-cols-2" : ""}`}>
            {visible.map((meeting) => {
              const sourceMeeting = items.find((item) => item.id === meeting.id) || meeting;
              const pendingOccurrences = pastOccurrences(sourceMeeting);
              return (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  canManage={canManage}
                  pendingOccurrences={pendingOccurrences}
                  onArchiveOccurrence={(id, date) => void mutate(id, "complete-occurrence", date)}
                />
              );
            })}
          </div> : <p className="mt-3 text-sm text-[#65718a]">Nenhuma reunião agendada.</p>}
      </section>

      <details className="ct-clean-card mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-[#182443]">Editar ou excluir reuniões agendadas ({scheduled.length})</summary>
        <div className="mt-3 divide-y divide-[#e1e6f0]">
          {scheduled.length ? scheduled.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="text-sm text-[#182443]"><strong>{meeting.unit}</strong> · {meeting.frequency} · {formatDate(meeting.date)} · {formatTime(meeting.time)}</p>
              {canManage && (
                <div className="flex flex-wrap gap-4">
                  <button onClick={() => edit(meeting)} className={BOTAO_TEXTO}>Editar</button>
                  {canDelete && <button onClick={() => void mutate(meeting.id, "delete")} className="text-sm font-semibold text-[#b42318] hover:underline">Excluir</button>}
                </div>
              )}
            </div>
          )) : <p className="py-3 text-sm text-[#65718a]">Nenhuma reunião agendada.</p>}
        </div>
      </details>

      <details className="ct-clean-card mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#182443]">Reuniões arquivadas ({history.length})</summary>
        <div className="mt-3 divide-y divide-[#e1e6f0]">
          {history.length ? history.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="text-sm text-[#182443]"><strong>{meeting.unit}</strong> · {formatDate(meeting.date)} · {formatTime(meeting.time)}</p>
              {canManage && (
                <div className="flex flex-wrap gap-4">
                  <button onClick={() => void mutate(meeting.id, "reopen")} className={BOTAO_TEXTO}>Desarquivar</button>
                  {canDelete && <button onClick={() => void mutate(meeting.id, "delete")} className="text-sm font-semibold text-[#b42318] hover:underline">Excluir</button>}
                </div>
              )}
            </div>
          )) : <p className="py-3 text-sm text-[#65718a]">Nenhuma reunião concluída.</p>}
        </div>
      </details>
    </div>
  );
}
