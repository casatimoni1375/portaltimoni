"use client";

import { useEffect, useMemo, useState } from "react";
import { TODAY_BLOCKS, wantsTodayBlock } from "@/lib/today-blocks";
import type { PortalModule, PortalUser } from "@/lib/access-control";
import type { ConfiguredCollaborator } from "@/lib/portal-config";

type ConfigurationResponse = {
  users: PortalUser[];
  collaborators: ConfiguredCollaborator[];
};

type Permissions = {
  modules: PortalModule[];
  mobileModules: PortalModule[];
  noticeRequired: boolean;
  todayBlocks: string[] | null;
  readOnlyModules: PortalModule[];
};

const MODULES: Array<{ id: PortalModule; label: string }> = [
  { id: "painel", label: "Avisos" },
  { id: "agenda", label: "Agenda Ciça" },
  { id: "agenda-ct", label: "Agenda CT" },
  { id: "chat", label: "Chat" },
  { id: "compras", label: "Compras" },
  { id: "pedido-de-compra", label: "Pedidos de Compra" },
  { id: "conferencia", label: "Conferência" },
  { id: "estoque", label: "Estoque" },
  { id: "estoque-rotativo", label: "Rotativo" },
  { id: "motorista", label: "Motorista" },
  { id: "reunioes", label: "Reuniões" },
  { id: "leads", label: "Leads" },
];

// Acesso novo abre com todos os módulos marcados; você desmarca o que não quiser.
const ALL_MODULE_IDS: PortalModule[] = MODULES.map((module) => module.id);

const DASHBOARD_MODULES = new Set<PortalModule>([
  "painel", "agenda", "compras", "pedido-de-compra", "conferencia", "estoque", "estoque-rotativo", "motorista", "reunioes", "leads",
]);

const NEW_ACCESS = "__new__";

function emptyMember(accessEmail = ""): ConfiguredCollaborator {
  return {
    id: "",
    name: "",
    role: "",
    unit: "Rio Claro",
    accessEmail,
    active: true,
    noticeRequired: true,
    chatEnabled: true,
    updatedAt: "",
  };
}

function accessLabel(user?: PortalUser) {
  if (!user) return "";
  return user.accessLabel || user.name || user.email;
}

function memberKey(member: ConfiguredCollaborator) {
  return member.id || `${member.unit}:${member.name}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function sortAccesses(users: PortalUser[]) {
  return users
    .filter((user) => user.active !== false)
    .sort((a, b) => accessLabel(a).localeCompare(accessLabel(b), "pt-BR"));
}

function byName(a: ConfiguredCollaborator, b: ConfiguredCollaborator) {
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

// Permissões salvas do acesso; sem acesso (e-mail novo), começa com tudo marcado.
function permissionsOf(access?: PortalUser): Permissions {
  if (!access) return { modules: [...ALL_MODULE_IDS], mobileModules: [...ALL_MODULE_IDS], noticeRequired: false, todayBlocks: null, readOnlyModules: [] };
  return {
    modules: [...access.modules],
    mobileModules: [...(access.mobileModules ?? access.modules)],
    noticeRequired: Boolean(access.noticeRequired),
    todayBlocks: access.todayBlocks?.length ? [...access.todayBlocks] : null,
    readOnlyModules: [...(access.readOnlyModules ?? [])],
  };
}

const FIELD = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const GRID = "mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";

export default function ConfiguracoesClient({ canAdministerPermissions = false }: { canAdministerPermissions?: boolean }) {
  const [data, setData] = useState<ConfigurationResponse>({ users: [], collaborators: [] });
  const [loading, setLoading] = useState(true);
  // E-mail escolhido no seletor (ou NEW_ACCESS). O cartão é fixo; só o conteúdo muda.
  const [selected, setSelected] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newUnit, setNewUnit] = useState<ConfiguredCollaborator["unit"]>("Rio Claro");
  const [perm, setPerm] = useState<Permissions>(permissionsOf());
  const [memberDraft, setMemberDraft] = useState<ConfiguredCollaborator | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/configuracoes?t=${Date.now()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as configurações.");
      const users: PortalUser[] = result.users || [];
      setData({ users, collaborators: result.collaborators || [] });
      const first = sortAccesses([...users])[0];
      if (first) {
        setSelected(normalizeEmail(first.email));
        setPerm(permissionsOf(first));
      } else {
        setSelected(NEW_ACCESS);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const usersByEmail = useMemo(
    () => new Map(data.users.map((user) => [normalizeEmail(user.email), user])),
    [data.users],
  );

  const accessOptions = useMemo(() => sortAccesses([...data.users]), [data.users]);

  const isNew = selected === NEW_ACCESS;
  const activeMembers = useMemo(() => data.collaborators.filter((member) => member.active !== false), [data.collaborators]);

  const linkedMembers = useMemo(
    () => (isNew ? [] : activeMembers.filter((member) => normalizeEmail(member.accessEmail) === selected).sort(byName)),
    [activeMembers, selected, isNew],
  );

  function selectAccess(value: string) {
    setSelected(value);
    setPerm(permissionsOf(value === NEW_ACCESS ? undefined : usersByEmail.get(value)));
    setNewEmail("");
    setMemberDraft(null);
    setError("");
    setMessage("");
  }

  function toggleModule(module: PortalModule, checked: boolean) {
    setPerm({
      ...perm,
      modules: checked ? [...new Set([...perm.modules, module])] : perm.modules.filter((item) => item !== module),
      mobileModules: checked ? perm.mobileModules : perm.mobileModules.filter((item) => item !== module),
    });
  }

  function toggleMobileModule(module: PortalModule, checked: boolean) {
    if (!perm.modules.includes(module)) return;
    setPerm({
      ...perm,
      mobileModules: checked ? [...new Set([...perm.mobileModules, module])] : perm.mobileModules.filter((item) => item !== module),
    });
  }

  function toggleReadOnly(module: PortalModule, checked: boolean) {
    const others = perm.readOnlyModules.filter((item) => item !== module);
    setPerm({ ...perm, readOnlyModules: checked ? [...others, module] : others });
  }

  async function putUser(user: PortalUser) {
    const response = await fetch("/api/configuracoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ section: "user", item: user }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar o acesso.");
    return result.item as PortalUser;
  }

  async function putMember(member: ConfiguredCollaborator) {
    const response = await fetch("/api/configuracoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ section: "collaborator", item: member }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar o colaborador.");
    return result.item as ConfiguredCollaborator;
  }

  // Salva só as permissões do e-mail escolhido. Colaboradores são salvos à parte.
  async function savePermissions() {
    if (!canAdministerPermissions) {
      setError("Seu acesso não permite criar acessos ou alterar permissões.");
      return;
    }
    const email = isNew ? normalizeEmail(newEmail) : selected;
    if (!email || !email.includes("@")) {
      setError("Informe um e-mail de acesso válido.");
      return;
    }
    const existing = usersByEmail.get(email);
    if (isNew && existing) {
      setError("Esse e-mail já tem acesso. Escolha-o no seletor.");
      return;
    }

    setBusy("save:access");
    setError("");
    setMessage("");
    try {
      const fields = {
        modules: [...perm.modules],
        boxes: perm.modules.filter((module) => DASHBOARD_MODULES.has(module)),
        mobileModules: perm.mobileModules.filter((module) => perm.modules.includes(module)),
        noticeRequired: perm.noticeRequired,
        todayBlocks: perm.todayBlocks ?? undefined,
        readOnlyModules: perm.readOnlyModules.filter((module) => perm.modules.includes(module)),
      };
      const saved = await putUser(existing
        ? { ...existing, ...fields }
        : {
          name: email,
          accessLabel: email,
          email,
          unit: newUnit,
          requiresPassword: false,
          readOnly: false,
          active: true,
          directPainel: false,
          lastAccess: "",
          ...fields,
        });
      const savedEmail = normalizeEmail(saved.email);
      setData((current) => ({
        ...current,
        users: current.users.some((item) => normalizeEmail(item.email) === savedEmail)
          ? current.users.map((item) => normalizeEmail(item.email) === savedEmail ? saved : item)
          : [...current.users, saved],
      }));
      setSelected(savedEmail);
      setPerm(permissionsOf(saved));
      setNewEmail("");
      setMessage("Permissões salvas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy("");
    }
  }

  async function saveMember() {
    if (!memberDraft) return;
    const member = {
      ...memberDraft,
      name: memberDraft.name.trim(),
      role: memberDraft.role.trim(),
      accessEmail: normalizeEmail(memberDraft.accessEmail),
      active: true,
    };
    if (member.name.length < 2) {
      setError("Informe o nome do colaborador.");
      return;
    }
    if (!usersByEmail.has(member.accessEmail)) member.accessEmail = selected;
    setBusy("save:member");
    setError("");
    setMessage("");
    try {
      const saved = await putMember(member);
      setData((current) => ({
        ...current,
        collaborators: current.collaborators.some((item) => item.id === saved.id)
          ? current.collaborators.map((item) => item.id === saved.id ? saved : item)
          : [...current.collaborators, saved],
      }));
      setMemberDraft(null);
      setMessage("Colaborador salvo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy("");
    }
  }

  async function deleteMember(member: ConfiguredCollaborator) {
    if (!window.confirm(`Excluir ${member.name}?`)) return;
    setBusy("delete:member");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/configuracoes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ id: member.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir.");
      setData((current) => ({
        ...current,
        collaborators: current.collaborators.filter((item) => item.id !== member.id),
      }));
      setMemberDraft(null);
      setMessage("Colaborador excluído.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir.");
    } finally {
      setBusy("");
    }
  }

  const locked = !canAdministerPermissions;
  const savingAccess = busy === "save:access";
  const savingMember = busy === "save:member";

  return (
    <div className="pb-10">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#13038D]">Configuração da equipe</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Acessos e permissões</h1>
        <p className="mt-1 text-sm text-slate-600">Escolha o e-mail de acesso e personalize. Cada colaborador pertence a um e-mail.</p>
      </header>

      {loading ? <p className="mt-5 text-sm text-slate-500">Carregando...</p> : (
        <section className="rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="px-4 py-4">
            <label className="block text-xs font-semibold text-slate-600">
              E-mail de acesso
              <select value={selected} onChange={(event) => selectAccess(event.target.value)} className={FIELD}>
                {accessOptions.map((user) => (
                  <option key={user.email} value={normalizeEmail(user.email)}>{user.email}</option>
                ))}
                {canAdministerPermissions && <option value={NEW_ACCESS}>+ Novo e-mail de acesso</option>}
              </select>
            </label>

            {isNew && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                  Novo e-mail
                  <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="email@exemplo.com" className={FIELD} />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Unidade
                  <select value={newUnit} onChange={(event) => setNewUnit(event.target.value as ConfiguredCollaborator["unit"])} className={FIELD}>
                    <option>Geral</option>
                    <option>Rio Claro</option>
                    <option>Araras</option>
                  </select>
                </label>
              </div>
            )}

            {!isNew && (
              <p className="mt-3 text-sm leading-7 text-slate-700">
                <span className="font-semibold text-slate-950">Colaboradores: </span>
                {!linkedMembers.length && <span className="text-slate-500">nenhum ligado a este e-mail. </span>}
                {linkedMembers.map((member, index) => (
                  <span key={memberKey(member)}>
                    <button type="button" onClick={() => { setMemberDraft({ ...member }); setError(""); setMessage(""); }} className={`underline decoration-slate-300 underline-offset-4 hover:text-[#13038D] ${memberDraft?.id === member.id ? "font-semibold text-[#13038D]" : ""}`}>{member.name}</button>
                    {index < linkedMembers.length - 1 ? ", " : ". "}
                  </span>
                ))}
                <button type="button" onClick={() => { setMemberDraft(emptyMember(selected)); setError(""); setMessage(""); }} className="ml-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700">+ Colaborador</button>
              </p>
            )}

            {memberDraft && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className={SECTION_TITLE}>{memberDraft.id ? "Editar colaborador" : "Novo colaborador"}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">
                    Nome
                    <input value={memberDraft.name} onChange={(event) => setMemberDraft({ ...memberDraft, name: event.target.value })} className={FIELD} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Função
                    <input value={memberDraft.role} onChange={(event) => setMemberDraft({ ...memberDraft, role: event.target.value })} placeholder="Ex.: Vendedor" className={FIELD} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Unidade
                    <select value={memberDraft.unit} onChange={(event) => setMemberDraft({ ...memberDraft, unit: event.target.value as ConfiguredCollaborator["unit"] })} className={FIELD}>
                      <option>Geral</option>
                      <option>Rio Claro</option>
                      <option>Araras</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    E-mail de acesso
                    <select value={usersByEmail.has(normalizeEmail(memberDraft.accessEmail)) ? normalizeEmail(memberDraft.accessEmail) : selected} onChange={(event) => setMemberDraft({ ...memberDraft, accessEmail: event.target.value })} className={FIELD}>
                      {accessOptions.map((user) => (
                        <option key={user.email} value={normalizeEmail(user.email)}>{user.email}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div>{memberDraft.id && <button type="button" disabled={Boolean(busy)} onClick={() => void deleteMember(memberDraft)} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-[#D40C0D] disabled:opacity-60">Excluir</button>}</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMemberDraft(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                    <button type="button" disabled={savingMember} onClick={() => void saveMember()} className="rounded-lg bg-[#13038D] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingMember ? "Salvando..." : "Salvar colaborador"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <p className={SECTION_TITLE}>Personalização</p>
            <div className={GRID}>
              {MODULES.map((module) => {
                const checked = perm.modules.includes(module.id);
                return (
                  <label key={module.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${checked ? "border-blue-300 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700"} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={checked} disabled={locked} onChange={(event) => toggleModule(module.id, event.target.checked)} className="h-4 w-4 accent-[#13038D]" />
                    {module.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className={SECTION_TITLE}>Mobile</p>
              <p className="text-[11px] text-slate-500">O que aparece no menu do celular.</p>
            </div>
            <div className={GRID}>
              {MODULES.map((module) => {
                const enabled = perm.modules.includes(module.id);
                const checked = enabled && perm.mobileModules.includes(module.id);
                return (
                  <label key={`mobile-${module.id}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${checked ? "border-blue-300 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700"} ${enabled && !locked ? "cursor-pointer" : "cursor-not-allowed"} ${enabled ? "" : "opacity-45"}`}>
                    <input type="checkbox" checked={checked} disabled={locked || !enabled} onChange={(event) => toggleMobileModule(module.id, event.target.checked)} className="h-4 w-4 accent-[#13038D]" />
                    {module.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className={SECTION_TITLE}>Tela Hoje</p>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" checked={perm.todayBlocks === null} disabled={locked} onChange={(event) => setPerm({ ...perm, todayBlocks: event.target.checked ? null : TODAY_BLOCKS.filter((block) => wantsTodayBlock(undefined, block.id, (module) => perm.modules.includes(module))).map((block) => block.id) })} className="h-4 w-4 accent-[#13038D]" />
                Padrão pelas permissões
              </label>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Blocos da tela inicial. Comunicados aparecem sempre. Um bloco só aparece se o módulo estiver liberado em Personalização.</p>
            <div className={GRID}>
              {TODAY_BLOCKS.map((block) => {
                const enabled = block.modules.some((module) => perm.modules.includes(module)) && perm.todayBlocks !== null;
                const checked = perm.todayBlocks === null ? wantsTodayBlock(undefined, block.id, (module) => perm.modules.includes(module)) : perm.todayBlocks.includes(block.id);
                return (
                  <label key={`hoje-${block.id}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${checked ? "border-blue-300 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700"} ${enabled && !locked ? "cursor-pointer" : "cursor-not-allowed"} ${enabled ? "" : "opacity-45"}`}>
                    <input type="checkbox" checked={checked} disabled={locked || !enabled} onChange={(event) => { const current = perm.todayBlocks || []; setPerm({ ...perm, todayBlocks: event.target.checked ? [...current, block.id] : current.filter((id) => id !== block.id) }); }} className="h-4 w-4 accent-[#13038D]" />
                    {block.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className={SECTION_TITLE}>Somente leitura</p>
              <p className="text-[11px] text-slate-500">O módulo continua visível, mas não cria, edita nem exclui.</p>
            </div>
            <div className={GRID}>
              {MODULES.map((module) => {
                const enabled = perm.modules.includes(module.id);
                const checked = enabled && perm.readOnlyModules.includes(module.id);
                return (
                  <label key={`leitura-${module.id}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${checked ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"} ${enabled && !locked ? "cursor-pointer" : "cursor-not-allowed"} ${enabled ? "" : "opacity-45"}`}>
                    <input type="checkbox" checked={checked} disabled={locked || !enabled} onChange={(event) => toggleReadOnly(module.id, event.target.checked)} className="h-4 w-4 accent-[#13038D]" />
                    {module.label}
                  </label>
                );
              })}
            </div>
            <label className={`mt-3 flex items-center gap-2 text-sm font-medium text-slate-700 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
              <input type="checkbox" checked={perm.noticeRequired} disabled={locked} onChange={(event) => setPerm({ ...perm, noticeRequired: event.target.checked })} className="h-4 w-4 accent-[#13038D]" />
              Exige confirmação de leitura dos comunicados
            </label>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            {message && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p>}
            {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            {locked ? (
              <p className="text-xs text-slate-500">Seu acesso permite editar colaboradores, mas não alterar permissões.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">As permissões valem para todos os colaboradores deste e-mail.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => selectAccess(selected)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Desfazer</button>
                  <button type="button" disabled={savingAccess} onClick={() => void savePermissions()} className="rounded-lg bg-[#13038D] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingAccess ? "Salvando..." : "Salvar"}</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
