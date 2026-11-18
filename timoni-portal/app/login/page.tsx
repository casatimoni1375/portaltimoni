import { auth, signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { individualLoginEnabled } from "@/lib/collaborator-auth.server";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Essa conta Google não tem acesso ao Portal Timoni.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; trocar?: string; renovar?: string }>;
}) {
  const [{ error, code, trocar, renovar }, session] = await Promise.all([searchParams, auth()]);
  const individual = individualLoginEnabled();
  if (individual && (session?.collaboratorSubject || !session?.user?.email)) {
    const connected = Boolean(session?.collaboratorAccess && !session.error);
    const message = code === "temporarily_unavailable" || session?.error === "SessionTemporarilyUnavailable"
      ? "Conexão temporariamente indisponível. Tente novamente em instantes."
      : code === "too_many_attempts" ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
      : error ? "Usuário ou senha inválidos, ou acesso indisponível." : null;
    return <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl max-md:text-[15px] font-semibold">Portal Timoni</h1>
        <p className="mt-2 text-center text-sm max-md:text-[11px] text-slate-600">Prévia do acesso individual</p>
        {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm max-md:text-[11px] text-red-800">{message}</p>}
        {connected ? <>
          <p className="mt-5 text-center font-medium">{session?.collaboratorAccess?.name}</p>
          <Link href="/acesso/inicio" prefetch={false} className="mt-5 block rounded-lg bg-[#14038D] px-4 py-2 text-center font-medium text-white">Abrir meu acesso</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="mt-3 w-full text-sm max-md:text-[11px] text-slate-600" type="submit">Sair e trocar usuário</button>
          </form>
        </> : <form className="mt-6 space-y-4" action={async form => {
          "use server";
          try {
            await signIn("credentials", { username: form.get("username"), password: form.get("password"), redirectTo: "/acesso/inicio" });
          } catch (cause) {
            if (cause instanceof AuthError) {
              const result = "code" in cause ? String(cause.code) : "credentials";
              redirect(`/login?error=CredentialsSignin&code=${encodeURIComponent(result)}`);
            }
            throw cause;
          }
        }}>
          <div><label htmlFor="username" className="mb-1 block text-sm max-md:text-[11px] font-medium">Usuário</label><input id="username" name="username" autoComplete="username" required minLength={3} maxLength={64} autoCapitalize="none" spellCheck={false} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
          <div><label htmlFor="password" className="mb-1 block text-sm max-md:text-[11px] font-medium">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
          <button type="submit" className="w-full rounded-lg bg-[#14038D] px-4 py-2 font-medium text-white">Entrar</button>
          <p className="text-xs max-md:text-[10px] text-slate-500">A recuperação de senha ainda não está disponível nesta prévia.</p>
        </form>}
      </section>
    </main>;
  }
  const canResume = Boolean(session?.user?.email && session.portalUser && session.portalUser.active !== false && session.error !== "RefreshAccessTokenError");
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Não foi possível entrar." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 max-md:px-6 max-md:py-10 text-center shadow-sm">
        <h1 className="text-xl max-md:text-[24px] font-semibold text-[#102a83]">Portal Timoni</h1>
        <p className="mt-2 text-sm max-md:text-[16px] text-slate-500">
          {canResume ? "Seu acesso continua conectado." : "Entre com a conta Google autorizada para acessar o Portal Timoni."}
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm max-md:text-[16px] text-red-700">
            {errorMessage}
          </p>
        )}

        {canResume ? (
          <>
            <p className="mt-3 break-all text-sm max-md:text-[16px] text-slate-600">{session?.user?.email}</p>
            <Link href="/dashboard" prefetch={false} className="mt-6 block w-full rounded-lg bg-[#102a83] px-4 py-2 text-sm max-md:text-[16px] max-md:min-h-[48px] max-md:flex max-md:items-center max-md:justify-center font-semibold text-white hover:bg-[#0c2068]">
              Entrar no Portal
            </Link>
            <form action={async () => {
              "use server";
              await signOut({ redirectTo: "/login?trocar=1" });
            }}>
              <button type="submit" className="mt-3 text-sm max-md:text-[16px] text-slate-500 hover:text-slate-800">Trocar conta</button>
            </form>
          </>
        ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" }, renovar === "1" ? { prompt: "consent" } : trocar === "1" ? { prompt: "select_account" } : undefined);
          }}
        >
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-[#102a83] px-4 py-2 text-sm max-md:text-[16px] max-md:min-h-[48px] font-semibold text-white hover:bg-[#0c2068]"
          >
            Entrar com Google
          </button>
        </form>
        )}
      </div>
    </main>
  );
}
