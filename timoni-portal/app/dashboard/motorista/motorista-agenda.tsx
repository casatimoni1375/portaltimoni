"use client";

import { createMotoristaReadLoader } from "@/lib/motorista-read-loader";

// MOTORISTA DASHBOARD: manter Dia, Semana e Mês. A rota /motorista (relatório/leitura) não deve ser alterada nesta reestruturação.

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrazilianDateInput } from "@/components/ui/brazilian-date-input";
import { Carimbo } from "@/components/clean/carimbo";

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

type FormState = {
  tipo: "Entrega" | "Retirada";
  loja: string;
  vendedor: string;
  data: string;
  hora: string;
  bloquear: boolean;
  bloqueioInicio: string;
  bloqueioFim: string;
  numeroPedido: string;
  clienteFornecedor: string;
  volumes: string;
  unidadeVolume: string;
  quantidadeVolume: string;
  contatoNome: string;
  contatoWhats: string;
  cep: string;
  endereco: string;
  numeroEndereco: string;
  bairro: string;
  cidade: string;
  referencia: string;
  linkEndereco: string;
  discriminacao: string;
  preenchidoPor: string;
  pagamento: "" | "Boleto" | "Debite" | "Pago" | "Receber";
  notasJson: string;
};

type Modo = "dia" | "semana" | "mes";

// Lista unica usada em Vendedor e em Preenchido por (decisao da gestao, 16/11/2026).
// Antes eram duas listas diferentes: Preenchido por era fixa e separada em Rio Claro e
// Araras; Vendedor vinha do cadastro de colaboradores e nao batia com ela.
const RESPONSAVEIS: string[] = [
  "Adriel",
  "Bruna",
  "Carina",
  "Ciça",
  "Davi",
  "Jaqueline",
  "Jeovana",
  "João",
  "José Roberto",
  "Lyra",
  "Marcelo",
  "Margareth",
  "Paulo",
  "Reginaldo",
  "Reinaldo",
  "San",
  "Yan",
];

const REQUIRED: Array<keyof FormState> = [
  "tipo",
  "loja",
  "vendedor",
  "data",
  "numeroPedido",
  "clienteFornecedor",
  "volumes",
  "endereco",
  "numeroEndereco",
];

const REQUIRED_LABELS: Partial<Record<keyof FormState, string>> = {
  tipo: "Tipo",
  loja: "Empresa",
  vendedor: "Vendedor",
  data: "Data",
  numeroPedido: "Nota Fiscal/Pedido",
  clienteFornecedor: "Cliente/Fornecedor",
  volumes: "Volume",
  endereco: "Endereço",
  numeroEndereco: "Número",
  preenchidoPor: "Preenchido por",
  bloqueioInicio: "Início do bloqueio",
  bloqueioFim: "Fim do bloqueio",
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
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthDays(base: Date) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d;
  });
}

function weekDays(value: string) {
  const base = dateFromString(value);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + index),
  ).filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
}

function emptyForm(data = localDateString()): FormState {
  return {
    tipo: "Entrega",
    loja: "",
    vendedor: "",
    data,
    hora: "",
    bloquear: false,
    bloqueioInicio: "",
    bloqueioFim: "",
    numeroPedido: "",
    clienteFornecedor: "",
    volumes: "",
    unidadeVolume: "",
    quantidadeVolume: "",
    contatoNome: "",
    contatoWhats: "",
    cep: "",
    endereco: "",
    numeroEndereco: "",
    bairro: "",
    cidade: "",
    referencia: "",
    linkEndereco: "",
    discriminacao: "",
    preenchidoPor: "",
    pagamento: "",
    notasJson: "[]",
  };
}

function lerMetaMotorista(notasJson?: string) {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      return {
        tipo: parsed.tipo === "Retirada" ? "Retirada" as const : "Entrega" as const,
        cidade: String(parsed.cidade || ""),
        referencia: String(parsed.referencia || ""),
        pagamento: parsed.pagamento === "Boleto" || parsed.pagamento === "Debite" || parsed.pagamento === "Pago" || parsed.pagamento === "Receber" ? parsed.pagamento as "Boleto" | "Debite" | "Pago" | "Receber" : "" as const,
      };
    }
  } catch {}
  return { tipo: "Entrega" as const, cidade: "", referencia: "", pagamento: "" as const };
}

function notasComMetaMotorista(
  notasJson: string | undefined,
  meta: { tipo: "Entrega" | "Retirada"; cidade: string; referencia: string; pagamento: "" | "Boleto" | "Debite" | "Pago" | "Receber" },
) {
  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    base = Array.isArray(parsed) ? { legado: parsed } : parsed && typeof parsed === "object" ? parsed : {};
  } catch {}
  return JSON.stringify({
    ...base,
    tipo: meta.tipo,
    cidade: meta.cidade.trim(),
    referencia: meta.referencia.trim(),
    pagamento: meta.pagamento,
  });
}

function formFromViagem(v: Viagem): FormState {
  const bloqueio = v.tipoHorario === "Bloqueio";
  const enderecoCompleto = [v.endereco, v.numero, v.complemento].filter(Boolean).join(" - ");
  const match = enderecoCompleto.match(/\nLink:\s*(https?:\/\/\S+)/i);
  const enderecoSemLink = enderecoCompleto.replace(/\nLink:\s*https?:\/\/\S+/i, "").trim();
  const partesEndereco = enderecoSemLink.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);
  const temCidadeUf = partesEndereco.length >= 3 && /\/[A-Z]{2}$/i.test(partesEndereco[partesEndereco.length - 1]);
  const meta = lerMetaMotorista(v.notasJson);
  const cidadeLegada = temCidadeUf ? partesEndereco[partesEndereco.length - 1] : "";
  const bairroLegado = temCidadeUf ? partesEndereco[partesEndereco.length - 2] : "";
  const enderecoEditavel = temCidadeUf
    ? partesEndereco.slice(0, -2).join(" - ")
    : (partesEndereco[0] || enderecoSemLink);
  const volumeInfo = separarVolume(v.volumes);
  return {
    tipo: meta.tipo,
    loja: v.loja || "",
    vendedor: v.vendedor || "",
    data: v.data,
    hora: "",
    bloquear: bloqueio,
    bloqueioInicio: bloqueio ? (v.horario || "").slice(0, 5) : "",
    bloqueioFim: bloqueio ? (v.horarioFim || "").slice(0, 5) : "",
    numeroPedido: v.numeroPedido || "",
    clienteFornecedor: v.clienteFornecedor || "",
    volumes: volumeInfo.volume,
    unidadeVolume: "",
    quantidadeVolume: "",
    contatoNome: v.contatoNome || "",
    contatoWhats: "",
    cep: "",
    endereco: enderecoEditavel,
    numeroEndereco: String(v.numero ?? ""),
    bairro: bairroLegado,
    cidade: meta.cidade || cidadeLegada,
    referencia: meta.referencia || v.complemento || "",
    linkEndereco: match?.[1] || "",
    discriminacao: v.info || "",
    preenchidoPor: v.preenchidoPor || "",
    pagamento: meta.pagamento,
    notasJson: v.notasJson || "[]",
  };
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.erro || "Não foi possível acessar a agenda.");
  return data;
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

function montarEnderecoComBairro(endereco: string, bairro: string) {
  const enderecoLimpo = endereco.trim();
  const bairroLimpo = bairro.trim();
  if (!bairroLimpo) return enderecoLimpo;
  const partes = enderecoLimpo.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);
  const ultima = partes[partes.length - 1] || "";
  return /\/[A-Z]{2}$/i.test(ultima)
    ? [...partes.slice(0, -1), bairroLimpo, ultima].join(" - ")
    : [enderecoLimpo, bairroLimpo].filter(Boolean).join(" - ");
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

function estiloBoxViagem(_v: Viagem) {
  // Card sem contorno, em cinza bem claro (aprovado).
  return { backgroundColor: "#f5f6fb", borderWidth: 0 };
}

// Etiquetas preenchidas (17/11/2026): Entrega azul, Coleta vermelho; Casa Timoni verde, Rodini amarelo, MCR laranja.
function EtiquetasViagem({ v }: { v: Viagem }) {
  const tipo = lerMetaMotorista(v.notasJson).tipo;
  const loja = String(v.loja || "").trim();
  const lojaMin = loja.toLocaleLowerCase("pt-BR");
  const ehCasaTimoni = lojaMin === "casa timoni" || lojaMin === "araras";
  const rotuloEmpresa = ehCasaTimoni ? "Casa Timoni" : lojaMin === "rio_claro" ? "Rio Claro" : loja;
  const base = "rounded-full px-2.5 py-0.5 text-sm";
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tipo === "Retirada"
        ? <span className={base} style={{ background: "#FCEBEB", color: "#A32D2D" }}>Coleta</span>
        : <span className={base} style={{ background: "#E3EEFB", color: "#185FA5" }}>Entrega</span>}
      {rotuloEmpresa && (ehCasaTimoni
        ? <span className={base} style={{ background: "#DDF1EE", color: "#0F6E56" }}>{rotuloEmpresa}</span>
        : lojaMin === "rodini"
          ? <span className={base} style={{ background: "#FAEEDA", color: "#854F0B" }}>{rotuloEmpresa}</span>
          : lojaMin === "mcr"
            ? <span className={base} style={{ background: "#FCE4D2", color: "#9A3412" }}>{rotuloEmpresa}</span>
            : <span className={base} style={{ background: "#EDEDEA", color: "#444441" }}>{rotuloEmpresa}</span>)}
    </div>
  );
}

function classeLinhaPrincipal(_v: Viagem) {
  return "font-bold text-black";
}

// Título sem marca-texto, na fonte do portal (Roboto).
function estiloLinhaPrincipal(_v: Viagem) {
  return { fontFamily: "inherit", fontWeight: 700, color: "#182443" };
}

function pagamentoTexto(notasJson?: string) {
  return lerMetaMotorista(notasJson).pagamento;
}

function linhaPrincipalRelatorio(v: Viagem, index: number) {
  const tipo = lerMetaMotorista(v.notasJson).tipo;
  const partes = [
    `${index + 1}. ${tipo === "Retirada" ? "Coleta" : tipo}`,
    v.tipoHorario === "Bloqueio" ? "Bloqueio" : "",
    lojaLabel(v.loja),
    v.vendedor ? `Vend.: ${v.vendedor}` : "",
    v.horario ? `${horaCurta(v.horario)}${v.horarioFim ? ` a ${horaCurta(v.horarioFim)}` : ""}` : "",
  ].filter(Boolean);
  return partes.join(" | ");
}

// Desktop: título e documento na mesma linha (há espaço na largura).
// Ex.: "2. Entrega | MCR | Vend.: Jaqueline - NF 10407 | RICLAN | Volume: 1"
function linhaUnicaDesktop(v: Viagem, index: number) {
  const doc = [
    documentoTexto(v.numeroPedido),
    v.clienteFornecedor ? String(v.clienteFornecedor).toUpperCase() : "",
    v.contatoNome ? `A/C: ${String(v.contatoNome).toUpperCase()}` : "",
    v.volumes ? `Volume: ${String(v.volumes)}` : "",
  ].filter(Boolean).join(" | ");
  const titulo = linhaPrincipalRelatorio(v, index);
  return doc ? `${titulo} - ${doc}` : titulo;
}

function separarVolume(valor?: string) {
  const texto = String(valor ?? "").trim();
  const unidadeMarcador = " | Unidade: ";
  const quantidadeMarcador = " | Quantidade: ";
  const indiceUnidade = texto.indexOf(unidadeMarcador);
  const indiceQuantidade = texto.indexOf(quantidadeMarcador);

  if (indiceUnidade >= 0) {
    const fimUnidade = indiceQuantidade >= 0 ? indiceQuantidade : texto.length;
    return {
      volume: texto.slice(0, indiceUnidade).trim(),
      unidade: texto.slice(indiceUnidade + unidadeMarcador.length, fimUnidade).trim(),
      quantidade: indiceQuantidade >= 0 ? texto.slice(indiceQuantidade + quantidadeMarcador.length).trim() : "",
    };
  }

  const combinado = texto.match(/^(\S+)\s+(.+)$/);
  return combinado
    ? { volume: combinado[1], unidade: combinado[2].trim(), quantidade: "" }
    : { volume: texto, unidade: "", quantidade: "" };
}

function formatarVolume(volume?: string, unidade?: string, quantidade?: string) {
  const vol = String(volume ?? "").trim();
  const un = String(unidade ?? "").trim();
  const qtd = String(quantidade ?? "").trim();
  const base = [vol, un].filter(Boolean).join(" ");
  return [base, qtd ? `Quantidade: ${qtd}` : ""].filter(Boolean).join(" | ");
}

function serializarVolume(volume?: string, unidade?: string, quantidade?: string) {
  const vol = String(volume ?? "").trim();
  const un = String(unidade ?? "").trim();
  const qtd = String(quantidade ?? "").trim();
  return [vol, un ? `Unidade: ${un}` : "", qtd ? `Quantidade: ${qtd}` : ""].filter(Boolean).join(" | ");
}

function lerConclusao(notasJson?: string) {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    if (parsed && !Array.isArray(parsed) && parsed.status === "concluida") return parsed as { status: string; observacaoConclusao?: string; concluidoEm?: string };
  } catch {}
  return null;
}

function notasComConclusao(notasJson: string | undefined, observacao: string) {
  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    base = Array.isArray(parsed) ? { legado: parsed } : parsed && typeof parsed === "object" ? parsed : {};
  } catch {}
  return JSON.stringify({ ...base, status: "concluida", observacaoConclusao: observacao.trim(), concluidoEm: new Date().toISOString() });
}

function lerRetirada(notasJson?: string) {
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    if (parsed && !Array.isArray(parsed) && parsed.status === "retirado") return parsed as { status: string; retiradoEm?: string };
  } catch {}
  return null;
}

function notasComRetirada(notasJson?: string) {
  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(notasJson || "[]"));
    base = Array.isArray(parsed) ? { legado: parsed } : parsed && typeof parsed === "object" ? parsed : {};
  } catch {}
  return JSON.stringify({ ...base, status: "retirado", retiradoEm: new Date().toISOString() });
}

// Último vendedor e empresa usados ao salvar uma viagem, para já virem preenchidos.
const CHAVE_ULTIMO_MOTORISTA = "motorista:ultimo";

function lerUltimoMotorista(): { loja: string; vendedor: string } {
  if (typeof window === "undefined") return { loja: "", vendedor: "" };
  try {
    const dados = JSON.parse(window.localStorage.getItem(CHAVE_ULTIMO_MOTORISTA) || "{}");
    return { loja: String(dados.loja || ""), vendedor: String(dados.vendedor || "") };
  } catch {
    return { loja: "", vendedor: "" };
  }
}

function guardarUltimoMotorista(loja: string, vendedor: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE_ULTIMO_MOTORISTA, JSON.stringify({ loja, vendedor }));
  } catch {
    // Armazenamento indisponível: o formulário segue sem lembrar a última escolha.
  }
}

function formatarCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

const TODAS_EMPRESAS = ["Casa Timoni", "MCR", "Rodini"];

export default function MotoristaAgenda({ readOnly = false, canCreate = false, canEdit = false, canDelete = false, actorName, empresas = TODAS_EMPRESAS }: { readOnly?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; actorName?: string; empresas?: string[] }) {
  const hoje = localDateString();
  const [modo, setModo] = useState<Modo>("dia");
  const [selecionado, setSelecionado] = useState(hoje);
  const [mesBase, setMesBase] = useState(() => dateFromString(hoje));
  const [viagens, setViagens] = useState<Record<string, Viagem[]>>({});
  const [form, setForm] = useState<FormState>(() => emptyForm(hoje));
  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [invalidos, setInvalidos] = useState<Set<keyof FormState>>(new Set());
  const [layoutViewport, setLayoutViewport] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const leituraAtual = useRef<ReturnType<typeof createMotoristaReadLoader> | null>(null);
  const ativo = useRef(false);
  const numeroRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ativo.current = true;
    return () => { ativo.current = false; leituraAtual.current?.dispose(); };
  }, []);

  const diasMes = useMemo(() => monthDays(mesBase), [mesBase]);
  const diasSemana = useMemo(() => weekDays(selecionado), [selecionado]);
  const linkMapsFormulario = useMemo(() => {
    if (form.linkEndereco) return form.linkEndereco;
    if (!form.numeroEndereco.trim()) return "";
    const destino = [form.endereco.trim(), form.numeroEndereco.trim(), form.bairro.trim(), form.cidade.trim()].filter(Boolean).join(", ");
    return destino ? `https://maps.google.com/?q=${encodeURIComponent(destino)}` : "";
  }, [form.linkEndereco, form.endereco, form.numeroEndereco, form.bairro, form.cidade]);

  useEffect(() => {
    const atualizarLayout = () => {
      const largura = window.innerWidth;
      setLayoutViewport(largura < 640 ? "mobile" : largura < 1024 ? "tablet" : "desktop");
    };
    atualizarLayout();
    window.addEventListener("resize", atualizarLayout);
    window.visualViewport?.addEventListener("resize", atualizarLayout);
    return () => {
      window.removeEventListener("resize", atualizarLayout);
      window.visualViewport?.removeEventListener("resize", atualizarLayout);
    };
  }, []);

  const colunasFormulario = (desktop: string, tablet = "repeat(2, minmax(0, 1fr))") => ({
    gridTemplateColumns:
      layoutViewport === "mobile"
        ? "minmax(0, 1fr)"
        : layoutViewport === "tablet"
          ? tablet
          : desktop,
  });


  const carregarDias = useCallback(async (datas: string[]) => {
    if (!ativo.current) return;
    leituraAtual.current?.dispose();
    const loader = createMotoristaReadLoader(fetch, 30_000, "/api/agenda-motorista");
    leituraAtual.current = loader;
    setLoading(true);
    setErro("");
    await loader.run(datas, {
      success: pares => setViagens(current => ({ ...current, ...Object.fromEntries(pares) as Record<string, Viagem[]> })),
      error: error => setErro(error instanceof Error ? error.message : "Não foi possível carregar a agenda."),
      done: () => setLoading(false),
    });
  }, []);

  async function carregarDia(data = selecionado) {
    await carregarDias([data]);
  }

  async function carregarMes() {
    await carregarDias(diasMes.map(localDateString));
  }

  useEffect(() => {
    const datas = modo === "dia" ? [selecionado] : (modo === "semana" ? diasSemana : diasMes).map(localDateString);
    void carregarDias(datas);
    return () => leituraAtual.current?.dispose();
  }, [modo, selecionado, diasSemana, diasMes, carregarDias]);

  function abrirNova(data = selecionado) {
    setEditandoId(null);
    // Com uma só empresa permitida (ex.: Araras = Casa Timoni), ela já vem escolhida.
    // Nos demais casos, vem a empresa e o vendedor da última viagem salva.
    const ultimo = lerUltimoMotorista();
    setForm({
      ...emptyForm(data),
      loja: empresas.length === 1 ? empresas[0] : empresas.includes(ultimo.loja) ? ultimo.loja : "",
      vendedor: ultimo.vendedor,
    });
    setInvalidos(new Set());
    setErro("");
    setAviso("");
    setModal(true);
  }

  // Atalho vindo da tela Hoje ("Agendar viagem"): abre o formulário direto.
  useEffect(() => {
    if (!canCreate || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("nova") !== "1") return;
    url.searchParams.delete("nova");
    window.history.replaceState(null, "", url.toString());
    abrirNova();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  function abrirEditar(v: Viagem) {
    setEditandoId(v.id);
    setForm(formFromViagem(v));
    setInvalidos(new Set());
    setErro("");
    setModal(true);
  }

  // Erro junto do campo obrigatório, mostrado depois de tentar salvar.
  function mensagemCampo(name: keyof FormState) {
    if (!invalidos.has(name)) return null;
    return <span className="mt-1 block text-sm font-normal text-red-600">Preencha este campo.</span>;
  }

  function fieldClass(name: keyof FormState) {
    return `mt-1 w-full min-w-0 rounded-xl border bg-white px-3 py-2.5 text-base md:text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${invalidos.has(name) ? "border-red-500" : "border-slate-300"}`;
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setInvalidos((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  async function buscarCep(cepInformado = form.cep) {
    const cep = cepInformado.replace(/\D/g, "");
    if (cep.length !== 8) {
      setAviso("");
      setErro("Digite um CEP com 8 números.");
      return;
    }
    setErro("");
    setAviso("");
    try {
      const response = await fetch(`/api/cep?cep=${encodeURIComponent(cep)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.erro || "CEP não encontrado.");
      const resultado = data.endereco || {};
      const cidadeUf = [resultado.cidade, resultado.uf].filter(Boolean).join("/");
      set("endereco", resultado.logradouro || "");
      set("bairro", resultado.bairro || "");
      set("cidade", cidadeUf);
      set("numeroEndereco", "");
      set("linkEndereco", "");
      setAviso("CEP localizado. Confirme o número para gerar o link do Google Maps.");
      // Depois do CEP, o cursor vai direto para o Número.
      numeroRef.current?.focus();
    } catch (e) {
      setAviso("");
      setErro(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    }
  }

  // Copia a discriminação da entrega mais recente do mesmo cliente/fornecedor.
  function repetirUltimaDiscriminacao() {
    const cliente = form.clienteFornecedor.trim().toUpperCase();
    if (!cliente) {
      setErro("Preencha Cliente/Fornecedor para repetir a última observação.");
      return;
    }
    const anterior = Object.keys(viagens)
      .sort()
      .reverse()
      .flatMap((data) => viagens[data] || [])
      .find((v) => v.id !== editandoId && (v.clienteFornecedor || "").trim().toUpperCase() === cliente && v.info?.trim());
    if (!anterior) {
      setErro("Não há discriminação anterior para este cliente.");
      return;
    }
    setErro("");
    set("discriminacao", anterior.info || "");
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();
    const faltando = new Set<keyof FormState>();
    REQUIRED.forEach((key) => {
      if (!String(form[key] ?? "").trim()) faltando.add(key);
    });
    if (actorName) faltando.delete("preenchidoPor");
    if (form.bloquear && (!form.bloqueioInicio || !form.bloqueioFim)) {
      faltando.add("bloqueioInicio");
      faltando.add("bloqueioFim");
    }
    setInvalidos(faltando);
    if (faltando.size) {
      const nomes = [...faltando].map((key) => REQUIRED_LABELS[key] || String(key)).join(", ");
      setErro(`Falta preencher: ${nomes}. Os campos estão destacados em vermelho.`);
      // Leva a tela até o primeiro campo vazio: no celular ele pode estar fora da vista.
      const formulario = event.currentTarget as HTMLFormElement | null;
      window.requestAnimationFrame(() => {
        const primeiro = formulario?.querySelector<HTMLElement>(":invalid:not(form)");
        primeiro?.scrollIntoView({ behavior: "smooth", block: "center" });
        primeiro?.focus({ preventScroll: true });
      });
      return;
    }

    setSaving(true);
    setErro("");
    try {
      const enderecoBase = [form.endereco.trim(), form.bairro.trim(), form.cidade.trim()].filter(Boolean).join(" - ");
      const destinoMaps = [form.endereco.trim(), form.numeroEndereco.trim(), form.bairro.trim(), form.cidade.trim()].filter(Boolean).join(", ");
      const linkMaps = linkMapsFormulario || `https://maps.google.com/?q=${encodeURIComponent(destinoMaps)}`;
      const detalhesEndereco = `${enderecoBase}\nLink: ${linkMaps}`;
      const payload = new URLSearchParams({
        action: editandoId ? "atualizar" : "criar",
        ...(editandoId ? { id: editandoId, dataOrigem: Object.values(viagens).flat().find((v) => v.id === editandoId)?.data || form.data } : {}),
        data: form.data,
        loja: form.loja,
        tipoHorario: form.bloquear ? "Bloqueio" : "Entrega",
        horario: form.bloquear ? form.bloqueioInicio : "",
        horarioFim: form.bloquear ? form.bloqueioFim : "",
        vendedor: form.vendedor,
        clienteFornecedor: form.clienteFornecedor.trim().toUpperCase(),
        numeroPedido: form.numeroPedido,
        volumes: form.volumes.trim(),
        contatoNome: form.contatoNome,
        contatoWhats: "",
        endereco: detalhesEndereco,
        numero: form.numeroEndereco,
        complemento: form.referencia,
        itens: "",
        // Planilha lê texto que começa com = + - @ como fórmula (aparece #ERROR!). O apóstrofo força texto e não aparece.
        info: /^[=+\-@]/.test(form.discriminacao.trim()) ? `'${form.discriminacao.trim()}` : form.discriminacao,
        preenchidoPor: form.preenchidoPor,
        dividir: "0",
        notasJson: notasComMetaMotorista(form.notasJson, {
          tipo: form.tipo,
          cidade: form.cidade,
          referencia: form.referencia,
          pagamento: form.pagamento,
        }),
      });
      const response = await fetch("/api/agenda-motorista", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload,
      });
      await parseResponse(response);
      guardarUltimoMotorista(form.loja, form.vendedor);
      setModal(false);
      setSelecionado(form.data);
      if (modo === "mes") await carregarMes();
      else await carregarDia(form.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function excluirViagem(v: Viagem) {
    if (!window.confirm("Excluir esta viagem definitivamente?")) return;
    setSaving(true);
    setErro("");
    try {
      const payload = new URLSearchParams({ action: "excluir", id: v.id, data: v.data });
      const response = await fetch("/api/agenda-motorista", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload,
      });
      await parseResponse(response);
      await carregarDia(v.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir a viagem.");
    } finally {
      setSaving(false);
    }
  }

  function selecionarDia(data: string) {
    setSelecionado(data);
    setModo("dia");
  }

  const itensDia = ordenarViagens(viagens[selecionado] || []);
  const dataSelecionada = dateFromString(selecionado);

  return (
    <>
      <section className="ct-std-card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && <button type="button" onClick={() => abrirNova()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900">Nova viagem</button>}
            <button type="button" onClick={() => setModo("dia")} className={`rounded-lg px-3 py-2 text-sm font-medium ${modo === "dia" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}>Dia</button>
            <button type="button" onClick={() => setModo("semana")} className={`rounded-lg px-3 py-2 text-sm font-medium ${modo === "semana" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}>Semana</button>
            <button type="button" onClick={() => setModo("mes")} className={`rounded-lg px-3 py-2 text-sm font-medium ${modo === "mes" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}>Mês</button>
          </div>

          {modo === "dia" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Agenda do dia</p>
                <p className="mt-1 text-lg max-md:text-[14px] font-semibold text-slate-950">{dataSelecionada.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelecionado(localDateString(new Date(dataSelecionada.getFullYear(), dataSelecionada.getMonth(), dataSelecionada.getDate() - 1)))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">← Dia anterior</button>
                <button type="button" onClick={() => setSelecionado(hoje)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Hoje</button>
                <button type="button" onClick={() => setSelecionado(localDateString(new Date(dataSelecionada.getFullYear(), dataSelecionada.getMonth(), dataSelecionada.getDate() + 1)))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Próximo dia →</button>
              </div>
            </div>
          ) : modo === "semana" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Agenda da semana</p>
                <p className="mt-1 text-sm text-slate-600">{selecionado === hoje ? "A partir de hoje" : "A partir do dia selecionado"} · sem sábado e domingo</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { const d = dateFromString(selecionado); d.setDate(d.getDate() - 7); setSelecionado(localDateString(d)); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">− 7 dias</button>
                <button type="button" onClick={() => setSelecionado(hoje)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Hoje</button>
                <button type="button" onClick={() => { const d = dateFromString(selecionado); d.setDate(d.getDate() + 7); setSelecionado(localDateString(d)); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">+ 7 dias</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setMesBase((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">←</button>
              <p className="text-lg max-md:text-[14px] font-semibold capitalize text-slate-950">{mesBase.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              <button type="button" onClick={() => setMesBase((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">→</button>
            </div>
          )}
        </div>

        {erro && !modal && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        {modo === "semana" ? (
          <div className="mt-4 space-y-4">
            {diasSemana.map((d) => {
              const data = localDateString(d);
              const itens = ordenarViagens(viagens[data] || []);
              return (
                <section key={data} className={`rounded-xl border bg-white p-4 ${data === hoje ? "border-[#102a83]" : "border-[#e1e6f0]"}`}>
                  <button type="button" onClick={() => selecionarDia(data)} className="w-full text-left">
                    <p className="text-sm font-semibold uppercase text-slate-500">{d.toLocaleDateString("pt-BR", { weekday: "long" })}</p>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-slate-950">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}{data === hoje && <Carimbo>Hoje</Carimbo>}</p>
                  </button>
                  <div className="mt-3 space-y-2">
                    {loading ? <p className="text-sm text-slate-400">Carregando...</p> : itens.length === 0 ? <p className="text-sm text-slate-400">Sem viagens.</p> : itens.map((v, index) => (
                      <article key={v.id} style={estiloBoxViagem(v)} className="rounded-xl border p-3">
                        <EtiquetasViagem v={v} />
                        <p style={estiloLinhaPrincipal(v)} className={`hidden md:block text-sm ${classeLinhaPrincipal(v)}`}>{linhaUnicaDesktop(v, index)}</p>
                        <div className="md:hidden">
                        <p style={estiloLinhaPrincipal(v)} className={`text-sm ${classeLinhaPrincipal(v)}`}>{linhaPrincipalRelatorio(v, index)}</p>
                        <p className="mt-2 text-sm font-bold uppercase text-slate-900">
                          {documentoTexto(v.numeroPedido)}
                          {documentoTexto(v.numeroPedido) && v.clienteFornecedor ? " | " : ""}
                          {v.clienteFornecedor ? <>{v.contatoNome ? "CLIENTE " : ""}{v.clienteFornecedor.toUpperCase()}</> : null}
                          {(documentoTexto(v.numeroPedido) || v.clienteFornecedor) && v.contatoNome ? " | " : ""}
                          {v.contatoNome ? <>A/C: {v.contatoNome.toUpperCase()}</> : null}
                          {!v.contatoNome && v.volumes ? <> | VOLUME: {String(v.volumes).toUpperCase()}</> : null}
                        </p>
                        {v.contatoNome && v.volumes && <p className="mt-1 text-sm font-bold uppercase text-slate-900">VOLUME: {String(v.volumes).toUpperCase()}</p>}
                        </div>
                        {v.endereco && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-700"><span>End.: {formatarEnderecoExibicao(v.endereco, v.numero, v.complemento)}</span>{separarEndereco(v.endereco).link && <a href={separarEndereco(v.endereco).link} target="_blank" rel="noreferrer" className="font-semibold text-blue-800 underline underline-offset-2">Google Maps</a>}</p>}
                        {v.info && (String(v.info).trim().startsWith("#ERROR") ? <p className="mt-1 text-sm text-amber-700">Observação com erro na planilha. Abra Editar, confira o texto e salve de novo.</p> : <p className="mt-1 text-sm text-slate-600">Observação: <span className="whitespace-pre-line">{String(v.info).replace(/^[\r\n]+/, "")}</span></p>)}
                        <p className="mt-1 text-sm text-slate-500"><strong>Preenchido por:</strong>{v.preenchidoPor ? ` ${v.preenchidoPor}` : ""} <span className="mx-1">|</span> <strong>Forma de pagamento:</strong>{pagamentoTexto(v.notasJson) ? ` ${pagamentoTexto(v.notasJson)}` : ""}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {lerConclusao(v.notasJson) && <Carimbo>Concluído</Carimbo>}
                          <button type="button" onClick={() => abrirEditar(v)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-50">Editar</button>
                          {canDelete && <button type="button" disabled={saving} onClick={() => void excluirViagem(v)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Excluir</button>}
                        </div>
                        {lerConclusao(v.notasJson)?.observacaoConclusao && <p className="mt-2 text-sm text-emerald-800">Conclusão: {lerConclusao(v.notasJson)?.observacaoConclusao}</p>}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : modo === "dia" ? (
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-slate-400">Carregando...</p> : itensDia.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-400">Sem viagens neste dia.</p> : itensDia.map((v, index) => (
              <article key={v.id} style={estiloBoxViagem(v)} className="rounded-2xl border p-4">
                <EtiquetasViagem v={v} />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="font-[Arial] text-[11pt] md:text-[calc(11pt+1px)] leading-[1.35]">
                    <p style={estiloLinhaPrincipal(v)} className={`hidden md:block ${classeLinhaPrincipal(v)}`}>{linhaUnicaDesktop(v, index)}</p>
                    <div className="md:hidden">
                    <p style={estiloLinhaPrincipal(v)} className={classeLinhaPrincipal(v)}>{linhaPrincipalRelatorio(v, index)}</p>
                    <p className="mt-2 font-bold uppercase text-slate-900">
                      {documentoTexto(v.numeroPedido)}
                      {documentoTexto(v.numeroPedido) && v.clienteFornecedor ? " | " : ""}
                      {v.clienteFornecedor ? <>{v.contatoNome ? "CLIENTE " : ""}{v.clienteFornecedor.toUpperCase()}</> : null}
                      {(documentoTexto(v.numeroPedido) || v.clienteFornecedor) && v.contatoNome ? " | " : ""}
                      {v.contatoNome ? <>A/C: {v.contatoNome.toUpperCase()}</> : null}
                      {!v.contatoNome && v.volumes ? <> | VOLUME: {String(v.volumes).toUpperCase()}</> : null}
                    </p>
                    {v.contatoNome && v.volumes && <p className="mt-1 font-bold uppercase text-slate-900">VOLUME: {String(v.volumes).toUpperCase()}</p>}
                    </div>
                    {v.endereco && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-slate-700"><span>End.: {formatarEnderecoExibicao(v.endereco, v.numero, v.complemento)}</span>{separarEndereco(v.endereco).link && <a href={separarEndereco(v.endereco).link} target="_blank" rel="noreferrer" className="font-semibold text-blue-800 underline underline-offset-2">Google Maps</a>}</p>}
                    {v.info && (String(v.info).trim().startsWith("#ERROR") ? <p className="mt-1 text-amber-700">Observação com erro na planilha. Abra Editar, confira o texto e salve de novo.</p> : <p className="mt-1 text-slate-600">Observação: <span className="whitespace-pre-line">{String(v.info).replace(/^[\r\n]+/, "")}</span></p>)}
                    <p className="mt-1 font-[Arial] text-[10pt] md:text-[calc(10pt+1px)] text-slate-500"><strong>Preenchido por:</strong>{v.preenchidoPor ? ` ${v.preenchidoPor}` : ""} <span className="mx-1">|</span> <strong>Forma de pagamento:</strong>{pagamentoTexto(v.notasJson) ? ` ${pagamentoTexto(v.notasJson)}` : ""}</p>
                  </div>
                  {canEdit && <div className="flex flex-wrap gap-2">
                    {lerConclusao(v.notasJson) && <Carimbo>Concluído</Carimbo>}
                    <button type="button" onClick={() => abrirEditar(v)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Editar</button>
                    {canDelete && <button type="button" disabled={saving} onClick={() => void excluirViagem(v)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Excluir</button>}
                  </div>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold uppercase text-slate-400"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {diasMes.map((d) => {
                const data = localDateString(d);
                const itens = viagens[data] || [];
                const fora = d.getMonth() !== mesBase.getMonth();
                return <button key={data} type="button" onClick={() => selecionarDia(data)} className={`min-h-24 rounded-xl border p-2 text-left ${fora ? "border-slate-100 bg-slate-50 text-slate-300" : data === hoje ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <p className="text-sm font-semibold">{d.getDate()}</p>
                  <div className="mt-1 space-y-1">{itens.slice(0, 3).map((v) => <p key={v.id} className="truncate text-sm text-slate-600">{horaCurta(v.horario)} {v.clienteFornecedor || v.tipoHorario}</p>)}{itens.length > 3 && <p className="text-sm text-slate-400">+{itens.length - 3}</p>}</div>
                </button>;
              })}
            </div>
          </div>
        )}
      </section>

      {modal && (!readOnly || (editandoId ? canEdit : canCreate)) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-slate-950/50 p-3 sm:p-6">
          <form
            noValidate
            onSubmit={salvar}
            style={layoutViewport === "mobile" ? { width: "calc(100vw - 24px)", maxWidth: "calc(100vw - 24px)" } : undefined}
            className="motorista-form my-4 w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Motorista</p><h2 className="mt-1 text-xl max-md:text-[15px] font-semibold text-slate-950">{editandoId ? "Editar agendamento" : "Nova viagem"}</h2><p className="mt-1 text-sm text-slate-500">Campos com * são obrigatórios.</p></div>
              <button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600">Fechar</button>
            </div>

            <div style={colunasFormulario("repeat(4, minmax(0, 1fr))")} className="mt-5 grid gap-4">
              <label className="min-w-0 text-sm font-medium text-slate-700">* Tipo<select value={form.tipo} onChange={(e) => set("tipo", e.target.value as "Entrega" | "Retirada")} className={fieldClass("tipo")}><option value="Entrega">Entrega</option><option value="Retirada">Coleta</option></select>{mensagemCampo("tipo")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">* Empresa<select value={form.loja} onChange={(e) => set("loja", e.target.value)} className={fieldClass("loja")}>{empresas.length !== 1 && <option value="">Selecione</option>}{form.loja && !empresas.includes(form.loja) && <option value={form.loja}>{form.loja} (já registrada)</option>}{empresas.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select>{mensagemCampo("loja")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">* Data<BrazilianDateInput value={form.data} onChange={(value) => set("data", value)} className={fieldClass("data")} required />{mensagemCampo("data")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">* Vendedor<select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={fieldClass("vendedor")} required><option value="">Selecione</option>{form.vendedor && !RESPONSAVEIS.includes(form.vendedor) && <option value={form.vendedor}>{form.vendedor} (já registrado)</option>}{RESPONSAVEIS.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select>{mensagemCampo("vendedor")}</label>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={form.bloquear} onChange={(e) => set("bloquear", e.target.checked)} />Bloqueio</label>
              {form.bloquear && <div style={colunasFormulario("repeat(2, minmax(0, 1fr))")} className="mt-3 grid gap-3"><label className="text-sm text-slate-700">Início<input type="time" value={form.bloqueioInicio} onChange={(e) => set("bloqueioInicio", e.target.value)} className={fieldClass("bloqueioInicio")} /></label><label className="text-sm text-slate-700">Fim<input type="time" value={form.bloqueioFim} onChange={(e) => set("bloqueioFim", e.target.value)} className={fieldClass("bloqueioFim")} /></label></div>}
            </div>

            <div style={colunasFormulario("repeat(3, minmax(0, 1fr))")} className="mt-4 grid gap-4">
              <label className="min-w-0 text-sm font-medium text-slate-700">* Nota Fiscal/Pedido<input value={form.numeroPedido} onChange={(e) => set("numeroPedido", e.target.value)} className={fieldClass("numeroPedido")} />{mensagemCampo("numeroPedido")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">* Cliente/Fornecedor<input value={form.clienteFornecedor} onChange={(e) => set("clienteFornecedor", e.target.value.toUpperCase())} className={fieldClass("clienteFornecedor")} />{mensagemCampo("clienteFornecedor")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">A/C<input value={form.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} className={fieldClass("contatoNome")} /></label>
            </div>

            <div style={colunasFormulario("220px 160px minmax(0, 1fr)")} className="mt-4 grid gap-4 items-end">
              <label className="min-w-0 text-sm font-medium text-slate-700">CEP<input value={form.cep} onChange={(e) => { const cepDigitado = formatarCep(e.target.value); set("cep", cepDigitado); if (cepDigitado.replace(/\D/g, "").length === 8) void buscarCep(cepDigitado); }} inputMode="numeric" placeholder="00000-000" className={fieldClass("cep")} /></label>
              <button type="button" onClick={() => void buscarCep()} className="h-[42px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Buscar CEP</button>
              <div className="min-w-0 text-sm font-medium text-slate-700">Link do endereço<div className="mt-1 flex h-[42px] items-center">{linkMapsFormulario ? <a href={linkMapsFormulario} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">Google Maps</a> : <span className="text-sm text-slate-400">Gerado após informar o número</span>}</div></div>
            </div>

            <div style={colunasFormulario("minmax(0, 1fr) 180px")} className="mt-4 grid gap-4">
              <label className="min-w-0 text-sm font-medium text-slate-700">* Endereço <span className="font-normal text-slate-400">(Rua / Av. / Rodovia)</span><input value={form.endereco} onChange={(e) => { set("endereco", e.target.value); set("linkEndereco", ""); }} className={fieldClass("endereco")} />{mensagemCampo("endereco")}</label>
              <label className="min-w-0 text-sm font-medium text-slate-700">* Número<input ref={numeroRef} value={form.numeroEndereco} onChange={(e) => { const numero = e.target.value; set("numeroEndereco", numero); const destino = [form.endereco, numero, form.bairro, form.cidade].filter(Boolean).join(", "); set("linkEndereco", destino ? `https://maps.google.com/?q=${encodeURIComponent(destino)}` : ""); }} className={fieldClass("numeroEndereco")} />{mensagemCampo("numeroEndereco")}</label>
            </div>

            <div style={colunasFormulario("repeat(3, minmax(0, 1fr))")} className="mt-4 grid gap-4">
              <label className="min-w-0 text-sm font-medium text-slate-700">Bairro<input value={form.bairro} onChange={(e) => { set("bairro", e.target.value); set("linkEndereco", ""); }} className={fieldClass("bairro")} /></label>
              <label className="min-w-0 text-sm font-medium text-slate-700">Cidade<input value={form.cidade} onChange={(e) => { set("cidade", e.target.value); set("linkEndereco", ""); }} className={fieldClass("cidade")} /></label>
              <label className="min-w-0 text-sm font-medium text-slate-700">Referência<input value={form.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ex.: portão lateral" className={fieldClass("referencia")} /></label>
            </div>

            <div style={colunasFormulario("180px minmax(0, 1fr)")} className="mt-4 grid gap-4">
              <label className="min-w-0 text-sm font-medium text-slate-700">* Volume<input value={form.volumes} onChange={(e) => set("volumes", e.target.value)} placeholder="Ex.: 15" className={fieldClass("volumes")} />{mensagemCampo("volumes")}</label>
              <div className="min-w-0"><label className="min-w-0 text-sm font-medium text-slate-700">Observação<textarea value={form.discriminacao} onChange={(e) => set("discriminacao", e.target.value)} rows={4} placeholder={"Ex.:\n10 rolos de bolha\n5 sacos de Polifloc"} className={fieldClass("discriminacao")} /></label><button type="button" onClick={repetirUltimaDiscriminacao} className="mt-1 text-sm font-semibold text-blue-800 underline underline-offset-2">Repetir última observação</button></div>
            </div>

            <div style={colunasFormulario("repeat(2, minmax(0, 1fr))")} className="mt-4 grid gap-4">
              <label className="block min-w-0 text-sm font-medium text-slate-700">Preenchido por:{actorName ? <input readOnly value={editandoId ? form.preenchidoPor : actorName} className={fieldClass("preenchidoPor")} /> : <select value={form.preenchidoPor} onChange={(e) => set("preenchidoPor", e.target.value)} className={fieldClass("preenchidoPor")}><option value="">Selecione</option>{form.preenchidoPor && !RESPONSAVEIS.includes(form.preenchidoPor) && <option value={form.preenchidoPor} disabled>{form.preenchidoPor} (já registrado)</option>}{RESPONSAVEIS.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select>}</label>
              <label className="block min-w-0 text-sm font-medium text-slate-700">Forma de pagamento:<select value={form.pagamento} onChange={(e) => set("pagamento", e.target.value as FormState["pagamento"])} className={fieldClass("pagamento")}><option value="">Selecione</option><option value="Boleto">Boleto</option><option value="Debite">Debite</option><option value="Pago">Pago</option><option value="Receber">Receber</option></select></label>
            </div>

            {aviso && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}
            {erro && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button><button type="submit" disabled={saving} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar viagem"}</button></div>
          </form>
        </div>
      )}
    </>
  );
}
