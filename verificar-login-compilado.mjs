import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

for (const individual of [false, true]) {
  const port = individual ? 4319 : 4318;
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(AUTH_|NEXTAUTH_|GOOGLE_|GEMINI_|TRELLO_|DATABASE_|MOTORISTA_|CRON_|LEADS_MONITOR_|TIMONI_|PORTAL_)/.test(key)) delete env[key];
  Object.assign(env, { AUTH_SECRET: 'verificacao-local-sem-credenciais-20261104', NEXTAUTH_SECRET: 'verificacao-local-sem-credenciais-20261104',
    GOOGLE_CLIENT_ID: 'local.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'ficticio', AUTH_TRUST_HOST: 'true', AUTH_URL: origin,
    PORTAL_INDIVIDUAL_LOGIN_ENABLED: String(individual), NEXT_TELEMETRY_DISABLED: '1' });
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('./timoni-portal/', import.meta.url), env, stdio: 'ignore',
  });
  try {
    let ready;
    for (let attempt = 0; attempt < 60; attempt++) {
      assert.equal(child.exitCode, null, 'Servidor terminou antes de responder.');
      try { const response = await fetch(`${origin}/login`); if (response.status === 200) { ready = response; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'Servidor não respondeu.');
    const html = await ready.text();
    assert.equal(html.includes('name="username"'), individual);
    assert.equal(html.includes('Entrar com Google'), !individual);
    const providers = await (await fetch(`${origin}/api/auth/providers`)).json();
    assert.equal(Boolean(providers.credentials), individual);
    assert.ok(providers.google);
    assert.equal((await fetch(`${origin}/acesso/inicio`, { redirect: 'manual' })).status, 307);
    assert.equal((await fetch(`${origin}/api/motorista-leitura?action=dia&data=2026-11-04`)).status, 401);
    assert.equal((await fetch(`${origin}/api/motorista-leitura`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${origin}/api/pedido-de-compra`)).status, 401);
    assert.equal((await fetch(`${origin}/api/reunioes`)).status, 401);
    assert.equal((await fetch(`${origin}/api/estoque`)).status, 401);
    for (const path of ['/api/chat-colaboradores', '/api/chat-historico', '/api/internal-chat']) assert.equal((await fetch(`${origin}${path}`)).status, 401);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(`${origin}/api/chat-colaboradores`, { method, body: '{}' })).status, 401);
      assert.equal((await fetch(`${origin}/api/chat-historico`, { method, body: '{}' })).status, 405);
      assert.equal((await fetch(`${origin}/api/internal-chat`, { method, body: '{}' })).status, 405);
    }
    assert.equal((await fetch(`${origin}/dashboard/chat`, { redirect: 'manual' })).status, 307);
    assert.equal((await fetch(`${origin}/api/estoque`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${origin}/dashboard/estoque`, { redirect: 'manual' })).status, 307);
    assert.equal((await fetch(`${origin}/api/configurar-gemini`)).status, 401);
    assert.equal((await fetch(`${origin}/api/configurar-gemini`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${origin}/dashboard/reunioes`, { redirect: 'manual' })).status, 307);
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await fetch(`${origin}/api/reunioes`, { method, body: '{}' })).status, 401);
    assert.equal((await fetch(`${origin}/api/pedido-de-compra/detalhes?id=pedido-ficticio`)).status, 401);
    const detailsWrite = await fetch(`${origin}/api/pedido-de-compra/detalhes`, { method: 'POST' });
    assert.equal(detailsWrite.status, 405); assert.equal(detailsWrite.headers.get('Allow'), 'GET');
    const purchaseWrite = await fetch(`${origin}/api/pedido-de-compra`, { method: 'POST' });
    assert.equal(purchaseWrite.status, 405);
    assert.equal(purchaseWrite.headers.get('Allow'), 'GET');
    assert.equal((await fetch(`${origin}/dashboard/pedido-de-compra`, { redirect: 'manual' })).status, 307);
    if (individual) {
      const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
      const csrf = await csrfResponse.json();
      const cookie = csrfResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const response = await fetch(`${origin}/api/auth/callback/credentials`, { method: 'POST', redirect: 'manual',
        headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, username: 'pessoa.ficticia', password: 'senha-ficticia-para-verificacao', callbackUrl: `${origin}/acesso/inicio` }),
      });
      assert.match(response.headers.get('location'), /temporarily_unavailable/);
      assert.equal(response.headers.getSetCookie().some(value => value.includes('authjs.session-token=')), false);
    }
    console.log(`Prévia ${individual ? 'ligada' : 'desligada'}: formulário, providers, página protegida e APIs conferidos sem credenciais reais.`);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
}
