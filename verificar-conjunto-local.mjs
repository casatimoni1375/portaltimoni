import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Apenas verificações locais. Não aplica esquema, não configura serviço nem publica.
const repository = dirname(fileURLToPath(import.meta.url));
const app = join(repository, 'timoni-portal');
const complete = process.argv.includes('--completo');
if (process.argv.slice(2).some(argument => argument !== '--completo')) throw new Error('Use sem argumentos ou com --completo.');
const expectedHead = '9a39cfc6e1a2a6032f51d025f4f5f48bd3dd0c05';
const expectedParent = '14750e28e3f3e1371e5228daa6d8d259376ab689';
const expectedMain = '72a3e72348ae2acde1dfcacac9ef343053b531c8';

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(AUTH_|NEXTAUTH_|GOOGLE_|GEMINI_|TRELLO_|DATABASE_|MOTORISTA_|CRON_|LEADS_MONITOR_|TIMONI_|PORTAL_)/.test(key)) delete env[key];
}
Object.assign(env, {
  AUTH_SECRET: 'verificacao-local-sem-credenciais-20261105',
  NEXTAUTH_SECRET: 'verificacao-local-sem-credenciais-20261105',
  GOOGLE_CLIENT_ID: 'local.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'ficticio',
  MOTORISTA_API_TOKEN: 'ficticio-local', MOTORISTA_WEBAPP_URL: 'https://exemplo.invalid/exec',
  PORTAL_INDIVIDUAL_LOGIN_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1',
});

function execute(label, binary, args, cwd = repository) {
  console.log(label);
  const result = spawnSync(binary, args, { cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    const diagnostic = [result.stdout, result.stderr].filter(Boolean).join('\n').split(/\r?\n/).slice(-100).join('\n');
    if (diagnostic) console.error(diagnostic);
    throw new Error(result.error?.message || `${label}: falhou (${result.status ?? result.signal}).`);
  }
  return result.stdout || '';
}
const git = args => execute('Conferindo repositório local…', 'git', [
  '-c', `safe.directory=${repository.replaceAll('\\', '/')}`,
  '-c', 'core.whitespace=cr-at-eol', ...args,
]);

try {
  if (git(['rev-parse', 'HEAD']).trim() !== expectedHead ||
      git(['rev-parse', 'HEAD^']).trim() !== expectedParent ||
      git(['rev-parse', 'main']).trim() !== expectedMain) {
    throw new Error('A base mudou. Conferir as diferenças antes de continuar. Nenhuma referência foi alterada.');
  }
  git(['diff', '--check']);
  // Next carrega estes arquivos automaticamente. Não executar com configuração real.
  if (['.env', '.env.local', '.env.production', '.env.production.local'].some(name => existsSync(join(app, name)))) {
    throw new Error('Há configuração de ambiente local no aplicativo. Separar um ambiente de verificação antes de executar; nenhum conteúdo foi lido.');
  }
  const tests = [
    ...readdirSync(repository).filter(name => /^testes-.*\.mjs$/.test(name)),
    ...readdirSync(join(app, 'tests')).filter(name => name.endsWith('.test.mjs')).map(name => join('timoni-portal', 'tests', name)),
  ];
  const output = execute('Executando testes com dados fictícios…', process.execPath,
    ['--experimental-vm-modules', '--test', '--test-reporter=spec', ...tests]);
  console.log(output.split(/\r?\n/).filter(line => /[ℹ] (tests|pass|fail|duration_ms) /.test(line)).join('\n'));
  if (complete) {
    execute('Compilando e verificando tipos/lint…', process.execPath, ['node_modules/next/dist/bin/next', 'build'], app);
    const smoke = execute('Conferindo aplicação compilada nos dois modos de login…', process.execPath, ['verificar-login-compilado.mjs']);
    console.log(smoke.trim());
    console.log('Verificação completa aprovada.');
  } else {
    console.log('Verificação rápida aprovada. Para compilar e conferir a aplicação: node verificar-conjunto-local.mjs --completo');
  }
  console.log('Nenhum commit, publicação, aplicação de esquema ou alteração de dados reais foi executado.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha na verificação local.');
  process.exitCode = 1;
}
