# Auditoria Completa da API CMU Solatio

**Data**: 2026-03-27
**Base URL**: `https://server.solatioenergialivre.com.br`
**Swagger**: `https://dev-server.solatioenergialivre.com.br/docs/index.html`

---

## 1. Endpoints Disponíveis na API

| Endpoint | Usamos? | No Banco? | Volume Estimado | Observações |
|---|---|---|---|---|
| `EnergyMeters` | SIM | SIM | ~6.000 | Tabela principal |
| `EnergyMeterBills` | SIM | SIM | ~19.000 | Contas da concessionária |
| `EnergyMeterInvoices` | SIM | SIM | ~20.000 | Faturas Solatio |
| `EnergyMeterPayments` | SIM | SIM | ~14.000 | Pagamentos/Boletos |
| **`Contacts`** | NAO | NAO | Desconhecido | Contatos de responsáveis (nome, email, tel, função) |
| **`Customers`** | NAO | NAO | Desconhecido | Acessos/perfis de usuários (email, tel do grupo) |
| **`Prospectors`** | NAO | NAO | Desconhecido | Parceiros comerciais (email, tel, CNPJ, endereço) |
| **`Vouchers`** | NAO | NAO | Desconhecido | Cupons/contratos (% economia, fórmulas, comissões) |
| **`Leads`** | NAO | NAO | 0 retornados | Prospectos — vazio para este perfil de token |
| **`Tickets`** | NAO | NAO | BLOQUEADO | Atendimentos — `AccessViolationException` para este perfil |
| **`ProspectorAPI/Data`** | NAO | NAO | Sob demanda | Endpoint unificado (fatura+bill+payment) — requer filtro obrigatório |
| **`Queries/GetCustomerDebits/{cpf}`** | NAO | NAO | Sob demanda | Boletos em aberto por CPF |

---

## 2. Diagnóstico: Campos Faltantes no Frontend

### O que o card mostra como "---" ou "Não informado"

| Campo no Card | Campo no JSONB | Status nos 6.000 meters | Causa Raiz |
|---|---|---|---|
| **Nº Cliente** | `customerNumber` | Preenchido em ~100% | Caso pontual da API não ter cadastrado |
| **Logradouro** | `address` | Preenchido em ~100%, mas alguns com "Não informado" | **API envia literal "Não informado"** — dado não cadastrado na origem |
| **Bairro** | `addressDistrict` | Idem | Idem |
| **E-mails** | `emails` | **VAZIO em 100%** dos meters testados | Campo existe mas nunca é preenchido pela API |
| **Telefones** | `phones` | **VAZIO em 100%** dos meters testados | Idem |
| **Banco** | `bank` | **NULL em 100%** | Não é preenchido no cadastro do meter |
| **Agência/Conta** | `agency` / `account` | **NULL em 100%** | Idem |

### Conclusão sobre emails/phones
Os campos `emails` e `phones` no nível do EnergyMeter são **SEMPRE VAZIOS** em toda a base (testamos páginas 1 e 100). A API simplesmente não popula esses campos. Os dados de contato que existem estão em:

1. **`data.customer.email`** e **`data.customer.phone`** — MAS são do perfil de "Acesso" do grupo/parceiro (ex: `gvs.geral@cmuenergia.com.br`), **NÃO** do consumidor final individual.

2. **`Contacts`** — Endpoint separado com contatos de responsáveis (Representante Legal, Financeiro, Titular). Têm email e telefone reais, MAS **não tem vínculo direto com energyMeterID**. O campo `responsibilitys` está sempre vazio `[]`.

---

## 3. Fontes Alternativas de Dados (Cross-Reference)

### Contacts (NOVO - não está no banco)
```json
{
  "contactID": 1759,
  "name": "Guilherme Henrique Souza Sacramento",
  "function": "Representante Legal",
  "email": "GSacramento@brasal.com.br",
  "phone": "3425120200",
  "comment": "CPF nº 067.440.476-98, residente em Uberlândia/MG..."
}
```
**Problema**: Não tem `energyMeterID` nem `userID` — sem vínculo direto com medidores.
**Possível uso**: Cruzamento por nome ou via campo `comment` que contém CPF.

### Customers (NOVO - não está no banco)
```json
{
  "userID": 306422,
  "role": "Acesso",
  "name": "POPSOL - Acesso Global à área do cliente",
  "email": "contato@popsolenergia.com.br",
  "phone": "3121169200"
}
```
**Vínculo**: EnergyMeter → `userID` → Customer. Já vem embutido no JSONB do meter como `data.customer`.
**Uso**: Já temos dentro do JSONB, mas o frontend não usa.

### Prospectors (NOVO - não está no banco)
```json
{
  "userID": 346433,
  "role": "Prospector",
  "name": "GVS HOLDING DE PARTICIPAÇÕES E INVESTIMENTOS LTDA",
  "email": "marcus.moulin@grupogvs.com.br",
  "contactEmail": "marcelo.baltazar@grupogvs.com.br",
  "registrationNumber": null
}
```
**Vínculo**: EnergyMeter → `voucher.prospector.userID`.
**Uso**: Já vem embutido no JSONB como `data.voucher.prospector`. Tabela dedicada seria útil para dashboards de performance por parceiro.

### Vouchers (NOVO - não está no banco)
```json
{
  "voucherID": 911,
  "code": "GVS - IGREEN 10%",
  "economyPercentage": 10,
  "economyFormula": "...",
  "commissionFormula": "..."
}
```
**Vínculo**: EnergyMeter → `voucherID`.
**Uso**: Já vem embutido no JSONB como `data.voucher`. Tabela dedicada útil para gestão de contratos/comissões.

### Payments → Endereço (JÁ NO BANCO)
Payments têm `addressStreet`, `addressCity`, `addressState`, `addressDistrict`, `addressPostalCode` preenchidos. Podem ser fallback quando o meter tem "Não informado".

### ProspectorAPI/Data (ENDPOINT UNIFICADO)
Requer filtro obrigatório: `referenceMonth`, `lastModify`, ou `energyMeterID`.
**Uso potencial**: Sync incremental futuro — filtrar por `lastModify` nas últimas 24h para pegar apenas alterações.

---

## 4. Descoberta Importante: rawData=false no EnergyMeterInvoices

Quando chamamos `/EnergyMeterInvoices?rawData=false`, a API retorna o objeto `energyMeterBill` **embutido dentro da fatura**, incluindo:
- `energyBillFile` (PDF da concessionária)
- `customerNumber`
- `info` (texto completo da conta)
- Todos os dados de tarifa e consumo

Isso é **exatamente** o que o `server.js` faz com o JOIN manual no Postgres. Se usarmos `rawData=false` no sync, poderíamos simplificar.

Porém: o sync atual usa `rawData=true` porque o payload é menor e mais rápido para volume alto.

---

## 5. Limitações Encontradas

1. **`Tickets`** — Bloqueado: `AccessViolationException: Operação não permitida para esse perfil de usuário`
2. **`Leads`** — Retorna array vazio (pode ser que o token não tenha acesso ou não existam leads)
3. **`Contacts`** — Sem vínculo com `energyMeterID` (campo `responsibilitys` sempre vazio)
4. **`meta.count`** — Sempre retorna 0 em todos os endpoints (bug da API ou feature não implementada)
5. **`emails`/`phones` nos Meters** — Campos existem na API mas nunca são preenchidos

---

## 6. Recomendações para Enriquecimento

### Ações de Curto Prazo (sem novo sync)

| Ação | Esforço | Impacto |
|---|---|---|
| Usar `data.customer.phone` como fallback de telefone no frontend | Baixo | Mostra pelo menos o tel do grupo |
| Usar endereço dos Payments como fallback | Baixo | Preenche endereços "Não informado" |
| Mostrar `currentStatus`/`energyMeterStatus` em vez de `contractStatus` | Baixo | Status mais relevante |
| Usar `data.voucher.prospector.contactEmail` no card | Baixo | Email do parceiro comercial |

### Ações de Médio Prazo (novo sync necessário)

| Ação | Esforço | Impacto |
|---|---|---|
| Sincronizar `Contacts` para tabela `cmu_contacts` | Médio | Dados de responsáveis reais (Titular, Financeiro) |
| Criar cruzamento Contacts ↔ Meters por CPF do `comment` | Alto | Vincular contatos reais aos medidores |
| Sincronizar `Vouchers` e `Prospectors` como tabelas dedicadas | Médio | Dashboard de performance por parceiro |
| Usar `ProspectorAPI/Data?lastModify=...` para sync incremental | Alto | Atualização diária em produção |

### Dados que NÃO EXISTEM em lugar nenhum da API
- Email pessoal do consumidor final
- Dados bancários do consumidor (banco, agência, conta)
- Birthday (sempre null)
