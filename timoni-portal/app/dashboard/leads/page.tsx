"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  companyKey,
  dailyProgress,
  deadline,
  isActive,
  OWNERS,
  prioritySort,
  STAGES,
  type LeadEvent,
  type LeadUnit,
  type Opportunity,
} from "@/lib/leads-workflow";

type LegacyActivity = {
  data: string;
  tipo: string;
  cliente: string;
  observacoes: string;
  proximoContato: string;
};
type Workspace = {
  legacyActivities: LegacyActivity[];
  items: Opportunity[];
  events: LeadEvent[];
  today: string;
  location: LeadUnit;
  canViewBothLocations: boolean;
  canEdit: boolean;
  canCreate: boolean;
};
type View = "agenda" | "prospeccao" | "funil" | "historico";
type Kind = LeadEvent["kind"];
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 focus:border-[#14038D] focus:outline-none focus:ring-2 focus:ring-indigo-100";
const secondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primary =
  "rounded-xl bg-[#14038D] px-4 py-2.5 text-base font-bold text-white hover:bg-indigo-900 disabled:opacity-50";
const dateLabel = (value: string) =>
  value ? value.split("-").reverse().join("/") : "Agendar retorno";
function Contact({ value }: { value: string }) {
  const parts = value.split(/\s*(?:\n|;|\||\s\/\s)\s*/).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part, index) => {
        const digits = part.replace(/\D/g, "");
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part))
          return (
            <a
              key={index}
              href={`mailto:${part}`}
              className="break-all font-semibold text-blue-800 underline"
            >
              {part}
            </a>
          );
        if (
          !/[a-zá-ú]/i.test(part) &&
          digits.length >= 10 &&
          digits.length <= 13
        )
          return (
            <a
              key={index}
              href={`https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800"
            >
              WhatsApp ↗
            </a>
          );
        return (
          <span key={index} className="break-all text-slate-600">
            {part}
          </span>
        );
      })}
    </div>
  );
}
export default function LeadsPage() {
  const [data, setData] = useState<Workspace | null>(null);
  const [unit, setUnit] = useState<LeadUnit | "">("");
  const [owner, setOwner] = useState("");
  const [view, setView] = useState<View>("agenda");
  const [filter, setFilter] = useState("pendentes");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{
    item: Opportunity;
    kind: Kind;
    requestId: string;
  } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [searchCompanies, setSearchCompanies] = useState(false);
  const [imports, setImports] = useState<Record<string, string>[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const location = data?.location ?? (unit || "rc");
  const owners = OWNERS[location];
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/leads/workspace${unit ? `?location=${unit}` : ""}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error ?? "Não foi possível carregar os contatos.");
      if (current === generation.current) {
        setData(result);
        setOwner((previous) =>
          previous &&
          (OWNERS[result.location as LeadUnit] as readonly string[]).includes(
            previous,
          )
            ? previous
            : OWNERS[result.location as LeadUnit][0],
        );
      }
    } catch (err) {
      if (current === generation.current) {
        setData(null);
        setError(err instanceof Error ? err.message : "Falha ao carregar.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [unit]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setVisibleCount(10);
  }, [owner, view, filter, query, segment]);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
  }, [modal]);
  const selected = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) =>
          (!owner || item.responsavel === owner) &&
          (!segment || item.segmento === segment) &&
          (!query ||
            `${item.empresa} ${item.contato} ${item.telefone} ${item.segmento} ${item.oportunidade}`
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR"))),
      ),
    [data, owner, query, segment],
  );
  const active = selected.filter(isActive);
  const progress = dailyProgress(
    data?.items ?? [],
    data?.events ?? [],
    owner,
    data?.today,
  );
  const filtered = selected
    .filter((item) => {
      if (view === "prospeccao") return item.etapa === "A contatar";
      if (view !== "agenda") return true;
      const status = deadline(item, data?.today);
      if (filter === "todos") return isActive(item);
      if (filter === "pendentes")
        return ["atrasado", "hoje", "sem-data"].includes(status);
      return status === filter;
    })
    .sort(prioritySort);
  const doneIds = new Set(
    (data?.events ?? [])
      .filter(
        (event) =>
          event.kind === "contato" &&
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
          }).format(new Date(event.at)) === data?.today,
      )
      .map((event) => event.item.id),
  );
  const focus = active
    .filter(
      (item) =>
        ["atrasado", "hoje", "sem-data"].includes(
          deadline(item, data?.today),
        ) && !doneIds.has(item.id),
    )
    .sort(prioritySort)[0];
  const history = (data?.events ?? [])
    .filter((event) => selected.some((item) => item.id === event.item.id))
    .slice()
    .reverse();
  function open(item: Opportunity, kind: Kind) {
    setError("");
    setNotice("");
    if (kind === "agendamento" && item.etapa === "Ganho") {
      item = {
        ...item,
        etapa: "Pós-venda / Recompra",
        proximaAcao: "Acompanhar entrega e próxima compra",
        proximoContato: "",
      };
    }
    setModal({ item, kind, requestId: crypto.randomUUID() });
  }
  function create() {
    open(
      {
        id: "",
        empresa: "",
        segmento: "",
        cidade: "",
        contato: "",
        telefone: "",
        oportunidade: "",
        observacoes: "",
        responsavel: owner || owners[0],
        etapa: "A contatar",
        proximaAcao: "Fazer a primeira abordagem",
        proximoContato: data?.today ?? "",
        ultimoContato: "",
        motivo: "",
        revision: "",
      },
      "cadastro",
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || busy.current) return;
    const fields = new FormData(event.currentTarget);
    const payload = { ...modal.item, ...Object.fromEntries(fields.entries()) };
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leads/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          item: payload,
          kind: modal.kind,
          requestId: modal.requestId,
          resultado: fields.get("resultado"),
          nota: fields.get("nota"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Não foi possível salvar.");
      const message =
        modal.kind === "contato"
          ? "Contato registrado. Próximo passo organizado!"
          : modal.kind === "agendamento"
            ? "Retorno agendado. O histórico foi preservado."
            : "Dados salvos.";
      setModal(null);
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function readImport(file: File) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "", raw: false },
      );
      const aliases: Record<string, string[]> = {
        cliente: ["empresa", "cliente", "razaosocial", "nomefantasia"],
        segmento: ["segmento", "ramo"],
        contato: ["contato", "pessoa", "responsavel"],
        canal: ["telefone", "email", "telefoneemail", "canal", "whatsapp"],
        proximoContato: ["proximocontato", "retorno", "datafollowup"],
        ultimoContato: ["ultimocontato"],
        observacoes: ["observacoes", "observacao", "notas"],
      };
      const clean = (value: string) =>
        companyKey(value).replace(/[^a-z0-9]/g, "");
      const known = new Set(
        (data?.items ?? []).map((item) => companyKey(item.empresa)),
      );
      const parsed = rows
        .map((row) =>
          Object.fromEntries(
            Object.entries(aliases).map(([field, names]) => [
              field,
              String(
                Object.entries(row).find(([key]) =>
                  names.includes(clean(key)),
                )?.[1] ?? "",
              ).trim(),
            ]),
          ),
        )
        .filter((row) => row.cliente && !known.has(companyKey(row.cliente)));
      const unique = [
        ...new Map(
          parsed.map((row) => [companyKey(row.cliente), row]),
        ).values(),
      ];
      if (!unique.length)
        throw Error(
          "Nenhuma empresa nova encontrada. Confira as colunas Empresa ou Cliente.",
        );
      if (unique.length > 1000)
        throw Error("Importe até 1.000 empresas por arquivo.");
      setImports(unique);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível ler o arquivo.",
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function confirmImport() {
    if (!imports || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, rows: imports }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Falha na importação.");
      setImports(null);
      setNotice(
        `${result.imported} empresas importadas. Complete as próximas ações na agenda.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function exportList() {
    const XLSX = await import("xlsx");
    const rows = [
      [
        "Empresa",
        "Responsável",
        "Etapa",
        "Próxima ação",
        "Próximo contato",
        "Último contato",
        "Contato",
        "Telefone/e-mail",
        "Produto",
        "Observações",
      ],
      ...selected.map((item) => [
        item.empresa,
        item.responsavel,
        item.etapa,
        item.proximaAcao,
        dateLabel(item.proximoContato),
        item.ultimoContato ? dateLabel(item.ultimoContato) : "",
        item.contato,
        item.telefone,
        item.oportunidade,
        item.observacoes,
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      "Acompanhamento",
    );
    XLSX.writeFile(workbook, `Leads-${location}-${data?.today}.xlsx`);
  }
  function badge(item: Opportunity) {
    const status = deadline(item, data?.today);
    return (
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${status === "atrasado" ? "bg-red-100 text-red-800" : status === "hoje" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}
      >
        {status === "atrasado"
          ? "Atrasado · "
          : status === "hoje"
            ? "Hoje · "
            : ""}
        {isActive(item) ? dateLabel(item.proximoContato) : item.etapa}
      </span>
    );
  }
  function card(item: Opportunity, compact = false) {
    return (
      <article
        key={item.id}
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            onClick={() => setDetail(item.id)}
            className="break-words text-left text-lg font-bold text-slate-950 hover:underline"
          >
            {item.empresa}
          </button>
          {badge(item)}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {item.responsavel} · {item.etapa}
          {item.segmento ? ` · ${item.segmento}` : ""}
        </p>
        <p className="mt-4 text-base font-semibold text-slate-900">
          {item.proximaAcao || "Definir a próxima ação"}
        </p>
        {!compact && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              Último contato:{" "}
              {item.ultimoContato
                ? dateLabel(item.ultimoContato)
                : "Ainda não registrado"}
              {item.contato ? ` · ${item.contato}` : ""}
            </p>
            {item.oportunidade && (
              <p className="mt-2 text-base text-slate-700">
                Interesse: {item.oportunidade}
              </p>
            )}
          </>
        )}
        <div className="mt-3">
          <Contact value={item.telefone} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.canEdit && (
            <>
              <button className={primary} onClick={() => open(item, "contato")}>
                Registrar contato
              </button>
              <button
                className={secondary}
                onClick={() => open(item, "agendamento")}
              >
                {item.etapa === "Ganho"
                  ? "Agendar pós-venda"
                  : "Agendar retorno"}
              </button>
            </>
          )}
          <button
            className="px-2 py-2 text-base font-semibold text-[#14038D] underline"
            onClick={() => setDetail(item.id)}
          >
            Ver histórico
          </button>
        </div>
      </article>
    );
  }
  const detailItem = data?.items.find((item) => item.id === detail);
  return (
    <div className="ct-modern-workspace pb-10 text-base">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[#14038D]">
            Casa Timoni · {location === "rc" ? "Rio Claro" : "Araras"}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Prospecção e Follow-up
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Cada contato com um próximo passo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.canCreate && (
            <button onClick={create} className={primary}>
              + Nova empresa
            </button>
          )}
          <button
            className={secondary}
            disabled={loading}
            onClick={() => void load()}
          >
            Atualizar
          </button>
        </div>
      </header>
      {data?.canViewBothLocations && (
        <div className="mb-4 flex gap-2" aria-label="Unidade">
          {(["rc", "ara"] as LeadUnit[]).map((value) => (
            <button
              key={value}
              className={value === location ? primary : secondary}
              aria-pressed={value === location}
              onClick={() => {
                setUnit(value);
                setData(null);
                setOwner("");
                setSegment("");
                setQuery("");
                setDetail(null);
                setModal(null);
              }}
            >
              {value === "rc" ? "Rio Claro" : "Araras"}
            </button>
          ))}
        </div>
      )}
      {error && !modal && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-900"
        >
          {notice}
        </div>
      )}
      {loading ? (
        <p role="status" className="rounded-2xl bg-white p-8 text-lg">
          Carregando sua agenda…
        </p>
      ) : (
        data && (
          <>
            <div
              className="mb-5 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Responsável"
            >
              {owners.map((name) => (
                <button
                  key={name}
                  onClick={() => setOwner(name)}
                  aria-pressed={owner === name}
                  className={owner === name ? primary : secondary}
                >
                  {name}
                  {location === "rc" && name === "Jaqueline"
                    ? " · principal"
                    : ""}
                </button>
              ))}
              <button
                onClick={() => setOwner("")}
                aria-pressed={!owner}
                className={!owner ? primary : secondary}
              >
                Toda a equipe
              </button>
            </div>
            <section className="mb-5 rounded-3xl bg-[#14038D] p-5 text-white sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-base font-semibold text-indigo-100">
                    {owner ? `Agenda de ${owner}` : "Agenda da equipe"}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">
                    {progress.remaining
                      ? `${progress.remaining} empresas precisam de ação`
                      : active.length
                        ? "Retornos do dia em ordem"
                        : "Comece sua prospecção"}
                  </h2>
                  <p className="mt-2 text-base text-indigo-100">
                    {progress.done} empresa(s) com contato registrado hoje.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
                  <b className="text-3xl">
                    {progress.done}/{progress.total}
                  </b>
                  <p className="text-sm">contatos da agenda</p>
                </div>
              </div>
              <div
                className="mt-4 h-3 overflow-hidden rounded-full bg-white/20"
                role="progressbar"
                aria-label="Contatos realizados"
                aria-valuemin={0}
                aria-valuemax={progress.total || 1}
                aria-valuenow={progress.done}
              >
                <div
                  className="h-full rounded-full bg-yellow-300 transition-all"
                  style={{
                    width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              {focus ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 text-slate-950">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#14038D]">
                      Seu próximo contato
                    </p>
                    <p className="mt-1 text-xl font-bold">{focus.empresa}</p>
                    <p className="mt-1 text-base">
                      {focus.proximaAcao} · {dateLabel(focus.proximoContato)}
                    </p>
                    <div className="mt-3">
                      <Contact value={focus.telefone} />
                    </div>
                  </div>
                  {data.canEdit && (
                    <button
                      className="rounded-xl bg-yellow-300 px-5 py-3 text-base font-bold text-indigo-950 hover:bg-yellow-200"
                      onClick={() => open(focus, "contato")}
                    >
                      Começar por este contato →
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-base text-indigo-100">
                  {active.length
                    ? "Confira os próximos retornos ou faça uma nova abordagem."
                    : "Cadastre uma empresa para organizar a primeira abordagem."}
                </p>
              )}
            </section>
            <nav
              className="mb-4 flex flex-wrap gap-2"
              aria-label="Visualização"
            >
              {(
                [
                  ["agenda", "Minha agenda"],
                  ["prospeccao", "Prospecção"],
                  ["funil", "Funil comercial"],
                  ["historico", "Histórico"],
                ] as [View, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-current={view === key ? "page" : undefined}
                  className={view === key ? primary : secondary}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <label className="min-w-48 flex-1 text-sm font-semibold">
                Buscar empresa ou contato
                <input
                  aria-label="Buscar empresa ou contato"
                  className={inputClass}
                  placeholder="Digite o nome, contato ou produto"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Segmento
                <select
                  className={inputClass}
                  value={segment}
                  onChange={(event) => setSegment(event.target.value)}
                >
                  <option value="">Todos os segmentos</option>
                  {[
                    ...new Set(
                      data.items.map((item) => item.segmento).filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
            </div>
            {view === "agenda" && (
              <div
                className="mb-4 flex flex-wrap gap-2"
                aria-label="Prazo do retorno"
              >
                {[
                  ["pendentes", "Precisam de ação"],
                  ["atrasado", "Atrasados"],
                  ["hoje", "Hoje"],
                  ["proximo", "Próximos"],
                  ["sem-data", "Sem data"],
                  ["todos", "Todos os ativos"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full border px-4 py-2 text-base font-semibold ${filter === key ? "border-indigo-800 bg-indigo-50 text-indigo-950" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    {label}
                    {key !== "pendentes" && key !== "todos"
                      ? ` (${active.filter((item) => deadline(item, data.today) === key).length})`
                      : ""}
                  </button>
                ))}
              </div>
            )}
            {view === "funil" ? (
              <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {STAGES.map((stage) => (
                  <section key={stage} className="rounded-2xl bg-slate-100 p-3">
                    <h2 className="mb-3 px-1 text-lg font-bold">
                      {stage}{" "}
                      <span className="text-slate-500">
                        {selected.filter((item) => item.etapa === stage).length}
                      </span>
                    </h2>
                    <div className="space-y-3">
                      {selected
                        .filter((item) => item.etapa === stage)
                        .map((item) => card(item, true))}
                    </div>
                  </section>
                ))}
              </div>
            ) : view === "historico" ? (
              <div className="space-y-3">
                {history.length ? (
                  history.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-2xl border bg-white p-5"
                    >
                      <p className="text-sm text-slate-500">
                        {new Date(event.at).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}{" "}
                        · {event.item.responsavel}
                      </p>
                      <h2 className="mt-1 text-lg font-bold">
                        {event.item.empresa}
                      </h2>
                      <p className="mt-1 font-semibold">
                        {event.kind === "contato"
                          ? event.resultado
                          : event.kind === "agendamento"
                            ? "Retorno reagendado"
                            : event.kind === "cadastro"
                              ? "Empresa cadastrada"
                              : "Cadastro atualizado"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">
                        {event.nota}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Registrado por {event.actor}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl bg-white p-7 text-slate-600">
                    Os novos contatos e alterações aparecerão aqui. As
                    observações anteriores continuam na ficha da empresa.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.length ? (
                  filtered.slice(0, visibleCount).map((item) => card(item))
                ) : (
                  <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-lg text-slate-600">
                    Nenhuma empresa neste filtro. Confira os próximos retornos
                    ou a prospecção.
                  </p>
                )}
              </div>
            )}
            {(view === "agenda" || view === "prospeccao") &&
              filtered.length > visibleCount && (
                <button
                  className={`${secondary} mt-4 w-full`}
                  onClick={() => setVisibleCount((value) => value + 10)}
                >
                  Mostrar mais 10 empresas ({visibleCount} de {filtered.length})
                </button>
              )}
            <footer className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
              <button
                className={secondary}
                onClick={() => setSearchCompanies(true)}
              >
                Buscar novas empresas
              </button>
              {data.canCreate && (
                <button
                  className={secondary}
                  onClick={() => fileRef.current?.click()}
                >
                  Importar planilha
                </button>
              )}
              <button className={secondary} onClick={exportList}>
                Exportar acompanhamento
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readImport(file);
                }}
              />
            </footer>
          </>
        )
      )}
      {modal && (
        <dialog
          ref={dialogRef}
          onCancel={(event) => {
            if (saving) event.preventDefault();
            else {
              setModal(null);
              setError("");
            }
          }}
          className="m-auto max-h-[90dvh] w-[min(95vw,720px)] overflow-y-auto rounded-3xl bg-white p-5 text-slate-950 shadow-2xl backdrop:bg-slate-950/50 sm:p-7"
        >
          <form onSubmit={save}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">
                  {modal.kind === "contato"
                    ? "Registrar contato"
                    : modal.kind === "agendamento"
                      ? "Agendar retorno"
                      : modal.kind === "cadastro"
                        ? "Nova empresa"
                        : "Editar empresa"}
                </h2>
                <p className="mt-1 text-base text-slate-600">
                  {modal.item.empresa || "Organize a primeira abordagem."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                disabled={saving}
                className={secondary}
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                ×
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-red-800"
              >
                {error}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(modal.kind === "cadastro" || modal.kind === "edicao") && (
                <>
                  {[
                    ["empresa", "Empresa", true],
                    ["segmento", "Segmento", false],
                    ["contato", "Pessoa de contato", false],
                    ["telefone", "WhatsApp / e-mail", false],
                    ["cidade", "Cidade / região", false],
                    ["oportunidade", "Produto de interesse", false],
                  ].map(([key, label, required]) => (
                    <label
                      key={String(key)}
                      className="text-base font-semibold"
                    >
                      {label}
                      <input
                        className={inputClass}
                        name={String(key)}
                        required={Boolean(required)}
                        defaultValue={String(
                          modal.item[key as keyof Opportunity],
                        )}
                      />
                    </label>
                  ))}
                </>
              )}
              {modal.kind === "contato" && (
                <label className="text-base font-semibold sm:col-span-2">
                  Resultado do contato
                  <select
                    required
                    name="resultado"
                    defaultValue=""
                    onChange={(event) => {
                      const stage = (
                        {
                          "Cotação enviada": "Cotação enviada",
                          "Venda realizada": "Ganho",
                          "Sem interesse": "Perdido",
                        } as Record<string, Opportunity["etapa"]>
                      )[event.target.value];
                      if (stage)
                        setModal({
                          ...modal,
                          item: { ...modal.item, etapa: stage },
                        });
                    }}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Selecione o que aconteceu
                    </option>
                    {[
                      "Conversou com o cliente",
                      "Sem resposta",
                      "Cotação enviada",
                      "Venda realizada",
                      "Sem interesse",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-base font-semibold">
                Responsável
                <select
                  name="responsavel"
                  defaultValue={modal.item.responsavel}
                  className={inputClass}
                >
                  {owners.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="text-base font-semibold">
                Etapa comercial
                <select
                  name="etapa"
                  value={modal.item.etapa}
                  onChange={(event) =>
                    setModal({
                      ...modal,
                      item: {
                        ...modal.item,
                        etapa: event.target.value as Opportunity["etapa"],
                      },
                    })
                  }
                  className={inputClass}
                >
                  {STAGES.map((stage) => (
                    <option key={stage}>{stage}</option>
                  ))}
                </select>
              </label>
              {isActive(modal.item) && (
                <>
                  <label className="text-base font-semibold sm:col-span-2">
                    Próxima ação *
                    <input
                      required
                      name="proximaAcao"
                      defaultValue={modal.item.proximaAcao}
                      placeholder="Ex.: confirmar recebimento da cotação"
                      className={inputClass}
                    />
                  </label>
                  <label className="text-base font-semibold sm:col-span-2">
                    Data do próximo contato *
                    <input
                      required
                      type="date"
                      name="proximoContato"
                      min={
                        modal.kind === "contato" || modal.kind === "agendamento"
                          ? data?.today
                          : undefined
                      }
                      defaultValue={
                        modal.kind === "edicao"
                          ? modal.item.proximoContato
                          : modal.item.proximoContato &&
                              modal.item.proximoContato >= (data?.today ?? "")
                            ? modal.item.proximoContato
                            : data?.today
                      }
                      className={inputClass}
                    />
                  </label>
                </>
              )}
              {modal.item.etapa === "Perdido" && (
                <label className="text-base font-semibold sm:col-span-2">
                  Motivo da perda *
                  <input
                    required
                    name="motivo"
                    defaultValue={modal.item.motivo}
                    className={inputClass}
                  />
                </label>
              )}
              {modal.kind === "contato" || modal.kind === "agendamento" ? (
                <label className="text-base font-semibold sm:col-span-2">
                  {modal.kind === "contato"
                    ? "O que aconteceu? *"
                    : "Motivo do reagendamento *"}
                  <textarea
                    required
                    name="nota"
                    rows={3}
                    className={inputClass}
                    placeholder={
                      modal.kind === "contato"
                        ? "Ex.: cliente pediu cotação de filme stretch."
                        : "Ex.: cliente pediu retorno na próxima semana."
                    }
                  />
                </label>
              ) : (
                <label className="text-base font-semibold sm:col-span-2">
                  Observações
                  <textarea
                    name="observacoes"
                    defaultValue={modal.item.observacoes}
                    rows={3}
                    className={inputClass}
                  />
                </label>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={secondary}
                disabled={saving}
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                Cancelar
              </button>
              <button disabled={saving} className={primary}>
                {saving
                  ? "Salvando…"
                  : modal.kind === "contato"
                    ? "Salvar contato e próximo passo"
                    : "Salvar"}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {detailItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Ficha e histórico da empresa"
            className="mx-auto max-w-3xl rounded-3xl bg-white p-5 sm:p-7"
          >
            <div className="flex justify-between gap-3">
              <h2 className="text-2xl font-bold">{detailItem.empresa}</h2>
              <button
                autoFocus
                className={secondary}
                onClick={() => setDetail(null)}
              >
                Fechar
              </button>
            </div>
            <p className="mt-2">
              {detailItem.responsavel} · {detailItem.etapa} ·{" "}
              {detailItem.segmento}
            </p>
            <div className="mt-3">
              <Contact value={detailItem.telefone} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-slate-700">
              {detailItem.observacoes}
            </p>
            {detailItem.motivo && (
              <p className="mt-3">Motivo da perda: {detailItem.motivo}</p>
            )}
            <p className="mt-3 font-semibold">
              Próxima ação: {detailItem.proximaAcao} ·{" "}
              {dateLabel(detailItem.proximoContato)}
            </p>
            {data?.canEdit && (
              <button
                className={`${secondary} mt-4`}
                onClick={() => {
                  setDetail(null);
                  open(detailItem, "edicao");
                }}
              >
                Editar cadastro / etapa
              </button>
            )}
            <h3 className="mb-3 mt-6 text-xl font-bold">Histórico</h3>
            <div className="space-y-3">
              {(data?.legacyActivities ?? [])
                .filter(
                  (event) =>
                    companyKey(event.cliente) ===
                      companyKey(detailItem.empresa) ||
                    detailItem.id === `base:${companyKey(event.cliente)}`,
                )
                .slice()
                .reverse()
                .map((event, index) => (
                  <div
                    key={`anterior-${index}`}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <p className="font-semibold">
                      Registro anterior · {event.tipo}
                    </p>
                    <p className="text-sm text-slate-500">{event.data}</p>
                    <p className="mt-2 whitespace-pre-wrap">
                      {event.observacoes}
                    </p>
                  </div>
                ))}
              {(data?.events ?? [])
                .filter((event) => event.item.id === detailItem.id)
                .slice()
                .reverse()
                .map((event) => (
                  <div key={event.id} className="rounded-xl bg-slate-50 p-4">
                    <p className="font-semibold">
                      {event.resultado ||
                        (event.kind === "agendamento"
                          ? "Retorno reagendado"
                          : "Cadastro atualizado")}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(event.at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}{" "}
                      · {event.actor}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{event.nota}</p>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
      {searchCompanies && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-5">
          <form
            className="mx-auto mt-12 max-w-lg rounded-3xl bg-white p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const search = `${fields.get("segmento")} ${fields.get("regiao")}`;
              window.open(
                `https://www.google.com/maps/search/${encodeURIComponent(search)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            <h2 className="text-2xl font-bold">Buscar novas empresas</h2>
            <label className="mt-4 block font-semibold">
              Segmento
              <input
                required
                name="segmento"
                className={inputClass}
                placeholder="Ex.: indústrias de alimentos"
              />
            </label>
            <label className="mt-4 block font-semibold">
              Cidade / região
              <input
                required
                name="regiao"
                className={inputClass}
                defaultValue={location === "rc" ? "Rio Claro SP" : "Araras SP"}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={secondary}
                onClick={() => setSearchCompanies(false)}
              >
                Fechar
              </button>
              <button className={primary}>Buscar no Maps ↗</button>
            </div>
          </form>
        </div>
      )}
      {imports && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Prévia da importação"
            className="mx-auto max-w-2xl rounded-3xl bg-white p-6"
          >
            <h2 className="text-2xl font-bold">Conferir importação</h2>
            <p className="mt-2">
              {imports.length} empresas novas. Empresas já cadastradas e
              duplicadas no arquivo foram excluídas desta prévia.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 max-h-96 overflow-y-auto divide-y">
              {imports.map((row) => (
                <p key={row.cliente} className="py-3 font-semibold">
                  {row.cliente}{" "}
                  <span className="font-normal text-slate-500">
                    {row.segmento}
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className={secondary}
                disabled={saving}
                onClick={() => setImports(null)}
              >
                Cancelar
              </button>
              <button
                className={primary}
                disabled={saving}
                onClick={() => void confirmImport()}
              >
                {saving ? "Importando…" : "Confirmar importação"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
