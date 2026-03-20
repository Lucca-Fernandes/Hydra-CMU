📘 Solatio Energy Livre - Dashboard & Sync Service
Este repositório contém a solução completa para gestão de Unidades Consumidoras (UCs) e Faturas da Solatio. A arquitetura foi evoluída de um consumo direto de API externa para um modelo de Espelhamento de Dados (Data Sync), garantindo performance de milissegundos em consultas complexas.

🚀 1. Arquitetura do Sistema
A solução é dividida em três camadas principais:

Sync Service (Node.js): Script de alto desempenho que consome os endpoints da Hydra V1 (Solatio) e popula o banco de dados Postgres.

Backend API (Express + PG): Ponte de comunicação que realiza buscas globais e filtros avançados diretamente no banco de dados.

Frontend (React + Material UI): Dashboard interativo para visualização de indicadores, faturas e status financeiro.

📦 2. Estrutura do Banco de Dados (PostgreSQL/Neon)
Utilizamos a estratégia de JSONB Storage para manter a fidelidade aos dados da API original sem perder a flexibilidade do SQL.

Tabelas Principais:
cmu_contacts: Dados de contato e representantes legais.

cmu_energy_meters: Unidades consumidoras, endereços e saldos de kWh.

cmu_energy_meter_invoices: Histórico de faturamentos e links de PDFs.

cmu_leads: Gestão de prospecção e novos clientes.

🔄 3. O Sync Service (Carga de Dados)
O serviço de sincronização (sync.js) utiliza Paralelismo e Upsert para garantir velocidade.

Como funciona:
Paralelismo: Busca 5 páginas simultâneas da API Solatio.

Performance: Utiliza ON CONFLICT DO NOTHING para ignorar registros já existentes, focando apenas em novos dados.

Configuração: Localizado em /sync-service.

Comando para rodar a carga:

Bash
node sync.js
🔗 4. API de Consulta (Backend Local)
Diferente da API original, nosso backend realiza buscas case-insensitive e globais dentro do JSON.

Endpoints Customizados:
GET /api/EnergyMeters: Lista UCs.

Lógica de Busca: Converte o JSON para texto (data::text) permitindo achar termos em qualquer campo (Nome, Fantasia, CPF, Medidor).

GET /api/EnergyMeterInvoices: Retorna faturas de uma UC específica já ordenadas por mês de referência.

Filtros Suportados (via JSON Query):

JavaScript
{
  "name": "Padaria",
  "energyMeterStatus": "Ativa",
  "pendingPayments": { ">": 0 } // Filtro para inadimplentes
}
🛠 5. Integração com o Frontend (React)
Para conectar o Dashboard ao novo ecossistema, o arquivo src/api/api.js deve apontar para o servidor local:

JavaScript
export const BASE_URL = 'http://localhost:3001/api';
Exemplo de Chamada no Componente:
JavaScript
const url = `/EnergyMeters?filters=${encodeURIComponent(JSON.stringify(filters))}`;
const res = await fetchApi(url);
📊 6. Regras de Negócio Implementadas
A. Busca Global "Smart"
A busca por texto no Dashboard não se limita ao nome. Graças ao operador ILIKE no Postgres, o sistema encontra:

Nome do Cliente

Nome Fantasia (businessName)

Número da Instalação (meterNumber)

CPF/CNPJ (registrationNumber)

B. Gestão de Status Financeiro
O campo pendingPayments é tratado no banco como um inteiro. No Frontend:

pendingPayments > 0: Exibe Badge "Débito" (Vermelho).

pendingPayments = 0: Exibe Badge "Em dia" (Verde).

C. Tratamento de PDFs
O parâmetro rawData=false foi fixado no backend para garantir que as URLs do S3 (energyInvoiceFile) estejam sempre disponíveis para visualização imediata no DataGrid.

⚠️ 7. Troubleshooting & Manutenção
1. O número de registros no Dashboard está menor que no Neon?

Certifique-se de que o backend está usando ILIKE e pesquisando no data::text.

Verifique o LIMIT na query SQL do server.js (padrão 50 ou 100).

2. Erro de Conexão (ECONNRESET) no Sync?

O script de sincronização já possui tratamento para ignorar falhas momentâneas e continuar o processo. Basta rodar node sync.js novamente para preencher lacunas.

3. Backend não inicia?

Verifique se o arquivo .env na raiz do projeto contém a variável DATABASE_URL apontando para o seu cluster do Neon.

Última atualização: 20 de Março de 2026
Responsável: lUCCA F
