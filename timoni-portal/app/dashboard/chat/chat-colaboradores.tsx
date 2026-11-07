"use client";
import { useEffect, useRef, useState } from "react";
import { createScreenRequest, ScreenRequestError } from "@/lib/screen-request";

type Contact = { id: string; name: string; unit: string; unread: number };
type Message = { id: string; sender_user_id: string; body: string; created_at: string; edited_at?: string | null };
type Conversation = { id: string; user_a: string; user_b: string };
type Permissions = { send: boolean; edit: boolean; remove: boolean };
type Overview = { currentUser: { id: string; name: string }; contacts: Contact[]; permissions: Permissions };
const none: Permissions = { send: false, edit: false, remove: false };
const button = "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50";

export default function ChatColaboradores({ individual, historyAllowed }: { individual: boolean; historyAllowed: boolean }) {
  const [history, setHistory] = useState(!individual);
  const [contacts, setContacts] = useState<Contact[]>([]), [me, setMe] = useState({ id: "", name: "" });
  const [permissions, setPermissions] = useState(none), [peer, setPeer] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]), [conversation, setConversation] = useState("");
  const [historyBefore, setHistoryBefore] = useState<string | null>(null), [historyLoading, setHistoryLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]), [before, setBefore] = useState<string | null>(null);
  const [draft, setDraft] = useState(""), [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [olderLoading, setOlderLoading] = useState(false);
  const overviewRequest = useRef<{ run: (options?: { urgent?: boolean }) => Promise<void> } | null>(null);
  const threadRequest = useRef<{ run: (options?: { urgent?: boolean }) => Promise<void> } | null>(null);
  const mutation = useRef<AbortController | null>(null), older = useRef<AbortController | null>(null), active = useRef(true);
  const historyOlder = useRef<AbortController | null>(null), paginated = useRef(false);
  const acknowledged = useRef<string | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; mutation.current?.abort(); older.current?.abort(); }; }, []);

  function accessLost() { setContacts([]); setMessages([]); setConversations([]); setPermissions(none); setPeer(""); setConversation(""); setDraft(""); setEditing(null); }
  const pollOverview = history || !peer;
  useEffect(() => {
    setError(""); setHistoryLoading(false);
    if (!pollOverview) return;
    const loader = createScreenRequest({
      load: async signal => {
        const response = await fetch(history ? "/api/chat-historico" : "/api/chat-colaboradores", { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok) throw new ScreenRequestError(data.error || "Não foi possível consultar o chat.", response.status);
        return data as Overview & { conversations?: Conversation[]; before?: string | null };
      },
      onData: data => {
        if (history) { setConversations(data.conversations || []); setHistoryBefore(data.before || null); }
        else {
          setContacts(data.contacts); setMe(data.currentUser); setPermissions(data.permissions);
          setPeer(current => data.contacts.some(person => person.id === current) ? current : "");
        }
        setError("");
      },
      onError: failure => { setError(failure instanceof Error ? failure.message : "Chat indisponível."); if (failure instanceof ScreenRequestError && [401, 403].includes(failure.status)) accessLost(); },
    });
    overviewRequest.current = loader;
    const check = () => { if (document.visibilityState === "visible" && navigator.onLine) void loader.run(); };
    check();
    const timer = history ? null : window.setInterval(check, 15000);
    const onVisible = () => { if (!history) check(); };
    window.addEventListener("focus", onVisible); window.addEventListener("online", onVisible); document.addEventListener("visibilitychange", onVisible);
    return () => { loader.dispose(); historyOlder.current?.abort(); historyOlder.current = null; overviewRequest.current = null; if (timer !== null) window.clearInterval(timer); window.removeEventListener("focus", onVisible); window.removeEventListener("online", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [history, pollOverview]);

  const threadKey = history ? conversation : peer;
  const threadUrl = history ? `/api/chat-historico?conversation=${encodeURIComponent(conversation)}` : `/api/chat-colaboradores?peer=${encodeURIComponent(peer)}&overview=1`;
  useEffect(() => {
    setMessages([]); setBefore(null); setDraft(""); setEditing(null); setOlderLoading(false);
    paginated.current = false;
    acknowledged.current = null;
    if (!threadKey) return;
    const acknowledgements = new AbortController();
    const loader = createScreenRequest({
      load: async signal => {
        const response = await fetch(threadUrl, { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok) throw new ScreenRequestError(data.error || "Não foi possível abrir a conversa.", response.status);
        return data as { messages: Message[]; before: string | null } & Partial<Overview>;
      },
      onData: data => {
        setMessages(data.messages); setBefore(data.before); setError("");
        paginated.current = false;
        if (data.currentUser && data.contacts && data.permissions) { setMe(data.currentUser); setContacts(data.contacts); setPermissions(data.permissions); }
        const last = data.messages.at(-1);
        if (!history && last && acknowledged.current !== last.id && document.visibilityState === "visible") {
          acknowledged.current = last.id;
          void fetch("/api/chat-colaboradores", { method: "PATCH", signal: acknowledgements.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", peer: threadKey, through: last.id }) }).then(response => { if (!response.ok) throw new Error("Leitura não confirmada"); }).catch(() => { if (!acknowledgements.signal.aborted && acknowledged.current === last.id) acknowledged.current = null; });
        }
      },
      onError: failure => { setError(failure instanceof Error ? failure.message : "Chat indisponível."); if (failure instanceof ScreenRequestError && [401, 403].includes(failure.status)) accessLost(); else if (failure instanceof ScreenRequestError && failure.status === 404) { setMessages([]); setBefore(null); if (!history) setPeer(""); } },
      onBusy: setLoading,
    });
    threadRequest.current = loader;
    const check = () => { if (!paginated.current && document.visibilityState === "visible" && navigator.onLine) void loader.run(); };
    check(); const timer = history ? null : window.setInterval(check, 15000);
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { loader.dispose(); acknowledgements.abort(); older.current?.abort(); older.current = null; threadRequest.current = null; if (timer !== null) window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [history, threadKey, threadUrl]);

  async function loadOlder() {
    if (!before || older.current) return;
    const wasPaginated = paginated.current;
    paginated.current = true;
    const controller = new AbortController(); older.current = controller; setOlderLoading(true);
    try {
      const response = await fetch(`${threadUrl}&before=${encodeURIComponent(before)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new ScreenRequestError(data.error || "Não foi possível carregar mensagens anteriores.", response.status);
      if (!controller.signal.aborted) { paginated.current = true; setMessages(current => [...data.messages, ...current]); setBefore(data.before); }
    } catch (failure) { if (!controller.signal.aborted) { paginated.current = wasPaginated; setError(failure instanceof Error ? failure.message : "Chat indisponível."); if (failure instanceof ScreenRequestError && [401, 403].includes(failure.status)) accessLost(); } }
    finally { if (older.current === controller) older.current = null; if (!controller.signal.aborted) setOlderLoading(false); }
  }
  async function loadOlderConversations() {
    if (!historyBefore || historyOlder.current) return;
    const controller = new AbortController(); historyOlder.current = controller; setHistoryLoading(true);
    try {
      const response = await fetch(`/api/chat-historico?before=${encodeURIComponent(historyBefore)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new ScreenRequestError(data.error || "Histórico indisponível.", response.status);
      if (!controller.signal.aborted) { setConversations(current => [...current, ...data.conversations]); setHistoryBefore(data.before); }
    } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Histórico indisponível."); if (failure instanceof ScreenRequestError && [401, 403].includes(failure.status)) accessLost(); } }
    finally { if (historyOlder.current === controller) historyOlder.current = null; if (!controller.signal.aborted) setHistoryLoading(false); }
  }
  async function change(method: "POST" | "PATCH" | "DELETE", body: object) {
    if (mutation.current || older.current) return;
    const controller = new AbortController(); mutation.current = controller; setSaving(true); setError("");
    try {
      const response = await fetch("/api/chat-colaboradores", { method, signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, peer }) });
      const data = await response.json();
      if (!response.ok) { if ([401, 403].includes(response.status)) accessLost(); throw new Error(data.error || "Não foi possível concluir a ação."); }
      if (active.current) { setDraft(""); setEditing(null); void threadRequest.current?.run({ urgent: true }); void overviewRequest.current?.run({ urgent: true }); }
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : "Confira a conversa antes de tentar novamente."); }
    finally { mutation.current = null; if (active.current) setSaving(false); }
  }
  function selectTab(value: boolean) { setHistory(value); setPeer(""); setConversation(""); setMessages([]); }

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold text-[#14038D]">Chat</h1>
    <div className="flex flex-wrap gap-2" aria-label="Tipo de conversa">
      {individual && <button type="button" disabled={saving} onClick={() => selectTab(false)} aria-pressed={!history} className={button}>Conversas individuais</button>}
      {historyAllowed && <button type="button" disabled={saving} onClick={() => selectTab(true)} aria-pressed={history} className={button}>Histórico antigo · consulta</button>}
      <button type="button" disabled={saving || olderLoading || historyLoading} onClick={() => { void overviewRequest.current?.run({ urgent: true }); void threadRequest.current?.run({ urgent: true }); }} className={button}>Atualizar</button>
    </div>
    {history ? <p className="text-sm text-slate-600">Histórico reservado à Ciça até a revisão dos destinatários. As identidades antigas são apresentadas como registradas, sem atribuição a pessoas.</p> : <p className="text-sm text-slate-600">{me.name ? `Conectado como ${me.name}. ` : ""}Sua identidade é definida pelo login individual.</p>}
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <nav aria-label={history ? "Conversas antigas" : "Colaboradores"} className="max-h-[65dvh] space-y-1 overflow-y-auto rounded-xl border bg-white p-2">
        {history ? conversations.map(item => <button type="button" disabled={saving} key={item.id} onClick={() => setConversation(item.id)} aria-pressed={conversation === item.id} className={`${button} w-full break-words text-left`}>{item.user_a} ↔ {item.user_b}</button>) : contacts.map(person => <button type="button" disabled={saving} key={person.id} onClick={() => setPeer(person.id)} aria-pressed={peer === person.id} className={`${button} w-full text-left`}><span className="block font-medium">{person.name}</span><span className="text-xs">{person.unit}{person.unread ? ` · ${person.unread} não lidas` : ""}</span></button>)}
        {!(history ? conversations.length : contacts.length) && <p className="p-3 text-sm text-slate-500">Nenhuma conversa disponível.</p>}
        {history && historyBefore && <button type="button" disabled={historyLoading} onClick={() => void loadOlderConversations()} className={`${button} w-full`}>{historyLoading ? "Carregando…" : "Conversas anteriores"}</button>}
      </nav>
      <div className="min-w-0 rounded-xl border bg-white p-4">
        {!threadKey ? <p className="text-sm text-slate-500">Selecione uma conversa.</p> : <>
          {before && <button type="button" disabled={olderLoading} onClick={() => void loadOlder()} className={button}>{olderLoading ? "Carregando…" : "Mensagens anteriores"}</button>}
          {loading && <p role="status" className="py-2 text-sm">Atualizando conversa…</p>}
          <div role="log" aria-label="Mensagens" aria-live="polite" className="max-h-[55dvh] space-y-3 overflow-y-auto py-3">
            {messages.map(message => <article key={message.id} className="rounded-lg bg-slate-50 p-3">
              <p className="break-words whitespace-pre-wrap text-sm">{message.body}</p>
              <p className="mt-2 break-words text-xs text-slate-500">{history ? message.sender_user_id : message.sender_user_id === me.id ? "Você" : contacts.find(person => person.id === peer)?.name} · {new Date(message.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{message.edited_at ? " · editada" : ""}</p>
              {!history && message.sender_user_id === me.id && <div className="mt-2 flex gap-2">{permissions.edit && <button type="button" disabled={saving} className={button} onClick={() => { setEditing(message.id); setDraft(message.body); }}>Editar</button>}{permissions.remove && <button type="button" disabled={saving} className={button} onClick={() => { if (window.confirm("Excluir esta mensagem?")) void change("DELETE", { messageId: message.id }); }}>Excluir</button>}</div>}
            </article>)}
            {!loading && !messages.length && <p className="text-sm text-slate-500">Nenhuma mensagem nesta conversa.</p>}
          </div>
          {!history && (permissions.send || (editing && permissions.edit)) && <form onSubmit={event => { event.preventDefault(); void change(editing ? "PATCH" : "POST", { ...(editing ? { action: "edit", messageId: editing } : {}), message: draft }); }} className="space-y-2 border-t pt-3">
            <label className="block text-sm font-medium">{editing ? "Editar sua mensagem" : "Mensagem"}<textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} disabled={saving} required rows={3} className="mt-2 w-full rounded-lg border border-slate-300 p-3" /></label>
            <button type="submit" disabled={saving || olderLoading || !draft.trim()} className={`${button} bg-[#14038D] text-white`}>{saving ? "Salvando…" : editing ? "Salvar edição" : "Enviar"}</button>
            {editing && <button type="button" disabled={saving} className={button} onClick={() => { setEditing(null); setDraft(""); }}>Cancelar edição</button>}
          </form>}
        </>}
      </div>
    </div>
  </section>;
}
