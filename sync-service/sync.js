require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 20 
});

const ENDPOINTS = [
  { path: '/Contacts', table: 'cmu_contacts', pk: 'contactID' },
  { path: '/Customers', table: 'cmu_customers', pk: 'customerID' },
  { path: '/EnergyMeterBills', table: 'cmu_energy_meter_bills', pk: 'energyMeterBillID' },
  { path: '/EnergyMeterInvoices', table: 'cmu_energy_meter_invoices', pk: 'energyMeterInvoiceID' },
  { path: '/EnergyMeterPayments', table: 'cmu_energy_meter_payments', pk: 'energyMeterPaymentID' },
  { path: '/EnergyMeters', table: 'cmu_energy_meters', pk: 'energyMeterID' },
  { path: '/Leads', table: 'cmu_leads', pk: 'leadID' },
  { path: '/Prospectors', table: 'cmu_prospectors', pk: 'prospectorID' },
  { path: '/Tickets', table: 'cmu_tickets', pk: 'ticketID' },
  { path: '/Vouchers', table: 'cmu_vouchers', pk: 'voucherID' },
  { path: '/ProspectorAPI/Data', table: 'cmu_prospector_consolidated_data', pk: 'registrationNumber' }
];
async function syncEndpointFast(target) {
    let page = 1;
    let hasMore = true;
    console.log(`🚀 Iniciando carga ultra-rápida: ${target.path}`);

    while (hasMore) {
        const pagesToFetch = [page, page + 1, page + 2, page + 3, page + 4];
        
        const requests = pagesToFetch.map(p => 
            axios.get(`${process.env.CMU_API_BASE_URL}${target.path}`, {
                params: { page: p, pageSize: 100 },
                headers: { 'Authorization': `Bearer ${process.env.CMU_API_TOKEN}` }
            }).catch(e => ({ data: [] })) 
        );

        const results = await Promise.all(requests);
        const allItems = results.flatMap(r => r.data);

        if (allItems.length === 0) {
            hasMore = false;
            break;
        }

        for (const item of allItems) {
            const idValue = item[target.pk];
            if (!idValue) continue;

            const tableIdCol = (target.table === 'cmu_energy_meters') ? 'energy_meter_id' : 'id';

            await pool.query(`
                INSERT INTO ${target.table} (${tableIdCol}, data, last_sync)
                VALUES ($1, $2, NOW())
                ON CONFLICT (${tableIdCol}) DO NOTHING
            `, [idValue, item]);
        }

        console.log(`✅ ${target.table}: Processadas páginas ${page} até ${page + 4}`);
        page += 5;
    }
}

async function runFullLoad() {
    console.time('TempoTotal');
    await Promise.all(ENDPOINTS.map(target => syncEndpointFast(target)));
    console.timeEnd('TempoTotal');
    console.log('🏁 Carga massiva finalizada!');
}

runFullLoad();