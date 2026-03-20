require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});

app.get('/api/EnergyMeters', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
        const { name, energyMeterStatus, pendingPayments } = filters;
    
    let query = `SELECT data FROM cmu_energy_meters WHERE 1=1`;
    const params = [];

    // 1. BUSCA GLOBAL 
    if (name) {
      params.push(`%${name}%`);
      query += ` AND (data::text ILIKE $${params.length})`;
    }

    // 2. FILTRO DE STATUS
    if (energyMeterStatus) {
      params.push(energyMeterStatus);
      query += ` AND data->>'energyMeterStatus' = $${params.length}`;
    }

    // 3. FILTRO FINANCEIRO
    if (pendingPayments !== undefined) {
      if (typeof pendingPayments === 'object') { 
        query += ` AND (data->>'pendingPayments')::int > 0`;
      } else if (pendingPayments === 0) {
        query += ` AND (data->>'pendingPayments')::int = 0`;
      }
    }

    query += ` ORDER BY name ASC LIMIT 100`;

    const result = await pool.query(query, params);
    
    console.log(`🔎 Busca: "${name || 'Todos'}" | Encontrados: ${result.rows.length}`);
    
    res.json(result.rows.map(row => row.data));
  } catch (err) {
    console.error("❌ Erro em /EnergyMeters:", err);
    res.status(500).json({ error: "Erro ao buscar medidores" });
  }
});

app.get('/api/EnergyMeterInvoices', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const { energyMeterID } = filters;

    if (!energyMeterID) {
      return res.status(400).json({ error: "energyMeterID é obrigatório" });
    }
    
    const query = `
      SELECT data FROM cmu_energy_meter_invoices 
      WHERE (data->>'energyMeterID')::int = $1
      ORDER BY (data->>'referenceMonth') DESC
    `;
    
    const result = await pool.query(query, [energyMeterID]);
    
    console.log(`🧾 Faturas para ID ${energyMeterID}: ${result.rows.length} encontradas.`);
    
    res.json(result.rows.map(row => row.data));
  } catch (err) {
    console.error("❌ Erro em /EnergyMeterInvoices:", err);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 BACKEND SOLATIO RODANDO`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`📡 Conectado ao Neon Postgres\n`);
});