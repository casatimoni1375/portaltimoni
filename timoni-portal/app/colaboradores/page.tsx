import { redirect } from "next/navigation";

// A Hoje é a única tela do portal. A antiga Equipe/Painel foi unificada nela.
export default function EquipePage() {
  redirect("/dashboard");
}
