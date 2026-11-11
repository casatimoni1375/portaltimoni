import { NextResponse } from "next/server";

// Informa qual versão do portal está publicada agora. A tela compara com a versão
// que ela mesma carregou para avisar quando há atualização (botão "Atualizar").
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
