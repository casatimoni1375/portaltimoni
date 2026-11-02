# Conexão compartilhada do Trello

O usuário relatou em 02/11/2026 que Pedidos mostrava a última atualização e erro de Trello para as contas testadas. Os logs observados eram da produção anterior, commit 72a3e723; não comprovam homologação das Frentes 1A/1B. Araras não foi testado por falta de senha. Fotos permanece fora do cadastro, sem reativação.

## Correção

A credencial de servidor tem prioridade sobre cookies individuais. Pedidos e sua sincronização usam exclusivamente a conexão compartilhada, sem consulta pública nem dependência de qual colaborador abriu a tela. A configuração pode vir das variáveis TRELLO_TOKEN e seus aliases existentes, ou do armazenamento central criptografado no banco já usado pelo Portal.

Somente Ciça pode salvar, substituir ou desconectar a configuração. O formulário valida acesso ao quadro antes de salvar. Quando houver uma conexão pessoal válida da própria Ciça, o botão “Usar conexão atual para todos” permite migrá-la sem exibir o token. Caso contrário, a própria tela gera a autorização do Trello e recebe o código; nunca enviar o token no chat.

O banco guarda AES-256-GCM com nonce aleatório e autenticação do conteúdo; a chave é derivada de AUTH_SECRET/NEXTAUTH_SECRET. Não remover ou trocar esse segredo sem planejar a reconexão. A leitura não cria tabela: a tabela é criada somente ao salvar administrativamente. Banco ou chave indisponíveis impedem gravar; não há armazenamento central em texto aberto.

Trocar a chave mantém a conexão anterior ativa até a nova ser validada e gravada. Uma credencial definida no ambiente prevalece e precisa ser alterada na Vercel. A credencial compartilhada não é devolvida pelas APIs ao navegador.

Consultas têm limite de tempo e até duas tentativas diante de falha de rede, 429 ou erro de servidor. POST, PUT e DELETE não são repetidos automaticamente para evitar duplicações. Tokens revogados ou permissões removidas exigem reconexão; esta mudança não promete disponibilidade permanente do Trello.

Pedidos preserva o último snapshot quando a consulta falha. Se alguma das duas listas de enviados estiver ausente, a sincronização falha em vez de substituir o snapshot por uma lista vazia.

## Ativação e liberação

1. Publicar a candidata conjunta somente após resolver a pendência de leitura do cadastro para Caixa. A revisão automática rejeitou a concessão a caixarctimoni@gmail.com por falta de autorização específica para esse arquivo/destinatário. Não houve mudança nesse compartilhamento.
2. Com Ciça, abrir Compras → Configurar Trello. Se disponível, usar “Usar conexão atual para todos”; caso contrário, autorizar pelo próprio formulário.
3. Abrir Pedidos e atualizar. Conferir os enviados e a data da atualização; repetir com Estoque RC. Nenhum colaborador precisa cadastrar uma chave individual.
4. Monitorar autorização e sincronização. O acesso Compras foi acrescentado ao módulo e box de estoquetimoni@gmail.com no cadastro oficial, preservando os outros campos. Fotos não foi recriado.

## Evidência e reversão

65 testes locais aprovados, incluindo isolamento da conexão central, rejeição de consulta pública, leitura com retentativa, ausência de repetição em gravações, criptografia autenticada e controle administrativo. Os testes não usam tokens reais nem escrevem em serviços reais.

Produção anterior verificada: dpl_78MMQyce99dtwHX8tHkN2yB5U83e, portaltimoni-ni3uikg2c-mcrodini.vercel.app, SHA 72a3e72348ae2acde1dfcacac9ef343053b531c8. Essa é a referência de reversão antes da nova publicação. Reverter código não desfaz operações comerciais. A nova tabela e sua credencial não precisam ser apagadas para reverter a aplicação; a versão anterior não as utiliza.
