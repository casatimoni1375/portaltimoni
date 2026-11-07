"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortalRevisionChecker } from "@/lib/portal-revision-checker";

const CHANGE_CHECK_MS = 60_000;

export default function PortalPermissionsSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/acesso/") || pathname === "/dashboard/estoque-rotativo") return;

    const checker = createPortalRevisionChecker(() => router.refresh());
    const checkForChanges = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      return checker.run();
    };

    void checkForChanges();
    const interval = window.setInterval(() => void checkForChanges(), CHANGE_CHECK_MS);
    const onFocus = () => void checkForChanges();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForChanges();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      checker.dispose();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
