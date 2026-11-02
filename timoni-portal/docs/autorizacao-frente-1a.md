# Frente 1A — base central de autorização

Base: `main`, commit `72a3e72348ae2acde1dfcacac9ef343053b531c8`.

## Contrato

```ts
can(usuarioOficial, "estoque", "editar", { unidade: "Rio Claro" });
can(usuarioOficial, "motorista", "visualizar", { canal: "mobile" });
await requireAuthorization("sistema", "administrar", { operation: "restaurar-backup" });
```

`can` é uma política pura, sem Google, banco, cookies ou React, reutilizável no servidor, middleware e apresentação. O objeto deve ser carregado de uma fonte confiável no servidor; nunca aceitar usuário, perfil, `legacyAllowed` ou contexto de autorização enviados pelo navegador como prova de acesso. Automações futuras precisam identificar seu principal em cadastro confiável antes de chamar a política.

`requireAuthorization` autentica a sessão, consulta o cadastro oficial e aplica `can` antes da operação. Ausência/falha no cadastro retorna 401; negação de ação retorna 403. O helper não substitui a verificação das permissões externas do Google/Trello.

## Três responsabilidades

1. **Cadastro:** `PortalUsuarios`, na planilha oficial já usada pelo Portal, continua definindo existência, status, unidade e módulos. `getEffectivePortalUser` consulta esse cadastro sem cache persistente de autorização e sem executar migrações. React `cache` deduplica apenas dentro da requisição. Identidades duplicadas são negadas.
2. **Autorização:** `lib/authorization.ts` define ações, perfis, restrições administrativas, unidade, canal e exceções de compatibilidade. Os helpers antigos delegam a essa política. `null`/`undefined` não pedem fallback.
3. **Apresentação:** boxes e menus continuam sendo preferências. Um box não cria acesso ao módulo. O filtro mobile atual do menu não passa a ser uma barreira de segurança nesta etapa.

## Perfis e compatibilidade

O catálogo preserva Administração Ciça/Marcelo, Gestão/Vendedores/Estoque Rio Claro e Gestão/Vendedores/Estoque Araras. Inclui o contrato futuro Motorista leitura e um marcador `legado` para contas sem classificação explícita. Esse marcador não adiciona permissões.

A etapa não altera o schema da planilha. As contas administrativas são identificadas em uma única tabela central; contas existentes recebem um adaptador de perfil central. O nome, rótulo do acesso e a função textual do colaborador não concedem poderes administrativos. `profile` é um atributo confiável interno preparado para futura persistência; a API de cadastro não o aceita do cliente nesta etapa. O catálogo histórico de `access-control.ts` permanece apenas para defaults explícitos, como a recuperação já protegida por administração, nunca para resolver uma conta ausente.

Para perfis operacionais, visualizar depende dos módulos oficiais. As exceções atuais de entrada universal em Motorista e Pedidos de Compra foram preservadas explicitamente, somente para visualizar. Novas ações não são deduzidas de acesso ao módulo: um adaptador de regra já aprovada poderá fornecer `legacyAllowed: true` no servidor durante a Frente 1B. Isso nunca contorna inatividade, unidade, canal ou restrições de Marcelo.

## Administração

- **Ciça:** visualizar, criar, editar, excluir e administrar. O contexto de unidade, quando exigido, continua validado; unidade Geral cobre as duas unidades.
- **Marcelo:** visualizar e editar nos recursos permitidos. Criar, excluir, administrar, restaurar backup e publicar código são negados. A restrição aprovada da Agenda Ciça permanece.
- **Edição de cadastro por Marcelo:** somente nome/rótulo de acesso existente e nome/função de colaborador existente. Não muda e-mail, vínculo, unidade, perfil, módulos, mobile, status ou outros campos de segurança. A API compara o registro oficial anterior, distingue inclusão de alteração e bloqueia antes de escrever.
- O cliente de Configurações evita regravar permissões ao salvar apenas metadados. A segurança permanece na API; nenhum botão é considerado proteção.

As gravações restritas usam somente colunas de metadados, sem regravar a linha inteira. Assim uma edição cadastral não restaura módulos/status antigos caso a administração os tenha alterado em paralelo. A integridade concorrente de exclusões/reordenação de linhas em Sheets ainda depende de migração futura para uma camada com controle de versão.

A integração mínima cobre Configurações/backup, sessão, middleware, helpers e menu. Ela não afirma que todas as mutações antigas dos módulos já consultam `can(..., acao)`. Isso fica explicitamente para 1B. A política de publicação também não altera permissões das contas no GitHub/Vercel.

## Revogação e falhas

Conta removida, inativa, duplicada, sem token de leitura ou com falha ao consultar o cadastro resulta em ausência de usuário autorizado. O JWT revalida o cadastro em cada processamento, mesmo com revisão recente, descartando a cópia anterior quando não há usuário válido. A sessão resultante também omite usuário e access token, para que endpoints legados que verificam apenas e-mail não aceitem a conta revogada. Não há liberação pela lista histórica nem reaproveitamento do usuário anterior pelo cabeçalho.

Leitura de autorização não cria abas, não repovoa usuários e não concede Rotativo automaticamente. Cadastro vazio deixa de provocar recriação automática. A concessão histórica automática do Rotativo foi retirada desse caminho; as permissões já salvas são preservadas.

## Recuperação administrativa segura

Não existe bypass por e-mail, variável de emergência ou conta fixa. Antes de qualquer implantação, o proprietário deve confirmar acesso direto à planilha identificada em `lib/portal-data-constants.ts` e à aba `PortalUsuarios`.

Se houver bloqueio administrativo:

1. O proprietário da planilha entra diretamente pelo Google, fora do Portal, e guarda uma cópia do estado atual.
2. Corrige o registro administrativo oficial da Ciça, sem duplicidade de e-mail, com unidade Geral, módulos aprovados e status ativo. Preserva os demais registros; não repovoa a lista histórica.
3. Se a causa for OAuth ou compartilhamento, restaura o acesso de leitura ao cadastro oficial. Não edita o código para autorizar uma conta ausente.
4. Entra novamente no Portal e verifica leitura e administração pela conta oficial.

Essa recuperação depende de controle externo da planilha. Não foi executada em produção. Confirmar previamente que as contas operacionais conseguem ler o cadastro oficial: o fallback antigo podia esconder compartilhamento incorreto. Indisponibilidade do Google agora pode negar acesso; esse é o comportamento seguro aprovado. Aumenta-se a leitura do cadastro por requisição, com deduplicação somente local; observar quotas antes de implantar.

## Mobile preparado

Com `{ canal: "mobile" }`: Ciça e Marcelo permitidos conforme ação; Estoque Rio Claro permitido na unidade Rio Claro e nos módulos autorizados; Motorista apenas visualizar Motorista; demais perfis negados. Uma lista `mobileModules` explícita pode restringir módulos. Não foi alterado o acesso público do motorista nem implementada detecção de dispositivo. A aplicação completa do canal precisa ocorrer nas futuras entradas de servidor; esconder menu não basta.

## Validação

`npm run test:authorization` executa política, helpers e integração das APIs de Configurações/backup, cadastro, JWT e middleware com serviços externos simulados. `npm test` também executa os testes existentes do Rotativo. Os testes não usam credenciais nem gravam em Google, Trello ou banco real.

## Frente 1B e riscos restantes

- Migrar cada mutação de Agenda, Motorista, Compras, Estoque, Leads, Reuniões e demais APIs para recurso/ação/contexto, com testes dos caminhos permitidos e negados.
- Corrigir os proxies públicos e as ações de escrita do Motorista; aplicar o canal mobile no servidor.
- Aplicar unidade aos registros e respostas de cada API, sem confiar em filtros da interface.
- Substituir gradualmente listas locais por adaptadores centrais e persistir perfis após definição das ações operacionais.
- Rever APIs que ainda verificam apenas e-mail/sessão; a fundação não as torna seguras automaticamente.
- Rever integridade/transações de restauração e permissões externas de GitHub/Vercel em frentes próprias.

Não há alteração de design, CSS, guias, Comunicados, OS, vínculo Agenda CT/Reuniões ou processamento Compras/Pedidos/Estoque. A única alteração em Agenda resumo passa o usuário oficial ao helper, necessária após retirar o fallback.
