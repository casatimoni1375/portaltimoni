"use client";

import { createMotoristaReadLoader } from "@/lib/motorista-read-loader";
import { useEffect, useMemo, useState } from "react";

type Viagem = {
  id: string;
  data: string;
  loja?: string;
  tipoHorario?: string;
  horario?: string;
  horarioFim?: string;
  vendedor?: string;
  clienteFornecedor?: string;
  numeroPedido?: string;
  volumes?: string;
  contatoNome?: string;
  contatoWhats?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  info?: string;
  preenchidoPor?: string;
  notasJson?: string;
};

function localDateString(d?: Date) {
  if (!d) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromString(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function nextDays(start: Date) {
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  ).filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
}

function lojaLabel(loja?: string) {
  if (loja === "araras") return "Araras";
  if (loja === "rio_claro") return "Rio Claro";
  return loja || "";
}

function horaCurta(hora?: string) {
  return hora ? hora.slice(0, 5) : "";
}

function separarEndereco(endereco?: string) {
  const valor = String(endereco ?? "");
  const match = valor.match(/\nLink:\s*(https?:\/\/\S+)/i);
  return {
    texto: valor.replace(/\nLink:\s*https?:\/\/\S+/i, "").trim(),
    link: match?.[1] || "",
  };
}

function escaparRegex(valor: string) {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatarEnderecoExibicao(endereco?: string, numero?: string, complemento?: string) {
  const texto = separarEndereco(endereco).texto;
  const num = String(numero ?? "").trim();
  const comp = String(complemento ?? "").trim();
  let partes = texto.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);
  if (num) {
    partes = partes.filter((parte) => parte !== num);
    if (partes[0]) {
      const fim = new RegExp(`(?:\\s*[,\-]?\\s*${escaparRegex(num)})+$`);
      partes[0] = partes[0].replace(fim, "").replace(/[\s,-]+$/, "").trim();
    }
  }
  const rua = partes.shift() || "";
  const inicio = rua && num ? `${rua}, ${num}` : rua || num;
  return [inicio, ...partes, comp && comp !== num ? comp : ""].filter(Boolean).join(" - ");
}

function pedidoTexto(valor?: string) {
  return String(valor ?? "").replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
}

function documentoTexto(valor?: string) {
  const texto = pedidoTexto(valor).trim();
  if (!texto) return "";
  if (/^ped\b/i.test(texto)) return texto.replace(/^ped\s*/i, "PED ");
  if (/^nf\b/i.test(texto)) return texto.replace(/^nf\s*/i, "NF ");
  return `NF ${texto}`;
}

function lerTipo(notasJson?: string): "Entrega" | "Retirada" {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    return parsed && !Array.isArray(parsed) && parsed.tipo === "Retirada" ? "Retirada" : "Entrega";
  } catch {
    return "Entrega";
  }
}

function lerPagamento(notasJson?: string) {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    if (!parsed || Array.isArray(parsed)) return "";
    return parsed.pagamento === "Boleto" || parsed.pagamento === "Debite" || parsed.pagamento === "Pago" || parsed.pagamento === "Receber"
      ? parsed.pagamento
      : "";
  } catch {
    return "";
  }
}

function ordenarViagens(viagens: Viagem[]) {
  return [...viagens].sort((a, b) => {
    const horarioA = String(a.horario || "").trim();
    const horarioB = String(b.horario || "").trim();
    if (!horarioA && !horarioB) return 0;
    if (!horarioA) return 1;
    if (!horarioB) return -1;
    return horarioA.localeCompare(horarioB);
  });
}

function estiloBoxViagem(v: Viagem) {
  // 23/11/2026: mesmo padrão da Agenda do Motorista — azul claro (entrega), amarelo claro (coleta), sem contorno.
  return { backgroundColor: lerTipo(v.notasJson) === "Retirada" ? "#FFFAE6" : "#F1F6FD", borderWidth: 0 };
}

function siglaEmpresa(loja?: string) {
  const l = String(loja || "").trim().toLocaleLowerCase("pt-BR");
  if (l === "rodini") return "ROD";
  if (l === "mcr") return "MCR";
  if (l === "casa timoni" || l === "araras" || l === "rio_claro" || l === "ct") return "CT";
  return String(loja || "").toUpperCase();
}

function numeroSemPrefixo(valor?: string) {
  return pedidoTexto(valor).replace(/^(nf|ped)\s*[:.\-]?\s*/i, "").trim();
}

function tituloViagem(v: Viagem) {
  const coleta = lerTipo(v.notasJson) === "Retirada";
  const n = numeroSemPrefixo(v.numeroPedido);
  const vol = v.volumes ? `VOL.: ${String(v.volumes).toUpperCase()}` : "";
  const cli = v.clienteFornecedor ? String(v.clienteFornecedor).toUpperCase() : "";
  const partes = coleta
    ? [cli, v.contatoNome ? String(v.contatoNome).toUpperCase() : "", n ? `PED ${n}` : "", vol]
    : [`Entrega ${siglaEmpresa(v.loja)}`.trim(), n ? `NF ${n}` : "", cli, v.contatoNome ? `A/C: ${String(v.contatoNome).toUpperCase()}` : "", vol];
  return partes.filter(Boolean).join(" | ");
}

function horarioLinha(v: Viagem) {
  const hora = v.horario ? `${horaCurta(v.horario)}${v.horarioFim ? ` a ${horaCurta(v.horarioFim)}` : ""}` : "";
  return [hora ? `Horário: ${hora}` : "", v.tipoHorario === "Bloqueio" ? "Bloqueado" : ""].filter(Boolean).join(" | ");
}

function classeLinhaPrincipal(_v: Viagem) {
  return "font-[Calibri] font-bold text-black";
}

const ETIQUETA_BASE = "rounded-full px-2.5 py-0.5 text-xs max-md:text-[10px] font-semibold";

// Coleta em amarelo; Entrega em azul (padrão do módulo Motorista).
function EtiquetaTipo({ tipo }: { tipo: string }) {
  return tipo === "Retirada"
    ? <span className={ETIQUETA_BASE} style={{ background: "#FFE600", color: "#1a1a1a" }}>Coleta</span>
    : <span className={ETIQUETA_BASE} style={{ background: "#5CE1FF", color: "#1a1a1a" }}>Entrega</span>;
}

// Etiquetas marca-texto (23/11/2026): Casa Timoni laranja neon, Rodini lilás, MCR verde neon.
function EtiquetaEmpresa({ loja }: { loja?: string }) {
  const valor = String(loja || "").trim();
  const min = valor.toLocaleLowerCase("pt-BR");
  if (!valor) return null;
  const ehCasaTimoni = min === "casa timoni" || min === "araras" || min === "ct";
  const texto = ehCasaTimoni ? "Casa Timoni" : min === "rio_claro" ? "Rio Claro" : valor;
  const fundo = ehCasaTimoni ? "#FF9A1F" : min === "rodini" ? "#D9A8FF" : min === "mcr" ? "#7DFF6A" : "#E2E2DC";
  return <span className={ETIQUETA_BASE} style={{ background: fundo, color: "#1a1a1a" }}>{texto}</span>;
}

function finalizada(v: Viagem) {
  try {
    const parsed = JSON.parse(String(v.notasJson || "[]"));
    if (!parsed || Array.isArray(parsed)) return false;
    if (parsed.status === "feito") return true;
    if (parsed.status !== "concluida" && parsed.status !== "retirado") return false;

    const marcadoEm = parsed.status === "concluida" ? parsed.concluidoEm : parsed.retiradoEm;
    if (!marcadoEm) return true;

    const inicioDoDiaAgendado = new Date(`${v.data}T00:00:00-03:00`).getTime();
    const instanteMarcacao = new Date(String(marcadoEm)).getTime();
    if (!Number.isFinite(instanteMarcacao)) return true;

    return instanteMarcacao >= inicioDoDiaAgendado;
  } catch {
    return false;
  }
}

function concluida(notasJson?: string) {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    return Boolean(parsed && !Array.isArray(parsed) && parsed.status === "concluida");
  } catch {
    return false;
  }
}

export default function MotoristaLeitura() {
  const [inicio, setInicio] = useState(() => dateFromString(localDateString()));
  const [viagens, setViagens] = useState<Record<string, Viagem[]>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const dias = useMemo(() => nextDays(inicio), [inicio]);

  useEffect(() => {
    let ativo = true;
    const loader = createMotoristaReadLoader();
    async function carregar() {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) { setErro("Sem conexão. Os dados exibidos serão atualizados ao reconectar."); setLoading(false); return; }
      await loader.run(dias.map(localDateString), {
        success: pares => { if (ativo) { setViagens(Object.fromEntries(pares) as Record<string, Viagem[]>); setErro(""); } },
        error: error => { if (ativo) setErro(error instanceof Error ? error.message : "Não foi possível carregar a agenda."); },
        done: () => { if (ativo) setLoading(false); },
      });
    }
    const atualizarAoVoltar = () => { void carregar(); };
    setLoading(true);
    void carregar();
    const intervalo = window.setInterval(() => void carregar(), 15_000);
    window.addEventListener("focus", atualizarAoVoltar);
    window.addEventListener("online", atualizarAoVoltar);
    document.addEventListener("visibilitychange", atualizarAoVoltar);
    return () => {
      ativo = false;
      loader.dispose();
      window.clearInterval(intervalo);
      window.removeEventListener("focus", atualizarAoVoltar);
      window.removeEventListener("online", atualizarAoVoltar);
      document.removeEventListener("visibilitychange", atualizarAoVoltar);
    };
  }, [dias]);

  return (
    <main className="ct-modern-calendar min-h-screen bg-slate-50 px-3 py-4 sm:px-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Casa Timoni</p>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl max-md:text-[20px] font-semibold tracking-tight text-slate-950">Agenda do Motorista</h1>
              <p className="mt-1 text-xs max-md:text-[10px] text-slate-600">Visualização somente leitura.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setInicio((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs max-md:text-[10px] font-medium text-slate-700">← 7 dias</button>
              <button type="button" onClick={() => setInicio(dateFromString(localDateString()))} className="rounded-lg bg-blue-800 px-3 py-2 text-xs max-md:text-[10px] font-semibold text-white">Hoje</button>
              <button type="button" onClick={() => setInicio((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs max-md:text-[10px] font-medium text-slate-700">+ 7 dias</button>
            </div>
          </div>
        </header>

        {erro && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-xs max-md:text-[10px] text-red-700">{erro}</p>}

        <div className="space-y-4">
          {dias.map((d) => {
            const data = localDateString(d);
            const itens = ordenarViagens((viagens[data] || []).filter((v) => !finalizada(v)));
            const hoje = data === localDateString();
            return (
              <section key={data} className={`rounded-2xl border bg-white p-4 shadow-sm ${hoje ? "border-blue-300" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{d.toLocaleDateString("pt-BR", { weekday: "long" })}</p>
                    <h2 className="mt-0.5 text-base max-md:text-[12.5px] font-semibold text-slate-950">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</h2>
                  </div>
                  {hoje && <span className="rounded-full bg-blue-800 px-2.5 py-1 text-[10px] font-semibold text-white">Hoje</span>}
                </div>

                <div className="mt-3 space-y-3">
                  {loading ? (
                    <p className="text-xs max-md:text-[10px] text-slate-400">Carregando...</p>
                  ) : itens.length === 0 ? (
                    <p className="text-xs max-md:text-[10px] text-slate-400">Sem viagens.</p>
                  ) : (
                    itens.map((v, index) => {
                      const bloqueio = v.tipoHorario === "Bloqueio";
                      const enderecoInfo = separarEndereco(v.endereco);
                      const endereco = formatarEnderecoExibicao(v.endereco, v.numero, v.complemento);
                      return (
                        <article key={v.id} style={estiloBoxViagem(v)} className="rounded-xl p-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-700 shadow-sm">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                  <EtiquetaTipo tipo={lerTipo(v.notasJson)} />
                                  <EtiquetaEmpresa loja={v.loja} />
                                </div>
                                {!bloqueio && concluida(v.notasJson) && <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">Concluído</span>}
                              </div>
                              <p className="mt-2 text-xs max-md:text-[10px] font-bold text-slate-900">{tituloViagem(v)}</p>
                              {horarioLinha(v) && <p className="mt-1 text-xs max-md:text-[10px] font-bold text-slate-900">{horarioLinha(v)}</p>}
                              {endereco && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs max-md:text-[10px] text-slate-700"><span>End.: {endereco}</span>{enderecoInfo.link && <a href={enderecoInfo.link} target="_blank" rel="noreferrer" className="font-semibold text-blue-800 underline underline-offset-2">Google Maps</a>}</p>}
                              {v.info && <p className="mt-1 text-xs max-md:text-[10px] text-slate-600">Obs.: <span className="whitespace-pre-line">{String(v.info).replace(/^[\r\n]+/, "")}</span></p>}
                              <p className="mt-2 text-xs max-md:text-[10px] text-slate-600"><strong>Preenchido por:</strong>{v.preenchidoPor ? ` ${v.preenchidoPor}` : ""}{lerTipo(v.notasJson) !== "Retirada" && <> <span className="mx-1">|</span> <strong>Vendedor:</strong>{v.vendedor ? ` ${v.vendedor}` : ""}</>} <span className="mx-1">|</span> <strong>Pagamento:</strong>{lerPagamento(v.notasJson) ? ` ${lerPagamento(v.notasJson)}` : ""}</p>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
