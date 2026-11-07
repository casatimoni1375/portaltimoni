"use client";

import { useRouter } from "next/navigation";




function InternalChatMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        fill="#2296E8"
        d="M12 8h38a8 8 0 0 1 8 8v27a8 8 0 0 1-8 8H29L17 60v-9h-5a8 8 0 0 1-8-8V16a8 8 0 0 1 8-8Z"
      />
      <rect x="17" y="23" width="29" height="5" rx="2.5" fill="#FFFFFF" />
      <rect x="17" y="34" width="23" height="5" rx="2.5" fill="#FFFFFF" />
    </svg>
  );
}

export default function ChatButton({ mobile = false, mobileHeader = false, onOpen }: { mobile?: boolean; mobileHeader?: boolean; onOpen?: () => void }) {
  const router = useRouter();
  const className = mobileHeader ? "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition active:bg-white/10"
    : mobile ? "mt-1 flex min-h-9 w-full items-center border-t border-slate-200 px-2.5 pt-1 text-left text-sm text-slate-800"
      : "order-2 inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-1.5 transition hover:bg-white/10 sm:order-none";
  return <button type="button" className={className} aria-label="Abrir chat" title="Chat" onClick={() => { onOpen?.(); router.push("/dashboard/chat"); }}>
    {mobile && !mobileHeader ? <span>Chat</span> : <InternalChatMark className={mobileHeader ? "h-8 w-8" : "h-9 w-9"} />}
  </button>;
}