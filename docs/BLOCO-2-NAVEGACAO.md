# Navegação e identidade — prévia do bloco 2

Base: bloco 1 (PR #332). Esta mudança depende dele e deve ser revisada em prévia antes de chegar à produção.

## Entregue neste recorte
- Logo SVG oficial do pacote 05/11, azul #102A83, amarelo #FFD438, superfícies claras e navegação compacta.
- Sete grupos no desktop e cinco atalhos no celular; Comercial, Equipe e Configurações ficam também no perfil conforme permissões existentes.
- Hoje usa fontes reais, até três prioridades, até três pedidos/compras em destaque, agenda e datas da equipe; não usa números do protótipo.
- Busca sob demanda, consultas independentes em paralelo, atualização sem sobreposição e pausa com aba oculta.
- Compras em cinco abas, Agenda e Equipe agrupadas; filtros por unidade preservam os controles de acesso dos serviços.

## Limites explícitos
Este recorte não conclui todas as regras de negócio do bloco 2. Necessidades reutiliza os acessos existentes ao Rotativo e à montagem. Recebidos é consulta e mostra última atualização do cartão, sem inventar data ou responsável por recebimento. Novos fluxos de recebimento → estoque, novas ações rápidas de recebimento/previsão e automações de arquivamento não foram implementados aqui. Permissões não foram migradas. Leads recebeu somente suporte aos filtros da busca, sem reformulação visual.

A disponibilidade dos módulos depende das integrações configuradas em cada ambiente. Falha de fonte aparece como aviso, sem ser tratada como zero confirmado. A compilação não comprova tempo real de carregamento nem o funcionamento de serviços externos.

## Verificação local
- 81 testes aprovados (incluindo menu, proteção dos grupos e separação por unidade).
- Compilação de produção Next.js concluída e verificação TypeScript sem erro.
- Diff sem problemas de espaços.

## Conferência autenticada da prévia
- Login Google concluído no endereço estável do bloco 2, sem redirect_uri_mismatch. Callback registrado no cliente existente.
- Conferidos no navegador: logo oficial, sete grupos, prioridades reais, aniversários/férias da Agenda CT e links Comercial/Equipe/Configurações no perfil.
- Encontrado e corrigido um caso da busca que usava módulos brutos em vez das permissões efetivas; os links da busca agora mantêm a unidade e os leads consultam ambas as unidades quando permitido.
- Limites observados: /api/compras retornou configured:false; agenda do motorista informou conexão não configurada. A consulta de pedidos mostrou snapshot com aviso de atualização.
- A captura de tela e a medição responsiva no navegador interromperam; validação visual em celular e medição de tempo de carregamento permanecem pendentes.

## Roteiro de conferência
1. Entrar com Google na prévia e conferir Hoje, unidade e prioridades reais.
2. Usar Ctrl+K e abrir um resultado permitido; navegar pelas abas de Compras e Agenda.
3. No celular, conferir cinco atalhos e abrir Comercial/Equipe pelo perfil.

Nenhuma mudança desta etapa foi mesclada em main ou promovida à produção.

## Configurações reaproveitadas em 07/11/2026
- Conexão Trello existente foi validada e salva pelo próprio Portal como compartilhada no quadro COMPRAS; API da prévia confirmou configured:true.
- CRON_SECRET cadastrado somente em produção para as duas rotinas já definidas no projeto; execução agendada ainda não comprovada.
- Produção republicada com o mesmo commit 46aa86a apenas para aplicar configurações, sem mesclar esta PR.
- Produção confirmou API do Motorista com ok:true, diretório Google com 19 vendedores e fallback:false, e Gemini configurado no servidor (sem teste de geração).
- MOTORISTA_WEBAPP_URL também habilitada em prévia. Liberação de MOTORISTA_API_TOKEN em prévia rejeitada pela revisão automática; GEMINI_API_KEY segue somente produção.
- Removida a frase “Isto precisa de você hoje.”; permanece somente saudação e nome.

## Padrão de leitura ampliado — 08/11/2026
- Roboto preservada em todo o Portal. Corpo principal: 18 px no computador e 16 px no celular; legendas: 14 px; títulos de página: 32/28 px; seções: 24/22 px.
- Escala compartilhada nas variáveis globais e nas classes de tipografia, aplicada a Hoje e aos módulos existentes. O tamanho-base do celular deixa de ser reduzido a 12,5 px.
- Cartões e cabeçalhos podem crescer/quebrar linha; indicadores no celular usam colunas adaptáveis. Logo mantém proporção original.
- Chaves mantidas salvas no servidor Vercel: Google, banco, Motorista e Gemini em produção/prévia; chave das rotinas agendadas somente em produção. Nenhuma chave incorporada ao código.
- Autorização específica de 08/11 resolveu o bloqueio anterior de Motorista/Gemini na prévia; o Motorista respondeu ok:true e o servidor reconheceu Gemini. Geração Gemini não testada.
