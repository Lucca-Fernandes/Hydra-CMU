# CLAUDE.md

Guidance para Claude Code (claude.ai/code) trabalhando neste repo.

## AVISO — ESCOPO DE TRABALHO

**NAO faca migracao para Supabase a menos que o usuario peca explicitamente.** A secao "MIGRACAO FUTURA PARA SUPABASE" descreve um plano de longo prazo, **so executado quando o usuario pedir de forma clara** ("migra pra Supabase agora", "comeca a migracao"). Ate la o stack permanece: **Neon Postgres + Express local (porta 3000) + React SPA**. Nao troque `DATABASE_URL`, nao instale `@supabase/supabase-js`, nao substitua `fetchApi()` por chamadas Supabase, nao mexa em RLS sem instrucao direta.

---

## Project Overview

**Power Analytics** para a **Solatio Energia Livre** (energia solar / geracao distribuida). Monitora usinas, medidores (UCs), faturas, pagamentos, eficiencia.

**Escala** (API CMU real, verificado 2026-05-18): **~18.700 medidores** (Ativa ~17.7k, Inativa ~800, Excluída ~134, Suspenso ~30), ~20.000 faturas, ~14.000 pagamentos, ~19.000 bills, ~4.000 contatos.

> **GOTCHA CRÍTICO — sync de EnergyMeters**: a API CMU retorna o ID do medidor como `energyMeterID` (NUNCA `id`). Em `sync_v2.js` o `idField` de EnergyMeters PRECISA ser `'energyMeterID'` — se for `'id'`, `extractId()` devolve `undefined` e **100% dos medidores são pulados silenciosamente** (bug que travou em 6.078 por ~2 meses). Além disso, a API **ignora silenciosamente o filtro `updatedAt`** — não existe sync incremental real; todo sync de medidores é full scan (~1246 páginas). Por isso `supportsIncremental: false` em todos os endpoints.
>
> **GOTCHA #2 — `rawData=true` mutila o medidor**: no endpoint EnergyMeters, `rawData=true` (payload "enxuto") devolve `expiredPaymentsTotalAmount`, `pendingPayments`, `distributor`, `voucher` e `customer` como **NULL**. Isso zera a Inadimplência e quebra os gráficos "Medidores por Distribuidora" e "Top Parceiros". O endpoint de medidores TEM que usar `rawData=false` (config `rawData: false` no registry → URL usa `ep.rawData`). Custo: payload ~2,5x maior (~22s/página vs ~9s), mas é o único modo com os dados completos. Invoices/Payments/Bills podem ficar em `rawData=true` (campos planos que o dashboard usa já vêm preenchidos).

## Arquitetura

```
API CMU Solatio (REST)                                         API UAU/Globaltec (REST POST)
        |                                                              |
  [sync_v2.js]  -->  Neon Postgres (JSONB)  <--  [server.js]  --proxy--+
                                                  Express :3000
                                                       |
                                                  [React SPA (Vite)]
```

Frontend chama `http://localhost:3000/api/...` via `src/api/api.js#fetchApi()`. Server.js encapsula tanto queries SQL (CMU) quanto proxy autenticado para UAU.

---

## BANCO DE DADOS (schema JSONB)

**Padrao**: toda tabela tem coluna `data JSONB NOT NULL` com o payload completo da API, mais `id INT PRIMARY KEY`, `created_at`/`updated_at TIMESTAMPTZ`. Tabelas com FK a medidor tem `energy_meter_id INT`. Queries usam operadores `->>` (texto) e `->` (objeto).

**Tabelas** (9 no total):

| Tabela | PK origem | Volume | Vinculo |
|---|---|---|---|
| `cmu_energy_meters` | `energyMeterID` | ~18.700 | raiz |
| `cmu_energy_meter_invoices` | `energyMeterInvoiceID` | ~20.000 | `data->>'energyMeterID'` + `data->>'energyMeterBillID'` |
| `cmu_energy_meter_bills` | `energyMeterBillID` | ~15.000 | `data->>'energyMeterID'` |
| `cmu_energy_meter_payments` | `energyMeterPaymentID` | ~14.000 | `data->>'energyMeterID'` + `data->>'energyMeterInvoiceID'` |
| `cmu_contacts` | `contactID` | ~4.000 | sem FK direta (cruzar por CPF em `comment`) |
| `cmu_customers` | `userID` | — | `EnergyMeter.data.customer.userID → id` |
| `cmu_prospectors` | `userID` | — | `EnergyMeter.data.voucher.prospector.userID → id` |
| `cmu_vouchers` | `voucherID` | — | `EnergyMeter.data.voucherID → id` |
| `sync_control` | `endpoint_name` | 8 linhas | controle de cursor por endpoint |

Em `cmu_energy_meters` ha ainda coluna `name TEXT` extraida do JSONB para busca rapida. `sync_control` tem colunas: `last_page_processed INT`, `last_sync_completed_at TIMESTAMPTZ`, `sync_mode TEXT DEFAULT 'full'`, `updated_at TIMESTAMPTZ`. Endpoints registrados: EnergyMeters, Contacts, Customers, Prospectors, Vouchers, EnergyMeterBills, EnergyMeterInvoices, EnergyMeterPayments.

### Campos JSONB usados pelo frontend

**`cmu_energy_meters.data`** (campos consumidos pelo UI):
- IDs/busca: `energyMeterID`, `name`, `meterNumber`, `customerNumber`, `registrationNumber` (CPF/CNPJ)
- Status: `energyMeterStatus` ∈ {`"Ativa"`, `"Inativa"`, `"Excluída"`, `"Suspenso"`} (valores REAIS verificados na API — NÃO existe "Desconectada"/"Cancelada"). Sem filtro a API devolve todos os status misturados, ordenados por `energyMeterID`
- Contrato: `contractConsumption` (kWh meta), `discountEstimative` (%), `contractStatus`, `paymentMethod`, `billingMode`
- Inadimplencia: `expiredPaymentsTotalAmount` (R$), `pendingPayments` (qtd)
- Endereco: `address`, `addressCity`, `addressState` (UF: MG/GO/BA…), `addressStreet`, `addressNumber`, `addressDistrict`, `addressPostalCode`
- **Sempre vazio** (nao usar): `emails`, `phones`
- Tecnico: `connection` (Mono/Bi/Trifasico), `class` (Residencial/Comercial/Rural/Industrial), `tariffSubgroup` (B1/B2/B3)
- Vinculos/objetos: `organization` (string), `prospector` (string plano), `distributor.{alias}`, `voucher.{code, prospector.{name, contactEmail, phone, userID}}`, `customer.{userID, email, phone}`

**`cmu_energy_meter_invoices.data`**:
- `energyMeterInvoiceID`, `energyMeterID`, `energyMeterBillID`
- `referenceMonth` (ISO, sempre dia 1, ex `"2025-01-01T00:00:00"`) — **chave de cruzamento temporal**
- `consumedEnergy` (kWh cliente), `compensatedEnergy` (kWh injetado pela usina), `economyValue` (R$)
- `totalAmount` (R$ fatura Solatio)
- `energyMeterInvoiceStatus` ∈ {`"Faturado"`, `"Disponível"`, `"Cancelado"`, `"Retido"`, `"Reprovado"`} — **NAO existe "Liquidado" nem "Pendente"**
- `energyInvoiceFile` (URL PDF S3), `statusDescription`, `registrationNumber`, `organization`

**`cmu_energy_meter_bills.data`** (conta da concessionaria):
- `energyMeterBillID`, `energyMeterID`, `referenceMonth`, `totalAmount` (R$), `energyBillFile` (URL)
- `energyBalancePeakTime`, `energyBalanceOffPeakTime` (saldo kWh)
- `consumedEnergyAmountOffPeakTime`, `injectedEnergyAmountOffPeakTime`

**`cmu_energy_meter_payments.data`**:
- `energyMeterPaymentID`, `energyMeterID`, `energyMeterInvoiceID`, `referenceMonth`
- `totalAmount` (boleto R$), `paidAmount` (R$ pago), `paymentDate`, `expirationDate`
- `energyMeterPaymentStatus` ∈ {`"Pago"`, `"Pendente"`, `"Vencido"`, `"Errado"`, `"Cancelado"`, `"Simulação"`} — **correto eh "Pago", NAO "Liquidado"**
- `paymentLinkURL` (Iugu), `paymentMethod`

**`cmu_contacts.data`**: `contactID`, `name`, `function` (Titular/Financeiro/Representante Legal), `email`, `phone`, `comment` (pode conter CPF). Sem FK direta a medidor.

### Relacoes

```
EnergyMeter (UC)
  |- 1:N -> Invoice  - N:1 -> Bill (via data.energyMeterBillID)
  |- 1:N -> Payment  - N:1 -> Invoice (via data.energyMeterInvoiceID)
  |- N:1 -> Customer (data.customer.userID)
  |- N:1 -> Voucher (data.voucherID) -> Prospector (voucher.prospector.userID)
Contact: sem vinculo direto (match por CPF em data.comment)
```

`referenceMonth` cruza temporalmente faturas/contas/pagamentos. `energyMeterBillID` liga fatura ↔ conta concessionaria.

---

## ROTAS DO BACKEND (`sync-service/server.js`)

Server roda em `http://localhost:3000` (overridable via `PORT`). Cache em memoria com TTL para `/api/dashboard/stats`, `/api/financial/stats`, `/api/energy/stats`.

### CMU — Medidores/Faturas/Pagamentos
| Metodo | Path | Resumo |
|---|---|---|
| GET | `/api/EnergyMeters` | Paginado server-side. Query: `search`, `status`, `limit`, `offset`. Retorna `{data, total}` |
| GET | `/api/EnergyMeters/delinquent` | Inadimplentes paginados. Query: `search`, `state`, `startDate`, `endDate`, `limit`, `offset` |
| GET | `/api/EnergyMeterInvoices` | Faturas de um medidor. Query: `energyMeterID`. JOIN com bills, anexa `energyMeterBill` e `energyBalance` no retorno |
| GET | `/api/EnergyMeterPayments` | Pagamentos de um medidor. Query: `energyMeterID` |

### Dashboards
| Metodo | Path | Resumo |
|---|---|---|
| GET | `/api/dashboard/stats` | 13 queries em paralelo. Query: `startDate`, `endDate` (ISO, opcional). Ver "Dashboard Stats" abaixo |
| GET | `/api/financial/stats` | RF04 — faturamento/receita/inadimplencia + serie mensal + breakdown por status (faturas e pagamentos). Filtros: `startDate`, `endDate`. Calcula `taxaRecebimento` e `ticketMedio` |
| GET | `/api/energy/stats` | RF01/RF03 — energia consumida/compensada/economia + serie mensal |

### Sync logs
| Metodo | Path | Resumo |
|---|---|---|
| GET | `/api/sync/runs` | Lista de execucoes |
| GET | `/api/sync/runs/:id/logs` | Logs de uma execucao |
| GET | `/api/sync/control` | Estado de `sync_control` |
| GET | `/api/sync/logs/recent` | Logs recentes consolidados |

### Rateio (rotas existem, pagina nao roteada no App.jsx hoje — usinas mock criadas no boot)
| Metodo | Path | Resumo |
|---|---|---|
| GET / POST / DELETE | `/api/rateio/plants[/:id]` | CRUD de usinas (`rateio_plants`) |
| GET | `/api/rateio/snapshots` | Snapshots de rateio mensal |
| POST | `/api/rateio/calculate` | Calcula distribuicao body `{reference_month, plant_factors}` |
| GET | `/api/rateio/results/:month` | Resultado do rateio do mes |

### UAU (proxy autenticado, ver secao UAU)
| Metodo | Path | Resumo |
|---|---|---|
| GET | `/api/uau/status` | Health check; retorna `{connected, baseUrl, user, tokenPreview, tokenExpiresAt}` |
| POST | `/api/uau/auth/refresh` | Forca novo token |
| GET | `/api/uau/empresas` | `Empresa.ObterEmpresasAtivas` → `{count, items}` (timeout 8s) |
| GET | `/api/uau/obras` | `Obras.ObterObrasAtivas` → `{count, items}` |
| POST | `/api/uau/call` | Proxy generico `{controller, method, body, timeout?}` |
| POST | `/api/uau/desembolso/empresa` | Agregacao por empresa, ver schema abaixo |
| POST | `/api/uau/desembolso/obra` | Detalhe de uma obra `{empresa, obra, mesInicial, mesFinal}` |
| GET | `/api/uau/catalog` | Catalogo estatico OK/PARAMS/SLOW/MISSING dos endpoints UAU |

### CMU x UAU (link textual)
| Metodo | Path | Resumo |
|---|---|---|
| GET | `/api/cmu/organizations` | Organizacoes distintas com contagem `{total, ativas}` |
| POST | `/api/cmu/org-stats` | Body `{organization, mesInicial?, mesFinal?}` → metricas de receita CMU |

---

## QUERIES SQL DE REFERENCIA

Estes sao os shapes mais usados. Padrao `JSONB ->>` com cast quando precisa numerico/inteiro.

### Listagem paginada com busca
```sql
SELECT data FROM cmu_energy_meters
WHERE (data->>'name' ILIKE $1 OR data->>'registrationNumber' ILIKE $1
       OR data->>'meterNumber' ILIKE $1 OR data->>'customerNumber' ILIKE $1)
  AND data->>'energyMeterStatus' = $2     -- opcional
ORDER BY data->>'name' ASC
LIMIT $3 OFFSET $4;
```

### Faturas + Bills (JOIN do modal do cliente)
```sql
SELECT i.data AS invoice_obj, b.data AS bill_obj
FROM cmu_energy_meter_invoices i
LEFT JOIN cmu_energy_meter_bills b ON (i.data->>'energyMeterBillID')::int = b.id
WHERE (i.data->>'energyMeterID')::int = $1
ORDER BY (i.data->>'referenceMonth') DESC;
```
Pos-processo no backend mescla `energyMeterBill` e `energyBalance = peak + offpeak`.

### Pagamentos de um medidor
```sql
SELECT data FROM cmu_energy_meter_payments
WHERE (data->>'energyMeterID')::int = $1
ORDER BY (data->>'referenceMonth') DESC;
```

### Dashboard stats — formato das queries (13 em paralelo)

**Sem filtro de periodo** (estado dos medidores): GROUP BY por `energyMeterStatus`, `addressState`, `distributor.alias`, `class`, `voucher.prospector.name` (top 10). Inadimplencia: `COUNT/SUM` onde `expiredPaymentsTotalAmount > 0`.

**Com filtro de periodo** (`referenceMonth >= $start AND <= $end`):
- Receita liquidada: `SUM(totalAmount)` em payments com `energyMeterPaymentStatus = 'Pago'`
- Faturas/pagamentos por status: GROUP BY status + SUM totalAmount + COUNT
- Faturamento mensal: GROUP BY referenceMonth, exclui status `Cancelado`/`Reprovado`, LIMIT 12 so quando sem filtro
- Energia: `SUM(consumedEnergy)` e `SUM(compensatedEnergy)`, mesmo filtro
- Economia: `SUM(economyValue)`, mesmo filtro
- Custo concessionaria: `SUM(totalAmount)` em `cmu_energy_meter_bills`

**Importante**: NUNCA aceitar status `"Liquidado"` em queries — nao existe. Pagamentos correto eh `"Pago"`, faturas usam `"Faturado"`/`"Disponível"`/`"Cancelado"`/`"Retido"`/`"Reprovado"`.

### Inadimplentes
```sql
SELECT data FROM cmu_energy_meters
WHERE (data->>'expiredPaymentsTotalAmount')::numeric > 0
  AND (data->>'name' ILIKE $1 OR data->>'meterNumber' ILIKE $1 OR data->>'registrationNumber' ILIKE $1)
ORDER BY (data->>'expiredPaymentsTotalAmount')::numeric DESC
LIMIT $2 OFFSET $3;
```

---

## FUNCIONALIDADES DO FRONTEND

Rotas registradas em `src/App.jsx`:

| Path | Pagina | Sidebar |
|---|---|---|
| `/` | `Dashboard.jsx` | Dashboard |
| `/financeiro` | `Financeiro.jsx` | Financeiro |
| `/energia` | `Energia.jsx` | Energia |
| `/clientes` | `Clientes.jsx` | Clientes |
| `/inadimplencia` | `Inadimplencia.jsx` | Inadimplência |
| `/uau-api` | `UauApi.jsx` | UAU API |
| `/gestao-desembolso` | `GestaoDesembolso.jsx` | Gestão Desembolso |
| `/sync` | `SyncLogs.jsx` | Sync Logs |

`src/pages/Rateio.jsx` ainda existe no disco mas **NAO esta roteado** — pagina mockada/abandonada; rotas server-side `/api/rateio/*` continuam ativas. Se for reativar, importar no `App.jsx`.

### Dashboard (`/`)
- 8 KPIs em 2 linhas de 4 + filtro periodo (2 calendarios mes De/Ate, auto-apply)
- BarChart: Faturamento Mensal (12 meses)
- PieChart: Medidores por Status / Estado (choropleth SVG) / Distribuidora / Classe
- Ranking: Top 10 Parceiros
- Tabelas: Faturas por Status, Pagamentos por Status
- Ver `docs/DASHBOARD_FIELDS.md`

### Clientes (`/clientes`)
- DataGrid server-side: Instalacao, Cliente, Cidade, UF, Status, Inadimplente
- Busca (Nome/CPF/Instalacao) + filtro `energyMeterStatus`
- Modal fullscreen com 6 KPIs (Consumo Contratado/Medio, Eficiencia Usina, Economia, Saldo Energia, Inadimplente), DataGrid de faturas (Mes Ref, Consumo + % meta, Gerado, Saldo, Valor Solatio, Economia, Status Fatura, Status Pagto, Docs PDF/boleto) + 4 InfoCards (Unidade, Localizacao, Contato, Contrato)

**Calculos no frontend** (nao no banco):
- Consumo Medio = media de `consumedEnergy` das faturas validas
- Eficiencia Usina = `compensatedEnergy / consumedEnergy * 100` do ultimo mes
- Saldo Energia = `energyBalanceOffPeakTime + energyBalancePeakTime` da bill mais recente
- Consumo vs Meta = `((consumedEnergy / contractConsumption) - 1) * 100`

**Fallbacks de campo vazio**:
- Email: `emails` → `customer.email` → `voucher.prospector.contactEmail`
- Telefone: `phones` → `customer.phone` → `voucher.prospector.phone`
- Endereco: `address` → `addressStreet + addressNumber + addressDistrict`

### Financeiro (`/financeiro`)
KPIs: Faturamento, Receita (Pago), Inadimplencia (Vencido), Em Aberto (Pendente), Taxa Recebimento (%), Ticket Medio. Serie mensal `monthlyFlow` com `{faturado, recebido, vencido, pendente}`. Tabelas por status (faturas + pagamentos). Backend em `/api/financial/stats`.

### Energia (`/energia`)
RF01/RF03. KPIs de energia consumida/compensada/economia + serie mensal. Backend `/api/energy/stats`.

### Inadimplencia (`/inadimplencia`)
- Busca (Nome/CPF/Instalacao) + filtro periodo (De/Ate)
- 4 KPIs: Total Inadimplente, Medidores Devedores, Boletos Pendentes, Ticket Medio
- DataGrid: Cliente, Instalacao, UF, Cidade, Valor Vencido, Pendencias, Status UC, Parceiro, Organizacao

### SyncLogs (`/sync`)
Monitoramento dos runs do `sync_v2.js` consultando `/api/sync/runs`, `/api/sync/control` e `/api/sync/logs/recent`.

### Layout
Sidebar fixa esquerda (230px), tema escuro `#0d1b2a`, conteudo em `#f4f6f8`. 8 items de navegacao (ver tabela acima).

---

## INTEGRACAO UAU ERP (Globaltec / Grupo GVS)

Segunda fonte de dados. **Bloco autoritativo** — leia antes de chutar endpoints.

### O que e

UAU ERP da **Globaltec**, usado pelo **Grupo GVS** (holding parceira). Dados financeiros, planejamento de obras, SPEs e processos de pagamento das CGHs. REST em `https://api.grupogvs.com.br/uauAPI/api/v1.0/{Controller}/{Method}` — **sempre POST**.

### Autenticacao — 2 fatores

Toda chamada exige **dois headers simultaneos**:

1. `X-INTEGRATION-Authorization: <token fixo>` — vem da Globaltec, no `.env` como `UAU_INTEGRATION_TOKEN`. Permanente.
2. `Authorization: <token do usuario>` — **SEM prefixo `Bearer`!** Token dinamico via `POST Autenticador/AutenticarUsuario` com body `{Login, Senha}` + o `X-INTEGRATION-Authorization`. Expira em ~1h.

`server.js` ja implementa em `getUauUserToken({force})` (cache 50min em `uauTokenCache`) e `uauCall(controller, method, body, {retryOn401, timeout=60000})` (retry automatico em 401). **Reuse — nao reimplemente.** Helpers extras: `getObrasCached()` (5min), `uauErrorPayload(err)`, `classifyInsumo(insumo)`.

**Body minimo**: mesmo endpoints sem parametros exigem `{}` no POST. IIS rejeita Content-Length 0. Ja tratado em `uauCall()`.

### Endpoints validados (testados 2026-04-14)

**O que nao esta nesta lista nao existe ou nao foi testado.** API sem documentacao publica, 404 generico — discovery por introspec nao funciona.

#### OK — funcionam sem parametros
| Controller.Method | Retorna |
|---|---|
| `Empresa.ObterEmpresasAtivas` | Array de 322 SPEs. Campos: `Codigo_emp`, `Desc_emp`, `CGC_emp`, `IE_emp`, `InscrMunic_emp`, `Endereco_emp`, `Fone_emp` |
| `Obras.ObterObrasAtivas` | Array de 1429 obras. Campos: `Cod_obr`, `Empresa_obr`, `Descr_obr`, `Status_obr`, `Ender_obr`, `Fone_obr`, `Fisc_obr`, `DtIni_obr`, `Dtfim_obr`, `TipoObra_obr`, `EnderEntr_obr`, `CEI_obr`, `DataCad_obr`, `DataAlt_obr`, `UsrCad_obr`. **`Status_obr=0` NAO significa inativa** — a maioria das obras com dados esta em status 0; nao filtre por status |
| `Autenticador.AutenticarUsuario` | `{Token, ...}`. Uso interno |

#### PARAMS — existem mas exigem body
| Controller.Method | Body |
|---|---|
| `Planejamento.ConsultarDesembolsoPlanejamento` | `{Empresa: int, Obra: string, MesInicial: "mm/yyyy", MesFinal: "mm/yyyy"}`. Ver schema abaixo |
| `Medicao.ConsultarMedicao` | `{empresa: int, contrato: int, medicao: int}`. So serve para detalhe — nao da listagem |

#### SLOW — endpoint existe mas estoura timeout
- `ProcessoPagamento.ConsultarProcessos`: timeout >3min ate com `{Empresa, Obra}`. Servidor UAU processando sincrono. **Nao usar.**
- `ProcessoPagamento.ConsultarProcessosPagamento`: 400 "Erro na verificacao do token" — header diferente, investigar com a Globaltec.

#### MISSING — testados e retornam 404, nao tente de novo
`Pessoas.ObterPessoas`, `Localidade.ObterLocalidades`, `Recebiveis.ConsultarRecebiveis`, `ExtratoDoCliente.ObterExtratoDoCliente`, `BoletoServices.ObterBoletoPorTitulo`, `CobrancaPix.ObterCobrancaPix`, `CessaoRecebiveis.ObterCessoes`, `Venda.ObterVendasPorEmpresa`, `NotasFiscais.ConsultarNotasFiscais`, `Fiscal.ObterImpostos`, `Contabil.ConsultarLancamentos`, `Planejamento.ConsultarCurvaFisicoFinanceira`, `Financeiro.ObterTitulos`, `Titulos.ConsultarTitulos`, `TituloReceber.ConsultarTitulos`, `TituloPagar.ConsultarTitulos`, `NotaFiscal.*`, `Cliente.*`, `Fornecedor.*`, `Banco.*`, `ContaCorrente.*`, `CentroCusto.*`, `Movimento.*`, `ContasReceber.*`, `ContasPagar.*`, `Contrato.*`, `Proposta.*`, `OrdemCompra.*`, `Insumos.*`, `Produto.*`, `Composicao.*`, `Cheque.*`, `Nota.*`, `Relatorio.*`, `RH.*`, `Funcionario.*`, `Usuarios.*`, `Obras.ObterObraPorCodigo`, `Obras.ObterObrasPorEmpresa`, `Empresa.ObterEmpresa`.

**Para endpoints novos: peca a lista oficial a Globaltec/Grupo GVS.** Tentativa-e-erro queima token sem retorno.

### Schema de `Planejamento.ConsultarDesembolsoPlanejamento`

Endpoint principal hoje. **Uma linha por (Obra, Item, Composicao, Insumo, DtaRef)** — curva fisico-financeira por insumo.

| Campo | Tipo | Significado |
|---|---|---|
| `Status` | string | `"Projetado"` (planejamento fisico, `Total`=QUANTIDADE) / `"Pagar"` (compromisso futuro R$) / `"Pago"` (desembolso realizado R$) |
| `Empresa` | int | SPE (= `Codigo_emp`) |
| `Obra` | string | Codigo da obra (= `Cod_obr`) |
| `Contrato` | int | Numero do contrato na obra |
| `Produto` | int | Id do produto |
| `Composicao` | string | Codigo (ex: `"S206"`) |
| `Item` | string | Item do cronograma (ex: `"01.01"`) |
| `Insumo` | string | Codigo do insumo (ex: `"CI001"`, `"PLN2429"`) |
| `DtaRef` | string ISO | 1o dia do mes |
| `DtaRefMes` / `DtaRefAno` | int | redundante |
| `Total` | float | **Depende do Status**: em `Projetado` eh QUANTIDADE fisica, em `Pago`/`Pagar` eh valor R$ |
| `Acrescimo` | float | Acrescimos R$ (so Pago/Pagar) |
| `Desconto` | float | Descontos R$ |
| `TotalLiq` | float | **Valor liquido R$** = `TotalBruto + Acrescimo - Desconto`. **Metrica monetaria correta** |
| `TotalBruto` | float | Valor bruto R$ |

**Armadilha critica**: NUNCA some `Total` como dinheiro geral. Em `Status=Projetado` eh quantidade (sacos de cimento, horas de mao de obra) — somar tudo da numeros absurdos (vimos R$ 420 bi para Empresa 1). **Sempre use `TotalLiq` ou `TotalBruto`** e/ou filtre por `Status IN ('Pago','Pagar')`.

**Volume**: export completo (01/2010 → 12/2030, 1429 obras, 1212 com dados) = **1.934.131 linhas** = ~292MB CSV / ~164MB XLSX.

### Mapa de insumos → categorias do plano de contas GVS

`sync-service/data/insumo_map.json` — 758 codigos de insumo mapeados a categorias. Funcao `classifyInsumo(insumo)` em `server.js` retorna a categoria; fallback `"Outros"`. Fonte autoritativa eh o JSON (XLSX origem em `docs/Classificações.xlsx`, nao requerido em runtime).

Categorias usadas (com acentos/cedilha, **exatamente como aparecem**):
- `"Amortização"` — `AMORTIZACAO_CATS` em server.js (`PLN2429`, `PLN2430`)
- `"Despesas Juros Financiamento"` — `JUROS_CATS` (`PLN1823`/`24`, `PLN2431-34`)
- `"O&M (Material/Peças/Serviços)"`, `"Folha"`, `"Implantação"`, `"Encargos de Transmissão"`, `"Despesas Administrativas"`, `"Outros empréstimos"`, `"Arrendamento Terras"`, `"Comercialização da Energia"`, `"(-) Pis"`, `"(-) Cofins"`, `"Outros"`

### Resposta de `POST /api/uau/desembolso/empresa`

Body: `{empresa, mesInicial, mesFinal}`. Itera todas as obras da empresa (concorrencia 6) chamando `ConsultarDesembolsoPlanejamento`. Soma `TotalLiq`.

| Campo | Tipo | Significado |
|---|---|---|
| `totais.totalLiq` | float | Comprometido Total = soma de `TotalLiq` (todos os status) |
| `totalAmortizacao` | float | Subset de Insumos em `Amortização` |
| `totalJuros` | float | Subset em `Despesas Juros Financiamento` |
| `totalOperacional` | float | `totalLiq - totalAmortizacao - totalJuros` |
| `porStatus` | array | `[{status, total, count}]` — Pago/Pagar/Projetado |
| `porCategoria` | array | `[{categoria, total, count}]` — todas as cats, ordenado |
| `catPorStatus` | object | `{Pagar: {Encargos de Transmissão: 411601, ...}, Pago: {...}}` |
| `porMes` | array | `[{mes, totalLiq, totalBruto, count}]` |
| `topObras` | array | Top 10 obras por `TotalLiq` |
| `topItens` | array | Top 15 combinacoes `categoria + Item` por `TotalLiq` |
| `errors` | array | Erros por obra |

**Status — interpretacao**:
- `"Pago"`: desembolso realizado, saiu do caixa
- `"Pagar"`: compromisso futuro lancado (Encargos de Transmissão programados, O&M contratado). **NAO sao emprestimos** — emprestimos aparecem em `Amortização` e `Outros empréstimos`
- `"Projetado"`: planejamento fisico — `Total` = QUANTIDADE; `TotalLiq` pode ser 0 ou irrelevante

### CMU — Receita por Organizacao (`POST /api/cmu/org-stats`)

Body: `{organization, mesInicial?, mesFinal?}`.

| Campo | Tipo | Significado |
|---|---|---|
| `meters.{total, ativas, inativas, suspensos, excluidas}` | int | Contagem de UCs por status real |
| `invoices.faturado` | float | `SUM(totalAmount)` de faturas `Faturado` no periodo. **So conta `Faturado`** — exclui `Disponível` (que tem credito/negativo), `Cancelado`, `Reprovado` |
| `invoices.economia` | float | `SUM(economyValue)` das `Faturadas` (R$) |
| `invoices.kwh_compensado` | float | `SUM(compensatedEnergy)` das `Faturadas` (kWh) |
| `payments.recebido` | float | `SUM(totalAmount)` dos `Pago` |
| `payments.pendente` | float | `SUM(totalAmount)` dos `Pendente` + `Vencido` |
| `porMes` | array | `[{mes, faturado, recebido}]` |

**Periodo CMU**: dados reais a partir de 2025-10. UI padrao 01/2025 a 12/2026.

**Link UAU x CMU**: `autoMatchCmuOrg()` no frontend, sem ID compartilhado. Normaliza (remove acentos, lowercase) e cruza palavras >3 chars entre `Desc_emp` (UAU) e `organization` (CMU). Eh **textual** — confirme manualmente em casos ambiguos.

### Paginas frontend UAU

**`UauApi.jsx`** (`/uau-api`): StatusCard (conexao/token), KPIs Empresas/Obras, 4 abas:
1. **Catalogo G-Sentinel 2** — cards por endpoint com chip de status (`ok`/`params`/`slow`/`missing`), botao "Testar" desabilitado para `missing`, pre-preenche Explorer
2. **Empresas** — DataGrid
3. **Explorer** — controller + method + body arbitrarios via `/api/uau/call`
4. **Obras** — DataGrid

**`GestaoDesembolso.jsx`** (`/gestao-desembolso`): dashboard UAU x CMU.

Filtros (botao "Carregar" dispara UAU + CMU em paralelo):
- Autocomplete empresa UAU (`Codigo_emp` + `Desc_emp`)
- `MesInicial`/`MesFinal` em `mm/yyyy` (padrao 01/2025 - 12/2026)
- Autocomplete organizacao CMU — auto-preenchido por `autoMatchCmuOrg()`; editavel

KPIs UAU (4): Comprometido Total (`totais.totalLiq` — card expandido mostra breakdown Pago/Pagar/Projetado com % e top 3 categorias), Operacional, Amortizacao, Juros Financiamento.

KPIs CMU (4, apos buscar receita): UCs Ativas, Faturado, Recebido, Inadimplente.

**Resultado Liquido** (ambos carregados): `Recebido CMU - Pago UAU`. Verde positivo, vermelho negativo.

Graficos:
- BarChart combinado: Faturado CMU + Recebido CMU + Desembolso UAU por mes
- PieChart UAU por status (Pago/Pagar/Projetado)
- Barras horizontais UCs CMU por status + kWh compensado + economia
- Painel categorias (plano de contas): barras horizontais; `Amortização` e `Despesas Juros Financiamento` destacados com chips
- Top 15 `categoria + Item` por `TotalLiq`
- Modal de obra (clicando no Top 10): endereco, fiscal, tipo, data inicio, KPIs, breakdown por status, top itens

### Scripts auxiliares (`sync-service/`)

- **`export_desembolso.js`** — Baixa **TUDO** do `Planejamento.ConsultarDesembolsoPlanejamento`. Janela `01/2010 → 12/2030`, 1429 obras, concorrencia 6. Cada linha ganha `_ObraDescricao`, `_ObraStatus`, `_ObraTipo`, `_ObraDtIni`, `_ObraDtFim`. Saida: `desembolso_planejamento_<timestamp>.csv` na raiz. ~5-10min. Rodar: `cd sync-service && node export_desembolso.js`.
- **`csv_to_xlsx.js`** — Converte CSV em XLSX multi-aba (1M linhas/aba, limite Excel). `exceljs` streaming (evita OOM com 2M linhas). Parser CSV estadual lida com `\n` em campos quotados. Uso: `node csv_to_xlsx.js <caminho.csv>`.

Os arquivos de saida estao no `.gitignore` (292MB/164MB).

### .env UAU

```
UAU_BASE_URL=https://api.grupogvs.com.br/uauAPI
UAU_INTEGRATION_TOKEN=<token fixo de integracao>
UAU_USER=<usuario>
UAU_PASS=<senha>
```

### Gotchas

1. **`Total` nao eh sempre R$**: so some `TotalLiq`/`TotalBruto` para financeiro. `Total` mistura quantidade/R$ por `Status`.
2. **`Status_obr=0` eh normal**: maioria das obras ativas esta em 0. Use a presenca em `ObterObrasAtivas`, nao esse campo.
3. **Discovery eh caro**: nao chutar endpoints — peca lista oficial a Globaltec.
4. **Date format**: `MesInicial`/`MesFinal` em `mm/yyyy` (com barra). `yyyy-mm` resulta em "O mes inicial deve ser do tipo numerico e estar no formato mm/yyyy".
5. **IIS exige body**: POST com `Content-Length: 0` recusado. `uauCall()` envia `{}` por default.
6. **Token sem "Bearer"**: header `Authorization` leva o token cru. `Bearer ` → 401.
7. **Timeout granular**: nao aumente timeout geral; passe `timeout` no `uauCall()` caso a caso.
8. **Cache proativo 50min**: token expira em ~1h. Se 401 escapar, `uauCall()` refaz login uma vez.

---

## SYNC SERVICE (manter como esta)

`sync-service/sync_v2.js` — Node.js, puxa CMU → Postgres.

- **8 endpoints** em 2 fases (fase 1: entidades independentes; fase 2: dependentes de meter)
- Modo incremental (default): NÃO funciona de verdade — a API ignora o filtro `updatedAt`; todo endpoint roda full
- `--full`: re-sync completo, **RETOMA de `sync_control.last_page_processed`** (resiliente a crash/sleep — restart continua de onde parou)
- `--fresh`: junto com `--full`, força recomeço da página 1 (re-scan completo). Use quando precisar re-capturar tudo
- `--endpoint=NomeDoEndpoint`: rodar so um
- Retry exponencial (5 tentativas), graceful shutdown Ctrl+C
- Le `VITE_API_BASE_URL`/`CMU_API_BASE_URL` e `VITE_API_TOKEN`/`CMU_API_TOKEN` do `.env`

**Resiliência de conexão Neon (crítico — o sync roda horas num laptop):** o `sync_v2.js` tem `pool.on('error')` (erro de client OCIOSO) **e** `client.on('error')` por client em uso (socket morto durante transação — Neon derruba conexão / laptop dorme). Sem ambos, um erro 'error' não tratado mata o processo. ROLLBACK é defensivo e `release(err)` descarta client quebrado. **Sempre rode o sync sob `caffeinate -is`** pra impedir o laptop de dormir (causa-raiz das quedas):
```bash
cd sync-service && nohup caffeinate -is node sync_v2.js --full > /tmp/sync_full.log 2>&1 &
```
Se cair mesmo assim: NÃO reinicie cego — `tail -30 /tmp/sync_full.log` pra achar a causa, depois `--full` (sem `--fresh`) retoma do checkpoint.

**Ordem na recuperação pós-bug-de-meters:** medidores primeiro (fase 1), só depois bills/invoices/payments (fase 2) — esses checam FK de meter e PULAM registros cujo medidor não existe. Quando medidores estavam incompletos, a fase 2 perdeu registros; após completar medidores, rode fase 2 com checkpoints zerados (`UPDATE sync_control SET last_page_processed=1, last_sync_completed_at=NULL WHERE endpoint_name IN (...)`) pra recapturar o que foi pulado.

Para popular do zero: `cd sync-service && nohup caffeinate -is node sync_v2.js --full --fresh > /tmp/sync_full.log 2>&1 &` (~8-10h, ~18.700 medidores + fases 2).

---

## COMANDOS

```bash
# Frontend
npm install && npm run dev          # Vite dev server (porta padrao 5173)

# Backend
cd sync-service && npm install
node server.js                       # Express :3000 (override com PORT=)

# Sync
cd sync-service
node sync_v2.js                      # Incremental
node sync_v2.js --full               # Full re-sync
node sync_v2.js --endpoint=EnergyMeters
```

---

## ENVIRONMENT VARIABLES

`.env` na raiz (atual):
```
DATABASE_URL=postgresql://...                          # Neon Postgres
VITE_API_BASE_URL=https://server.solatioenergialivre.com.br
VITE_API_TOKEN=Bearer_token_aqui
CMU_API_BASE_URL=https://server.solatioenergialivre.com.br
CMU_API_TOKEN=Bearer_token_aqui

# UAU
UAU_BASE_URL=https://api.grupogvs.com.br/uauAPI
UAU_INTEGRATION_TOKEN=<token fixo>
UAU_USER=<usuario>
UAU_PASS=<senha>

# Opcional
PORT=3000                                              # server.js (default 3000)
```

---

## CONVENCOES

- UI em **Portugues Brasileiro**
- Moeda: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Datas ISO 8601, `referenceMonth` sempre dia 1
- Frontend: ES Modules. Sync service: CommonJS
- **MUI v7**: `<Grid size={{ xs: 12, md: 6 }}>` — NUNCA `<Grid item xs={12}>`
- **MUI X DataGrid v8**: `paginationMode="server"`
- Status configs (badges): `statusConfigs` em `src/components/shared.jsx`

---

## ARQUIVOS RELEVANTES

| Arquivo | Funcao |
|---|---|
| `src/App.jsx` | Router com 8 rotas + Layout |
| `src/components/Layout.jsx` | Sidebar 230px + navItems |
| `src/components/shared.jsx` | `KPICard`, `StatusBadge`, `PeriodFilter`, `DataField`, `InfoCard`, formatters, `statusConfigs` |
| `src/api/api.js` | `fetchApi()` + `BASE_URL=http://localhost:3000/api` |
| `src/pages/Dashboard.jsx` | KPIs + graficos + tabelas (RF geral) |
| `src/pages/Financeiro.jsx` | RF04 — financeiro |
| `src/pages/Energia.jsx` | RF01/RF03 — energia |
| `src/pages/Clientes.jsx` | Listagem + modal cliente |
| `src/pages/Inadimplencia.jsx` | Inadimplentes |
| `src/pages/UauApi.jsx` | Explorer UAU |
| `src/pages/GestaoDesembolso.jsx` | Dashboard cruzado UAU x CMU |
| `src/pages/SyncLogs.jsx` | Monitor sync_v2 |
| `src/pages/Rateio.jsx` | Existe mas nao roteado |
| `sync-service/server.js` | Express API (CMU + UAU). Bloco UAU em "UAU ERP (Globaltec / Grupo GVS) — Proxy Routes" |
| `sync-service/sync_v2.js` | Sync CMU (manter) |
| `sync-service/export_desembolso.js` | Dump completo `ConsultarDesembolsoPlanejamento` |
| `sync-service/csv_to_xlsx.js` | CSV → XLSX multi-aba streaming |
| `sync-service/data/insumo_map.json` | 758 codigos UAU → categorias plano de contas GVS |
| `docs/DASHBOARD_FIELDS.md` | Doc de metricas do dashboard CMU |
| `docs/API_AUDIT.md` | Auditoria da API CMU |
| `docs/db-samples/` | Amostras JSON de cada tabela |
| `docs/Classificações.xlsx` | XLSX origem do insumo_map (nao requerido em runtime) |

---

## MIGRACAO FUTURA PARA SUPABASE (so executar quando pedido)

**Nao mover sem instrucao direta.** Plano de referencia abaixo.

### Mudancas

- `server.js` (Express) deixa de existir — queries SQL viram chamadas Supabase (`supabase.rpc()` para complexas, `supabase.from().select()` para CRUD)
- Frontend chama Supabase direto via `@supabase/supabase-js`
- `sync_v2.js` igual, so troca `DATABASE_URL`
- Schema JSONB identico
- Funcionalidades identicas

### Passos

1. **Criar tabelas no Supabase** — rodar os 9 `CREATE TABLE` no SQL Editor (padrao acima)
2. **Popular**: trocar `DATABASE_URL` para Supabase no `.env`, `cd sync-service && node sync_v2.js --full` (~3-5h)
3. **Instalar client**: `npm install @supabase/supabase-js`
4. **Configurar**:
   ```js
   import { createClient } from '@supabase/supabase-js'
   const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
   ```
5. **Converter queries**:
   - **RPC functions** (recomendado para complexas — dashboard stats, JOINs faturas+bills, ILIKE multi-campo, agregacoes)
   - **Queries diretas** para CRUD simples: `supabase.from('cmu_energy_meters').select('data', {count:'exact'}).ilike('data->>name', '%X%').range(off, off+ps-1)`
6. **RLS**: read-only para o frontend.
   ```sql
   ALTER TABLE cmu_energy_meters ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "allow_read" ON cmu_energy_meters FOR SELECT USING (true);
   ```
   Repetir nas 9 tabelas. Ou usar `service_role` se sem auth de usuario.

### Variaveis adicionais
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=postgresql://postgres:senha@db.xxx.supabase.co:5432/postgres
```

### Cron de sync apos migracao
1. `pg_cron` + Edge Function (nativo Supabase)
2. GitHub Actions com workflow scheduled (`node sync_v2.js`)
3. Host separado (Railway/Render) com cron

### Checklist
- [ ] Criar projeto Supabase
- [ ] Criar as 9 tabelas
- [ ] RLS allow read
- [ ] `sync_v2.js --full` com `DATABASE_URL` Supabase
- [ ] Instalar `@supabase/supabase-js`
- [ ] RPC functions para queries complexas (dashboard, faturas+bills JOIN, financial/energy stats, org-stats, desembolso/empresa)
- [ ] Substituir `fetchApi()` por chamadas Supabase em cada pagina
- [ ] Para UAU: manter um proxy minimo (Edge Function) pois auth 2FA com headers customizados nao da pra fazer direto do frontend
- [ ] Testar todas as paginas
- [ ] Cron sync automatico
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Remover `server.js` e dependencia do Express
