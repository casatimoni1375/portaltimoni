import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // Versão gravada na tela no momento da publicação; o botão "Atualizar" compara com /api/versao.
  env: { NEXT_PUBLIC_PORTAL_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
};

export default nextConfig;
