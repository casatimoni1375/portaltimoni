import { redirect } from "next/navigation";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { getAuthorizationProfile } from "@/lib/authorization";
import ChatColaboradores from "./chat-colaboradores";
export default async function ChatPage() {
  const gate = await requireModuleAuthorization("chat", "visualizar");
  if (!gate.current) redirect("/login?error=AccessDenied");
  const individual = Boolean(gate.current.user.collaboratorAccess);
  const profile = gate.current.user.collaboratorAccess?.profile ?? getAuthorizationProfile(gate.current.user);
  const historyAllowed = profile === "administracao-cica";
  if (!individual && !historyAllowed) redirect("/dashboard");
  return <ChatColaboradores individual={individual} historyAllowed={historyAllowed} />;
}
