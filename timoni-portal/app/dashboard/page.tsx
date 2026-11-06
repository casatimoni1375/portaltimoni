import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasModuleAccess, type PortalModule } from "@/lib/access-control";
import PortalIcon, { type PortalIconName } from "@/components/portal-icon";

type Tile = { module: PortalModule; label: string; description: string; href: string; icon: PortalIconName };
const tiles: Tile[] = [
  { module: "compras", label: "Compras", description: "Fornecedores e pedidos", href: "/dashboard/compras", icon: "cart" },
  { module: "pedido-de-compra", label: "Pedidos de Compra", description: "Acompanhamento de pedidos", href: "/dashboard/pedido-de-compra", icon: "document" },
  { module: "conferencia", label: "Conferência", description: "Conferência de pedidos", href: "/dashboard/conferencia-pedidos", icon: "document" },
  { module: "estoque", label: "Estoque", description: "Consultar estoque", href: "/dashboard/estoque", icon: "stock" },
  { module: "estoque-rotativo", label: "Rotativo", description: "Conferências do estoque", href: "/dashboard/estoque-rotativo", icon: "stock" },
  { module: "motorista", label: "Motorista", description: "Agenda e entregas", href: "/dashboard/motorista", icon: "truck" },
  { module: "agenda", label: "Agenda Ciça", description: "Compromissos", href: "/agenda", icon: "calendar" },
  { module: "agenda-ct", label: "Agenda CT", description: "Compromissos da equipe", href: "/agenda-ct", icon: "calendar" },
  { module: "reunioes", label: "Reuniões", description: "Reuniões agendadas", href: "/dashboard/reunioes", icon: "meetings" },
  { module: "leads", label: "Leads", description: "Acompanhamento existente", href: "/dashboard/leads", icon: "leads" },
  { module: "painel", label: "Equipe", description: "Avisos e comunicação", href: "/colaboradores", icon: "team" },
];
function calendarInfo(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {timeZone:"America/Sao_Paulo",year:"numeric",month:"numeric",day:"numeric"});
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find(p=>p.type===type)?.value??1);
  const year=get("year"),month=get("month"),day=get("day");
  const first=new Date(Date.UTC(year,month-1,1));
  const start=first.getUTCDay();
  const length=new Date(Date.UTC(year,month,0)).getUTCDate();
  const monthName=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(first);
  return {monthName,day,start,length};
}
export default async function DashboardPage() {
  const session=await auth();
  const email=session?.user?.email??"";
  if(!email) redirect("/login");
  const visible=tiles.filter(t=>hasModuleAccess(email,t.module,session?.portalUser));
  if(!visible.length) redirect("/login?error=AccessDenied");
  const name=email.toLowerCase()==="mcrodini@gmail.com"?"Ciça":(session?.user?.name?.split(" ")[0]||"Equipe");
  const calendar=calendarInfo(new Date());
  const priority=visible.filter(t=>["pedido-de-compra","estoque-rotativo","motorista"].includes(t.module));
  return <div className="space-y-6 pb-10">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-[#14038D] px-5 py-5 text-white sm:px-8">
        <div className="flex items-center gap-4">
          <Image src="/icons/portal-192.png" alt="Identidade Casa Timoni do Portal" width={62} height={62} unoptimized className="rounded-xl bg-white p-1 object-contain"/>
          <div><p className="text-xl font-bold tracking-wide sm:text-2xl">PORTAL TIMONI</p><p className="text-sm text-white/85">Gestão e Operação</p></div>
        </div>
        <span className="rounded-full border border-white/30 px-4 py-2 text-sm">Visão por perfil</span>
      </header>
      <div className="px-5 py-6 sm:px-8">
        <div className="mb-7"><h1 className="text-3xl font-bold text-[#14038D]">Bem-vinda, {name}!</h1><p className="mt-1 text-base text-slate-600">Acesse suas atividades e módulos autorizados.</p></div>
        <h2 className="mb-4 text-xl font-bold text-[#14038D]">Acesso rápido</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visible.map(tile=><Link key={tile.href} href={tile.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#14038D] hover:shadow-md">
            <PortalIcon name={tile.icon} className="mb-4 h-9 w-9 text-[#14038D]"/>
            <h3 className="text-lg font-bold text-[#14038D]">{tile.label}</h3>
            <p className="mt-2 text-sm text-slate-600">{tile.description}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-[#14038D] group-hover:underline">Abrir módulo →</span>
          </Link>)}
        </div>
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <h2 className="rounded-t-3xl bg-[#FFD600] px-5 py-4 text-xl font-bold text-[#14038D]">Acompanhamento operacional</h2>
        <div className="divide-y divide-slate-100">
          {priority.length ? priority.map(tile=><Link key={tile.href} href={tile.href} className="flex items-center gap-4 px-5 py-5 hover:bg-slate-50">
            <PortalIcon name={tile.icon} className="h-7 w-7 shrink-0 text-[#14038D]"/>
            <div className="min-w-0 flex-1"><p className="font-semibold text-[#14038D]">{tile.label}</p><p className="text-sm text-slate-600">{tile.description}</p></div>
            <span className="text-sm font-semibold text-[#14038D]">Consultar →</span>
          </Link>) : <p className="p-5 text-slate-600">Os módulos disponíveis estão no acesso rápido.</p>}
        </div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3"><PortalIcon name="calendar" className="h-7 w-7 text-[#14038D]"/><h2 className="text-xl font-bold text-[#14038D]">Calendário</h2></div>
        <p className="mb-4 capitalize font-semibold text-slate-700">{calendar.monthName}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {["D","S","T","Q","Q","S","S"].map((x,i)=><span key={i} className="py-2 font-semibold text-slate-500">{x}</span>)}
          {Array.from({length:42},(_,i)=>{const d=i-calendar.start+1;return <span key={i} className={`rounded-lg py-2 ${d===calendar.day?"bg-[#14038D] font-bold text-white":d>0&&d<=calendar.length?"text-slate-700":"text-slate-300"}`}>{d>0&&d<=calendar.length?d:""}</span>})}
        </div>
        {visible.some(t=>t.module==="motorista")&&<Link className="mt-5 inline-block font-semibold text-[#14038D] underline" href="/dashboard/motorista">Abrir agenda do Motorista</Link>}
        <p className="mt-3 text-xs text-slate-500">Calendário de referência. Entregas e compromissos permanecem nos módulos originais.</p>
      </section>
    </div>
  </div>;
}
