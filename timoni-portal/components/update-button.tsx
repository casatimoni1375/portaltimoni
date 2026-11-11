"use client";
import { useSyncExternalStore } from "react";
import PortalIcon from "@/components/portal-icon";
import { hasNewVersion } from "@/lib/portal-version";

const LOADED = process.env.NEXT_PUBLIC_PORTAL_VERSION;
const CHECK_EVERY_MS = 3 * 60 * 1000;

// Uma única verificação compartilhada por todos os botões da tela.
let stale = false, started = false, lastCheck = 0;
const listeners = new Set<() => void>();
async function check() {
  if (stale || document.visibilityState !== "visible" || Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  try {
    const response = await fetch("/api/versao", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (hasNewVersion(LOADED, data?.version)) { stale = true; listeners.forEach(listener => listener()); }
  } catch { /* sem conexão: tenta de novo na próxima vez */ }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", () => void check());
    window.addEventListener("focus", () => void check());
    void check();
  }
  return () => { listeners.delete(listener); };
}

/**
 * Botão "Atualizar": recarrega o portal. Quando sai uma versão nova, fica em destaque
 * ("Nova versão") para a pessoa saber que a tela aberta está desatualizada.
 * `floating` é usado nas telas sem o menu principal e só aparece quando há versão nova.
 */
export default function UpdateButton({ floating = false }: { floating?: boolean }) {
  const isStale = useSyncExternalStore(subscribe, () => stale, () => false);
  if (floating && !isStale) return null;
  const label = isStale ? "Nova versão" : "Atualizar";
  return <button type="button" className={`ct-update-button${isStale ? " is-stale" : ""}${floating ? " is-floating" : ""}`} title={isStale ? "Saiu uma versão nova do portal. Clique para atualizar." : "Atualizar a tela"} aria-label={isStale ? "Nova versão do portal disponível. Atualizar a tela" : "Atualizar a tela"} onClick={() => window.location.reload()}>
    <PortalIcon name="refresh" className="h-[18px] w-[18px]" /><span>{floating ? "Nova versão — Atualizar" : label}</span>
  </button>;
}
