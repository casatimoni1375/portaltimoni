import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import "./dashboard/workspace-modern.css";
import "./portal-modern-shell.css";
import "./clean-portal.css";
import "./celular-padrao.css";
import "./alinhamento.css";
import MobileUiRules from "@/components/mobile-ui-rules";
import PortalPermissionsSync from "@/components/portal-permissions-sync";
import UpdateButton from "@/components/update-button";

const roboto = Roboto({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Portal Timoni",
    template: "%s | Portal Timoni",
  },
  description: "Central de gestão da Casa Timoni",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/portal-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/portal-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/portal-apple-touch.png",
  },
  appleWebApp: {
    capable: true,
    title: "Portal Timoni",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${roboto.className} min-h-screen text-slate-900 antialiased`}>
        {/* 18/11: trava de Avisos obrigatórios retirada a pedido da Ciça — o aviso segue obrigatório (Pendente/Assinado) sem bloquear o menu. */}
        {children}
        <PortalPermissionsSync />
        <MobileUiRules />
        <UpdateButton floating />
      </body>
    </html>
  );
}
