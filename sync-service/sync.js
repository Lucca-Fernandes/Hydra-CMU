const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

const api = axios.create({
    baseURL: process.env.VITE_API_BASE_URL || process.env.CMU_API_BASE_URL,
    headers: { 'Authorization': `Bearer ${process.env.VITE_API_TOKEN}` },
    timeout: 180000,
    // Isso mantém a conexão aberta e evita erros de rede bobos
    httpsAgent: new https.Agent({ keepAlive: true }) 
});

async function syncEndpoint(endpoint, tableName, idField) {
    console.log(`\n--- 🔄 Sincronizando: ${endpoint} ---`);
    
    // Garante que o controle de sincronização existe
    await pool.query(`
        INSERT INTO sync_control (endpoint_name, last_page_processed) 
        VALUES ($1, 1) ON CONFLICT (endpoint_name) DO NOTHING
    `, [endpoint]);

    const resControl = await pool.query("SELECT last_page_processed FROM sync_control WHERE endpoint_name = $1", [endpoint]);
    let currentPage = resControl.rows[0].last_page_processed;
    
    let hasMore = true;
    const pageSize = 15; 

    while (hasMore) {
        try {
            console.log(`> [${endpoint}] Lendo página ${currentPage}...`);
            const response = await api.get(`/${endpoint}?page=${currentPage}&pageSize=${pageSize}&rawData=true`);
            
            // Com rawData=true, os itens geralmente vêm direto em response.data
            const items = response.data;

            if (!items || items.length === 0) {
                console.log(`✅ ${endpoint} finalizado.`);
                hasMore = false;
                break;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const item of items) {
                    // --- LÓGICA DE CAPTURA DE ID CORRIGIDA ---
                    // 1. Tenta o idField na raiz (Ex: item.energyMeterBillID)
                    // 2. Tenta o idField dentro de .data (caso a API mude o comportamento)
                    // 3. Tenta 'id' genérico como última opção
                    let id = item[idField] || (item.data ? item.data[idField] : null) || item.id;
                    
                    if (!id) {
                        // Se não encontrar o ID, ignora o registro para não quebrar o loop
                        continue; 
                    }

                    // Define o objeto de dados que será salvo na coluna JSONB
                    const finalData = item.data ? item.data : item;

                    // Captura o vínculo com o medidor
                    const meterId = item.energyMeterID || (item.data ? item.data.energyMeterID : null) || item.energy_meter_id || null;

                    if (tableName === 'cmu_energy_meters') {
                        await client.query(`
                            INSERT INTO ${tableName} (id, name, data)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = NOW()
                        `, [id, finalData.name || finalData.alias || 'Sem Nome', finalData]);
                    } else {
                        await client.query(`
                            INSERT INTO ${tableName} (id, energy_meter_id, data)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (id) DO UPDATE SET energy_meter_id = EXCLUDED.energy_meter_id, data = EXCLUDED.data, updated_at = NOW()
                        `, [id, meterId, finalData]);
                    }
                }

                // Atualiza o progresso no banco
                await client.query("UPDATE sync_control SET last_page_processed = $1, updated_at = NOW() WHERE endpoint_name = $2", [currentPage, endpoint]);
                await client.query('COMMIT');
                currentPage++;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error(`⚠️ Erro em ${endpoint} (Pág ${currentPage}):`, error.message);
            // Aguarda 5 segundos para retry em caso de erro de rede ou API
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

async function runFullSync() {
    try {
        console.log('🚀 INICIANDO SINCRONIZAÇÃO COMPLETA...');
        
        // 1. Medidores
        await syncEndpoint('EnergyMeters', 'cmu_energy_meters', 'id');
        
        // 2. Contas (Bills) - Usando o ID confirmado no Swagger
        await syncEndpoint('EnergyMeterBills', 'cmu_energy_meter_bills', 'energyMeterBillID');
        
        // 3. Faturas (Invoices) - Usando o ID confirmado no seu JSON
        await syncEndpoint('EnergyMeterInvoices', 'cmu_energy_meter_invoices', 'energyMeterInvoiceID');
        
        console.log('\n✨ BANCO DE DADOS TOTALMENTE SINCRONIZADO!');
    } catch (e) {
        console.error('🔥 Erro fatal durante a sincronização:', e.message);
    } finally {
        await pool.end();
    }
}

runFullSync();