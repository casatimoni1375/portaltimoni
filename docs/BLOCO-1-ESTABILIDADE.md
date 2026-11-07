# Bloco 1 — estabilidade e integração

Base: `46aa86aec0e99d1b03e2ceaaeb2e5ff932525b80`, repositório atual `casatimoni1375/portaltimoni`.
Entrega em branch e PR; a integração e a publicação ficam com a gestora, conforme o prompt v5. Não inclui o redesign preparado na pasta separada nem os blocos 2–5.

## Resultado

- Renovação Google compartilha chamadas simultâneas, repete uma vez após falha transitória e mantém revogação definitiva.
- Leituras das planilhas fixas usam o token central. O cadastro de autorização preserva a credencial já existente somente enquanto `GOOGLE_REFRESH_TOKEN` não estiver configurado, permitindo que a administradora entre para concluir essa configuração. Não há fallback de permissões ou liberação de usuário ausente/inativo.
- E-mails de gestão centralizados, Ciça corporativa reconhecida, Conferência restrita às duas identidades Ciça; demais regras de Marcelo mantidas.
- Notificação tem prazo de 8 segundos no servidor e 10 no navegador. Uma falha conserva o contador anterior, avisa e permite consultar Estoque.
- Mensagem de falha encontrada em `middleware.ts` na main atual: substituída por recuperação limitada a duas tentativas por minuto, sem liberar acesso durante a falha.
- Compras retorna todos os indicadores em leitura normal e resumida; possíveis cartões repetidos são alertados e permanecem visíveis.
- Próximas reuniões considera hora de Brasília; registros e histórico não são alterados.
- Rotativo inicia em 1. Fornecedor. Guia removido, Backup preservado.
- Leads transporta 25 registros por lista/página, busca antes de paginar, preserva resumo global, seleção por unidade e relatório completo sob demanda. Segmentos semelhantes geram aviso sem alteração da origem.
- Aniversários repetidos geram aviso, sem apagar eventos.
- Não existem chamadas diretas a `url.parse()` no código da aplicação; nenhum pacote foi atualizado por esse item.
- Não foi encontrada rota OS no código. Dados reais de OS não foram consultados.

## Configuração conferida (somente nomes e ambientes)

- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: produção e prévia.
- `GEMINI_API_KEY`: produção; substitui a necessidade de `GOOGLE_AI_STUDIO_API_KEY`.
- `MOTORISTA_WEBAPP_URL`, `MOTORISTA_API_TOKEN`, `DATABASE_URL`: produção.
- `GOOGLE_REFRESH_TOKEN`: ausente; a gestora precisa cadastrá-lo para a conta central com acesso às planilhas da empresa. Não incluir o valor no PR, em logs ou em conversas.
- Trello tem chave pública padrão e alternativas em banco criptografado, cookie ou appData. A ausência de variáveis não comprova ausência de conexão. Não houve leitura/decriptação de credenciais para confirmar a conexão salva; conferir a situação na tela de conexão antes de solicitar qualquer token novo.
- Banco, Gemini e Motorista ainda não estão habilitados para prévia. Ajuste dos ambientes das configurações depende da gestora; valores não foram copiados nem expostos.

## Validação e limites

Testes automatizados usam dados simulados e não acessam serviços externos. Build e TypeScript devem passar antes da entrega. A duração de páginas com Google/Trello/banco reais e o comportamento de cada conta exigem teste na prévia com as configurações habilitadas; não há certificação de 2 segundos baseada apenas nos testes locais.

Nenhum dado real foi apagado, arquivado ou migrado. Não foi aplicada a matriz do Bloco 3. A política de arquivamento do Bloco 4 não foi ativada.

Para desfazer esta entrega antes da integração, fechar o PR; após a integração, reverter apenas seu commit. O identificador de rollback informado no prompt (`dpl_78MMQyce99dtwHX8tHkN2yB5U83e`) é histórico; a produção atual deve ser conferida antes de qualquer restauração. Nenhuma restauração foi executada.
