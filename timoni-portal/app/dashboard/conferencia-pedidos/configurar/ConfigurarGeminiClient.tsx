"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ConfigurarGeminiClient() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setConfigured(null);
    void (async () => {
      try {
        const response = await fetch("/api/configurar-gemini", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || typeof data.configured !== "boolean") throw Error("Não foi possível verificar a integração. Tente novamente em instantes.");
        if (!controller.signal.aborted) setConfigured(Boolean(data.configured));
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível verificar a integração. Tente novamente em instantes.");
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return <section className="mx-auto max-w-2xl rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-semibold text-[#14038D]">Integração da Conferência de Preços</h1>
    <p className="mt-3 text-sm text-slate-600">A configuração é centralizada no Portal. Não é necessário informar uma chave neste navegador.</p>
    {configured === true && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-900">Integração configurada no servidor.</p>}
    {configured === false && <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-900">A administração precisa concluir a configuração central. Depois disso, a mesma integração será usada pelos colaboradores autorizados.</p>}
    {configured === null && !error && <p role="status" className="mt-5">Verificando integração…</p>}
    {error && <div className="mt-5 space-y-3"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg border border-slate-300 px-4">Tentar novamente</button></div>}
    <Link href="/dashboard/conferencia-pedidos" className="mt-6 inline-block py-3 font-medium text-[#14038D]">Voltar para Conferência de Preços</Link>
  </section>;
}
