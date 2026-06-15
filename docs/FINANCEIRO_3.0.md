# FINANCEIRO 3.0 — Complete Integration Guide

> Single production page for Power Analytics. Crosses energy, billing, collection, delinquency, and costs in **Realizado (actual) x Previsto (planned)**, by group / cluster / source type.  
> Route: `/financeiro-3` | Frontend: `src/pages/Financeiro3.jsx` | Spec: `docs/financeiro 3.0/G2.pdf`

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  FINANCEIRO 3.0 — Frontend (React SPA)                            │
│  src/pages/Financeiro3.jsx                                        │
│  5 parallel fetches on "Carregar" → /api/fin3/*                   │
└──────┬─────────┬────────────┬──────────────┬──────────────────────┘
       │         │            │              │
   /resumo  /inadimplencia  /faturamento  /custos    /usinas
       │         │            │              │            │
┌──────▼─────────▼────────────▼──────────────▼────────────▼────────┐
│  EXPRESS SERVER (sync-service/server.js)                          │
│  Fin3 block starts at "FINANCEIRO 3.0" comment (~line 1228)      │
│  Cache: 5min TTL in-memory (fin3Cache)                           │
└──────┬─────────┬────────────────────────────────────────────────┘
       │         │
┌──────▼──┐ ┌───▼────────────┐  ┌──────────────────────┐
│ CMU     │ │ fin3_resumo    │  │ uau_desembolso       │
│ tables  │ │ (xlsx ingest)  │  │ (UAU ERP costs)      │
│ (live)  │ │                │  │                      │
└─────────┘ └────────────────┘  └──────────────────────┘
 REALIZADO      PREVISTO              CUSTOS
```

### Three Data Sources

| Source | What | Database Tables | Updates |
|--------|------|----------------|---------|
| **CMU (Realizado)** | Live billing, payments, delinquency, compensated energy | `cmu_energy_meter_invoices`, `cmu_energy_meter_payments`, `cmu_energy_meters` | `sync_v2.js --full` (hours) |
| **Planilha (Previsto)** | Projected energy, billing, revenue, delinquency from DADOS GERAIS.xlsx | `fin3_resumo` | Upload via UI or `node ingest_resumo_graficos.js` |
| **UAU (Custos)** | Disbursement costs (O&M, financing, CAPEX) from Globaltec ERP | `uau_desembolso` | `node ingest_desembolso.js` |

### Cluster as Cross-Reference Key

All three sources are linked through **cluster**:
- **Planilha**: has its own `cluster` column (e.g., "CLUSTER I")
- **UAU**: linked via `spe_estrutura.cluster`
- **CMU**: linked via `fin3_org_cluster` (maps CMU `organization` string → cluster). **This mapping is user-editable**.

---

## 2. Database Schema

### 2.1 `fin3_resumo` — Planilha Data (Previsto + Realizado from xlsx)

```sql
CREATE TABLE fin3_resumo (
  usina           TEXT,          -- "CGH NOVA UNIÃO", "UFV ARAGUARI", etc.
  cluster         TEXT,          -- "CLUSTER I".."CLUSTER XII", "BGO"
  fonte           TEXT,          -- "CGH", "UFV", "UTE"
  concessionaria  TEXT,          -- "CEMIG", "ENEL GO", etc.
  potencia_mw     NUMERIC,       -- installed power in MW
  operando        BOOLEAN,       -- true = operating, false = not yet
  status          TEXT,          -- "REALIZADO" or "PROJETADO"
  metrica         TEXT,          -- metric name (see list below)
  ref_mes         DATE,          -- first day of month (2024-01-01, 2024-02-01, etc.)
  valor           NUMERIC        -- metric value for that month
);
-- Indexes: (status, metrica, ref_mes), (cluster), (fonte), (usina)
```

**Metrics in `metrica` column** (exact strings, case-sensitive):

| Metric | Unit | Used For |
|--------|------|----------|
| `Energia Injetada (MWh)` | MWh | Previsto energy injected |
| `Energia Compensada (MWh)` | MWh | Previsto energy compensated |
| `Energia Bruta (MWh)` | MWh | Realizado only (generation) |
| `Tarifa (R$/MWh)` | R$/MWh | Used to calculate injetado R$ |
| `Valor faturado (R$)` | R$ | Previsto billing |
| `Faturamento recebido (R$)` | R$ | Previsto revenue collected |
| `Faturamento em Aberto (R$)` | R$ | Previsto open billing |
| `Estoque (MWh)` | MWh | Energy stock/balance |
| `Estoque Gerado (MWh)` | MWh | Realizado only |
| `Em Aberto (Até 90 dias)` | R$ | Delinquency bucket ≤90d |
| `Em aberto (91 - 180 dias)` | R$ | Delinquency bucket 91-180d |
| `Inadimplência (Acima 181 dias)` | R$ | Delinquency bucket >180d |
| `% Indisponibilidade Rede` | % | Realizado only |
| `% Indisponibilidade Usina` | % | Realizado only |
| `Receita Realizada (R$)` | R$ | Realizado only (actual revenue) |
| `Realizado Tempo OK` | hours | Realizado only |

**Data volume**: ~11,300 rows. Period: 2024-01 to 2026-12 (36 months).

### 2.2 `fin3_org_cluster` — CMU Organization → Cluster Mapping

```sql
CREATE TABLE fin3_org_cluster (
  organization TEXT PRIMARY KEY,  -- CMU organization name (e.g., "Consórcio GV VII")
  cluster      TEXT,              -- "CLUSTER I".."CLUSTER XII" or custom
  fonte        TEXT,              -- "CGH", "UFV", "UTE" (currently unused by CMU queries)
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Critical**: CMU revenue only appears in cluster-filtered views when the organization is mapped here. Unmapped orgs fall under "(sem cluster)" and are invisible in cluster mode.

As of writing: 28 CMU organizations exist, only 6 mapped. The mapping dialog allows users to add/edit mappings and create new clusters.

### 2.3 `fin3_planilha_versao` — Upload Version Tracking

```sql
CREATE TABLE fin3_planilha_versao (
  id          SERIAL PRIMARY KEY,
  arquivo     TEXT,                 -- original filename
  versao      TEXT,                 -- user-entered version string (e.g., "rev.38")
  linhas      INT,                  -- rows ingested
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  resumo      JSONB                 -- summary stats [{status, linhas, usinas, min_mes, max_mes}]
);
```

### 2.4 Existing Tables Used (NOT created by Fin3)

| Table | Source | Fin3 Usage |
|-------|--------|------------|
| `cmu_energy_meters` | CMU sync | Realizado: organization, status, distributor, class, address |
| `cmu_energy_meter_invoices` | CMU sync | Realizado: faturado (status "Faturado"), compensated energy |
| `cmu_energy_meter_payments` | CMU sync | Realizado: recebido (status "Pago"), inadimplencia ("Vencido"+"Pendente"), aging |
| `uau_desembolso` | UAU ingest | Custos: O&M, Financiamento, CAPEX by status (Pago/Pagar/Projetado) |
| `spe_estrutura` | UAU seed | Maps empresa code → cluster for UAU cost aggregation |

---

## 3. Planilha Ingestion

### Source File: `DADOS GERAIS.xlsx`, sheet "Resumo Graficos"

**Column layout** (row 1 = headers):

| Col | Field |
|-----|-------|
| A (1) | Cluster (roman numeral: "I", "VII", "XII", or "BGO") |
| B (2) | Fonte ("CGH", "UFV", "UTE") |
| C (3) | Usina name |
| D (4) | Concessionaria |
| E (5) | Potencia MW |
| F (6) | Operando ("SIM" / "NÃO") |
| G (7) | Status ("REALIZADO" / "PROJETADO") |
| H (8) | Dados (metric name) |
| I+ (9+) | Monthly values, headers "jan/24", "fev/24", ..., "dez/26" |

**Normalization rules**:
- Cluster: roman "I" → "CLUSTER I", "VII" → "CLUSTER VII". Non-roman stays as-is (e.g., "BGO").
- Status: anything starting with "PROJ" → "PROJETADO", else → "REALIZADO"
- Operando: "SIM" → true, "NÃO"/"NAO" → false
- Empty/non-numeric month cells are skipped (no row created)

### Ingest Methods

**1. CLI script** (initial setup):
```bash
cd sync-service && node ingest_resumo_graficos.js [path/to/DADOS_GERAIS.xlsx]
# Default path: docs/financeiro 3.0/DADOS GERAIS.xlsx
# npm run seed:resumo
```

**2. UI upload** (`POST /api/fin3/upload-resumo`):
- Accepts multipart form with `file` (xlsx) and optional `versao` (string)
- Parses the same way as the CLI script
- TRUNCATES and re-inserts all rows (full replace)
- Saves version info to `fin3_planilha_versao`
- Invalidates fin3 cache

---

## 4. API Endpoints

All endpoints under `/api/fin3/*`. Common query params:
- `mesInicial` — format `mm/yyyy` (e.g., "01/2025")
- `mesFinal` — format `mm/yyyy` (e.g., "12/2026")
- `cluster` — exact cluster name (e.g., "CLUSTER I"). Omit for group-level view.
- `fonte` — "CGH", "UFV", or "UTE" (only filters planilha data, NOT CMU)

All responses cached 5 minutes in-memory.

---

### 4.1 `GET /api/fin3/dimensions`

Returns available filter values from planilha data.

**Response:**
```json
{
  "clusters": ["BGO", "CLUSTER I", "CLUSTER II", ...],
  "fontes": ["CGH", "UFV", "UTE"],
  "concessionarias": ["CEMIG", "COELBA", "CPFL PAULISTA", ...],
  "usinas": ["CGH ALEGRE", "CGH ALTO FURNAS", ...]
}
```

---

### 4.2 `GET /api/fin3/resumo` — Main Dashboard Data

**Query**: `?mesInicial=01/2025&mesFinal=12/2026&cluster=CLUSTER I&fonte=CGH`

**Response shape:**
```json
{
  "nivel": "cluster",         // "cluster" or "grupo"
  "cluster": "CLUSTER I",
  "fonte": "CGH",
  "mesInicial": "01/2025",
  "mesFinal": "12/2026",
  "real": {
    "injetadoRS": null,        // CMU does NOT have generation data
    "compensadaMWh": 1300.5,   // SUM(compensatedEnergy)/1000 from invoices status "Faturado"
    "faturado": 1021606.32,    // SUM(totalAmount) from invoices status "Faturado"
    "recebido": 129000.0,      // SUM(totalAmount) from payments status "Pago"
    "inadimplencia": 892000.0, // SUM(totalAmount) from payments status "Vencido"+"Pendente"
    "aging": {                 // Delinquency by days past expiration
      "d90": 400000, "d180": 300000, "maior180": 192000, "total": 892000
    },
    "custos": 8500000.0,       // UAU Pago where bloco="O&M"
    "endividamento": 15100000, // UAU Pago where bloco="Financiamento"
    "capex": 0,                // UAU Pago where bloco="CAPEX"
    "custosTotal": 23600000,   // UAU total Pago all blocos
    "serie": [                 // Monthly time series
      {"mes": "2025-10", "faturado": 40840, "compensadaMWh": 52.3, "recebido": 5000, "emAberto": 35000},
      {"mes": "2025-11", "faturado": 484931, ...},
      ...
    ]
  },
  "previsto": {
    "injetadaMWh": 35100.0,
    "injetadoRS": 19600000.0,   // Calculated: SUM(injetada * tarifa) per usina/month
    "compensadaMWh": 28000.0,
    "faturado": 12000000.0,     // From planilha metric "Valor faturado (R$)" status PROJETADO
    "recebido": 10300000.0,     // From planilha metric "Faturamento recebido (R$)" status PROJETADO
    "inadimplencia": 0,         // From planilha aging buckets (d90+d180+maior180)
    "custos": 1300000.0,        // UAU Pagar where bloco="O&M"
    "custosMediaRealizada": 1700000, // (UAU Pago O&M) / nMesesReal — for statistical projection
    "endividamento": 5000000,   // UAU Pagar where bloco="Financiamento"
    "serie": [                  // Monthly from planilha PROJETADO
      {"mes": "2024-01", "faturado": 300000, "recebido": 250000, ...},
      ...
    ]
  },
  "custosBlocos": {             // UAU cost breakdown by bloco and status
    "O&M": {"Pago": 8500000, "Pagar": 1300000, "Projetado": 0},
    "Financiamento": {"Pago": 15100000, "Pagar": 5000000},
    "CAPEX": {"Pago": 0, "Pagar": 0},
    ...
  },
  "energiaSerie": [             // From planilha: REALIZADO preferred over PROJETADO when both exist
    {"mes": "2024-01", "Energia Injetada (MWh)": 500, "Energia Compensada (MWh)": 380, "Estoque (MWh)": 120},
    ...
  ]
}
```

**How each field is calculated:**

| Field | Source | SQL Logic |
|-------|--------|-----------|
| `real.faturado` | CMU invoices | `SUM(totalAmount) WHERE energyMeterInvoiceStatus = 'Faturado'` |
| `real.recebido` | CMU payments | `SUM(totalAmount) WHERE energyMeterPaymentStatus = 'Pago'` |
| `real.inadimplencia` | CMU payments | `SUM(totalAmount) WHERE energyMeterPaymentStatus IN ('Vencido','Pendente')` |
| `real.compensadaMWh` | CMU invoices | `SUM(compensatedEnergy) / 1000` (kWh → MWh) |
| `real.custos` | UAU desembolso | `aggDesembolso()` → `blocos['O&M'].Pago` |
| `real.endividamento` | UAU desembolso | `aggDesembolso()` → `blocos['Financiamento'].Pago` |
| `previsto.faturado` | Planilha | `SUM(valor) WHERE status='PROJETADO' AND metrica='Valor faturado (R$)'` |
| `previsto.recebido` | Planilha | `SUM(valor) WHERE status='PROJETADO' AND metrica='Faturamento recebido (R$)'` |
| `previsto.injetadoRS` | Planilha | Cross-join: `SUM(injetada.valor * tarifa.valor)` per usina/month |
| `previsto.custos` | UAU desembolso | `aggDesembolso()` → `blocos['O&M'].Pagar` |

**Cluster filtering logic:**
- CMU queries: `WHERE m.data->>'organization' IN (SELECT organization FROM fin3_org_cluster WHERE cluster = $1)`
- Planilha queries: `WHERE cluster = $1`
- UAU queries: `WHERE empresa = ANY(empresaList)` (from `spe_estrutura WHERE cluster = $1`)

**Fonte filtering logic:**
- Only applies to planilha queries: `WHERE fonte = $1`
- CMU and UAU are NOT filtered by fonte

---

### 4.3 `GET /api/fin3/inadimplencia` — Delinquency Breakdowns

**Response:**
```json
{
  "real": {
    "aging": {"d90": 400000, "d180": 300000, "maior180": 192000, "total": 892000},
    "porConcessionaria": [{"label": "CEMIG", "total": 500000}, ...],
    "porTipo": [{"label": "Residencial", "total": 600000}, {"label": "Comercial", ...}],
    "porCluster": [{"label": "CLUSTER VII", "total": 300000}, {"label": "(não mapeado)", ...}],
    "porRegiao": [{"label": "MG", "total": 700000}, {"label": "GO", ...}],
    "porFaixa": [
      {"label": "Até R$ 200", "total": 50000, "qtd": 500},
      {"label": "R$ 201–500", "total": 120000, "qtd": 350},
      {"label": "R$ 501–1.000", "total": 200000, "qtd": 280},
      {"label": "R$ 1.001–5.000", "total": 400000, "qtd": 150},
      {"label": "Acima de R$ 5.000", "total": 122000, "qtd": 10}
    ],
    "total": 892000
  },
  "d15": [
    {"mes": "2025-10", "recebido_d15": 30000, "inadimplente_d15": 10840},
    {"mes": "2025-11", "recebido_d15": 400000, "inadimplente_d15": 84931},
    ...
  ],
  "previsto": {
    "d90": 4608320, "d180": 3118552, "maior180": 6534113, "total": 14260985
  }
}
```

**D15 model**: For each `referenceMonth`, the cutoff date = 15th of the following month. A payment is "recebido_d15" if `paymentStatus = 'Pago'` AND `paymentDate <= cutoff`. Otherwise it's "inadimplente_d15". Excludes Cancelado/Errado/Simulacao.

**Aging calculation**: `dias = CURRENT_DATE - expirationDate`. Buckets: ≤90d, 91-180d, >180d. Only payments with status IN ('Vencido', 'Pendente').

---

### 4.4 `GET /api/fin3/faturamento` — Billing Breakdowns

**Response:**
```json
{
  "real": {
    "porConcessionaria": [{"label": "CEMIG", "total": 8000000}, ...],
    "porTipo": [{"label": "Residencial", "total": 7000000}, ...],
    "porCluster": [{"label": "CLUSTER VII", "total": 3268400}, {"label": "(sem)", ...}]
  },
  "previsto": {
    "porCluster": [{"label": "CLUSTER I", "total": 12000000}, ...],
    "porFonte": [{"label": "CGH", "total": 101000000}, ...]
  }
}
```

Real uses CMU invoices with status "Faturado". Previsto uses planilha metric "Valor faturado (R$)" with status PROJETADO.

---

### 4.5 `GET /api/fin3/custos` — UAU Cost Data

**Response:**
```json
{
  "totais": {"total": 23600000, "pago": 23600000, "pagar": 6300000, "projetado": 0, "financiamento": 15100000, "servicoDivida": 2000000},
  "blocos": {
    "O&M": {"Pago": 8500000, "Pagar": 1300000},
    "Financiamento": {"Pago": 15100000, "Pagar": 5000000},
    "CAPEX": {"Pago": 0, "Pagar": 0},
    ...
  },
  "porCategoria": [{"categoria": "Encargos de Transmissão", "total": 4000000}, ...],
  "topObras": [{"obra": "CGH NOVA UNIÃO - OPERAÇÃO", "total": 3000000}, ...],
  "serieMensal": [{"mes": "2025-01", "O&M": 400000, "Financiamento": 600000, ...}],
  "porCluster": [{"label": "CLUSTER I", "total": 23600000, "pago": 23600000, "endividamento": 15100000}],
  "cards": {
    "valorPago": 23600000,
    "valorTotal": 29900000,
    "endividamento": 15100000,
    "dataFimPrevista": "2028-06-30"
  }
}
```

Uses `aggDesembolso()` function which queries `uau_desembolso` table. Groups by bloco (O&M, Financiamento, CAPEX, Aportes, Impostos).

---

### 4.6 `GET /api/fin3/usinas` — Plant Connection Table

**Query**: `?cluster=CLUSTER I` (optional)

**Response:**
```json
[
  {
    "usina": "CGH NOVA UNIÃO",
    "cluster": "CLUSTER I",
    "fonte": "CGH",
    "concessionaria": "CEMIG",
    "potencia": 1.0,
    "operando": true,
    "fase": "OPERAÇÃO",           // "OPERAÇÃO" | "IMPLANTAÇÃO" | "DESENVOLVIMENTO"
    "dataFimPrevista": "2025-12-31",
    "prazoDias": -167              // negative = overdue
  },
  ...
]
```

Phase is inferred: `operando=true` → "OPERAÇÃO", else checks UAU obra description for "IMPLANTAÇÃO", fallback "DESENVOLVIMENTO". `dataFimPrevista` comes from UAU `obra_dt_fim`.

---

### 4.7 `GET /api/fin3/org-cluster` — Read Organization Mapping

**Response:**
```json
[
  {"organization": "Consórcio Energia Livre", "cluster": null, "fonte": null, "ativas": 9306, "total": 9349, "faturado": 0},
  {"organization": "Consórcio GV VII", "cluster": "CLUSTER VII", "fonte": null, "ativas": 922, "total": 1607, "faturado": 1536055.20},
  ...
]
```

Returns ALL CMU organizations with LEFT JOIN to `fin3_org_cluster`. Includes active meter count and total faturado (invoices with status "Faturado").

### 4.8 `POST /api/fin3/org-cluster` — Save Organization Mapping

**Body:** `{"organization": "Consórcio Raul Soares", "cluster": "CLUSTER III", "fonte": "CGH"}`

Upserts into `fin3_org_cluster`. Invalidates fin3 cache.

### 4.9 `GET /api/fin3/planilha-versao` — Last Upload Info

Returns the most recent planilha upload metadata, or `null`.

### 4.10 `POST /api/fin3/upload-resumo` — Upload New Planilha

Multipart form: `file` (xlsx), `versao` (text, optional). TRUNCATES `fin3_resumo` and re-ingests.

---

## 5. Frontend Structure

### 5.1 State & Data Flow

```
User clicks "Carregar"
  → 5 parallel fetches: /resumo, /inadimplencia, /faturamento, /custos, /usinas
  → State: resumo, inad, fat, custos, usinas
  → All panels render from these 5 state objects
```

**Controls:**
- Toggle: Grupo / Cluster
- Dropdown: Cluster (from dims.clusters)
- Dropdown: Fonte (optional, from dims.fontes)
- Text fields: Mes inicial (mm/yyyy), Mes final (mm/yyyy)
- Button: "Carregar"
- Button: "Atualizar Planilha" (xlsx upload with optional version)
- Button: "Mapeamento Org→Cluster" (opens mapping dialog)
- Chip: shows planilha version and date

### 5.2 Page Sections (8 blocks)

#### Block 1 — REALIZADO (5 KPI cards)
| Card | Value | Source |
|------|-------|--------|
| Compensado | `real.compensadaMWh` | CMU invoices (kWh/1000) |
| Faturado | `real.faturado` | CMU invoices "Faturado" |
| Recebido | `real.recebido` | CMU payments "Pago" |
| Inadimplencia | `real.inadimplencia` | CMU payments "Vencido"+"Pendente" |
| Custos O&M | `real.custos` | UAU Pago O&M. Sub: "Endividamento R$ X" |

#### Block 2 — PREVISTO (5 KPI cards)
| Card | Value | Source |
|------|-------|--------|
| Injetado (R$) | `previsto.injetadoRS` | Planilha (injetada × tarifa). Sub: "X GWh" |
| Faturado | `previsto.faturado` | Planilha "Valor faturado" PROJETADO |
| Recebido | `previsto.recebido` | Planilha "Faturamento recebido" PROJETADO |
| Inadimplencia | `previsto.inadimplencia` | Planilha aging buckets. Shows "n/d" when 0 |
| Custos O&M | `previsto.custos` | UAU Pagar O&M. Sub: "Media realizada R$ X/mes" |

#### Block 3 — CRUZAMENTO CMU × UAU
- **Resultado de Caixa (Oper.)**: `recebido - custos O&M`. Green if positive, red if negative.
- **DSCR (Cobertura Divida)**: `(recebido - O&M) / servicoDivida`. Shows "n/d" when no debt data.
- **BarChart**: Monthly series with bars for Faturado CMU, Recebido CMU, Desembolso O&M UAU.

#### Block 4 — ENERGIA (ComposedChart)
- Line: Energia Injetada (MWh) from planilha
- Bar: Energia Compensada (MWh) from planilha
- Line: Estoque (MWh) from planilha
- Uses REALIZADO when available, falls back to PROJETADO (no duplication in overlap months)

#### Block 5 — INADIMPLENCIA × TEMPO
- **ToggleButtonGroup**: Aging | Regiao | Tipo | Concess. | Faixa R$
  - Aging: HBars with d90/d180/maior180 (real) + separate section for previsto
  - Regiao: HBars by state (MG, GO, BA, etc.)
  - Tipo: HBars by class (Residencial, Comercial, etc.)
  - Concess.: HBars by distributor
  - Faixa R$: HBars by value bucket
- **D15 Chart**: Stacked BarChart with `recebido_d15` (green) and `inadimplente_d15` (red) per month

#### Block 6 — FATURAMENTO × INADIMPLENCIA MENSAL (ComposedChart)
- Bars: `faturado` per month
- Line: `recebido` per month
- Line: `emAberto` per month
- From `real.serie`

#### Block 7 — FATURAMENTO POR DIMENSAO
- **ToggleButtonGroup**: Cluster | Fonte | Concessionaria | Tipo UC
  - Cluster/Fonte: uses `fat.previsto.porCluster` / `porFonte`
  - Concessionaria/Tipo: uses `fat.real.porConcessionaria` / `porTipo`
- Renders as HBars

#### Block 8 — CUSTOS + CONEXAO GERENCIAL
- **Custos por cluster**: HBars from `custos.porCluster`
- **Cards**: Valor Pago, Valor Total, Endividamento, Data Fim Prevista
- **Usinas table**: DataGrid with columns: Usina, Cluster, Fonte, Concessionaria, Potencia, Fase (colored chip), Data Fim, Prazo (days)
- Phase colors: OPERAÇÃO=#22c55e, IMPLANTAÇÃO=#fbbf24, DESENVOLVIMENTO=#38bdf8

### 5.3 Organization Mapping Dialog

Full-screen-width dialog (`maxWidth="lg"`) with:
- **4 summary cards**: Mapeadas (X/28), Sem Cluster (Y), UCs Invisiveis (Z), Faturado Perdido (R$ W)
- **Create new cluster**: text field + button. New clusters appear in dropdowns immediately
- **Unmapped section** (red border): table with org name, UCs ativas, faturado CMU, cluster dropdown
- **Mapped section** (green border): same table, allows editing
- Auto-saves on dropdown change via `POST /api/fin3/org-cluster`

---

## 6. Helper Functions (server.js)

| Function | Purpose |
|----------|---------|
| `mmYyyyToDate(s)` | "01/2025" → "2025-01-01" (planilha/UAU date format) |
| `mmYyyyToCmu(s)` | "01/2025" → "2025-01-01T00:00:00" (CMU referenceMonth format) |
| `cmuFilter({cluster,start,end}, refCol, orgCol)` | Builds WHERE clause for CMU queries with optional cluster + date range |
| `fin3Previsto({cluster,fonte,start,end})` | Aggregates planilha PROJETADO data. Returns totals + monthly series. Also calculates injetadoRS (injetada × tarifa cross-join) |
| `fin3RealCore({cluster,start,end})` | Aggregates CMU invoices (Faturado) + payments (Pago/Vencido/Pendente). Returns totals + monthly series |
| `fin3RealAging({cluster})` | Calculates delinquency aging buckets from CMU payments |
| `fin3EnergiaSerie({cluster,fonte,start,end})` | Builds energy time series from planilha. Prefers REALIZADO over PROJETADO per (usina, metrica, month) |
| `clusterEmpresas(cluster)` | Returns array of empresa codes from `spe_estrutura` for a given cluster |
| `aggDesembolso({empresaList,startDate,endDate})` | Aggregates UAU `uau_desembolso` by bloco/status. Returns totals, series, topObras, porCategoria |

---

## 7. Important Business Rules

1. **CMU invoice status "Faturado" only** counts as billed revenue. "Disponivel" (draft), "Cancelado", "Reprovado", "Retido" are excluded.

2. **CMU payment status "Pago"** = received. "Vencido" + "Pendente" = delinquent. "Cancelado", "Errado", "Simulacao" are excluded.

3. **Fonte filter does NOT apply to CMU data** — only to planilha queries. CMU organizations don't have a fonte attribute.

4. **UAU TotalLiq** is the correct monetary field (NOT Total, which is quantity for status "Projetado").

5. **UAU bloco classification**: each insumo maps to a category via `plano_contas` / `insumo_map.json`, then categories map to blocos (O&M, Financiamento, CAPEX, etc.).

6. **Energy data (injetada/estoque)** only comes from planilha — CMU does not have generation data. CMU only has `compensatedEnergy` on invoices.

7. **D15 cutoff model**: payment considered "received on time" if paid by the 15th of the month following the referenceMonth.

---

## 8. Setup & Running

### First-time setup (after CMU sync and UAU ingest are done):

```bash
# 1. Ingest planilha
cd sync-service
node ingest_resumo_graficos.js
# or: npm run seed:resumo

# 2. Start server
node server.js  # fin3_org_cluster table auto-created on boot

# 3. Start frontend
cd .. && npm run dev

# 4. Open http://localhost:5173/financeiro-3
# 5. Click "Mapeamento Org→Cluster" to map CMU organizations to clusters
# 6. Click "Carregar" to load data
```

### Updating planilha data:
- Via UI: click "Atualizar Planilha" button, select xlsx file
- Via CLI: `cd sync-service && node ingest_resumo_graficos.js path/to/new_file.xlsx`

---

## 9. Known Limitations & Notes

- **CMU data starts ~2025-10** with significant volume. Before that, only planilha has data.
- **Planilha usinas ≠ CMU organizations**: different naming (e.g., "CGH NOVA UNIAO" vs "Consorcio GV I"). No automatic cross-reference between them.
- **org_cluster mapping is manual**: user must assign each CMU org to a cluster. Without mapping, CMU revenue is invisible in cluster views.
- **Sync freshness**: CMU data depends on `sync_v2.js` runs. Check `sync_control` table for last sync date.
- **Cache**: 5-minute TTL. After mapping changes or planilha upload, cache is invalidated automatically.
