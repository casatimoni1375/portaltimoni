import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from './timoni-portal/node_modules/typescript/lib/typescript.js';
import React from './timoni-portal/node_modules/react/index.js';
import * as jsx from './timoni-portal/node_modules/react/jsx-runtime.js';
import { renderToStaticMarkup } from './timoni-portal/node_modules/react-dom/server.node.js';

const app = fileURLToPath(new URL('./timoni-portal/', import.meta.url));
export async function loadPortalModule(session, relative = 'app/dashboard/page.tsx', overrides = {}) {
  const context = vm.createContext({ Intl, Date });
  const cache = new Map();
  const mocks = {
    'react': React,
    'react/jsx-runtime': jsx,
    'next/image': { default: ({ unoptimized: _unused, ...props }) => React.createElement('img', props) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/navigation': { redirect: path => { throw Error('redirect:' + path); } },
    '@/lib/portal-session': { getPortalSession: async () => session },
    '@/components/portal-panel': { default: () => React.createElement('section', { 'data-existing-panel': true }, 'Informações existentes do Painel') },
    '@/lib/google-calendar': { getAccessTokenFromRefreshToken: async () => { throw Error('Sem acesso externo nos testes'); }, listEventsInRange: async () => [] },
    ...overrides,
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
    }}).outputText;
    const mod = new vm.SourceTextModule(source, { context, identifier: path });
    cache.set(path, mod);
    return mod;
  }
  const page = load(resolve(app, relative));
  await page.link(async (spec, parent) => {
    if (mocks[spec]) {
      const values = mocks[spec];
      return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    }
    const path = spec.startsWith('@/') ? resolve(app, spec.slice(2)) : resolve(dirname(parent.identifier), spec);
    return load(path + (existsSync(path + '.tsx') ? '.tsx' : '.ts'));
  });
  await page.evaluate();
  return page.namespace;
}
export async function renderDashboard(session) {
  const page = await loadPortalModule(session);
  return renderToStaticMarkup(await page.default());
}
export async function renderPortalPreview(session, events = []) {
  const weekly = await loadPortalModule(session, 'components/weekly-people-highlights.tsx');
  const header = await loadPortalModule(session, 'components/portal-header.tsx', {
    '@/lib/portal-config': { getEffectivePortalUser: async () => session?.portalUser },
    '@/components/module-updates-nav': { default: ({ items, linkClass }) => items.map(item => React.createElement('a', { key: item.href, href: item.targetHref, className: linkClass }, item.label)) },
    '@/components/mobile-portal-header': { default: () => React.createElement('div', { className: 'portal-mobile-header' }, 'Portal Timoni') },
    '@/components/chat-button': { default: () => null },
    '@/components/portal-notifications': { default: () => null },
    '@/components/weekly-people-highlights': {
      default: () => React.createElement(weekly.WeeklyPeopleCards, { events, now: new Date('2026-11-07T12:00:00Z') }),
      WeeklyPeopleCards: weekly.WeeklyPeopleCards,
    },
  });
  return renderToStaticMarkup(await header.default({ email: session.user.email })) + '<main class="mx-auto max-w-6xl px-4 py-5 sm:px-6">' + await renderDashboard(session) + '</main>';
}
const actor = (email, modules, extra = {}) => ({ user: { email, name: 'Pessoa de demonstração' }, portalUser: {
  email, name: 'Pessoa de demonstração', active: true, unit: 'Rio Claro', modules, requiresPassword: false, ...extra,
} });

test('dashboard exige sessão e recusa conta desativada', async () => {
  await assert.rejects(renderDashboard(null), /redirect:\/login$/);
  await assert.rejects(renderDashboard(actor('vendas@example.test', ['estoque'], { active: false })), /AccessDenied/);
});
test('dashboard mostra somente módulos e cards permitidos no cadastro', async () => {
  const html = await renderDashboard(actor('vendas@example.test', ['estoque', 'pedido-de-compra']));
  assert.ok(html.includes('O que precisa da sua atenção hoje'));
  assert.ok(html.includes('aria-label="Acesso rápido"'));
  assert.ok(html.includes('href="/dashboard/estoque"'));
  assert.ok(html.includes('href="/dashboard/pedido-de-compra"'));
  for (const path of ['/agenda', '/agenda-ct', '/dashboard/compras', '/dashboard/motorista', '/dashboard/financeiro']) {
    assert.ok(!html.includes(`href="${path}"`), path);
  }
});
test('ocultar cards preserva o acesso por módulo sem exibir atalhos ocultos', async () => {
  const html = await renderDashboard(actor('vendas@example.test', ['estoque'], { boxes: [] }));
  assert.ok(html.includes('Seus módulos continuam disponíveis no menu.'));
  assert.ok(!html.includes('href="/dashboard/estoque"'));
});
test('módulos Financeiro e Marketing existentes mantêm destino autorizado', async () => {
  for (const module of ['financeiro', 'marketing']) {
    const html = await renderDashboard(actor('vendas@example.test', [module]));
    assert.ok(html.includes(`href="/dashboard/${module}"`));
    assert.ok(!html.includes('href="/dashboard/estoque"'));
  }
});

test('cards semanais mantêm limite de três, removem duplicados e incluem férias em andamento', async () => {
  const { selectWeeklyPeople, WeeklyPeopleCards } = await loadPortalModule(null, 'components/weekly-people-highlights.tsx');
  const now = new Date('2026-11-07T12:00:00Z');
  const events = Array.from({ length: 5 }, (_, i) => ({ id: String(i), calendarKey: 'timoni', summary: 'Aniversário Pessoa ' + i, start: '2026-11-06', end: '2026-11-07' }));
  events.push({ ...events[0], id: 'duplicado' });
  events.push({ id: 'ferias', calendarKey: 'timoni', summary: 'Pessoa em férias', start: '2026-10-28', end: '2026-11-10' });
  events.push({ id: 'fora', calendarKey: 'timoni', summary: 'Aniversário fora da semana', start: '2026-11-09', end: '2026-11-10' });
  const selected = selectWeeklyPeople(events, now);
  assert.equal(selected.birthdays.length, 3);
  assert.equal(selected.vacations.length, 1);
  assert.ok(!selected.birthdays.some(event => event.id === 'duplicado' || event.id === 'fora'));
  const html = renderToStaticMarkup(React.createElement(WeeklyPeopleCards, { events, now }));
  assert.ok(html.includes('Aniversários da semana'));
  assert.ok(html.includes('Férias da semana'));
  assert.ok(!html.includes('<details'));
});

test('falha de calendário não é apresentada como ausência de aniversários ou férias', async () => {
  const { WeeklyPeopleCards } = await loadPortalModule(null, 'components/weekly-people-highlights.tsx');
  const html = renderToStaticMarkup(React.createElement(WeeklyPeopleCards, { events: [], unavailable: true }));
  assert.ok(html.includes('Não foi possível carregar agora.'));
  assert.ok(!html.includes('Nenhum registro nesta semana.'));
});

test('estrutura aprovada usa logo oficial e menu lateral, sem ampliar leitura do calendário', async () => {
  const rc = actor('vendas@example.test', ['estoque']);
  const restricted = await renderPortalPreview(rc);
  assert.ok(restricted.includes('ct-portal-sidebar'));
  assert.ok(restricted.includes('/logo-ct-oficial.png'));
  assert.ok(!restricted.includes('Aniversários da semana'));
  assert.ok(!restricted.includes('href="/agenda"'));
  const management = actor('mcrodini@gmail.com', ['painel', 'estoque', 'motorista', 'agenda'], { unit: 'Geral' });
  const allowed = await renderPortalPreview(management);
  assert.ok(allowed.includes('href="/colaboradores#ct-aniversarios"'));
  assert.ok(allowed.includes('href="/colaboradores#ct-ferias"'));
  assert.ok(!allowed.includes('Aniversários da semana'));
  assert.ok(allowed.includes('href="/dashboard"'));
  assert.ok(!allowed.includes('casa-timoni-logo.svg'));
});

test('visão geral inclui informações anteriores apenas para quem tem acesso ao Painel', async () => {
  assert.ok((await renderDashboard(actor('mcrodini@gmail.com', ['painel', 'estoque']))).includes('data-existing-panel'));
  assert.ok(!(await renderDashboard(actor('vendas@example.test', ['estoque']))).includes('data-existing-panel'));
});

test('próximas datas preservam a janela anterior sem misturar registros na semana atual', async () => {
  const { getExistingPeopleWindow, selectUpcomingPeople, selectWeeklyPeople } = await loadPortalModule(null, 'components/weekly-people-highlights.tsx');
  const now = new Date('2026-11-07T12:00:00Z');
  assert.equal(getExistingPeopleWindow(now).timeMax, '2027-01-07T00:00:00-03:00');
  const event = (id, summary, start, end) => ({ id, summary, start, end, calendarKey: 'timoni' });
  const events = [event('futuro', 'Aniversário de exemplo', '2026-11-14', '2026-11-15'), event('dup', 'Aniversário de exemplo', '2026-11-14', '2026-11-15'), event('fora', 'Aniversário fora da janela', '2027-01-08', '2027-01-09'), event('ferias', 'Pessoa - Férias', '2026-10-28', '2026-11-12')];
  assert.equal(selectWeeklyPeople(events, now).birthdays.length, 0);
  assert.equal(selectUpcomingPeople(events, now).birthdays.length, 1);
  assert.equal(selectUpcomingPeople(events, now).vacations.length, 1);
});

test('troca explícita oferece seleção da conta Google sem forçar consentimento', async () => {
  for (const trocar of [undefined, '1']) {
    let submitted;
    const login = await loadPortalModule(null, 'app/login/page.tsx', {
      '@/lib/auth': { auth: async () => null, signIn: async (...args) => { submitted = args; }, signOut: async () => {} },
      'next-auth': { AuthError: class extends Error {} },
      '@/lib/collaborator-auth.server': { individualLoginEnabled: () => false },
    });
    const page = await login.default({ searchParams: Promise.resolve({ trocar }) });
    const findForm = node => {
      if (!node || typeof node !== 'object') return null;
      if (node.type === 'form') return node;
      for (const child of React.Children.toArray(node.props?.children)) { const found = findForm(child); if (found) return found; }
      return null;
    };
    await findForm(page).props.action();
    assert.equal(submitted[0], 'google');
    assert.equal(submitted[2]?.prompt, trocar === '1' ? 'select_account' : undefined);
  }
});
