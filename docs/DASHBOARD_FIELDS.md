# Dashboard — Campos e Metricas

## KPIs - Linha 1 (Financeiro/Operacional)

| Card | Valor | Origem (tabela/campo) | Significado |
|---|---|---|---|
| **MEDIDORES ATIVOS** | Quantidade | `cmu_energy_meters` agrupado por `energyMeterStatus` = 'Ativa' | UCs efetivamente operando. Subtitulo mostra o total geral (inclui Desconectada, Cancelada, etc) |
| **RECEITA LIQUIDADA** | R$ soma | `cmu_energy_meter_payments` onde `energyMeterPaymentStatus` = 'Pago' | Dinheiro que efetivamente entrou — boletos confirmados como pagos |
| **FATURAS PENDENTES** | Quantidade | `cmu_energy_meter_invoices` com status 'Faturado' + 'Pendente' | Faturas emitidas que ainda nao foram processadas/pagas. Subtitulo mostra o valor total em R$ |
| **INADIMPLENCIA** | R$ soma | `cmu_energy_meters` onde `expiredPaymentsTotalAmount` > 0 | Total de divida vencida em toda a base. Subtitulo mostra quantos medidores estao devendo |

## KPIs - Linha 2 (Energia/Economia)

| Card | Valor | Origem (tabela/campo) | Significado |
|---|---|---|---|
| **ENERGIA COMPENSADA** | kWh total | `cmu_energy_meter_invoices` → `compensatedEnergy` (faturas validas, exclui Cancelado/Reprovado) | Total de energia que as usinas solares geraram e injetaram para os clientes. Subtitulo = **eficiencia** = `compensada / consumida * 100`. Ex: 72% = usinas cobrem 72% do consumo |
| **ECONOMIA GERADA** | R$ soma | `cmu_energy_meter_invoices` → `economyValue` (faturas validas) | Quanto os clientes economizaram usando energia solar Solatio vs tarifa cheia da concessionaria |
| **CUSTO CONCESSIONARIA** | R$ soma | `cmu_energy_meter_bills` → `totalAmount` | Total das contas de luz das distribuidoras (CEMIG, COELBA, etc). O que o cliente pagaria SEM a Solatio |
| **VOLUME FATURADO** | R$ soma | `cmu_energy_meter_invoices` → `totalAmount` (todos os status) | Tudo que a Solatio emitiu em faturas — inclui pagas, pendentes, canceladas. Faturamento bruto |

## Graficos - Linha 1

| Grafico | Tipo | Origem | Significado |
|---|---|---|---|
| **Faturamento Mensal** | Barras (12 meses) | `cmu_energy_meter_invoices` agrupado por `referenceMonth`, soma `totalAmount` (exclui Cancelado/Reprovado) | Tendencia de receita mensal. Cada barra = faturamento daquele mes |
| **Medidores por Status** | Pizza | `cmu_energy_meters` agrupado por `energyMeterStatus` | Saude da base: Ativa, Desconectada, Cancelada, etc. Idealmente quase tudo "Ativa" |
| **Distribuicao por Estado** | Pizza | `cmu_energy_meters` agrupado por `addressState` (top 7) | Onde estao os clientes geograficamente (MG, GO, BA, etc) |

## Graficos - Linha 2

| Grafico | Tipo | Origem | Significado |
|---|---|---|---|
| **Medidores por Distribuidora** | Pizza | `cmu_energy_meters` → `data.distributor.alias` | Quais concessionarias atendem os clientes (CEMIG, EQUATORIAL GO, COELBA, etc). Importante para dependencia regulatoria |
| **Classe de Consumo** | Pizza | `cmu_energy_meters` → `class` | Perfil: Residencial, Comercial, Rural, Industrial. Define tarifas e regras diferentes |
| **Top Parceiros** | Ranking | `cmu_energy_meters` → `data.voucher.prospector.name` (top 10) | Parceiros comerciais que mais trouxeram clientes. Ranking por volume de medidores |

## Tabelas

| Tabela | Origem | Significado |
|---|---|---|
| **Faturas por Status** | `cmu_energy_meter_invoices` agrupado por `energyMeterInvoiceStatus` | Breakdown: Faturado, Disponivel, Cancelado, Retido, Reprovado — quantidade e valor R$ |
| **Pagamentos por Status** | `cmu_energy_meter_payments` agrupado por `energyMeterPaymentStatus` | Breakdown: Pendente, Errado, Vencido, Cancelado, Pago, Simulacao — quantidade e valor R$ |

## Status possiveis

### Faturas (`energyMeterInvoiceStatus`)
- **Faturado** — fatura emitida, aguardando processamento
- **Disponivel** — disponivel para pagamento
- **Cancelado** — cancelada
- **Retido** — retida (pendencia administrativa)
- **Reprovado** — reprovada (erro nos dados)

### Pagamentos (`energyMeterPaymentStatus`)
- **Pendente** — boleto gerado, aguardando pagamento
- **Pago** — pagamento confirmado (equivale a "Liquidado")
- **Vencido** — passou da data de vencimento sem pagamento
- **Errado** — erro no boleto/dados
- **Cancelado** — boleto cancelado
- **Simulacao** — simulacao (nao eh real)

> **IMPORTANTE**: NAO existe status "Liquidado" nos pagamentos nem nas faturas. O status correto para pagamento confirmado eh "Pago".

## Fluxo de negocio

```
Cliente contrata Solatio
  -> Usina gera ENERGIA COMPENSADA (kWh)
  -> Cliente consome energia da rede
  -> Concessionaria cobra CUSTO CONCESSIONARIA (R$)
  -> Solatio emite fatura com desconto -> VOLUME FATURADO (R$)
  -> Diferenca = ECONOMIA GERADA (R$)
  -> Cliente paga boleto -> RECEITA LIQUIDADA (R$)
  -> Se nao paga a tempo -> INADIMPLENCIA (R$)
  -> Se paga atrasado -> sai da inadimplencia (status Vencido -> Pago)
```

## Cache

Os dados do dashboard sao cacheados por **5 minutos** no backend (`CACHE_TTL = 5 * 60 * 1000`). Ao aplicar filtros de periodo, o cache eh bypassado pois os query params mudam.
