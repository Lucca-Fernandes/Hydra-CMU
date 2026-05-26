# Financeiro 2.0 — Guia dos Campos (linguagem simples)

Este guia explica, em palavras simples, o que significa cada número da tela **Financeiro 2.0**. Pensado para gestores — sem termo técnico desnecessário.

> **Ideia geral:** a tela cruza o que **SAI** (desembolso das usinas, vindo do UAU) com o que **ENTRA** (receita dos clientes, vinda do CMU). Assim dá pra ver se cada usina/SPE se paga.

---

## 1. Os 3 níveis de visão

| Nível | O que mostra |
|---|---|
| **SPE** | Uma usina/empresa específica (a menor unidade) |
| **Cluster** | Um grupo de SPEs (ex: CLUSTER VI, BGO) somados |
| **Grupo** | Tudo junto — o consolidado de todas as SPEs |

Você escolhe o nível no topo e o período (mês inicial / mês final).

---

## 2. Status do desembolso (de onde vem o dinheiro que saiu)

Todo gasto do UAU vem com um status:

| Status | Significado simples |
|---|---|
| **Pago** | Já saiu do caixa — dinheiro de fato gasto |
| **A Pagar** | Compromisso já assumido, ainda vai sair |
| **Projetado** | Só planejamento — ainda não é compromisso firme |

**Comprometido Total** = Pago + A Pagar + Projetado (tudo que está previsto).

---

## 3. KPIs principais (cards do topo)

| Card | O que é |
|---|---|
| **Comprometido Total** | Soma de tudo que a usina vai desembolsar no período (já pago + a pagar + projetado) |
| **Financiamento / Dívida** | Quanto é dívida — empréstimos, amortização e juros. (Quanto da operação é "alavancada") |
| **Serviço da Dívida** | O custo de carregar a dívida = **Amortização + Juros** |
| **O&M (Operacional)** | Custo de **operar e manter** a usina no dia a dia |

---

## 4. Os blocos (para onde o dinheiro vai)

O desembolso é separado em **blocos** — grandes "caixinhas" de gasto:

| Bloco | O que entra aqui (em palavras simples) |
|---|---|
| **Financiamento** | **Dívida**: amortização (paga o principal do empréstimo), juros, e os vários empréstimos. É o que se conecta às emissões (CRI/debêntures) |
| **O&M** | **Operação e manutenção**: peças, serviços, folha de pagamento, administração, arrendamento de terra, encargos de transmissão, seguros |
| **CAPEX** | **Construção da usina** (Implantação). Gasto único, lá no começo, pra erguer a usina |
| **Aportes** | Dinheiro dos sócios / holding entrando na empresa (capital, adiantamentos) |
| **Impostos** | PIS, Cofins, Imposto de Renda, Contribuição Social |
| **Não classificado** | Códigos que ainda não foram categorizados no plano de contas (a "caixinha do que falta organizar") |

> **CAPEX × O&M:**
> - **CAPEX** = construir (uma vez só, no início)
> - **O&M** = manter funcionando (todo mês, pra sempre)

---

## 5. Lado da Receita (CMU) — aparece no nível SPE

Quando você cruza uma SPE com o consórcio de clientes (CMU):

| Card | O que é |
|---|---|
| **Faturado** | Quanto foi cobrado dos clientes (faturas emitidas) |
| **Receita Recebida** | Quanto os clientes **de fato pagaram** |
| **Inadimplência** | Quanto está em aberto (pendente + vencido) — o que não foi pago |

---

## 6. Indicadores cruzados (a "inteligência" da tela)

Aqui é onde UAU e CMU se encontram:

| Indicador | Conta | O que diz |
|---|---|---|
| **Resultado de Caixa** | Recebido − Pago | Sobrou ou faltou caixa no período. Verde = sobrou, vermelho = faltou |
| **DSCR** (cobertura da dívida) | (Recebido − O&M) ÷ Serviço da Dívida | **A usina paga a própria dívida?** Se for **maior que 1**, sim. Menor que 1, não está se sustentando |

> **DSCR em uma frase:** depois de pagar a operação, sobra dinheiro suficiente pra pagar a dívida? `1,2x` = sobra 20% além da dívida. `0,8x` = falta 20%.

---

## 7. Os gráficos

| Gráfico | O que mostra |
|---|---|
| **Desembolso mensal por bloco** | Como o gasto se distribui mês a mês, colorido por bloco |
| **Composição por bloco** | Quanto cada bloco pesa no total (com a divisão Pago / A Pagar) |
| **Top categorias** | As maiores contas do plano de contas |
| **Top obras / Desembolso por cluster** | Onde mais se gastou (por obra, ou por cluster no nível Grupo) |
| **Cruzamento UAU × CMU** | Lado a lado, mês a mês: Faturado e Recebido (entra) vs Desembolso (sai) |

---

