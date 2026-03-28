const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const api = axios.create({
    baseURL: process.env.VITE_API_BASE_URL || process.env.CMU_API_BASE_URL,
    headers: { 'Authorization': `Bearer ${process.env.VITE_API_TOKEN || process.env.CMU_API_TOKEN}` },
    timeout: 180000
});

const PAGE_SIZE = 15;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 5000;

// ============================================================
// REGISTRY DE ENDPOINTS
// ============================================================
// Fase 1: Entidades independentes (sem FK)
// Fase 2: Dependentes do medidor (FK para cmu_energy_meters)

const ENDPOINTS = [
    // --- Fase 1 ---
    {
        name: 'EnergyMeters',
        table: 'cmu_energy_meters',
        idField: 'id',
        phase: 1,
        hasMeterFK: false,
        isMeter: true,
        supportsIncremental: true,
    },
    {
        name: 'Contacts',
        table: 'cmu_contacts',
        idField: 'contactID',
        phase: 1,
        hasMeterFK: false,
        isMeter: false,
        supportsIncremental: false, // API pode não suportar filtro updatedAt
    },
    {
        name: 'Customers',
        table: 'cmu_customers',
        idField: 'userID',
        phase: 1,
        hasMeterFK: false,
        isMeter: false,
        supportsIncremental: false,
    },
    {
        name: 'Prospectors',
        table: 'cmu_prospectors',
        idField: 'userID',
        phase: 1,
        hasMeterFK: false,
        isMeter: false,
        supportsIncremental: false,
    },
    {
        name: 'Vouchers',
        table: 'cmu_vouchers',
        idField: 'voucherID',
        phase: 1,
        hasMeterFK: false,
        isMeter: false,
        supportsIncremental: false,
    },
    // --- Fase 2 (dependem de EnergyMeters) ---
    {
        name: 'EnergyMeterBills',
        table: 'cmu_energy_meter_bills',
        idField: 'energyMeterBillID',
        phase: 2,
        hasMeterFK: true,
        isMeter: false,
        supportsIncremental: true,
    },
    {
        name: 'EnergyMeterInvoices',
        table: 'cmu_energy_meter_invoices',
        idField: 'energyMeterInvoiceID',
        phase: 2,
        hasMeterFK: true,
        isMeter: false,
        supportsIncremental: true,
    },
    {
        name: 'EnergyMeterPayments',
        table: 'cmu_energy_meter_payments',
        idField: 'energyMeterPaymentID',
        phase: 2,
        hasMeterFK: true,
        isMeter: false,
        supportsIncremental: true,
    },
];

// ============================================================
// UTILITÁRIOS
// ============================================================

function log(level, endpoint, message) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level}] [${endpoint || 'SYNC'}] ${message}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function withRetry(fn, label) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            log('ERROR', label, `Tentativa ${attempt}/${MAX_RETRIES} falhou: ${err.message}`);
            if (attempt === MAX_RETRIES) throw err;
            log('WARN', label, `Retentando em ${delay / 1000}s...`);
            await sleep(delay);
        }
    }
}

function extractId(item, idField) {
    return item[idField] || (item.data ? item.data[idField] : null) || item.id;
}

function extractMeterId(item) {
    return item.energyMeterID || (item.data ? item.data.energyMeterID : null) || item.energy_meter_id || null;
}

function extractData(item) {
    return item.data ? item.data : item;
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

let shutdownRequested = false;

process.on('SIGINT', () => {
    shutdownRequested = true;
    log('WARN', null, 'SIGINT recebido — finalizando página atual...');
});
process.on('SIGTERM', () => {
    shutdownRequested = true;
    log('WARN', null, 'SIGTERM recebido — finalizando página atual...');
});

// ============================================================
// UPSERT POR TIPO
// ============================================================

async function upsertRow(client, ep, item) {
    const id = extractId(item, ep.idField);
    if (!id) return { skipped: true, reason: 'sem ID' };

    const finalData = extractData(item);

    if (ep.isMeter) {
        const name = finalData.name || finalData.alias || 'Sem Nome';
        await client.query(`
            INSERT INTO ${ep.table} (id, name, data)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = NOW()
        `, [id, name, finalData]);
        return { skipped: false };
    }

    if (ep.hasMeterFK) {
        const meterId = extractMeterId(item);
        if (meterId) {
            const check = await client.query('SELECT id FROM cmu_energy_meters WHERE id = $1', [meterId]);
            if (check.rowCount === 0) {
                return { skipped: true, reason: `medidor ${meterId} não encontrado` };
            }
        }
        await client.query(`
            INSERT INTO ${ep.table} (id, energy_meter_id, data)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET energy_meter_id = EXCLUDED.energy_meter_id, data = EXCLUDED.data, updated_at = NOW()
        `, [id, meterId, finalData]);
        return { skipped: false };
    }

    // Entidade independente (Contacts, Customers, Prospectors, Vouchers)
    await client.query(`
        INSERT INTO ${ep.table} (id, data)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [id, finalData]);
    return { skipped: false };
}

// ============================================================
// SYNC DE UM ENDPOINT
// ============================================================

async function syncEndpoint(ep, { mode }) {
    log('INFO', ep.name, `Iniciando sync (modo: ${mode})`);

    // Garante registro no sync_control
    await pool.query(`
        INSERT INTO sync_control (endpoint_name, last_page_processed)
        VALUES ($1, 1) ON CONFLICT (endpoint_name) DO NOTHING
    `, [ep.name]);

    const controlRes = await pool.query(
        'SELECT last_page_processed, last_sync_completed_at FROM sync_control WHERE endpoint_name = $1',
        [ep.name]
    );
    const control = controlRes.rows[0];

    // Decidir modo efetivo
    let effectiveMode = mode;
    let filterParam = '';

    if (mode === 'incremental') {
        if (!control.last_sync_completed_at) {
            log('WARN', ep.name, 'Nunca completou sync completo — forçando modo full');
            effectiveMode = 'full';
        } else if (!ep.supportsIncremental) {
            log('INFO', ep.name, 'Endpoint não suporta incremental — executando full');
            effectiveMode = 'full';
        } else {
            const since = control.last_sync_completed_at.toISOString();
            filterParam = `&filters=${encodeURIComponent(JSON.stringify({ updatedAt: { ">=": since } }))}`;
            log('INFO', ep.name, `Incremental desde ${since}`);
        }
    }

    // Reset página no modo full
    let currentPage;
    if (effectiveMode === 'full') {
        await pool.query(
            'UPDATE sync_control SET last_page_processed = 1 WHERE endpoint_name = $1',
            [ep.name]
        );
        currentPage = 1;
    } else {
        // Incremental sempre começa da página 1 (com filtro de data)
        currentPage = 1;
    }

    let totalProcessed = 0;
    let totalSkipped = 0;
    let hasMore = true;

    while (hasMore && !shutdownRequested) {
        const pageResult = await withRetry(async () => {
            const url = `/${ep.name}?page=${currentPage}&pageSize=${PAGE_SIZE}&rawData=true${filterParam}`;
            log('INFO', ep.name, `Página ${currentPage}...`);

            const response = await api.get(url);
            const items = response.data;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return { done: true, processed: 0, skipped: 0 };
            }

            const client = await pool.connect();
            let pageProcessed = 0;
            let pageSkipped = 0;

            try {
                await client.query('BEGIN');

                for (const item of items) {
                    const result = await upsertRow(client, ep, item);
                    if (result.skipped) {
                        pageSkipped++;
                    } else {
                        pageProcessed++;
                    }
                }

                await client.query(
                    'UPDATE sync_control SET last_page_processed = $1, updated_at = NOW() WHERE endpoint_name = $2',
                    [currentPage, ep.name]
                );
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }

            return { done: false, processed: pageProcessed, skipped: pageSkipped };
        }, ep.name);

        if (pageResult.done) {
            hasMore = false;
        } else {
            totalProcessed += pageResult.processed;
            totalSkipped += pageResult.skipped;
            currentPage++;
        }
    }

    // Marcar como concluído
    if (!shutdownRequested) {
        await pool.query(
            'UPDATE sync_control SET last_sync_completed_at = NOW(), sync_mode = $1 WHERE endpoint_name = $2',
            [effectiveMode, ep.name]
        );
        log('INFO', ep.name, `Concluído — ${totalProcessed} registros salvos, ${totalSkipped} pulados`);
    } else {
        log('WARN', ep.name, `Interrompido na página ${currentPage} — ${totalProcessed} salvos até aqui`);
    }
}

// ============================================================
// ORQUESTRADOR
// ============================================================

async function runSync(mode, onlyEndpoint) {
    log('INFO', null, `========================================`);
    log('INFO', null, `SYNC V2 — Modo: ${mode.toUpperCase()}`);
    log('INFO', null, `========================================`);

    // Rodar migration automática (CREATE IF NOT EXISTS é seguro)
    try {
        const fs = require('fs');
        const migrationPath = path.resolve(__dirname, 'migrations/001_add_new_tables.sql');
        if (fs.existsSync(migrationPath)) {
            const sql = fs.readFileSync(migrationPath, 'utf-8');
            await pool.query(sql);
            log('INFO', null, 'Migração verificada/aplicada');
        }
    } catch (err) {
        log('WARN', null, `Migração falhou (pode já existir): ${err.message}`);
    }

    const targets = onlyEndpoint
        ? ENDPOINTS.filter(e => e.name === onlyEndpoint)
        : ENDPOINTS;

    if (onlyEndpoint && targets.length === 0) {
        log('ERROR', null, `Endpoint "${onlyEndpoint}" não encontrado. Disponíveis: ${ENDPOINTS.map(e => e.name).join(', ')}`);
        await pool.end();
        process.exit(1);
    }

    const results = { success: [], failed: [], skipped: [] };

    for (const ep of targets) {
        if (shutdownRequested) {
            results.skipped.push(ep.name);
            continue;
        }
        try {
            await syncEndpoint(ep, { mode });
            results.success.push(ep.name);
        } catch (err) {
            log('ERROR', ep.name, `Falha após ${MAX_RETRIES} tentativas: ${err.message}`);
            results.failed.push(ep.name);
        }
    }

    // Resumo final
    log('INFO', null, `========================================`);
    log('INFO', null, `RESULTADO FINAL`);
    log('INFO', null, `  OK:      ${results.success.join(', ') || 'nenhum'}`);
    if (results.failed.length) log('ERROR', null, `  FALHA:   ${results.failed.join(', ')}`);
    if (results.skipped.length) log('WARN', null, `  PULADOS: ${results.skipped.join(', ')}`);
    log('INFO', null, `========================================`);

    await pool.end();
}

// ============================================================
// CLI
// ============================================================
// node sync_v2.js                                -> incremental (default)
// node sync_v2.js --full                         -> full re-sync
// node sync_v2.js --full --endpoint=EnergyMeters -> full de um endpoint
// node sync_v2.js --endpoint=Contacts            -> incremental de um endpoint

const args = process.argv.slice(2);
const mode = args.includes('--full') ? 'full' : 'incremental';
const endpointArg = args.find(a => a.startsWith('--endpoint='));
const onlyEndpoint = endpointArg ? endpointArg.split('=')[1] : null;

runSync(mode, onlyEndpoint);
