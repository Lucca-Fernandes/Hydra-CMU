# 📘 Solatio Energy Livre - Documentação de Integração (Dashboard)

Este documento detalha a arquitetura, endpoints e regras de negócio utilizadas na integração entre o Frontend (React) e a API da Solatio para a gestão de Unidades Consumidoras e Faturas.

---

## 🚀 1. Visão Geral do Fluxo
O sistema permite que o usuário visualize o histórico de faturas de uma Unidade Consumidora (UC), acessando tanto o demonstrativo gerado pela **Solatio** quanto a fatura original da **Concessionária (Ex: CEMIG)**. Além disso, consolida os indicadores de saldo de energia injetada.

---

## 🔗 2. Endpoints e Autenticação

### Ambientes
- **Desenvolvimento:** `https://dev-server.solatioenergialivre.com.br`
- **Produção:** `https://server.solatioenergialivre.com.br`

### Autenticação
As requisições devem incluir o Header:
`Authorization: Bearer {SEU_TOKEN_JWT}`

---

## 🏗️ 3. Entidades Principais e Relacionamentos

### A. EnergyMeters (Unidades Consumidoras)
Representa o cliente e sua instalação física. Contém os dados de saldo acumulado.
- **Endpoint:** `GET /EnergyMeters`
- **Identificador:** `energyMeterID`

### B. EnergyMeterInvoices (Demonstrativos Solatio)
Fatura gerada pela Solatio com os benefícios/descontos.
- **Endpoint:** `GET /EnergyMeterInvoices`
- **Filtro Recomendado:** `?filters={"energyMeterID": 123}&rawData=false`
- **Campo PDF:** `energyInvoiceFile`

### C. EnergyMeterBills (Contas da Distribuidora)
A fatura bruta da concessionária (CEMIG, etc).
- **Endpoint:** `GET /EnergyMeterBills/{id}`
- **Identificador:** `energyMeterBillID`
- **Campo PDF:** `energyBillFile`

---

## 🛠️ 4. Regras de Negócio e Implementação Técnica

### 📊 Lógica de Saldos (KPIs)
Existem dois tipos de saldo no sistema, ambos localizados dentro do objeto `energyMeter`:

1.  **`lastInvoiceEnergyBalance` (Principal):** Saldo acumulado de energia (kWh) após o processamento do último demonstrativo Solatio. É o crédito que o cliente possui para abates futuros.
2.  **`lastBillEnergyBalance` (Secundário):** Saldo remanescente diretamente na concessionária. Representa a "sobra" de energia injetada que ficou acumulada no medidor da distribuidora.

### O Parâmetro `rawData`
Este é o parâmetro mais importante da API Solatio:
- `rawData=true` (Default): Otimiza a resposta omitindo objetos filhos e URLs de arquivos. **Os botões de PDF ficarão desabilitados.**
- `rawData=false`: **Obrigatório** para o Dashboard. Retorna os objetos `energyMeterBill` e as URLs de PDF.

### Tratamento de Duplicatas (Mês de Referência)
A API retorna o histórico completo de tentativas de faturamento. Para exibir apenas uma linha por mês no Frontend:
1. Ordene por data de criação (`createdAt` ou `updatedAt`).
2. Mantenha apenas o registro mais recente ou com status `Faturado`.

---

## 📊 5. Mapeamento de Campos (UI vs API)

| Coluna UI | Propriedade API | Tratamento / Formatação |
| :--- | :--- | :--- |
| **Mês Ref.** | `referenceMonth` | `date-fns` ou `Intl.DateTimeFormat` (MM/YYYY) |
| **Saldo (kWh)** | `energyMeter.lastInvoiceEnergyBalance` | `Intl.NumberFormat` (pt-BR) |
| **Valor Solatio** | `totalAmount` | `Intl.NumberFormat` (BRL) |
| **Economia** | `economyValue` | `Intl.NumberFormat` (BRL) |
| **Status** | `energyMeterInvoiceStatus` | Mapear strings para Cores (Chip/Badge) |
| **PDF Solatio** | `energyInvoiceFile` | Link direto (S3/Cloudfront) |
| **PDF CEMIG** | `energyMeterBill.energyBillFile` | Link direto (S3/Cloudfront) |

---

## ⚠️ 6. Troubleshooting (FAQ)

**1. Erro 401 (Unauthorized) no Swagger?**
O token JWT expira periodicamente. Pegue o token atual na aba *Network* do navegador enquanto estiver logado na aplicação.

**2. PDF da CEMIG não abre?**
Verifique se o `energyMeterBillID` não é nulo. Caso seja, utilize `GET /EnergyMeterBills/{id}` para buscar o dado atualizado via Lazy Loading.

**3. Tela Branca/Preta ao carregar saldos?**
Sempre utilize *Optional Chaining* (`row.energyMeter?.lastInvoiceEnergyBalance`) para evitar erros caso a UC não possua dados de saldo vinculados.

---
*Documentação atualizada em: 18 de Março de 2026*# Hydra-CMU
