# Identidade visual do Portal Timoni — parâmetros

Atualizado em 15/11/2026 com as decisões finais da responsável. Fonte única para tamanhos, cores, colunas e blocos. Desktop e celular têm colunas separadas. Quando um valor mudar, muda aqui primeiro.

Celular: abaixo de 768 pontos de largura vale a coluna Celular (breakpoint único de 767 px). Referência de teste: iPhone 17, 402 × 874 pontos.

## 1. Tipografia (px)

### 1.1 Desktop

| Nível | Uso | Valor | Código |
|---|---|---|---|
| Título de página | Hoje, Compras, Agenda, Estoque, Reuniões | 34 | `--ct-font-page-title` |
| Título de seção | cabeçalho de cartão (Enviados, Recebidos…) | 26 | `--ct-font-section-title` |
| Subtítulo | títulos internos, versão compacta | 22 | `--ct-font-subtitle` |
| Texto | nome do pedido, título de evento, corpo | 20 | `--ct-font-body` |
| Texto informativo | datas, enviado em, local, legendas | 18 | `--ct-font-caption` |
| Etiqueta | carimbos, badges, rótulos de grupo | 16 | `--ct-font-label` |
| Número de contador | caixas Enviados / Atrasados | 34 | classe `ct-clean-counter` |
| Número de métrica | cartões de contagem em Hoje | 36 | `.ct-clean-metric strong` |
| E-mail no cabeçalho de Hoje | | 14 | valor fixo |

### 1.2 Celular (até 767 px)

| Nível | Celular |
|---|---|
| Título de página | 26 |
| Título de seção | 22 |
| Subtítulo | 18 |
| Texto | 16 |
| Texto informativo | 14 |
| Etiqueta (inclui navegação inferior) | 14 |
| Número de contador | 26 |
| Número de métrica | 32 |

**Piso de 14 px: vale só no desktop** (decisão 15/11). No celular não há piso adicional.

### 1.3 Versão compacta (contas da Ciça e da mcrodini)

| Item | Desktop | Celular |
|---|---|---|
| Linha da agenda | 16 | 14 |
| Título de seção | 22 | 15 |
| Link de cabeçalho | 14 | 12 |
| Navegação inferior | 14 | 14 |
| Avisos e rótulos | 14 | 14 |

## 2. Cores (aprovadas, não mudam sem decisão)

Regra geral: azul é o normal; vermelho pede atenção. Valem nos dois.

| Cor | Hex | Uso |
|---|---|---|
| Azul | #102a83 | normal, títulos, ação principal, Enviado no prazo |
| Vermelho | #b12532 | atenção: Atrasado, Cancelar (ação destrutiva) |
| Amarelo | #ffd438 | Araras em Recebidos; Sem data em Enviados (risco de sobreposição aceito, com legenda na planilha) |
| Âmbar (texto) | #854f0b / #996000 | texto de alerta sobre fundo claro |
| Verde | #15803d (texto #166534) | Rio Claro em Recebidos |
| Dourado | #f6bf26 | Agenda CT (cor do calendário) |
| Roxo | #7986CB | Minha agenda |
| Texto principal | #182443 | |
| Texto secundário | #65718a | datas, legendas |
| Linha | #e1e6f0 | bordas de cartão |
| Separador | #edf0f6 | linhas entre itens |
| Fundo da página | #f5f6fb | |
| Destaque suave | #eef1fa | dia de hoje, cabeçalho de tabela |

Concluído: mesma cor do item, com 60% de opacidade. Não é cor nova.

Amarelo e verde identificam unidade, não status. Não usar essas cores para indicar atraso ou sucesso.

## 3. Blocos e espaçamentos

| Item | Desktop | Celular |
|---|---|---|
| Cartão: borda e raio | 1 px #e1e6f0, raio 12 | igual |
| Cartão: padding | 18 × 20 | 16 (em vigor) |
| Faixa de status (lateral) | 4 px agenda, 5 px pedidos | igual |
| Espaço entre cartões | 20 | 16 (em vigor) |
| Linha de ação: altura mínima | 76 | 0 na versão compacta |
| Alvo de toque | 36 | 44 |
| Barra superior | 64 | 60 |
| Navegação inferior | não existe | 54 mínimo |
| Largura máxima do conteúdo | 1180 (Hoje) | largura total |

## 4. Colunas

| Tela | Desktop | Celular |
|---|---|---|
| Hoje | 2 colunas (1,8fr + 1fr) | 1 coluna |
| Enviados | 2 colunas: Araras à esquerda, Rio Claro à direita | 1 coluna, Araras primeiro |
| Recebidos | 2 colunas: Araras (amarelo), Rio Claro (verde) | 1 coluna |
| Agenda — Semana | 7 colunas, uma por dia, gap 8 | lista de dias empilhados |
| Agenda — Mês | grade 7 colunas + lista do dia selecionado | grade 7 colunas + lista |
| Agenda — Dia | lista única | lista única |
| Contadores (Enviados / Atrasados) | 2 colunas, largura máxima 440 | 2 colunas |

## 5. Telas e blocos

- **Hoje:** blocos escolhidos em Configurações. Comunicados sempre aparecem.
- **Hoje, pedidos:** dois blocos separados. Pedidos atrasados (urgentes) e Pedidos a fazer. Cada bloco some quando vazio (PR #416).
- **Compras:** abas 1 Fazer pedido, 2 Conferir, 3 Pedidos enviados, 4 Recebidos, 5 Estoque rotativo.
- **Agenda:** Dia, Semana e Mês. Ano foi removido. Busca de compromissos com janela de ±1 ano, sem limite de quantidade.
- **Reuniões:** item próprio no menu.
- **Estoque:** cabeçalho e cartões no padrão limpo.

## 6. Pendências (migração autorizada, ainda não feita)

Estas telas ainda usam classes Tailwind com texto abaixo de 14 px (`text-xs`, `text-[10px]`, `text-[11px]`). A migração foi autorizada em 15/11 e será feita arquivo por arquivo:

| Arquivo | Ocorrências |
|---|---|
| app/dashboard/leads/page.tsx | 34 |
| app/dashboard/estoque-rotativo/estoque-rotativo-client.tsx | 29 |
| app/dashboard/estoque/estoque-client.tsx | 22 |
| app/dashboard/motorista/motorista-agenda.tsx | 13 |
| app/dashboard/compras/ComprasClient.tsx | 11 |
| app/dashboard/reunioes/reunioes-client.tsx | 7 |
