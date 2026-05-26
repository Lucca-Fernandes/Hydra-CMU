# FINANCEIRO 2.0 — Documentação de Arquitetura

> Dashboard financeiro executivo cruzando **desembolso (UAU)** × **receita (CMU)**.
> Substitui a aba "Gestão Desembolso" (`/gestao-desembolso`). É o módulo principal do sistema para os gestores Solatio/GVS.

**Status:** Plano aprovado em 2026-05-20. Implementação por fases.
**Stakeholders:** Glayson (gestor / diligência de projetos), Camila (gestora — refinará requisitos), Lucca (produto).

---

## 1. Objetivo

Painel **executivo, intuitivo e robusto** para os gestores tomarem decisões financeiras com perfeição. Visão completa integrada: caixa, dívida/financiamento, operacional e resultado líquido — cruzando o que **sai** (desembolso das obras/usinas no UAU) com o que **entra** (receita de faturamento dos medidores no CMU).

A análise segue a hierarquia da due diligence do GVS:
1. **SPE individual** (empresa/usina)
2. **Cluster** como um todo
3. **Grupo consolidado** (todas as SPEs)

---

## 2. Princípio arquitetural — INDEPENDÊNCIA DE PLANILHAS

**O sistema NUNCA depende de arquivos `.xlsx` em runtime.**

As planilhas (`docs/Classificações.xlsx`) servem **uma única vez** como fonte de conhecimento de negócio. Elas são absorvidas para dentro do banco no setup; depois disso são apenas documento histórico de referência. Se sumirem, o sistema continua funcionando.

```
ETAPA 1 (uma vez)    Classificações.xlsx  →  seed das tabelas Postgres
                      (plano_contas, spe_estrutura)

ETAPA 2 (no ingest)  linha UAU  →  aplica classificação  →  grava com
                      colunas `categoria` e `bloco` em uau_desembolso

ETAPA 3 (runtime)    dashboard  →  SQL em uau_desembolso (já classificada)
                      ZERO planilha · ZERO lookup de arquivo
```

**Mudanças futuras** (novo código de insumo, mudança no plano de contas):
- Código não mapeado → cai no balde **"Não classificado"**, visível no painel (nunca quebra; sinaliza revisão).
- Atualizar classificação → via tabela do banco / futura tela de admin. Nunca via Excel em produção.

---

## 3. Fontes de dados

### 3.1 UAU ERP (desembolso) — o que SAI
Endpoint `Planejamento.ConsultarDesembolsoPlanejamento` (por obra). Ver `CLAUDE.md` para auth/gotchas. É a curva físico-financeira quebrada por insumo. Uma linha = **(Obra, Item, Composição, Insumo, Mês)**.

### 3.2 CMU Solatio (receita) — o que ENTRA
Tabelas `cmu_energy_meter_*` (já no Postgres via sync). Receita faturada/recebida, inadimplência, energia compensada, economia — por organização.

### 3.3 Vórtx (dívida) — FUTURO
API GraphQL do agente fiduciário com saldo devedor/taxa/vencimento das emissões (CRI/debêntures). Liga por CNPJ ao UAU. Alimentará o bloco de dívida quando o GVS fornecer o token. Ver memória `reference-vortx-divida`.

---

## 4. Campos do UAU `ConsultarDesembolsoPlanejamento` — o que cada um significa

| Campo | Significado | Uso no painel |
|---|---|---|
| `Status` | **Projetado** = planejamento físico (`Total` é QUANTIDADE, `TotalLiq`=0). **Pagar** = compromisso futuro (R$). **Pago** = desembolso realizado (R$). | Dimensão Planejado×Realizado |
| `Empresa` | Código da SPE (= `Codigo_emp`) | Chave do nível SPE |
| `Obra` | Código da obra (= `Cod_obr`) | Drill-down |
| `Contrato` | Nº do contrato dentro da obra | — |
| `Produto` | Id do produto UAU | — |
| `Composicao` | Código da composição de serviço (ex: `S206`, `PLN0026`, `DI001`) — agrupa insumos. **Atenção: aceita prefixo PLN** | Detalhe da obra |
| `Item` | Item do cronograma (ex: `01.01.02`) — **define a FASE/contexto**, essencial pra classificar | Chave de classificação (com Insumo) |
| `Insumo` | Código do insumo/conta (ex: `PLN1018`, `OPE1025`) — **o que mapeia pro plano de contas** | Chave de classificação |
| `DtaRef` | Mês de referência (1º dia) | Série temporal |
| `Total` | Quantidade (Projetado) OU valor (Pago/Pagar). **NUNCA somar cego** | — |
| `TotalLiq` | **Valor líquido R$** = Bruto + Acréscimo − Desconto. **MÉTRICA FINANCEIRA CORRETA** | Todas as somas de R$ |
| `TotalBruto` | Valor bruto R$ | Conferência |
| `Acrescimo` / `Desconto` | Ajustes R$ | Conferência |

**Regra de ouro:** para qualquer valor monetário, somar **`TotalLiq`** e/ou filtrar `Status IN ('Pago','Pagar')`. `Total` mistura quantidade e R$.

---

## 5. Classificação do plano de contas (a correção de raiz)

A categorização (qual insumo = qual conta) é **decisão de negócio do GVS** — NÃO vem da API UAU (que só devolve o código). Vive na `Classificações.xlsx` (Planilha1: `PLANO DE CONTAS` | `Item_SiAp` | `InsumoPl_Des`).

### 5.1 Dois bugs encontrados no mapa antigo (`insumo_map.json`)

**Bug A — Prefixo PLN vs OPE:** existem `PLN1018` e `OPE1018` (mesmo número, prefixos diferentes).
- `PLN` = **Planejado** (629 códigos)
- `OPE` = **Operado/realizado** (76 códigos)
- Em **29 números** o mesmo dígito cai em categorias DIFERENTES (ex: `OPE1025`=Arrendamento, `PLN1025`=O&M). **O prefixo importa** — tratar como chaves distintas.

**Bug B — Ambiguidade por Item:** **238 dos 758** insumos mapeiam pra VÁRIAS categorias dependendo do `Item` (ex: `PLN1001` = Folha num item, Implantação em outro). O `insumo_map.json` (dict plano) achatou isso e classifica errado centenas de linhas.
- **Correção:** chave = **(Item + Insumo)**, como a planilha define.
- Restam ~201 pares genuinamente ambíguos (tipicamente **Implantação vs O&M** = CAPEX vs OPEX). Resolução por **regra de prioridade** (documentada abaixo) + flag de revisão.

### 5.2 Regra de desambiguação (Item+Insumo com >1 categoria)
1. Tiebreak por **frequência** na planilha (categoria mais comum para o par vence).
2. Empate → prioridade: `Financiamento > Impostos > Folha > Implantação > O&M`.
3. Par ambíguo → marcado `revisao=true` na tabela, listado pra Camila validar.
4. (Futuro) refinar Implantação×O&M pela **fase da obra** na `DtaRef` (antes do COD = Implantação; depois = O&M), usando `DtIni_obr`/`Dtfim_obr`.

### 5.2.1 Resultado da classificação (validado 2026-05-20)
Classificação em **3 níveis** (seed em `seed_plano_contas.js` → tabelas `plano_contas` + `plano_contas_prefixo`):
1. **Exato** `(Item, Insumo)` — 2.862 chaves
2. **Wildcard por Insumo** `(*, Insumo)` — 758 chaves (combos novos do mesmo insumo)
3. **Prefixo** (PLN, FI, EMP, FOL…) — 30 prefixos, categoria dominante por evidência da planilha + adição manual `FOL→Folha`

**Cobertura medida no export real:** ~93% das linhas / **98,3% do R\$** classificados. Resto = `Não classificado` (visível no painel). Scan completo achou **1.161 códigos (R\$ ~307M)** fora da planilha — listados em `docs/CLASSIFICAR_PENDENTE.md` pra Camila validar. Inferências a confirmar: `DEV→Aportes` (~R\$39M, devolução), `CDI→O&M` (pode ser juros).

### 5.3 Blocos financeiros (agrupamento das ~28 categorias)

| Bloco | Categorias do plano de contas |
|---|---|
| **RECEITA** | (lado CMU) faturado, recebido, inadimplência |
| **O&M / OPERACIONAL** | O&M (Material/Peças/Serviços), Folha, Despesas Administrativas, Arrendamento Terras, Encargos de Transmissão, Seguros, Comercialização da Energia, O&M AGOE/AB |
| **CAPEX / IMPLANTAÇÃO** | Implantação |
| **FINANCIAMENTO / DÍVIDA** | Amortização, Despesas Juros Financiamento, Outros empréstimos (240 cód.), Empréstimo entre SPEs, Empréstimo da SPE/Consórcio, Despesas Financeiras |
| **APORTES / SÓCIOS** | Aporte Sócios AFAC, GVS Holding, Adiantamento construtora |
| **IMPOSTOS** | (-) Pis, (-) Cofins, Imposto De Renda, Contribuição Social, Royalties |
| **NÃO CLASSIFICADO** | qualquer código novo/desconhecido (fallback seguro) |

> O painel antigo jogava TODO o bloco Financiamento dentro de "Operacional" — erro grave que o 2.0 corrige.

---

## 6. Estrutura societária (níveis Cluster/Grupo)

Da `Classificações.xlsx` Planilha2 (seed em `seed_spe_estrutura.js` → tabela `spe_estrutura`). **Importante:** a coluna "Lista CNPJ" é na verdade `código - NOME` (não tem o CNPJ em dígitos); o agrupamento de cluster confiável é a **SEÇÃO** da planilha (linhas-cabeçalho ☀: CLUSTER I–XII, BGO, FASE 3, HOLDING, MINERAÇÃO…), pois a coluna "Classificação" (col D) é texto inconsistente.

Campos: `empresa` (= `Codigo_emp` do UAU) · `nome` · `cluster` (seção) · `classificacao` (col D, referência) · `tipo` (HOLDING/SUB-HOLDING/SPE/CONSÓRCIO/…) · `status_planilha`.

**Validado:** 293 empresas únicas (69 duplicatas dedupadas). Das empresas com desembolso real, **92% têm cluster / 99,7% do R\$**. As 24 sem cluster (R\$104M, 0,3% — SPEs novas pós-planilha) caem no balde "Sem cluster", a confirmar com Camila.

Habilita: agregação por **Cluster** (join `uau_desembolso.empresa → spe_estrutura.cluster`) e de-para UAU↔CMU mais preciso (nome + cluster).

---

## 7. Modelo de dados (Postgres)

```sql
-- Conhecimento de negócio (seed da planilha, 1x)
CREATE TABLE plano_contas (
  item        TEXT,            -- Item_SiAp (pode ser '' = qualquer)
  insumo      TEXT NOT NULL,   -- InsumoPl_Des (com prefixo PLN/OPE)
  categoria   TEXT NOT NULL,   -- plano de contas
  bloco       TEXT NOT NULL,   -- Receita/O&M/CAPEX/Financiamento/...
  revisao     BOOLEAN DEFAULT false,
  PRIMARY KEY (item, insumo)
);

CREATE TABLE spe_estrutura (
  empresa     INT PRIMARY KEY, -- Codigo_emp
  nome        TEXT,
  cnpj        TEXT,
  cluster     TEXT,
  tipo        TEXT             -- HOLDING / SUB-HOLDING / SPE
);

-- Dados de desembolso, pré-classificados e pré-agregados
CREATE TABLE uau_desembolso (
  empresa      INT,
  obra         TEXT,
  item         TEXT,
  composicao   TEXT,
  insumo       TEXT,
  categoria    TEXT,           -- aplicado no ingest
  bloco        TEXT,           -- aplicado no ingest
  status       TEXT,           -- Projetado/Pagar/Pago
  ref_mes      DATE,
  total_liq    NUMERIC,
  total_bruto  NUMERIC,
  qtd_linhas   INT             -- pré-agregação
);
-- índices: (empresa, ref_mes), (bloco), (categoria), (status)
```

Carga inicial: a partir do **CSV de export** já existente (`desembolso_planejamento_*.csv`, ~1.9M linhas) — sem martelar a API. Refresh incremental depois.

---

## 8. Os 3 níveis de análise — Backend (Fase 2, IMPLEMENTADO)

Rotas em `server.js` (bloco "FINANCEIRO 2.0"). Todas leem de `uau_desembolso` (+ join `spe_estrutura`). Query param de período: `?mesInicial=mm/yyyy&mesFinal=mm/yyyy` (opcional; filtra `ref_mes`). Helper `aggDesembolso({empresaList, startDate, endDate})` monta a agregação; `mmYyyyToDate()` converte o período.

| Método | Rota | Retorna |
|---|---|---|
| GET | `/api/fin2/clusters` | `[{cluster, empresas, pago}]` — lista para navegação |
| GET | `/api/fin2/grupo` | consolidado de TODAS as empresas + `porCluster` |
| GET | `/api/fin2/cluster/:cluster` | uma cluster (empresas via `spe_estrutura.cluster`) + lista `empresas` |
| GET | `/api/fin2/spe/:empresa` | uma SPE + metadados (`spe`) |

**Shape comum da resposta** (grupo/cluster/spe):
- `totais`: `{ total, pago, pagar, financiamento, amortizacao, juros, operacional (=O&M), capex, naoClassificado, servicoDivida (=amortizacao+juros) }` — tudo em R\$ (soma de `total_liq`)
- `blocos`: `{ Financiamento: {Pago, Pagar, Projetado, total}, O&M: {...}, CAPEX, Aportes, Impostos, "Não classificado" }`
- `porCategoria`: `[{categoria, bloco, total, qtd}]` ordenado por R\$
- `topObras`: `[{empresa, obra, total}]` top 15
- `serieMensal`: `[{mes:"YYYY-MM", Financiamento, O&M, CAPEX, ...}]` (uma chave por bloco)
- grupo extra: `porCluster`; cluster/spe extra: `empresas`/`spe`

**Notas de implementação importantes:**
- Indicador `juros` usa `categoria LIKE '%Juros%'` (a planilha tem variante singular "Despesa Juros Financiamento" além da plural — NÃO filtrar por nome exato).
- `amortizacao` usa `categoria LIKE 'Amortiza%'`.
- O **cruzamento CMU** (receita) ainda NÃO está embutido nos endpoints fin2 — usar o `/api/cmu/org-stats` existente e combinar no frontend (Fase 3), pois o link UAU↔CMU é por nome de organização (textual). Plano: no nível SPE, casar `spe.nome` ↔ `organization` CMU; em cluster/grupo, somar as orgs casadas.

---

## 9. Indicadores executivos (o "magnífico")

| Indicador | Fórmula | O que diz |
|---|---|---|
| **Resultado de Caixa** | Recebido (CMU) − Pago (UAU) | sobra/falta de caixa no período |
| **DSCR** (cobertura do serviço da dívida) | (Recebido − O&M) ÷ (Amortização + Juros) | se a usina paga a própria dívida (>1 = sim) |
| **Margem Operacional** | (Recebido − O&M) ÷ Recebido | eficiência da operação |
| **Carga de Dívida** | Financiamento ÷ Receita | nível de alavancagem |
| **Inadimplência %** | (Pendente + Vencido) ÷ Faturado | saúde do recebimento |
| **Planejado × Realizado** | (Projetado + Pagar) vs Pago | aderência ao plano |

---

## 10. Cruzamento UAU × CMU

- **IMPLEMENTADO (nível SPE) com de-para PERSISTIDO:** o match textual é inútil aqui — UAU ("SPE GVS I S.A") e CMU ("Consórcio GV VII") têm nomes/naturezas diferentes; o `autoMatchCmuOrg` melhorado (stop-words + substring) acerta ~47% mas com muitos falsos positivos ("Santa Bárbara"→"Santa Cruz"). Por isso a fonte da verdade é uma **tabela de mapeamento manual** `fin2_spe_org (empresa, organization)`:
  - `GET /api/fin2/spe-org/:empresa` → org salva (ou null) · `POST /api/fin2/spe-org {empresa, organization}` → upsert.
  - Frontend: ao escolher a SPE, busca o **salvo** (✓ autoritativo); se não houver, mostra **palpite automático** (⚠ rotulado "confira!"); o usuário corrige e, ao **Carregar**, o de-para é **salvo automaticamente** — então da próxima vez já vem certo.
  - Ao Carregar, busca `/api/cmu/org-stats` e mostra: Receita Recebida, Faturado, Resultado de Caixa, DSCR, e o **gráfico cruzado mensal** (Faturado/Recebido CMU vs Desembolso UAU).
- **Realidade dos dados:** nem toda org tem faturamento (ex: "Consórcio Energia Livre" = 0 faturas "Faturado"; "Consórcio GV VII" = R\$953k). E invoices/payments ainda são dados de março até a fase-2 do CMU sync completar.
- **Pendente (cluster/grupo):** o cruzamento só existe no nível SPE (mapa org 1:1). Para cluster/grupo, precisa de um de-para SPE→org persistido (futuro: tabela de mapeamento manual, em vez do match textual).
- **Chave temporal:** mês (`ref_mes` UAU ↔ `referenceMonth` CMU).

---

## 11. Fases de implementação

- **Fase 1 — Fundação de dados** ✅ *concluída (2026-05-20)*
  - 1.1 ✅ Motor de classificação (`seed_plano_contas.js` → `plano_contas` + `plano_contas_prefixo`). 93% linhas / 98% R\$.
  - 1.2 ✅ Estrutura societária (`seed_spe_estrutura.js` → `spe_estrutura`). 293 empresas, 92% do desembolso com cluster.
  - 1.3 ✅ Ingest (`ingest_desembolso.js` → `uau_desembolso`). 1,9M linhas → 91k grupos pré-classificados/agregados (10 MB, queries instantâneas). Os 3 níveis (SPE/Cluster/Grupo) validados.
  - **Números consolidados (2010–2030, todas SPEs):** Financiamento R\$27,9bi · Aportes R\$6,3bi · O&M R\$2,0bi · CAPEX R\$1,4bi · Não classificado R\$313M (gap p/ Camila).
  - **Re-ingest:** quando Camila classificar a cauda, rodar `seed_plano_contas.js` (atualizar mapa) + `ingest_desembolso.js` (reaplica). Idempotente.
- **Fase 2 — Backend** ✅ *concluída (2026-05-21)* — endpoints `/api/fin2/{grupo,cluster/:c,spe/:e,clusters}` em `server.js`, query rápida no Postgres. Testados nos 3 níveis. Falta só embutir o cruzamento CMU (ver seção 8).
- **Fase 3 — Frontend** ✅ *v1 (2026-05-21)* — `src/pages/Financeiro2.jsx`, rota `/financeiro-2`, menu "Financeiro 2.0" (`Layout.jsx`). **Tema escuro** global aplicado no `App.jsx` (MUI `mode:'dark'`, paleta sky/verde, paper #121a2e). Página: toggle 3 níveis (Grupo/Cluster/SPE) + período + KPIs executivos (Comprometido, Financiamento, Serviço da Dívida, O&M) + cruzamento CMU no nível SPE (Receita/Resultado de Caixa/DSCR via `/api/cmu/org-stats` com auto-match de organização) + série mensal empilhada por bloco + composição por bloco + top categorias + top obras/clusters. Build OK (2081 módulos). **Refinar visual/layout com Glayson/Camila depois.**
  - Endpoints consumidos: `/api/fin2/{clusters,grupo,cluster/:c,spe/:e}`, `/api/uau/empresas`, `/api/cmu/organizations`, `/api/cmu/org-stats`.
  - `GestaoDesembolso.jsx` (rota antiga `/gestao-desembolso`) mantida como fallback, fora do menu.
- **Fase 4 (futuro)** — integração Vórtx no bloco de dívida (saldo devedor/taxa/vencimento real)

---

## 12. Decisões em aberto (refinar com o uso)
- Regra final de desambiguação Implantação×O&M (CAPEX vs OPEX).
- Quais indicadores são prioritários na primeira tela.
- Se "Pagar" (compromisso futuro) entra no Resultado de Caixa ou só projeção.
- Layout/ordem dos blocos conforme o fluxo de análise.
- Cruzamento CMU em nível cluster/grupo (hoje só SPE) — depende dos de-para SPE→org salvos.
- Cauda de R\$307M não classificada (`docs/CLASSIFICAR_PENDENTE.md`) — classificar quando houver a info do plano de contas.
