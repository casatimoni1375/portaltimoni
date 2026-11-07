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

## Roteiro de conferência
1. Entrar com Google na prévia e conferir Hoje, unidade e prioridades reais.
2. Usar Ctrl+K e abrir um resultado permitido; navegar pelas abas de Compras e Agenda.
3. No celular, conferir cinco atalhos e abrir Comercial/Equipe pelo perfil.

Nenhuma mudança desta etapa foi mesclada em main ou promovida à produção.
