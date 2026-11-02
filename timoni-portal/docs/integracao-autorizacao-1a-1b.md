# Preparação da integração das Frentes 1A e 1B

Estado conferido em 02/11/2026. Este documento prepara a entrega; não autoriza nem executa merge ou implantação.

## Referências verificadas

- Main anterior às mudanças: `72a3e72348ae2acde1dfcacac9ef343053b531c8`.
- Frente 1A: PR #325, branch `fix/permissoes-base-central`, commit `330e532a2e9c3b04dd7a26935d47b9c539d76e76`, base `main`.
- Frente 1B: PR #326, branch `fix/permissoes-apis-1b`, commit `47178768ae6b16c657e23a8e27c73af678b738d3`, base `fix/permissoes-base-central`.
- A branch 1B já inclui a 1A: a prévia da 1B é a candidata conjunta. Ambos os PRs estão abertos, em rascunho e sem conflitos no momento da conferência.
- CI de autorização da 1B: 58 testes e TypeScript aprovados. Provedores externos são simulados nesses testes.

## Confirmações do usuário

- Item 1, teste com contas reais: adiado pelo usuário; continua pendente.
- Item 2, regras dos acessos: confirmado pelo usuário. Selecionados no Dashboard Motorista criam/editam/excluem na própria unidade; motorista separado consulta; Marcelo visualiza/edita.
- Item 3, demais módulos e revisão de proteções: informado como validado pelo usuário. Essa declaração não é apresentada como uma nova verificação instrumental do agente.

## Sequência de integração

1. Usar a candidata conjunta da 1B para o teste pendente. Conferir criação, mudança de data, conclusão e exclusão por usuário selecionado; negar outra unidade; confirmar os limites de Marcelo e do motorista de consulta. Usar registros identificados de homologação e remover somente os registros criados nesse teste.
2. Registrar o resultado e qualquer ajuste necessário. Havendo mudança de código, executar os testes afetados e os checks exigidos novamente.
3. Antes de integrar em main, confirmar como o projeto dispara produção. Merge pode publicar automaticamente: a integração deve ocorrer na janela de implantação, nunca como uma preparação supostamente neutra. Capturar o ID/URL da implantação de produção anterior e os commits efetivamente integrados.
4. Integrar a 1A primeiro. Depois, reposicionar a base da 1B para main, conferir o diff restante e integrar a 1B. Não retargetar agora: a dependência atual permanece revisável. Se a plataforma publicar cada merge, definir previamente uma promoção controlada da candidata conjunta para evitar expor a etapa intermediária; essa configuração ainda não foi alterada.
5. Conferir o SHA implantado e testar login, leitura de cadastro e operações críticas. Monitorar erros de autorização, latência e cotas. Encerrar a entrega somente após essa verificação.

## Reversão

Antes da implantação, guardar a identificação da versão de produção anterior. O SHA de main acima é a referência do código observado; ele não comprova qual implantação está ativa na Vercel.

Se houver regressão que impeça uso: promover a implantação anterior pelo mecanismo de rollback da plataforma, conferir o SHA e repetir login/leitura. Em seguida, reconciliar o Git por PR de reversão para que a próxima publicação não reintroduza a falha.

Para reverter o código, usar os commits de integração efetivamente gerados: reverter 1B e depois 1A. Em squash, usar git revert do commit de squash; em merge commit, selecionar o primeiro pai com git revert -m 1. Revisar o diff e os checks antes de integrar a reversão. Não executar reset/force-push na main.

As mudanças desta entrega não migraram dados reais nem alteraram compartilhamentos. Reversão de código não desfaz viagens ou outros registros que venham a ser criados durante operação; não restaurar backups de planilhas indiscriminadamente. Retornar à versão anterior também reintroduz as limitações de autorização anteriores, exigindo acompanhamento até a correção.

## O que falta para encerrar

1. Teste com contas reais, adiado pelo usuário.
2. Integração e implantação controladas, seguidas da conferência em produção.

A preparação técnica está concluída. Não há estimativa confiável de término enquanto o teste permanecer adiado; falhas encontradas na homologação podem exigir correções. Restrição completa de canal mobile permanece fora da entrega 1A/1B, como documentado no PR #326.
