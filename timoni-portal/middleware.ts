import { temporarySessionPage } from "@/lib/temporary-session-page";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortalUser, hasModuleAccess, type PortalModule } from "@/lib/access-control";

import { can } from "@/lib/authorization";
import { canCollaboratorAction, resolveCollaboratorAccess } from "@/lib/collaborator-access";

const protectedRoutes: Array<{ prefix: string; module: PortalModule }> = [
  { prefix: "/agenda-ct", module: "agenda-ct" },
  { prefix: "/agenda", module: "agenda" },
  { prefix: "/colaboradores", module: "painel" },
  { prefix: "/dashboard/compras", module: "compras" },
  { prefix: "/dashboard/conferencia-pedidos", module: "conferencia" },
  { prefix: "/dashboard/estoque-rotativo", module: "estoque-rotativo" },
  { prefix: "/dashboard/estoque", module: "estoque" },
  { prefix: "/dashboard/motorista-leitura", module: "motorista" },
  { prefix: "/dashboard/motorista", module: "motorista" },
  { prefix: "/dashboard/reunioes", module: "reunioes" },
  { prefix: "/dashboard/leads", module: "leads" },
  { prefix: "/dashboard/marketing", module: "marketing" },
  { prefix: "/dashboard/financeiro", module: "financeiro" },
  { prefix: "/agenda-motorista", module: "motorista" },
  { prefix: "/espaco-equipe", module: "painel" },
  { prefix: "/motorista", module: "motorista" },
];

const publicMotoristaAssets = new Set([
  "/motorista/app.css",
  "/motorista/app.js",
  "/motorista/lib/store.js",
  "/motorista/icons/icon48.png",
  "/agenda-motorista/app.css",
  "/agenda-motorista/app.js",
  "/agenda-motorista/lib/store.js",
]);

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const configuredUser = request.auth?.portalUser;
  if (request.auth?.error === "SessionTemporarilyUnavailable") {
    return new NextResponse(temporarySessionPage(), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3", "Cache-Control": "no-store" } });
  }
  if (request.auth?.collaboratorSubject) {
    const access = resolveCollaboratorAccess(request.auth.collaboratorSubject.collaboratorId, request.auth.collaboratorAccess ?? null);
    if (!access || request.auth.error) return NextResponse.redirect(new URL("/login?error=CredentialsSignin", request.url));
    if (publicMotoristaAssets.has(pathname)) return NextResponse.next();
    if (["/dashboard/motorista", "/dashboard/motorista-leitura", "/motorista"].includes(pathname)
      && canCollaboratorAction(access, "motorista", "visualizar")) return NextResponse.next();
    if (pathname === "/dashboard/pedido-de-compra"
      && canCollaboratorAction(access, "pedido-de-compra", "visualizar")) return NextResponse.next();
    if (pathname === "/dashboard/reunioes"
      && canCollaboratorAction(access, "reunioes", "visualizar")) return NextResponse.next();
    if (pathname === "/dashboard/estoque"
      && canCollaboratorAction(access, "estoque", "visualizar")) return NextResponse.next();
    if (pathname === "/dashboard/chat"
      && canCollaboratorAction(access, "chat", "visualizar")) return NextResponse.next();
    // Os demais módulos ainda não consomem a identidade por id.
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Este módulo ainda não está disponível no acesso individual." }, { status: 403 });
    return NextResponse.redirect(new URL("/acesso/inicio", request.url));
  }

  // A tela pública do motorista continua disponível para uso direto no celular.
  if (pathname === "/motorista" || pathname.startsWith("/motorista/")) {
    return NextResponse.next();
  }

  if (publicMotoristaAssets.has(pathname)) {
    return NextResponse.next();
  }

  if (!getPortalUser(request.auth?.user?.email, configuredUser)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/configuracoes") && !can(configuredUser, "configuracoes", "visualizar")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Pedidos de Compra validates current saved permissions in its server page.
  // The JWT may still contain the permissions from before the last edit.
  if (pathname === "/agenda" && ["agenda", "agenda-ct", "reunioes"].some(module=>hasModuleAccess(request.auth?.user?.email,module as PortalModule,configuredUser))) return NextResponse.next();
  if (pathname === "/dashboard/compras" && ["compras", "pedido-de-compra", "estoque-rotativo", "conferencia"].some(module=>hasModuleAccess(request.auth?.user?.email,module as PortalModule,configuredUser))) return NextResponse.next();
  const protectedRoute = protectedRoutes.find(({ prefix }) => pathname.startsWith(prefix));

  if (protectedRoute && !hasModuleAccess(request.auth?.user?.email, protectedRoute.module, configuredUser)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  matcher: [
    "/dashboard/:path*",
    "/agenda/:path*",
    "/agenda-ct/:path*",
    "/colaboradores/:path*",
    "/espaco-equipe/:path*",
    "/motorista/:path*",
    "/agenda-motorista/:path*",
    "/api/conferencia-pedidos",
    "/configuracoes/:path*",
  ],
};
