# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MISSAO DO PROXIMO AGENTE

**Migrar este projeto de Neon Postgres + Express local para Supabase + novo frontend.**

O backend atual (Express em `sync-service/server.js`) sera substituido pelo **Supabase client (`@supabase/supabase-js`)** chamando diretamente o Postgres do Supabase. O frontend sera refeito em outro padrao mas com **funcionalidades identicas** as atuais.

O sync de dados (`sync-service/sync_v2.js`) continuara rodando como script Node.js, apenas apontando o `DATABASE_URL` para o Supabase Postgres.

---

## Project Overview

Sistema de **Power Analytics** para a **Solatio Energia Livre** — empresa de energia solar por geracao distribuida (GD). Monitora usinas, medidores de consumo (UCs), faturas, pagamentos e eficiencia operacional.

**Escala**: ~8.000 medidores, ~20.000 faturas, ~14.000 pagamentos, ~15.000 bills.

## Arquitetura Atual (antes da migracao)

```
API CMU Solatio (REST externa)
        |
  [sync_v2.js]  -->  Neon Postgres (JSONB)
                           |
                     [Express :3001]  <--  server.js (5 rotas)
                           |
                     [React SPA (Vite)]
```

## Arquitetura Alvo (apos migracao)

```
API CMU Solatio (REST externa)
        |
  [sync_v2.js]  -->  Supabase Postgres (mesmo schema JSONB)
                           |
                     [@supabase/supabase-js]  <--  chamadas diretas do frontend
                           |
                     [React SPA (Vite) — novo padrao de UI]
```

**O que muda**:
- `server.js` (Express) **deixa de existir** — as queries SQL que estao nele devem ser convertidas em chamadas via Supabase client ou RPC functions
- Frontend chama Supabase diretamente via `supabase.rpc()` ou `supabase.from().select()`
- `sync_v2.js` continua igual, apenas troca `DATABASE_URL` no `.env`

**O que NAO muda**:
- Schema do banco (JSONB) — identico
- Funcionalidades do frontend — identicas
- Script de sync — identico

---

## TODAS AS TABELAS DO BANCO (schema JSONB)

Padrao: cada tabela tem coluna `data` (JSONB) com o payload completo da API CMU. Queries usam operadores `->>` e `->`.

### `cmu_energy_meters` — Medidores/Clientes (~8.000)

```sql
CREATE TABLE cmu_energy_meters (
    id          INT PRIMARY KEY,  -- energyMeterID da API
    name        TEXT,              -- extraido do JSONB para busca
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos JSONB usados pelo frontend**:
| Campo | Tipo | Uso |
|---|---|---|
| `energyMeterID` | int | ID unico |
| `name` | string | Nome do cliente |
| `meterNumber` | string | Numero da instalacao |
| `customerNumber` | string | Numero do cliente na concessionaria |
| `registrationNumber` | string | CPF/CNPJ |
| `energyMeterStatus` | string | "Ativa", "Desconectada", "Cancelada" |
| `contractConsumption` | float | kWh contratado (meta mensal) |
| `discountEstimative` | float | % desconto no contrato |
| `expiredPaymentsTotalAmount` | float | Valor total vencido (R$) |
| `pendingPayments` | int | Qtd de pagamentos pendentes |
| `address` | string | Endereco completo |
| `addressCity` | string | Cidade |
| `addressState` | string | UF (MG, GO, BA...) |
| `addressStreet` | string | Logradouro |
| `addressNumber` | string | Numero |
| `addressDistrict` | string | Bairro |
| `addressPostalCode` | string | CEP |
| `emails` | string | **SEMPRE VAZIO** — nao usar |
| `phones` | string | **SEMPRE VAZIO** — nao usar |
| `connection` | string | Monofasico/Bifasico/Trifasico |
| `class` | string | Residencial/Comercial/Rural/Industrial |
| `tariffSubgroup` | string | B1/B2/B3 |
| `contractStatus` | string | Status do contrato |
| `paymentMethod` | string | Boleto/Cartao/PIX |
| `billingMode` | string | Modo de cobranca |
| `organization` | string | Organizacao |
| `prospector` | string | Nome do parceiro (campo plano) |
| `distributor` | object | `{ alias, ... }` — dados da concessionaria |
| `voucher` | object | `{ code, prospector: { name, contactEmail, phone, userID }, ... }` |
| `customer` | object | `{ userID, email, phone, ... }` — perfil de acesso |

### `cmu_energy_meter_invoices` — Faturas Solatio (~20.000)

```sql
CREATE TABLE cmu_energy_meter_invoices (
    id              INT PRIMARY KEY,  -- energyMeterInvoiceID
    energy_meter_id INT,              -- FK para cmu_energy_meters
    data            JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos JSONB usados**:
| Campo | Tipo | Uso |
|---|---|---|
| `energyMeterInvoiceID` | int | ID |
| `energyMeterID` | int | FK medidor |
| `referenceMonth` | string (ISO date) | Mes de referencia, sempre 1o dia (ex: "2025-01-01T00:00:00") |
| `consumedEnergy` | float | kWh consumido pelo cliente |
| `compensatedEnergy` | float | kWh gerado/injetado pela usina solar |
| `totalAmount` | float | Valor da fatura Solatio (R$) |
| `energyMeterInvoiceStatus` | string | **"Faturado" / "Disponível" / "Cancelado" / "Retido" / "Reprovado"** |
| `energyInvoiceFile` | string (URL) | PDF da fatura no S3 |
| `energyMeterBillID` | int | FK para bill da concessionaria |
| `statusDescription` | string | Historico textual |
| `economyValue` | float | Economia gerada (R$) |
| `registrationNumber` | string | CPF/CNPJ |
| `organization` | string | Organizacao |

**IMPORTANTE**: NAO existe status "Liquidado" nem "Pendente" nas faturas.

### `cmu_energy_meter_bills` — Contas da Concessionaria (~15.000)

```sql
CREATE TABLE cmu_energy_meter_bills (
    id              INT PRIMARY KEY,  -- energyMeterBillID
    energy_meter_id INT,              -- FK para cmu_energy_meters
    data            JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos JSONB usados**:
| Campo | Tipo | Uso |
|---|---|---|
| `energyMeterBillID` | int | ID |
| `energyMeterID` | int | FK medidor |
| `referenceMonth` | string | Mes ref |
| `totalAmount` | float | Valor da conta (R$) |
| `energyBillFile` | string (URL) | PDF da conta |
| `energyBalancePeakTime` | float | Saldo energia horario ponta (kWh) |
| `energyBalanceOffPeakTime` | float | Saldo energia fora ponta (kWh) |
| `consumedEnergyAmountOffPeakTime` | float | Consumo fora ponta |
| `injectedEnergyAmountOffPeakTime` | float | Energia injetada pela usina |

### `cmu_energy_meter_payments` — Pagamentos/Boletos (~14.000)

```sql
CREATE TABLE cmu_energy_meter_payments (
    id              INT PRIMARY KEY,  -- energyMeterPaymentID
    energy_meter_id INT,
    data            JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos JSONB usados**:
| Campo | Tipo | Uso |
|---|---|---|
| `energyMeterPaymentID` | int | ID |
| `energyMeterID` | int | FK medidor |
| `energyMeterInvoiceID` | int | FK fatura |
| `referenceMonth` | string | Mes ref |
| `totalAmount` | float | Valor do boleto (R$) |
| `paidAmount` | float | Valor efetivamente pago |
| `paymentDate` | string | Data do pagamento |
| `expirationDate` | string | Vencimento |
| `energyMeterPaymentStatus` | string | **"Pago" / "Pendente" / "Vencido" / "Errado" / "Cancelado" / "Simulação"** |
| `paymentLinkURL` | string (URL) | Link do boleto Iugu |
| `paymentMethod` | string | Boleto/Cartao/PIX |

**IMPORTANTE**: NAO existe status "Liquidado" nos pagamentos. O correto eh "Pago".

### `cmu_contacts` — Contatos/Responsaveis (~4.000)

```sql
CREATE TABLE cmu_contacts (
    id          INT PRIMARY KEY,  -- contactID
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Campos: `contactID`, `name`, `function` (Titular/Financeiro/Representante Legal), `email`, `phone`, `comment` (pode conter CPF).
**NAO tem vinculo direto com energyMeterID.**

### `cmu_customers` — Perfis de Acesso

```sql
CREATE TABLE cmu_customers (
    id          INT PRIMARY KEY,  -- userID
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Vinculo: `EnergyMeter.data.customer.userID → Customer.id`

### `cmu_prospectors` — Parceiros Comerciais

```sql
CREATE TABLE cmu_prospectors (
    id          INT PRIMARY KEY,  -- userID
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Vinculo: `EnergyMeter.data.voucher.prospector.userID → Prospector.id`

### `cmu_vouchers` — Cupons/Contratos

```sql
CREATE TABLE cmu_vouchers (
    id          INT PRIMARY KEY,  -- voucherID
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Vinculo: `EnergyMeter.data.voucherID → Voucher.id`

### `sync_control` — Controle do Sync

```sql
CREATE TABLE sync_control (
    endpoint_name          TEXT PRIMARY KEY,
    last_page_processed    INT DEFAULT 1,
    last_sync_completed_at TIMESTAMPTZ,
    sync_mode              TEXT DEFAULT 'full',
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);
```

Endpoints registrados: EnergyMeters, Contacts, Customers, Prospectors, Vouchers, EnergyMeterBills, EnergyMeterInvoices, EnergyMeterPayments.

---

## RELACOES ENTRE ENTIDADES

```
EnergyMeter (UC/Cliente)
  |
  |-- 1:N --> EnergyMeterInvoice (Fatura Solatio)
  |               |
  |               |-- N:1 --> EnergyMeterBill (Conta Concessionaria)
  |
  |-- 1:N --> EnergyMeterPayment (Boleto/Pagamento)
  |               |
  |               |-- N:1 --> EnergyMeterInvoice (via energyMeterInvoiceID)
  |
  |-- N:1 --> Customer (data.customer.userID)
  |-- N:1 --> Voucher (data.voucherID)
                  |
                  |-- N:1 --> Prospector (voucher.prospector.userID)

Contact (sem vinculo direto — cruzamento possivel por CPF no campo comment)
```

- `referenceMonth` eh a chave de cruzamento temporal entre faturas, contas e pagamentos
- `energyMeterBillID` dentro da fatura vincula fatura ↔ conta concessionaria

---

## QUERIES SQL QUE O FRONTEND USA (converter para Supabase)

Estas sao as queries exatas do `server.js` que devem virar chamadas Supabase (via `supabase.rpc()`, views, ou queries diretas).

### 1. Listagem de Medidores (pagina Clientes)

```sql
-- Busca paginada com busca global e filtro de status
SELECT data FROM cmu_energy_meters
WHERE 1=1
  AND (data->>'name' ILIKE '%termo%' OR data->>'registrationNumber' ILIKE '%termo%'
       OR data->>'meterNumber' ILIKE '%termo%' OR data->>'customerNumber' ILIKE '%termo%')
  AND data->>'energyMeterStatus' = 'Ativa'  -- opcional
ORDER BY data->>'name' ASC
LIMIT 25 OFFSET 0;

-- Contagem total (para paginacao)
SELECT COUNT(*) FROM cmu_energy_meters WHERE ... (mesmos filtros);
```

**Retorna**: `{ data: [...medidores], total: int }`

### 2. Faturas de um Medidor (modal do cliente)

```sql
SELECT
  i.data as invoice_obj,
  b.data as bill_obj
FROM cmu_energy_meter_invoices i
LEFT JOIN cmu_energy_meter_bills b
  ON (i.data->>'energyMeterBillID')::int = b.id
WHERE (i.data->>'energyMeterID')::int = $1
ORDER BY (i.data->>'referenceMonth') DESC
```

**Pos-processamento no backend** (manter no frontend):
```javascript
const formattedData = result.rows.map(row => ({
  ...row.invoice_obj,
  energyMeterBill: row.bill_obj,
  energyBalance: row.bill_obj
    ? (parseFloat(row.bill_obj.energyBalanceOffPeakTime || 0) + parseFloat(row.bill_obj.energyBalancePeakTime || 0))
    : null
}));
```

### 3. Pagamentos de um Medidor (modal do cliente)

```sql
SELECT p.data as payment_obj
FROM cmu_energy_meter_payments p
WHERE (p.data->>'energyMeterID')::int = $1
ORDER BY (p.data->>'referenceMonth') DESC
```

### 4. Dashboard Stats (13 queries em paralelo)

**Queries sem filtro de periodo** (estado atual dos medidores):

```sql
-- Medidores por status
SELECT data->>'energyMeterStatus' as status, COUNT(*)::int as count
FROM cmu_energy_meters GROUP BY 1 ORDER BY 2 DESC;

-- Inadimplencia
SELECT COUNT(*)::int as count, COALESCE(SUM((data->>'expiredPaymentsTotalAmount')::numeric), 0) as total
FROM cmu_energy_meters WHERE (data->>'expiredPaymentsTotalAmount')::numeric > 0;

-- Medidores por estado
SELECT data->>'addressState' as state, COUNT(*)::int as count
FROM cmu_energy_meters WHERE data->>'addressState' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

-- Medidores por distribuidora
SELECT data->'distributor'->>'alias' as distributor, COUNT(*)::int as count
FROM cmu_energy_meters WHERE data->'distributor'->>'alias' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

-- Medidores por classe
SELECT data->>'class' as class, COUNT(*)::int as count
FROM cmu_energy_meters WHERE data->>'class' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

-- Top 10 parceiros
SELECT data->'voucher'->'prospector'->>'name' as partner, COUNT(*)::int as count
FROM cmu_energy_meters WHERE data->'voucher'->'prospector'->>'name' IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

**Queries COM filtro de periodo** (`referenceMonth >= startDate AND referenceMonth <= endDate`):

```sql
-- Receita liquidada (pagamentos confirmados)
SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0) as total
FROM cmu_energy_meter_payments
WHERE data->>'energyMeterPaymentStatus' = 'Pago'
  AND data->>'referenceMonth' >= $1  -- startDate (opcional)
  AND data->>'referenceMonth' <= $2; -- endDate (opcional)

-- Faturas por status
SELECT data->>'energyMeterInvoiceStatus' as status, COUNT(*)::int as count,
       COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total
FROM cmu_energy_meter_invoices
WHERE data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2
GROUP BY 1 ORDER BY 2 DESC;

-- Pagamentos por status
SELECT data->>'energyMeterPaymentStatus' as status, COUNT(*)::int as count,
       COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total
FROM cmu_energy_meter_payments
WHERE data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2
GROUP BY 1 ORDER BY 2 DESC;

-- Faturamento mensal (grafico de barras)
SELECT data->>'referenceMonth' as month,
       COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as revenue,
       COUNT(*)::int as invoice_count
FROM cmu_energy_meter_invoices
WHERE data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')
  AND data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2
GROUP BY 1 ORDER BY 1 DESC LIMIT 12;  -- LIMIT 12 so quando sem filtro de periodo

-- Energia consumida/compensada
SELECT COALESCE(SUM((data->>'consumedEnergy')::numeric), 0)::float as total_consumed,
       COALESCE(SUM((data->>'compensatedEnergy')::numeric), 0)::float as total_compensated
FROM cmu_energy_meter_invoices
WHERE data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')
  AND data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2;

-- Economia gerada
SELECT COALESCE(SUM((data->>'economyValue')::numeric), 0)::float as total_economy
FROM cmu_energy_meter_invoices
WHERE data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')
  AND data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2;

-- Custo concessionaria
SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total_bills
FROM cmu_energy_meter_bills
WHERE data->>'referenceMonth' >= $1 AND data->>'referenceMonth' <= $2;
```

### 5. Inadimplentes (pagina Inadimplencia)

```sql
-- Listagem paginada ordenada por maior divida
SELECT data FROM cmu_energy_meters
WHERE (data->>'expiredPaymentsTotalAmount')::numeric > 0
  AND (data->>'name' ILIKE '%termo%' OR data->>'meterNumber' ILIKE '%termo%'
       OR data->>'registrationNumber' ILIKE '%termo%')  -- busca opcional
ORDER BY (data->>'expiredPaymentsTotalAmount')::numeric DESC
LIMIT 20 OFFSET 0;

-- Agregados (KPIs)
SELECT COUNT(*)::int as count,
       COALESCE(SUM((data->>'expiredPaymentsTotalAmount')::numeric), 0)::float as total_amount,
       COALESCE(SUM((data->>'pendingPayments')::int), 0)::int as total_pending
FROM cmu_energy_meters
WHERE (data->>'expiredPaymentsTotalAmount')::numeric > 0
  AND ... (mesmos filtros);
```

---

## FUNCIONALIDADES DO FRONTEND (replicar identicas)

### Pagina: Dashboard (`/`)
- 8 KPIs em 2 linhas de 4
- Filtro de periodo (2 calendarios mes De/Ate, auto-apply)
- Grafico de barras: Faturamento Mensal (12 meses)
- Pizza: Medidores por Status
- Pizza: Distribuicao por Estado
- Pizza: Medidores por Distribuidora
- Pizza: Classe de Consumo
- Ranking: Top 10 Parceiros
- Tabela: Faturas por Status
- Tabela: Pagamentos por Status
- Ver detalhes em `docs/DASHBOARD_FIELDS.md`

### Pagina: Clientes (`/clientes`)
- Tabela paginada server-side (DataGrid) com colunas: Instalacao, Cliente, Cidade, UF, Status, Inadimplente
- Barra de busca (Nome, CPF, Instalacao) + filtro dropdown Status UC (Ativa/Desconectada/Cancelada)
- Ao clicar numa linha abre **Modal fullscreen** com:
  - 6 KPIs: Consumo Contratado, Consumo Medio, Eficiencia Usina, Economia, Saldo Energia, Inadimplente
  - DataGrid de Faturas (historico completo) com colunas: Mes Ref, Consumo (kWh + % vs meta), Gerado (kWh), Saldo (kWh), Valor Solatio, Economia, Status Fatura, Status Pagamento, Docs (PDF fatura + PDF conta + link boleto)
  - 4 cards informativos: Unidade, Localizacao, Contato, Contrato

**Calculos no frontend** (nao vem do banco):
- Consumo Medio = media de `consumedEnergy` das faturas validas
- Eficiencia Usina = `(compensatedEnergy / consumedEnergy) * 100` do ultimo mes
- Saldo Energia = `energyBalanceOffPeakTime + energyBalancePeakTime` da bill mais recente
- Consumo vs Meta = `((consumedEnergy / contractConsumption) - 1) * 100`

**Fallbacks de dados** (campos vazios no meter):
- Email: tenta `emails` → `customer.email` → `voucher.prospector.contactEmail`
- Telefone: tenta `phones` → `customer.phone` → `voucher.prospector.phone`
- Endereco: tenta `address` → monta de `addressStreet + addressNumber + addressDistrict`

### Pagina: Inadimplencia (`/inadimplencia`)
- Barra de busca (Nome, CPF, Instalacao) + filtro periodo (De/Ate)
- 4 KPIs: Total Inadimplente, Medidores Devedores, Boletos Pendentes, Ticket Medio
- DataGrid paginada server-side: Cliente, Instalacao, UF, Cidade, Valor Vencido, Pendencias, Status UC, Parceiro, Organizacao

### Pagina: Rateio (`/rateio`)
- **NAO FUNCIONAL** — endpoint `/api/dados-rateio` nao existe
- Pagina de distribuicao de clientes por usinas (mockada com 3 usinas fixas)
- Se for reimplementar, precisa criar endpoint que retorne medidores com consumo medio

### Layout
- Sidebar fixa esquerda (230px) com navegacao: Dashboard, Clientes, Inadimplencia, Rateio
- Tema escuro na sidebar (`#0d1b2a`), conteudo em `#f4f6f8`

---

## COMO CONECTAR O SUPABASE

### 1. Criar tabelas no Supabase

Rodar os CREATE TABLE acima no SQL Editor do Supabase. Sao 9 tabelas no total.

### 2. Popular dados

Trocar `DATABASE_URL` no `.env` para a connection string do Supabase Postgres e rodar:
```bash
cd sync-service && node sync_v2.js --full
```

Demora ~3-5h (8.000+ medidores, 20.000+ faturas, etc). O script cria as tabelas automaticamente se nao existirem.

### 3. Frontend — instalar Supabase client

```bash
npm install @supabase/supabase-js
```

### 4. Configurar client

```javascript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,     // https://xxx.supabase.co
  process.env.VITE_SUPABASE_ANON_KEY // anon key publica
)
```

### 5. Converter queries

**Opcao A — RPC functions** (recomendado para queries complexas como dashboard stats):

Criar funcoes SQL no Supabase e chamar via `supabase.rpc('dashboard_stats', { start_date, end_date })`.

**Opcao B — Queries diretas** (para CRUD simples):

```javascript
// Listar medidores paginados
const { data, count } = await supabase
  .from('cmu_energy_meters')
  .select('data', { count: 'exact' })
  .ilike('data->>name', `%${search}%`)
  .order('data->>name')
  .range(offset, offset + pageSize - 1)
```

**IMPORTANTE**: Queries com JOIN (faturas + bills), ILIKE em multiplos campos, ou agregacoes complexas sao melhor servidas por **RPC functions** (funcoes SQL no Supabase) do que pelo query builder.

### 6. RLS (Row Level Security)

Para este projeto, desabilitar RLS ou usar `service_role` key, ja que nao tem autenticacao de usuarios. Os dados sao read-only para o frontend.

```sql
ALTER TABLE cmu_energy_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read" ON cmu_energy_meters FOR SELECT USING (true);
-- Repetir para todas as tabelas
```

---

## ENVIRONMENT VARIABLES

### Atual (.env na raiz)
```
DATABASE_URL=postgresql://...          # Neon Postgres (trocar para Supabase)
VITE_API_BASE_URL=https://server.solatioenergialivre.com.br
VITE_API_TOKEN=Bearer_token_aqui
CMU_API_BASE_URL=https://server.solatioenergialivre.com.br
CMU_API_TOKEN=Bearer_token_aqui
```

### Apos migracao — adicionar:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=postgresql://postgres:senha@db.xxx.supabase.co:5432/postgres
```

---

## SYNC SERVICE (manter como esta)

`sync-service/sync_v2.js` — script Node.js que puxa dados da API CMU para o Postgres.

- **8 endpoints** em 2 fases (fase 1: entidades independentes, fase 2: dependentes de meter)
- Modo incremental (default): filtra por `updatedAt>=` na API — so busca alteracoes
- Modo full (`--full`): re-sync completo
- Endpoint especifico: `--endpoint=NomeDoEndpoint`
- Retry com backoff exponencial (5 tentativas)
- Graceful shutdown com Ctrl+C

Para popular o Supabase do zero: `cd sync-service && node sync_v2.js --full`

Para cron automatico no Supabase, ver opcoes:
1. **pg_cron + Edge Function** — nativo do Supabase
2. **GitHub Actions** — `node sync_v2.js` em workflow scheduled
3. **Host separado** (Railway/Render) com cron nativo

---

## COMMANDS (desenvolvimento atual)

```bash
# Frontend
npm install && npm run dev       # Vite dev server

# Backend (SERA SUBSTITUIDO pelo Supabase client)
cd sync-service && npm install
node server.js                   # Express :3001

# Sync
cd sync-service
node sync_v2.js                  # Incremental
node sync_v2.js --full           # Full re-sync
```

---

## CONVENCOES

- Textos da UI em **Portugues Brasileiro**
- Formatacao monetaria: BRL `Intl.NumberFormat('pt-BR')`
- Datas ISO 8601, `referenceMonth` sempre 1o dia do mes
- Frontend: ES Modules. Sync service: CommonJS.
- **MUI v7**: usar `<Grid size={{ xs: 12, md: 6 }}>`, NUNCA `<Grid item xs={12}>`
- **MUI X DataGrid v8**: paginacao server-side com `paginationMode="server"`
- Status configs para badges: ver `statusConfigs` em `src/components/shared.jsx`

---

## ARQUIVOS RELEVANTES

| Arquivo | O que faz |
|---|---|
| `src/App.jsx` | Router com 4 rotas + Layout |
| `src/components/Layout.jsx` | Sidebar + area de conteudo |
| `src/components/shared.jsx` | KPICard, StatusBadge, PeriodFilter, DataField, InfoCard, formatters |
| `src/pages/Dashboard.jsx` | Dashboard com KPIs, graficos e tabelas |
| `src/pages/Clientes.jsx` | Listagem + modal detalhado do cliente |
| `src/pages/Inadimplencia.jsx` | Inadimplentes com busca e KPIs |
| `src/pages/Rateio.jsx` | Rateio (nao funcional) |
| `src/api/api.js` | `fetchApi()` — wrapper do fetch para Express |
| `sync-service/server.js` | **Express API (5 rotas) — SUBSTITUIR pelo Supabase** |
| `sync-service/sync_v2.js` | Script de sync — MANTER |
| `docs/DASHBOARD_FIELDS.md` | Documentacao de cada metrica do dashboard |
| `docs/API_AUDIT.md` | Auditoria completa da API CMU |
| `docs/db-samples/` | Amostras JSON de cada tabela |

---

## CHECKLIST DE MIGRACAO

- [ ] Criar projeto Supabase
- [ ] Criar as 9 tabelas (SQL acima)
- [ ] Configurar RLS (allow read)
- [ ] Rodar `sync_v2.js --full` com `DATABASE_URL` do Supabase
- [ ] Instalar `@supabase/supabase-js` no frontend
- [ ] Criar Supabase RPC functions para queries complexas (dashboard stats, faturas+bills join)
- [ ] Substituir `fetchApi()` por chamadas Supabase em cada pagina
- [ ] Testar todas as funcionalidades
- [ ] Configurar cron para sync automatico
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Remover `server.js` e dependencia do Express
