# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AVISO — ESCOPO DE TRABALHO

**NAO faca a migracao para Supabase a menos que o usuario peca explicitamente.**
A secao "MIGRACAO FUTURA PARA SUPABASE" mais abaixo descreve um plano de longo prazo que **so deve ser executado quando o usuario pedir de forma clara** ("migra pra Supabase agora", "comeca a migracao", etc). Ate la, o stack atual permanece em uso: **Neon Postgres + Express local + React SPA**. Nao troque `DATABASE_URL`, nao instale `@supabase/supabase-js`, nao substitua `fetchApi()` por chamadas Supabase e nao mexa no RLS sem instrucao explicita.

Em resumo: **o que esta funcionando hoje continua — so mude o stack quando for uma instrucao direta**.

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

## INTEGRACAO UAU ERP (Globaltec / Grupo GVS)

A UAU e a segunda fonte de dados do projeto (complementar ao CMU). Integrada em **abril/2026**. Este bloco e autoritativo — se o agente do futuro precisar mexer com UAU, leia tudo aqui antes de chutar endpoints.

### O que e o UAU

**UAU ERP** = sistema de gestao da **Globaltec** usado pelo **Grupo GVS** (holding parceira da Solatio). Contem dados financeiros, planejamento de obras, empresas/SPEs e processos de pagamento das usinas hidroeletricas (CGHs). Acessado via REST API em `https://api.grupogvs.com.br/uauAPI/api/v1.0/{Controller}/{Method}` (sempre POST).

### Autenticacao (IMPORTANTE — 2 fatores)

O UAU exige **dois headers de autenticacao simultaneamente** em toda chamada:

1. `X-INTEGRATION-Authorization: <token fixo>` — token de integracao permanente, vem da Globaltec, vive no `.env` como `UAU_INTEGRATION_TOKEN`.
2. `Authorization: <token do usuario>` — **SEM prefixo `Bearer`!** Token dinamico obtido via `POST /api/v1.0/Autenticador/AutenticarUsuario` com body `{Login, Senha}` + o `X-INTEGRATION-Authorization`. Expira em ~1h.

O `server.js` ja tem tudo isso implementado em `getUauUserToken()` (cache de 50min) e `uauCall()` (retry automatico em 401 forcando novo login). **Nao reimplemente** — use as funcoes existentes.

**Body minimo**: mesmo endpoints sem parametros exigem `{}` no POST. IIS rejeita Content-Length 0. Ja tratado em `uauCall()`.

### Endpoints validados (testados ao vivo em 2026-04-14)

**Tudo o que nao esta nesta lista nao existe ou nao foi testado.** A API do UAU nao tem documentacao publica e o servidor retorna 404 generico para controllers desconhecidos — nao da pra fazer discovery por introspec.

#### OK — funcionam sem parametros

| Controller | Method | Retorna |
|---|---|---|
| `Empresa` | `ObterEmpresasAtivas` | Array de 322 SPEs. Campos: `Codigo_emp`, `Desc_emp`, `CGC_emp`, `IE_emp`, `InscrMunic_emp`, `Endereco_emp`, `Fone_emp`. |
| `Obras` | `ObterObrasAtivas` | Array de 1429 obras. Campos: `Cod_obr`, `Empresa_obr`, `Descr_obr`, `Status_obr` (0=normal/ativa efetivamente, 1/2/4=outros), `Ender_obr`, `Fone_obr`, `Fisc_obr`, `DtIni_obr`, `Dtfim_obr`, `TipoObra_obr`, `EnderEntr_obr`, `CEI_obr`, `DataCad_obr`, `DataAlt_obr`, `UsrCad_obr`. **ATENCAO**: `Status_obr=0` NAO significa inativa — a maioria das obras com dados esta em status 0. Nao filtre por status. |
| `Autenticador` | `AutenticarUsuario` | `{Token, ...}`. Usado internamente pelo `getUauUserToken()`. |

#### PARAMS — existem mas exigem body

| Controller.Method | Body obrigatorio | Notas |
|---|---|---|
| `Planejamento.ConsultarDesembolsoPlanejamento` | `{Empresa: int, Obra: string, MesInicial: "mm/yyyy", MesFinal: "mm/yyyy"}` | Retorna linhas-item de desembolso planejado. Ver secao "Schema do desembolso" abaixo. |
| `Medicao.ConsultarMedicao` | `{empresa: int, contrato: int, medicao: int}` | Consulta uma medicao especifica. **Nao serve pra listagem** — e pra buscar detalhes de uma medicao conhecida. |

#### SLOW — endpoint existe mas da timeout (>3min mesmo com filtros)

| Controller.Method | Status |
|---|---|
| `ProcessoPagamento.ConsultarProcessos` | Timeout mesmo com `{Empresa, Obra}`. Provavelmente o servidor UAU esta processando sincronamente um volume enorme. **Nao use ate a Globaltec corrigir.** |
| `ProcessoPagamento.ConsultarProcessosPagamento` | Retorna 400 "Erro na verificacao do token" — parece exigir um header diferente. Investigar com a Globaltec. |

#### MISSING — retornam 404, nao existem no UAU

Os seguintes endpoints estavam chutados no primeiro catalogo, **foram testados e nao existem** — nao tente de novo:

`Pessoas.ObterPessoas`, `Localidade.ObterLocalidades`, `Recebiveis.ConsultarRecebiveis`, `ExtratoDoCliente.ObterExtratoDoCliente`, `BoletoServices.ObterBoletoPorTitulo`, `CobrancaPix.ObterCobrancaPix`, `CessaoRecebiveis.ObterCessoes`, `Venda.ObterVendasPorEmpresa`, `NotasFiscais.ConsultarNotasFiscais`, `Fiscal.ObterImpostos`, `Contabil.ConsultarLancamentos`, `Planejamento.ConsultarCurvaFisicoFinanceira`, `Financeiro.ObterTitulos`, `Titulos.ConsultarTitulos`, `TituloReceber.ConsultarTitulos`, `TituloPagar.ConsultarTitulos`, `NotaFiscal.*`, `Cliente.*`, `Fornecedor.*`, `Banco.*`, `ContaCorrente.*`, `CentroCusto.*`, `Movimento.*`, `ContasReceber.*`, `ContasPagar.*`, `Contrato.*`, `Proposta.*`, `OrdemCompra.*`, `Insumos.*`, `Produto.*`, `Composicao.*`, `Cheque.*`, `Nota.*`, `Relatorio.*`, `RH.*`, `Funcionario.*`, `Usuarios.*`, `Obras.ObterObraPorCodigo`, `Obras.ObterObrasPorEmpresa`, `Empresa.ObterEmpresa`.

**Para descobrir novos endpoints: peca a lista oficial a Globaltec/Grupo GVS.** Tentativa-e-erro nao funciona — a API retorna 404 anonimo.

### Schema do `Planejamento.ConsultarDesembolsoPlanejamento`

Este e o endpoint principal da integracao UAU hoje. Retorna **uma linha por combinacao (Obra, Item, Composicao, Insumo, DtaRef)** — e basicamente a curva fisico-financeira quebrada por insumo.

**Campos retornados**:

| Campo | Tipo | Significado |
|---|---|---|
| `Status` | string | **"Projetado"** (planejamento fisico — Total e QUANTIDADE, nao R$) / **"Pagar"** (compromisso futuro em R$) / **"Pago"** (desembolso ja realizado em R$) |
| `Empresa` | int | Codigo da SPE (mesmo do `Codigo_emp`) |
| `Obra` | string | Codigo da obra (mesmo do `Cod_obr`) |
| `Contrato` | int | Numero do contrato dentro da obra |
| `Produto` | int | Id do produto no UAU |
| `Composicao` | string | Codigo da composicao (ex: "S206") |
| `Item` | string | Item do cronograma (ex: "01.01") |
| `Insumo` | string | Codigo do insumo (ex: "CI001") |
| `DtaRef` | string ISO | Primeiro dia do mes de referencia |
| `DtaRefMes` | int | Mes (redundante) |
| `DtaRefAno` | int | Ano (redundante) |
| `Total` | float | **Depende do Status** — em "Projetado" e quantidade fisica, em "Pago"/"Pagar" e valor monetario |
| `Acrescimo` | float | Acrescimos em R$ (so em Pago/Pagar) |
| `Desconto` | float | Descontos em R$ |
| `TotalLiq` | float | **Valor liquido em R$** = TotalBruto + Acrescimo - Desconto. **Esta e a metrica monetaria correta para gestao de caixa.** |
| `TotalBruto` | float | Valor bruto em R$ |

**Armadilha critica**: NAO some `Total` como valor monetario geral. Para Status=Projetado, `Total` e quantidade de insumo (1 saco de cimento, 3 horas de mao de obra, etc). Somar tudo junto gera numeros astronomicos sem sentido (vimos R$ 420 bilhoes para Empresa 1). **Para metricas financeiras use `TotalLiq` ou `TotalBruto`** e/ou filtre por `Status IN ('Pago','Pagar')`.

**Volume**: o export completo (janela 01/2010 → 12/2030, 1429 obras, 1212 com dados) gerou **1.934.131 linhas** = ~292MB CSV / ~164MB XLSX.

### Rotas do backend (`sync-service/server.js`)

Todas as rotas UAU estao no bloco comentado `UAU ERP (Globaltec / Grupo GVS) — Proxy Routes`. Helpers internos:

- `getUauUserToken({force})` — autentica, cacheia token por 50min
- `uauCall(controller, method, body, {retryOn401, timeout})` — wrapper de POST com 2FA, retry em 401, timeout configuravel (default 60s)
- `getObrasCached()` — cache de 5min do `ObterObrasAtivas`
- `uauErrorPayload(err)` — formata erro pra resposta HTTP

Rotas HTTP expostas:

| Metodo | Path | Descricao |
|---|---|---|
| GET | `/api/uau/status` | Health check — tenta autenticar e retorna `{connected, baseUrl, user, tokenPreview, tokenExpiresAt}` |
| POST | `/api/uau/auth/refresh` | Forca novo token |
| GET | `/api/uau/empresas` | Proxy direto para `Empresa.ObterEmpresasAtivas`, retorna `{count, items}` |
| GET | `/api/uau/obras` | Proxy direto para `Obras.ObterObrasAtivas`, retorna `{count, items}` |
| POST | `/api/uau/call` | Proxy generico. Body: `{controller, method, body, timeout?}`. Usado pelo Explorer da pagina UauApi. |
| POST | `/api/uau/desembolso/empresa` | **Agregacao por empresa**. Body: `{empresa, mesInicial, mesFinal}`. Itera todas as obras da empresa (concorrencia 6), chama `Planejamento.ConsultarDesembolsoPlanejamento` pra cada, devolve `{totais, porMes, porStatus, topObras, topItens, rows, errors}`. Metricas somam **TotalLiq** (nao `Total`). |
| GET | `/api/uau/catalog` | Catalogo estatico documentando os RFs e o status (`ok`/`params`/`slow`/`missing`) de cada endpoint, com body sugerido. Consumido pela pagina UauApi. |

### Frontend — paginas UAU

**`src/pages/UauApi.jsx`** (`/uau-api`) — explorador da API:
- StatusCard mostrando conexao, user, token preview, expiracao
- KPIs: Empresas ativas, Obras ativas
- 4 abas: Catalogo G-Sentinel 2, Empresas (DataGrid), Explorer (controller+method+body arbitrarios), Obras (DataGrid)
- Cards do catalogo tem chip colorido por status (`ok`/`params`/`slow`/`missing`), botao "Testar" desabilitado para missing, e pre-preenche o Explorer com o body sugerido
- `JsonViewer` com botao copiar para inspecionar respostas

**`src/pages/GestaoDesembolso.jsx`** (`/gestao-desembolso`) — dashboard de gestao:
- Autocomplete de empresa (`Codigo_emp` + `Desc_emp`) carregada de `/api/uau/empresas`
- Inputs `MesInicial` / `MesFinal` no formato `mm/yyyy`
- Chama `/api/uau/desembolso/empresa` ao clicar Carregar
- 4 KPIs: Planejado Liquido, Planejado Bruto, Acrescimos - Descontos, Obras com dados
- BarChart (Recharts): Bruto vs Liquido por mes
- PieChart: distribuicao por Status (dominado por Pago/Pagar; Projetado = R$ 0 porque sua coluna Total nao e dinheiro)
- Top 10 obras por valor liquido
- Top 10 itens/composicoes por valor liquido
- DataGrid com todas as linhas brutas (ate 1 pagina de 50 por default)
- Alert laranja quando alguma obra falha ao consultar

### Scripts auxiliares (`sync-service/`)

**`export_desembolso.js`** — Baixa **TUDO** do endpoint Planejamento. Autentica, busca obras, itera 1429 obras com concorrencia 6, janela `01/2010` → `12/2030`, agrega tudo em um CSV enriquecido (cada linha ganha `_ObraDescricao`, `_ObraStatus`, `_ObraTipo`, `_ObraDtIni`, `_ObraDtFim`). Saida: `desembolso_planejamento_<timestamp>.csv` na raiz do projeto. Leva ~5-10min. Rodar com: `cd sync-service && node export_desembolso.js`.

**`csv_to_xlsx.js`** — Converte o CSV gigante em XLSX com **multiplas abas de ate 1M linhas cada** (limite do Excel). Usa `exceljs` em modo streaming para evitar OOM com 2M linhas. Parser CSV estadual que lida corretamente com `\n` embutido em campos quotados. Uso: `node csv_to_xlsx.js <caminho.csv>`. Output: mesmo nome com extensao `.xlsx`.

**IMPORTANTE**: os arquivos de saida (`desembolso_planejamento_*.csv` e `.xlsx`) estao no `.gitignore` — nao commitar (292MB/164MB).

### Environment variables UAU

No `.env` da raiz:
```
UAU_BASE_URL=https://api.grupogvs.com.br/uauAPI
UAU_INTEGRATION_TOKEN=<token fixo de integracao>
UAU_USER=<usuario>
UAU_PASS=<senha>
```

### Armadilhas / Gotchas

1. **Total nao e sempre R$**: vale repetir — so some `TotalLiq`/`TotalBruto` para gestao financeira. `Total` mistura quantidades e valores dependendo do `Status`.
2. **Status_obr=0 e normal**: a maior parte das obras ativas tem `Status_obr=0`. Nao use este campo como filtro de "ativa" — use a presenca no `ObterObrasAtivas` como indicativo.
3. **Discovery de endpoint novo e caro**: se precisar de um endpoint nao listado aqui, **peca a lista oficial a Globaltec**. Nao gaste tokens tentando chutar.
4. **Data format**: `MesInicial`/`MesFinal` em `ConsultarDesembolsoPlanejamento` e `mm/yyyy` (com barra). Se passar `yyyy-mm` o servidor responde "O mes inicial deve ser do tipo numerico e estar no formato mm/yyyy".
5. **IIS exige body**: POSTs com `Content-Length: 0` sao rejeitados. Sempre envie `{}` no minimo.
6. **Token sem "Bearer"**: Ponto critico — o header `Authorization` leva o token cru, sem `Bearer `. Se colocar Bearer, o UAU retorna 401.
7. **Timeout grande**: `ProcessoPagamento.ConsultarProcessos` e lento. Nao aumente timeout geral — use o parametro `timeout` do `uauCall()` caso a caso.
8. **Cache de 50min**: o token UAU expira em ~1h. O cache em `uauTokenCache` e proativo (50min). Se um 401 ainda ocorrer, `uauCall` refaz login automatico uma vez.

---

## MIGRACAO FUTURA PARA SUPABASE (**so executar quando pedido**)

As secoes abaixo ("COMO CONECTAR O SUPABASE", "ENVIRONMENT VARIABLES — Apos migracao", "CHECKLIST DE MIGRACAO") descrevem o trabalho de migracao. **Nao execute nada disso por iniciativa propria.** Aguarde instrucao direta do usuario antes de mexer nessa parte. Se estiver em duvida, pergunte antes.

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
| `src/pages/SyncLogs.jsx` | Monitoramento dos logs do sync_v2 |
| `src/pages/UauApi.jsx` | Explorer da API UAU — catalogo, Explorer generico, listagem de empresas/obras |
| `src/pages/GestaoDesembolso.jsx` | Dashboard de gestao de desembolso planejado por empresa (UAU) |
| `src/api/api.js` | `fetchApi()` + `BASE_URL` — wrapper do fetch para Express |
| `sync-service/server.js` | Express API (rotas CMU + UAU). Bloco UAU comeca em `UAU ERP (Globaltec / Grupo GVS) — Proxy Routes` |
| `sync-service/sync_v2.js` | Script de sync CMU — MANTER |
| `sync-service/export_desembolso.js` | Dump completo do `Planejamento.ConsultarDesembolsoPlanejamento` para CSV |
| `sync-service/csv_to_xlsx.js` | Converte CSV gigante em XLSX multi-aba (streaming via exceljs) |
| `docs/DASHBOARD_FIELDS.md` | Documentacao de cada metrica do dashboard CMU |
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
