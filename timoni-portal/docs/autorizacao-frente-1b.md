# Frente 1B — autorização nas APIs

Branch: fix/permissoes-apis-1b. Depende da Frente 1A (PR #325); revisão em PR separado, sem merge ou produção.

## Comportamento

A política pura lib/module-authorization.ts adapta as regras operacionais existentes à base central. O cadastro oficial continua obrigatório: retirar um módulo revoga a entrada na API, inclusive Motorista e Pedidos. Boxes continuam somente apresentação.

- Ciça mantém administração integral.
- Marcelo visualiza/edita os módulos atribuídos; criação, exclusão, administração crítica e restauração são negadas no servidor.
- Dashboard Motorista: usuários selecionados com módulo Motorista e controle operacional continuam criando, editando e excluindo viagens da própria unidade. Acesso separado de consulta não pode alterar viagens. Contas com readOnly=true não gravam.
- Estoque mantém as transições existentes; editar registro/observação e reabrir permanecem restritos à gestão. Exclusão somente Ciça.
- Leads mantém os fluxos da unidade vinculada. Gerar relatório e importar criam dados e são negados a Marcelo.
- Agenda Ciça e Agenda CT continuam distintas. O calendário consultado passa por autorização explícita; não se amplia a edição operacional do embed CT.
- Reuniões exige módulo e filtra unidade; Marcelo pode editar. A leitura deixa de criar aba ou repovoar dados antigos quando a planilha está vazia.
- Rotativo preserva os papéis de relatório e conferência, com exceção operacional da Carolina centralizada. Padronização, backup/restauração, mapeamentos e exclusão não são permitidos a Marcelo.
- Compras verifica quadro/lista/unidade do cartão antes de alterá-lo. Pedidos continua sendo projeção dos enviados; não há ligação com Estoque. Sincronização de documentos passa a POST administrativo.

## Conferência do registro

Os nomes reais do formulário são preservados: Casa Timoni corresponde a Araras; MCR e Rodini correspondem a Rio Claro, conforme os endereços empresariais existentes no módulo Compras.

Motorista consulta a viagem original por ID e data antes de editar/excluir. A unidade enviada pelo cliente não substitui a unidade persistida. O cliente envia dataOrigem quando muda a data. Conclusão e exclusão enviam data. A ordem global só pode ser modificada por conta Geral; não se permite reordenar viagens de outra unidade.

A API encaminha somente consultas dia/mes, rejeita ações arbitrárias em GET, remove callback e filtra viagens e vendedores. Consultas mensais agregadas ficam restritas a Geral; a tela atual consulta dias. POST em motorista-leitura retorna 405, inclusive com sessão administrativa.

Estoque confere a unidade na linha original; unidade desconhecida não é convertida em autorização Rio Claro. Resumos e notificações usam somente os registros visíveis. O catálogo de produtos, sem unidade de loja, continua compartilhado.

## Limites antes de implantação

1. Homologar com contas reais selecionadas, inclusive criar/editar/excluir viagem, mudança de data, conclusão, Compras → Pedidos, Leads e Rotativo. Testes automatizados usam provedores simulados e não escrevem em serviços reais.
2. Provisionar a identidade oficial do motorista e revisar o acesso mobile salvo. A rota de consulta exige login; o link anteriormente anônimo deixa de funcionar sem sessão. A separação de dispositivos/canais mobile em todas as APIs ainda não está concluída; não se usa User-Agent como prova de autorização.
3. O Apps Script externo tem sua própria implantação e compartilhamento. Proteger o proxy do Portal não revoga eventual acesso direto ao URL público do Script. É necessário auditar e proteger esse serviço antes de alegar proteção integral dos dados.
4. Confirmar proteção das colunas/abas do cadastro oficial. Permissão de edição no arquivo Drive não comprova a possibilidade de editar uma faixa protegida; essa proteção ainda precisa ser verificada.
5. Confirmar acesso de leitura do cadastro para Bruna e módulos mobile de Estoque RC, sem conceder automaticamente permissões ou alterar o cadastro real.
6. Rotativo é um estoque central compartilhado sem unidade por registro; esta frente não inventa divisão artificial. Comunicados, Chat e Espaço Equipe não foram migrados nesta frente. Cron com segredo próprio e monitor de Leads com credencial de serviço mantêm seus mecanismos separados de autenticação.
7. Homologação da prévia Vercel continua dependente de acesso autenticado; a proteção do projeto permanece intacta.
8. Mais verificações não comprovam ganho de velocidade. A leitura oficial e a verificação da viagem acrescentam chamadas; medir latência e cotas antes de implantação.

## Validação

npm test executa a política real e os handlers reais em VM com provedores simulados. Inclui revogação, Marcelo, usuários operacionais, unidade forjada, ID de outra unidade, consulta pública negada e sucesso de criar/editar/excluir no Dashboard Motorista. Verificações adicionais: TypeScript, ESLint dos arquivos alterados e build Next.js.

Não houve alteração de cadastro, compartilhamento, Apps Script, proteção Vercel ou produção.
