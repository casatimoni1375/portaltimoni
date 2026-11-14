"use client";
import { isFutureMeeting } from "@/lib/block-one-utils";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrazilianDateInput } from "@/components/ui/brazilian-date-input";
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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{meeting.unit}</h3>
          <p className="mt-1 text-sm text-slate-500">{meeting.frequency}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Próxima</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatDate(meeting.date)}</p>
          {meeting.time && <p className="text-sm text-slate-500">{formatTime(meeting.time)}</p>}
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Seguinte</p>
          {meeting.secondDate ? (
            <>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatDate(meeting.secondDate)}</p>
              {meeting.secondTime && <p className="text-sm text-slate-500">{formatTime(meeting.secondTime)}</p>}
            </>
          ) : (
            <p className="mt-1 text-base text-slate-500">A definir</p>
          )}
        </div>
      </div>

      {(meeting.additionalDates || []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {meeting.additionalDates.map((item) => (
            <span key={item.date} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
              {formatDate(item.date)}{item.time ? ` · ${formatTime(item.time)}` : ""}
            </span>
          ))}
        </div>
      )}

      {pendingOccurrences.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Reunião anterior</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingOccurrences.map((occurrence) => (
              <div key={occurrence.date} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
                <span className="text-sm text-slate-700">{formatDate(occurrence.date)}{occurrence.time ? ` · ${formatTime(occurrence.time)}` : ""}</span>
                {canManage && (
                  <button onClick={() => onArchiveOccurrence(meeting.id, occurrence.date)} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">Arquivar</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-3">
        {links.map((link) => link.url ? (
          <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-blue-800 hover:bg-slate-50">{link.label}</a>
        ) : (
          <span key={link.label} className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center text-sm text-slate-400">{link.label}</span>
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
      .map(upcomingMeeting)
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
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Reuniões{allowedUnits.length === 1 ? ` ${allowedUnits[0]}` : ""}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Pautas, atas, apresentações e datas futuras por loja.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && <button onClick={startNew} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">+ Nova reunião</button>}
            <a href="https://drive.google.com/drive/folders/1a90BS_9nnf_9_o9VZyNDICfPyAxxyYOg" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Abrir pasta oficial</a>
          </div>
        </div>
      </section>

      {(form.id ? canManage : canCreate) && showForm && (
        <form
          id="form-reuniao"
          ref={formRef}
          onSubmit={(event) => { event.preventDefault(); void salvar(false); }}
          className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
        >
          <h2 className="text-xl font-semibold text-slate-900 md:col-span-2">{form.id ? "Editar reunião" : "Nova reunião"}</h2>
          <label className="text-sm font-medium text-slate-700">Loja
            <select value={form.unit} onChange={(e) => trocarLoja(e.target.value as Meeting["unit"])} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {allowedUnits.map(unit => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Periodicidade
            <input value={form.frequency} onChange={(e) => setField("frequency", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
          </label>
          <label className="text-sm font-medium text-slate-700">Primeira data
            <BrazilianDateInput value={form.date} onChange={(value) => setField("date", value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
            <span className="mt-1 block text-xs font-normal text-slate-500">Sugestão: mesmo dia da semana do mês seguinte à última reunião.</span>
          </label>
          <label className="text-sm font-medium text-slate-700">Primeiro horário
            <input type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
          </label>
          <label className="text-sm font-medium text-slate-700">Segunda data (opcional)
            <BrazilianDateInput value={form.secondDate} onChange={(value) => setField("secondDate", value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Horário da data seguinte (opcional)
            <input type="time" value={form.secondTime} onChange={(e) => setField("secondTime", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          {form.additionalDates.map((item, index) => (
            <div key={index} className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Outra data (opcional)
                <BrazilianDateInput value={item.date} onChange={(value) => setField("additionalDates", form.additionalDates.map((date, i) => i === index ? { ...date, date: value } : date))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Horário (opcional)
                <div className="flex gap-2">
                  <input type="time" value={item.time} onChange={(e) => setField("additionalDates", form.additionalDates.map((date, i) => i === index ? { ...date, time: e.target.value } : date))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
                  <button type="button" onClick={() => setField("additionalDates", form.additionalDates.filter((_, i) => i !== index))} className="mt-1 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-700">Remover</button>
                </div>
              </label>
            </div>
          ))}
          <button type="button" onClick={() => setField("additionalDates", [...form.additionalDates, { date: "", time: "" }])} className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 md:col-span-2">+ Adicionar outra data</button>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Link da pauta
            <input type="url" value={form.pautaUrl} onChange={(e) => setField("pautaUrl", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Link da ata
            <input type="url" value={form.ataUrl} onChange={(e) => setField("ataUrl", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Link da apresentação
            <input type="url" value={form.slidesUrl} onChange={(e) => setField("slidesUrl", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar reunião"}</button>
            {!form.id && <button type="button" disabled={saving} onClick={() => void salvar(true)} className="rounded-xl border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-800 disabled:opacity-50">Salvar e criar a próxima</button>}
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <section className="mt-5">
        <h2 className="text-xl font-semibold text-slate-900">Reuniões agendadas</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Carregando...</p> :
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
          </div> : <p className="mt-3 text-sm text-slate-500">Nenhuma reunião agendada.</p>}
      </section>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Editar ou excluir reuniões agendadas ({scheduled.length})</summary>
        <div className="mt-4 grid gap-3">
          {scheduled.length ? scheduled.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-700"><strong>{meeting.unit}</strong> · {meeting.frequency} · {formatDate(meeting.date)} · {formatTime(meeting.time)}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => edit(meeting)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">Editar</button>
                  {canDelete && <button onClick={() => void mutate(meeting.id, "delete")} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">Excluir</button>}
                </div>
              )}
            </div>
          )) : <p className="text-sm text-slate-500">Nenhuma reunião agendada.</p>}
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Reuniões arquivadas ({history.length})</summary>
        <div className="mt-4 grid gap-3">
          {history.length ? history.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-700"><strong>{meeting.unit}</strong> · {formatDate(meeting.date)} · {formatTime(meeting.time)}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void mutate(meeting.id, "reopen")} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800">Desarquivar</button>
                  {canDelete && <button onClick={() => void mutate(meeting.id, "delete")} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">Excluir</button>}
                </div>
              )}
            </div>
          )) : <p className="text-sm text-slate-500">Nenhuma reunião concluída.</p>}
        </div>
      </details>
    </>
  );
}
