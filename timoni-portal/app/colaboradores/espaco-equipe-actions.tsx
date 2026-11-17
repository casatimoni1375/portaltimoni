"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Ações da gestão em cada mensagem: OK (resolvida), Responder e Excluir.
export default function EspacoEquipeActions({ id, status, canAct }: { id: string; status: string; canAct: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const done = ["concluído", "concluido"].includes(status.trim().toLowerCase());

  async function send(method: "PATCH" | "DELETE", body: Record<string, string>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/espaco-equipe", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar.");
      setOpen(false);
      setReply("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setBusy("");
    }
  }

  if (!canAct) return null;

  return (
    <div className="mt-3">
      {open && (
        <div className="mb-2">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            maxLength={2500}
            placeholder="Escreva a resposta. Só o acesso que enviou a mensagem vai ver."
            className="w-full rounded-lg border border-[#c9d8f0] bg-white px-3 py-2 text-[14px] text-slate-900 outline-none focus:border-[#102a83]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-[14px] text-slate-600">Fechar</button>
            <button
              type="button"
              disabled={busy === "reply" || !reply.trim()}
              onClick={() => void send("PATCH", { id, action: "responder", reply: reply.trim() }, "reply")}
              className="rounded-lg bg-[#102a83] px-4 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy === "reply" ? "Enviando..." : "Enviar resposta"}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!done && (
          <button
            type="button"
            disabled={busy === "ok"}
            onClick={() => void send("PATCH", { id, action: "ok" }, "ok")}
            className="rounded-lg border border-[#c9d8f0] bg-white px-3 py-1 text-[14px] text-[#102a83] disabled:opacity-50"
          >
            {busy === "ok" ? "Salvando..." : "OK"}
          </button>
        )}
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-[#c9d8f0] bg-white px-3 py-1 text-[14px] text-[#102a83]">
            Responder
          </button>
        )}
        <button
          type="button"
          disabled={busy === "delete"}
          onClick={() => { if (window.confirm("Excluir esta mensagem do Equipe?")) void send("DELETE", { id }, "delete"); }}
          className="px-2 py-1 text-[14px] text-[#b42318] disabled:opacity-50"
        >
          {busy === "delete" ? "Excluindo..." : "Excluir"}
        </button>
      </div>
      {error ? <p className="mt-1 text-right text-[13px] text-red-700">{error}</p> : null}
    </div>
  );
}
