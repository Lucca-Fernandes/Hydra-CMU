# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de gestao e **Power Analytics** para a **Solatio Energia Livre** — empresa de energia solar por geracao distribuida (GD). O dashboard monitora usinas, medidores de consumo (UCs), faturas, pagamentos e eficiencia operacional.

**Escala**: ~6.000 medidores, ~19.000 faturas, ~14.000 pagamentos.

## Architecture

Dois apps independentes no mesmo repo:

```
External CMU API (Swagger/REST)
        |
        v
  [sync scripts]  -->  Neon Postgres (JSONB)
                              |
                              v
                    [Express API :3001]
                              |
                              v
                    [React SPA (Vite)]
```

1. **Frontend** (root) — React 19 + Vite, MUI v7, MUI X DataGrid v8. Sem routing; `App.jsx` renderiza `Clientes` diretamente. `Rateio.jsx` existe mas nao esta conectado ao app.

2. **Backend** (`sync-service/`) — Express 5 com `package.json` proprio. Serve API REST na porta 3001. Scripts de sync puxam dados da API CMU para o Neon Postgres.

## Commands

```bash
# Frontend (raiz)
npm install
npm run dev          # Vite dev server
npm run build        # Build producao
npm run lint         # ESLint flat config

# Backend (sync-service/)
cd sync-service && npm install
node server.js       # API Express na porta 3001

# Sync V2 (principal)
node sync_v2.js                                # Incremental (default) — so pega alteracoes desde ultimo sync
node sync_v2.js --full                         # Re-sync completo de todos os endpoints
node sync_v2.js --endpoint=EnergyMeters        # Incremental de um endpoint especifico
node sync_v2.js --full --endpoint=Contacts     # Full de um endpoint especifico

# Scripts legados (referencia)
node sync_final.js   # Sync v1 — apenas 4 endpoints, sem incremental
node check_one.js    # Cruzamento de dados API vs banco para um medidor especifico
```

Ambos devem rodar simultaneamente: `npm run dev` + `node sync-service/server.js`.

## Environment Variables

Root `.env` (compartilhado — sync-service le com `path: '../.env'`):
- `DATABASE_URL` — connection string Neon Postgres (com SSL)
- `VITE_API_BASE_URL` / `CMU_API_BASE_URL` — URL base da API CMU Solatio
- `VITE_API_TOKEN` / `CMU_API_TOKEN` — Bearer token da API CMU

## Database Schema (Neon Postgres)

Padrao JSONB: cada tabela armazena o payload completo da API na coluna `data` (JSONB), consultada com operadores `->>`.

### Tabelas

#### `cmu_energy_meters` — Medidores/Clientes (~6.000)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `energyMeterID` da API |
| `name` | text | Nome do cliente (extraido do JSONB) |
| `data` | jsonb | Payload completo do medidor |
| `updated_at` | timestamptz | Ultima atualizacao |

**Campos JSONB principais**: `energyMeterID`, `name`, `meterNumber` (instalacao), `customerNumber`, `registrationNumber` (CPF/CNPJ), `energyMeterStatus` (Ativa/Desconectada/etc), `contractConsumption` (kWh contratado), `discountEstimative` (% desconto), `expiredPaymentsTotalAmount`, `pendingPayments`, `address`, `addressCity`, `addressState`, `emails`, `phones`, `connection` (Monofasico/Bifasico/Trifasico), `class` (Residencial/Comercial), `tariffSubgroup` (B1/B2/B3), `contractStatus`, `distributor` (objeto com dados da concessionaria CEMIG/COELBA/etc), `voucher` (objeto com dados do prospector/parceiro), `customer` (objeto com dados de acesso).

#### `cmu_energy_meter_invoices` — Faturas Solatio (~19.000)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `energyMeterInvoiceID` da API |
| `energy_meter_id` | int FK | Vinculo com medidor |
| `data` | jsonb | Payload completo da fatura |
| `updated_at` | timestamptz | |

**Campos JSONB principais**: `energyMeterInvoiceID`, `energyMeterID`, `referenceMonth` (ISO date, 1o dia do mes), `consumedEnergy` (kWh), `compensatedEnergy` (kWh gerado pela usina), `totalAmount` (valor Solatio R$), `energyMeterInvoiceStatus` (Faturado/Disponível/Cancelado/Retido/Reprovado — NAO existe "Liquidado" nem "Pendente"), `energyInvoiceFile` (URL do PDF S3), `energyMeterBillID` (FK para bill), `statusDescription` (historico textual de acoes), `icmsRefund`, `economyValue`, `solatioEconomyAmount`, `equivalentAmount`, `consumedEnergyTariff`, `registrationNumber`, `organization`, `partnership`.

#### `cmu_energy_meter_bills` — Contas da Concessionaria (CEMIG/COELBA/etc)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `energyMeterBillID` da API |
| `energy_meter_id` | int FK | Vinculo com medidor |
| `data` | jsonb | Payload completo da conta |
| `updated_at` | timestamptz | |

**Campos JSONB principais**: `energyMeterBillID`, `energyMeterID`, `referenceMonth`, `totalAmount` (valor concessionaria), `energyBillFile` (URL PDF), `energyMeterBillStatus`, `info` (texto completo da conta com tarifas, impostos, saldos), `consumedEnergyAmountOffPeakTime`, `consumedEnergyAmountPeakTime`, `injectedEnergyAmountOffPeakTime` (energia injetada pela usina), `icmsPercentage`, `cofinsPercentage`, `pisPercentage`, `availabilityCost`, `typefullLine` (codigo de barras), `pixCustomerCode`, `customerNumber`, `expirationDate`, `energyBalancePeakTime`, `energyBalanceOffPeakTime`.

#### `cmu_energy_meter_payments` — Pagamentos/Boletos (~14.000)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `energyMeterPaymentID` da API |
| `energy_meter_id` | int FK | Vinculo com medidor |
| `data` | jsonb | Payload completo do pagamento |
| `updated_at` | timestamptz | |

**Campos JSONB principais**: `energyMeterPaymentID`, `energyMeterID`, `energyMeterInvoiceID` (vinculo com fatura), `referenceMonth`, `totalAmount`, `paidAmount`, `paymentDate`, `expirationDate`, `energyMeterPaymentStatus` (Pago/Pendente/Vencido/Errado/Cancelado/Simulação — NAO existe "Liquidado"), `paymentMethod` (Boleto/Cartao/PIX), `paymentLinkURL` (link Iugu), `bank` (IUGU), `registrationNumber`, `autoCancelAt`, `bankLiquidValue`, `paymentTicketBarCode`, `paymentTicketComment`.

#### `cmu_contacts` — Contatos/Responsaveis (NOVO)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `contactID` da API |
| `data` | jsonb | Payload: name, function (Titular/Financeiro/Representante Legal), email, phone, comment (pode conter CPF e endereco) |
| `updated_at` | timestamptz | |

**Nota**: NAO tem vinculo direto com energyMeterID. Campo `responsibilitys` sempre vazio. Cruzamento possivel por CPF no `comment`.

#### `cmu_customers` — Perfis de Acesso/Grupos (NOVO)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `userID` da API |
| `data` | jsonb | Payload: name, role (Acesso), email, phone, accessCount, lastAccess |
| `updated_at` | timestamptz | |

**Vinculo**: EnergyMeter → `data.customer.userID` → Customer.id

#### `cmu_prospectors` — Parceiros Comerciais (NOVO)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `userID` da API |
| `data` | jsonb | Payload: name, alias, email, contactEmail, phone, parentID, ruleSetName, devolutiveEmail |
| `updated_at` | timestamptz | |

**Vinculo**: EnergyMeter → `data.voucher.prospector.userID` → Prospector.id

#### `cmu_vouchers` — Cupons/Contratos (NOVO)
| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | int PK | `voucherID` da API |
| `data` | jsonb | Payload: code, economyPercentage, economyFormula, commissionFormula, expirationDate, voucherType |
| `updated_at` | timestamptz | |

**Vinculo**: EnergyMeter → `data.voucherID` → Voucher.id

#### `sync_control` — Controle de paginacao e modo incremental
| Coluna | Tipo | Descricao |
|---|---|---|
| `endpoint_name` | text PK | Nome do endpoint (todos os 8) |
| `last_page_processed` | int | Ultima pagina sincronizada |
| `last_sync_completed_at` | timestamptz | Timestamp do ultimo sync completo (usado para filtro incremental) |
| `sync_mode` | text | Ultimo modo executado: 'full' ou 'incremental' |
| `updated_at` | timestamptz | |

## API Endpoints (Backend Express)

### `GET /api/EnergyMeters`
Listagem paginada com busca global. Query params:
- `page`, `pageSize` — paginacao (default 1/25)
- `filters` — JSON stringificado: `{ name, energyMeterStatus, pendingPayments }`
- Busca `name` faz ILIKE em: `name`, `registrationNumber`, `meterNumber`, `customerNumber`

### `GET /api/EnergyMeterInvoices`
Faturas de um medidor com JOIN nas bills. Query params:
- `filters` — JSON: `{ energyMeterID }` (obrigatorio)
- Retorna array com `energyMeterBill` embutido (para PDF da concessionaria)

### `GET /api/EnergyMeterPayments` (a implementar no server.js)
Atualmente o frontend chama este endpoint mas ele nao existe no `server.js`. O `Clientes.jsx` faz `fetchApi('/EnergyMeterPayments?filters=...')` e trata o erro silenciosamente.

## Sync Service

### `sync_v2.js` (PRINCIPAL — usar este)
- Sincroniza **8 endpoints** em 2 fases:
  - Fase 1 (sem FK): EnergyMeters, Contacts, Customers, Prospectors, Vouchers
  - Fase 2 (FK para meters): EnergyMeterBills, EnergyMeterInvoices, EnergyMeterPayments
- **Modo incremental** (default): usa filtro `updatedAt>=` na API — so busca registros alterados desde ultimo sync. Testado e confirmado que a API suporta em todos os 4 endpoints grandes.
- **Modo full** (`--full`): re-sync completo, reseta paginas no sync_control
- Pode rodar um endpoint especifico: `--endpoint=NomeDoEndpoint`
- Migration automatica: cria tabelas novas (`cmu_contacts`, `cmu_customers`, `cmu_prospectors`, `cmu_vouchers`) no primeiro run
- Retry com backoff exponencial (5s, 10s, 20s, 40s, 80s — max 5 tentativas)
- Graceful shutdown: Ctrl+C salva progresso e para limpo
- Logs estruturados com timestamp `[ISO] [LEVEL] [ENDPOINT] msg`
- **IMPORTANTE para proximo agente**: Se o sync nunca rodou full pelo v2, o modo incremental detecta e forca full automaticamente. Apos o primeiro full, incrementais subsequentes sao rapidos (poucos registros por dia).

### `sync_final.js` (legado v1)
- Apenas 4 endpoints, sem incremental, sem Contacts/Customers/Prospectors/Vouchers
- Mantido como referencia, usar sync_v2.js para novos syncs

### `sync.js` (legado v0)
- Apenas 3 endpoints (sem payments), sem FK check
- Bug: usa `https.Agent` sem importar o modulo `https`

## Analytics (Frontend)

Calculos feitos no `Clientes.jsx`:
- **Consumo Medio**: media de `consumedEnergy` das faturas validas (exclui Cancelado/Reprovado)
- **Eficiencia Usina**: `(compensatedEnergy / consumedEnergy) * 100` do ultimo mes
- **Economia**: `discountEstimative` do medidor (% desconto fixo do contrato)
- **Inadimplencia**: `expiredPaymentsTotalAmount` e `pendingPayments` do medidor
- **Consumo vs Meta**: `((consumedEnergy / contractConsumption) - 1) * 100`

## Relacoes entre Entidades

```
EnergyMeter (UC/Cliente)
  |
  |-- 1:N --> EnergyMeterInvoice (Fatura Solatio)
  |               |
  |               |-- N:1 --> EnergyMeterBill (Conta Concessionaria)
  |
  |-- 1:N --> EnergyMeterPayment (Boleto/Pagamento)
  |               |
  |               |-- N:1 --> EnergyMeterInvoice (vinculo via energyMeterInvoiceID)
  |
  |-- N:1 --> Customer (data.customer.userID)
  |-- N:1 --> Voucher (data.voucherID)
                  |
                  |-- N:1 --> Prospector (voucher.prospector.userID)

Contact (sem vinculo direto — cruzamento por CPF no campo comment)
```

- Um medidor tem multiplas faturas e pagamentos
- Cada fatura Solatio referencia uma conta da concessionaria (`energyMeterBillID`)
- Cada pagamento referencia uma fatura (`energyMeterInvoiceID`)
- `referenceMonth` eh a chave logica de cruzamento temporal entre faturas, contas e pagamentos
- Customers, Vouchers e Prospectors vinculam via IDs embutidos no JSONB do meter
- Contacts NAO tem vinculo direto — possivel cruzamento por CPF no campo `comment`

## Key Conventions

- Textos da UI e comentarios em **Portugues Brasileiro**
- Formatacao monetaria: BRL com `Intl.NumberFormat('pt-BR')`
- ESLint: `no-unused-vars` ignora variaveis que comecam com maiuscula ou underscore
- Frontend: ES Modules (import/export); Backend: CommonJS (require)
- Sem framework de testes configurado
- Datas sempre em ISO 8601 com `T00:00:00`, referenceMonth sempre 1o dia do mes

## API CMU — Endpoints Disponiveis

Ver `docs/API_AUDIT.md` para auditoria completa. Resumo:

Endpoints **sincronizados** (sync_v2.js): EnergyMeters, EnergyMeterBills, EnergyMeterInvoices, EnergyMeterPayments, Contacts, Customers, Prospectors, Vouchers
Endpoints **disponiveis mas nao sincronizados**: ProspectorAPI/Data (unificado, util para queries sob demanda), Queries/GetCustomerDebits/{cpf} (boletos em aberto por CPF)
Endpoints **bloqueados**: Tickets (sem permissao), Leads (retorna vazio)

**Dados que NAO existem em nenhum endpoint**: email pessoal do consumidor final, dados bancarios do consumidor (banco/agencia/conta), birthday.

**Campos `emails` e `phones` no EnergyMeter**: existem no schema mas sao SEMPRE VAZIOS em toda a base. Dados de contato alternativos estao em `data.customer.email/phone` (do grupo) e no endpoint `Contacts` (responsaveis, sem vinculo direto com meter).

## Roadmap / Pendencias Conhecidas

- **Fallbacks no frontend**: usar `data.customer.phone` e endereco dos Payments quando meter tem dados vazios
- **Novos endpoints no server.js**: expor dados das novas tabelas (Contacts, Customers, Prospectors, Vouchers) para o frontend
- **Endpoint `/api/dados-rateio`**: Rateio.jsx chama este endpoint mas ele nao existe no server.js (precisa implementar)

## Implementacoes Futuras — Migracao para Supabase

> **IMPORTANTE PARA O PROXIMO AGENTE**: Esta secao descreve planos FUTUROS. O projeto atual roda com Neon Postgres + Express local. NAO tente implementar nada desta secao a menos que o usuario peca explicitamente.

### Hospedagem planejada: Supabase

O projeto sera migrado para o Supabase. A arquitetura futura:

| Componente atual | Destino Supabase |
|---|---|
| Neon Postgres | Supabase Postgres (migracao direta, mesmo schema JSONB) |
| Express API (server.js) | Supabase Edge Functions (Deno) OU manter Express em host separado (Railway/Render) |
| sync_v2.js (cron) | **pg_cron** + Edge Function OU **Supabase Cron Jobs** (via Dashboard) |
| Frontend (Vite SPA) | Vercel / Netlify / Supabase Hosting (static deploy) |

### Cron para sync automatico no Supabase

O Supabase oferece **3 opcoes** para agendar o sync incremental:

#### Opcao 1: Supabase Cron Jobs (Recomendada)
Supabase tem cron nativo via Dashboard (Database > Extensions > pg_cron). Pode chamar uma Edge Function via `net.http_post`:

```sql
-- Habilitar extensao (uma vez)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar sync diario as 3h da manha (UTC)
SELECT cron.schedule(
  'sync-cmu-daily',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/sync-cmu',
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
  )$$
);
```

A Edge Function `sync-cmu` seria uma versao Deno do sync_v2.js (ou chamaria o sync Node.js hospedado externamente).

#### Opcao 2: GitHub Actions (mais simples, sem reescrever sync)
Manter sync_v2.js como esta e rodar via GitHub Actions scheduled workflow:

```yaml
# .github/workflows/sync-cron.yml
name: Sync CMU Daily
on:
  schedule:
    - cron: '0 6 * * *'  # 3h BRT = 6h UTC
  workflow_dispatch:       # permite rodar manualmente
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd sync-service && npm ci && node sync_v2.js
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          CMU_API_BASE_URL: ${{ secrets.CMU_API_BASE_URL }}
          CMU_API_TOKEN: ${{ secrets.CMU_API_TOKEN }}
```

**Vantagem**: Nao precisa reescrever sync_v2.js. Funciona com Neon OU Supabase Postgres.

#### Opcao 3: Host separado para o backend
Hospedar `sync-service/` (Express + sync) em Railway, Render ou Fly.io. Configurar cron no proprio host (Railway tem cron jobs nativo). O frontend aponta para a URL publica da API.

### Passos para migracao (quando for implementar)

1. Criar projeto Supabase e obter connection string
2. Rodar `sync_v2.js --full` apontando para o Supabase Postgres (trocar DATABASE_URL no .env)
3. Decidir onde hospedar o server.js (Edge Functions vs host externo)
4. Configurar cron (opcao 1, 2 ou 3 acima)
5. Deploy do frontend (Vercel/Netlify com VITE_API_BASE_URL apontando para a nova API)
6. Desativar Neon Postgres antigo

## MUI v7 — Grid API

**IMPORTANTE**: Este projeto usa MUI v7 (`@mui/material@^7.3.9`). A API do Grid mudou:

```jsx
// ERRADO (v5/v6 — NAO usar)
<Grid item xs={12} md={6}>

// CORRETO (v7 — Grid v2)
<Grid size={{ xs: 12, md: 6 }}>
```

A prop `item` foi removida. Props de breakpoint (`xs`, `md`, `sm`, `lg`, `xl`) agora vao dentro de `size`. Sem `size`, o Grid nao distribui os itens e tudo fica comprimido na esquerda.

## Notas para o Proximo Agente

- **sync_v2.js** eh o script principal de sync. Sempre use este, nao os legados.
- Se precisar re-popular o banco do zero: `cd sync-service && node sync_v2.js --full` (demora ~2-3h pelos endpoints grandes)
- Para sync rapido do dia: `node sync_v2.js` (sem flags) — usa filtro `updatedAt>=` e leva poucos minutos
- O sync roda a migration automaticamente — nao precisa rodar o SQL manualmente
- A API CMU base URL de producao eh `server.solatioenergialivre.com.br` (nao `dev-server`; o dev-server eh so para Swagger docs)
- Token de autenticacao eh Bearer token no header Authorization
- Documentacao detalhada da API em `docs/API_AUDIT.md`
- Samples do banco em `docs/db-samples/` (JSONs exportados das tabelas)
- **NAO implementar migracao Supabase** a menos que o usuario peca — ver secao "Implementacoes Futuras" acima
- **Sempre usar `<Grid size={{}}>` no MUI v7**, nunca `<Grid item xs={}>`
