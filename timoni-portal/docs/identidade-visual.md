# Identidade visual do Portal Timoni — parâmetros

Atualizado em 15/11/2026. Fonte única para tamanhos, cores, colunas e blocos. Quando um valor mudar, muda aqui primeiro.

## 1. Tipografia (px)

Os tamanhos de texto são os mesmos no desktop e no celular. No celular muda o layout, não a leitura.

| Nível | Uso | Desktop | Celular | Onde está no código |
|---|---|---|---|---|
| Título de página | Hoje, Compras, Agenda, Estoque, Reuniões | 34 | 34 | `--ct-font-page-title` |
| Título de seção | cabeçalho de cartão (Enviados, Recebidos…) | 26 | 26 | `--ct-font-section-title` |
| Subtítulo | títulos internos, versão compacta | 22 | 22 | `--ct-font-subtitle` |
| Texto | nome do pedido, título de evento, corpo | 20 | 20 | `--ct-font-body` |
| Texto informativo | datas, enviado em, local, legendas | 16 | 16 | `--ct-font-caption` |
| Etiqueta | carimbos, badges, navegação inferior, rótulos de grupo | 14 | 14 | valor fixo, nunca abaixo |
| Número de contador | caixas Enviados / Atrasados | 34 | 34 | `text-3xl` |
| Número de métrica | Hoje (cartões de contagem) | 36 | 32 | `.ct-clean-metric strong` |

**Piso absoluto: 14 px.** Nenhum texto do portal fica abaixo disso.

**Versão compacta (contas da Ciça e da mcrodini, no celular):**
- Linha da agenda: 16 px.
- Títulos de seção: 22 px.
- Links de cabeçalho: 14 px.
- Resto: igual à tabela acima.

## 2. Cores (aprovadas, não mudam sem decisão)

Regra geral: azul é o normal; vermelho pede atenção.

| Cor | Hex | Uso |
|---|---|---|
| Azul | #102a83 | normal, títulos, ação principal, Enviado no prazo, Minha agenda |
| Vermelho | #b12532 | atenção: Atrasado, Cancelar (ação destrutiva) |
| Amarelo | #ffd438 | Araras em Recebidos; Sem data em Enviados |
| Âmbar (texto) | #854f0b / #996000 | texto de alerta sobre fundo claro |
| Verde | #15803d (texto #166534) | Rio Claro em Recebidos |
| Dourado | #f6bf26 | Agenda CT (cor do calendário) |
| Lilás | #7986CB | Minha agenda (cor de reserva) |
| Texto principal | #182443 | |
| Texto secundário | #65718a | datas, legendas |
| Linha | #e1e6f0 | bordas de cartão |
| Separador | #edf0f6 | linhas entre itens |
| Fundo da página | #f5f6fb | |
| Destaque suave | #eef1fa | dia de hoje, cabeçalho de tabela |

Amarelo e verde identificam unidade, não status. Não usar essas cores para indicar atraso ou sucesso.

## 3. Blocos e espaçamentos

- Cartão: fundo branco, borda 1 px #e1e6f0, raio 12 px, sem sombra. Padding 18 × 20 no desktop, 16 no celular.
- Faixa de status (lateral): 4 px na agenda, 5 px nos pedidos. Azul normal, vermelho atenção.
- Linha de ação: altura mínima 76 px no desktop; 0 na versão compacta.
- Espaço entre cartões: 20 px no desktop, 16 px no celular.
- Alvo de toque: 44 px no celular, 36 px no desktop.
- Barra superior: 64 px (60 px no celular). Navegação inferior do celular: 54 px mínimo.

## 4. Colunas

| Tela | Desktop | Celular |
|---|---|---|
| Hoje | 2 colunas (1,8fr + 1fr), largura máx. 1180 px | 1 coluna |
| Enviados | 2 colunas: Araras à esquerda, Rio Claro à direita | 1 coluna, Araras primeiro |
| Recebidos | 2 colunas: Araras (amarelo), Rio Claro (verde) | 1 coluna |
| Agenda — Semana | 7 colunas (uma por dia), gap 8 px | lista de dias empilhados |
| Agenda — Mês | grade 7 colunas + lista do dia selecionado | grade 7 colunas + lista |
| Agenda — Dia | lista única | lista única |
| Contadores (Enviados / Atrasados) | 2 colunas, largura máx. 440 px | 2 colunas |

## 5. Telas e blocos

- **Hoje:** blocos escolhidos em Configurações. Comunicados sempre aparecem.
- **Compras:** abas 1 Fazer pedido, 2 Conferir, 3 Pedidos enviados, 4 Recebidos, 5 Estoque rotativo.
- **Agenda:** Dia, Semana e Mês. Ano foi removido. Busca de compromissos com janela de ±1 ano, sem limite de quantidade.
- **Reuniões:** item próprio no menu.
- **Estoque:** cabeçalho e cartões no padrão limpo.

## 6. Pendências (fora do piso, ainda não migradas)

Estas telas ainda usam classes Tailwind com texto abaixo de 14 px (`text-xs`, `text-[10px]`, `text-[11px]`). Entram na próxima rodada de migração:

| Arquivo | Ocorrências |
|---|---|
| app/dashboard/leads/page.tsx | 34 |
| app/dashboard/estoque-rotativo/estoque-rotativo-client.tsx | 29 |
| app/dashboard/estoque/estoque-client.tsx | 22 |
| app/dashboard/motorista/motorista-agenda.tsx | 13 |
| app/dashboard/compras/ComprasClient.tsx | 11 |
| app/dashboard/reunioes/reunioes-client.tsx | 7 |
