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

pool.connect((err, client, release) => {
  if (err) return console.error('Erro ao conectar ao Neon Postgres:', err.stack);
  console.log('Conexao com o Neon Postgres estabelecida');
  release();
});

app.get('/api/EnergyMeters', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 25;
    const offset = (page - 1) * pageSize;

    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const { name, energyMeterStatus } = filters;

    let query = `SELECT data FROM cmu_energy_meters WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) FROM cmu_energy_meters WHERE 1=1`;
    const params = [];

    if (name) {
      params.push(`%${name}%`);
      const searchFilter = ` AND (
        data->>'name' ILIKE $${params.length} OR
        data->>'registrationNumber' ILIKE $${params.length} OR
        data->>'meterNumber' ILIKE $${params.length} OR
        data->>'customerNumber' ILIKE $${params.length}
      )`;
      query += searchFilter;
      countQuery += searchFilter;
    }

    if (energyMeterStatus) {
      params.push(energyMeterStatus);
      query += ` AND data->>'energyMeterStatus' = $${params.length}`;
      countQuery += ` AND data->>'energyMeterStatus' = $${params.length}`;
    }

    query += ` ORDER BY data->>'name' ASC LIMIT ${pageSize} OFFSET ${offset}`;

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows.map(row => row.data), total });
  } catch (err) {
    console.error("Erro em /EnergyMeters:", err);
    res.status(500).json({ error: "Erro ao buscar medidores" });
  }
});

app.get('/api/EnergyMeterInvoices', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const { energyMeterID } = filters;

    const query = `
      SELECT
        i.data as invoice_obj,
        b.data as bill_obj
      FROM cmu_energy_meter_invoices i
      LEFT JOIN cmu_energy_meter_bills b
        ON (i.data->>'energyMeterBillID')::int = b.id
      WHERE (i.data->>'energyMeterID')::int = $1
      ORDER BY (i.data->>'referenceMonth') DESC
    `;

    const result = await pool.query(query, [energyMeterID]);

    const formattedData = result.rows.map(row => ({
      ...row.invoice_obj,
      energyMeterBill: row.bill_obj,
      energyBalance: row.bill_obj
        ? (parseFloat(row.bill_obj.energyBalanceOffPeakTime || 0) + parseFloat(row.bill_obj.energyBalancePeakTime || 0))
        : null
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar faturas" });
  }
});

app.get('/api/EnergyMeterPayments', async (req, res) => {
  try {
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const { energyMeterID } = filters;

    const query = `
      SELECT p.data as payment_obj
      FROM cmu_energy_meter_payments p
      WHERE (p.data->>'energyMeterID')::int = $1
      ORDER BY (p.data->>'referenceMonth') DESC
    `;

    const result = await pool.query(query, [energyMeterID]);
    res.json(result.rows.map(row => row.payment_obj));
  } catch (err) {
    console.error("Erro em /EnergyMeterPayments:", err);
    res.status(500).json({ error: "Erro ao buscar pagamentos" });
  }
});

let statsCache = { data: null, timestamp: 0, key: '' };
const CACHE_TTL = 5 * 60 * 1000;

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `${startDate || ''}_${endDate || ''}`;

    if (statsCache.data && statsCache.key === cacheKey && (Date.now() - statsCache.timestamp) < CACHE_TTL) {
      return res.json(statsCache.data);
    }

    let invFilter = `data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')`;
    let invFilterAll = `1=1`;
    let payFilter = `1=1`;
    let billFilter = `1=1`;
    const params = [];

    if (startDate) {
      params.push(startDate);
      invFilter += ` AND data->>'referenceMonth' >= $${params.length}`;
      invFilterAll += ` AND data->>'referenceMonth' >= $${params.length}`;
      payFilter += ` AND data->>'referenceMonth' >= $${params.length}`;
      billFilter += ` AND data->>'referenceMonth' >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      invFilter += ` AND data->>'referenceMonth' <= $${params.length}`;
      invFilterAll += ` AND data->>'referenceMonth' <= $${params.length}`;
      payFilter += ` AND data->>'referenceMonth' <= $${params.length}`;
      billFilter += ` AND data->>'referenceMonth' <= $${params.length}`;
    }

    const [
      metersByStatus, revenueResult, delinquencyResult, invoicesByStatus,
      paymentsByStatus, metersByState, monthlyTrend, energyResult,
      economyResult, billsCostResult, metersByDistributor, metersByClass, topPartners
    ] = await Promise.all([
      pool.query(`SELECT data->>'energyMeterStatus' as status, COUNT(*)::int as count FROM cmu_energy_meters GROUP BY 1 ORDER BY 2 DESC`),
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0) as total FROM cmu_energy_meter_payments WHERE data->>'energyMeterPaymentStatus' = 'Pago' AND ${payFilter}`, params),
      pool.query(`SELECT COUNT(*)::int as count, COALESCE(SUM((data->>'expiredPaymentsTotalAmount')::numeric), 0) as total FROM cmu_energy_meters WHERE (data->>'expiredPaymentsTotalAmount')::numeric > 0`),
      pool.query(`SELECT data->>'energyMeterInvoiceStatus' as status, COUNT(*)::int as count, COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_invoices WHERE ${invFilterAll} GROUP BY 1 ORDER BY 2 DESC`, params),
      pool.query(`SELECT data->>'energyMeterPaymentStatus' as status, COUNT(*)::int as count, COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_payments WHERE ${payFilter} GROUP BY 1 ORDER BY 2 DESC`, params),
      pool.query(`SELECT data->>'addressState' as state, COUNT(*)::int as count FROM cmu_energy_meters WHERE data->>'addressState' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
      pool.query(`
        SELECT data->>'referenceMonth' as month,
               COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as revenue,
               COUNT(*)::int as invoice_count
        FROM cmu_energy_meter_invoices
        WHERE ${invFilter}
        GROUP BY 1 ORDER BY 1 DESC ${!startDate && !endDate ? 'LIMIT 12' : ''}
      `, params),
      pool.query(`
        SELECT COALESCE(SUM((data->>'consumedEnergy')::numeric), 0)::float as total_consumed,
               COALESCE(SUM((data->>'compensatedEnergy')::numeric), 0)::float as total_compensated
        FROM cmu_energy_meter_invoices WHERE ${invFilter}
      `, params),
      pool.query(`
        SELECT COALESCE(SUM((data->>'economyValue')::numeric), 0)::float as total_economy
        FROM cmu_energy_meter_invoices WHERE ${invFilter}
      `, params),
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total_bills FROM cmu_energy_meter_bills WHERE ${billFilter}`, params),
      pool.query(`SELECT data->'distributor'->>'alias' as distributor, COUNT(*)::int as count FROM cmu_energy_meters WHERE data->'distributor'->>'alias' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
      pool.query(`SELECT data->>'class' as class, COUNT(*)::int as count FROM cmu_energy_meters WHERE data->>'class' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
      pool.query(`SELECT data->'voucher'->'prospector'->>'name' as partner, COUNT(*)::int as count FROM cmu_energy_meters WHERE data->'voucher'->'prospector'->>'name' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`)
    ]);

    const en = energyResult.rows[0];
    const stats = {
      metersByStatus: metersByStatus.rows,
      totalRevenue: parseFloat(revenueResult.rows[0].total),
      delinquency: {
        count: delinquencyResult.rows[0].count,
        total: parseFloat(delinquencyResult.rows[0].total)
      },
      invoicesByStatus: invoicesByStatus.rows,
      paymentsByStatus: paymentsByStatus.rows,
      metersByState: metersByState.rows,
      monthlyTrend: monthlyTrend.rows.reverse(),
      energy: {
        consumed: en.total_consumed,
        compensated: en.total_compensated,
        efficiency: en.total_consumed > 0 ? (en.total_compensated / en.total_consumed) * 100 : 0
      },
      totalEconomy: economyResult.rows[0].total_economy,
      totalBillsCost: billsCostResult.rows[0].total_bills,
      metersByDistributor: metersByDistributor.rows,
      metersByClass: metersByClass.rows,
      topPartners: topPartners.rows
    };

    statsCache = { data: stats, timestamp: Date.now(), key: cacheKey };
    res.json(stats);
  } catch (err) {
    console.error("Erro em /dashboard/stats:", err);
    res.status(500).json({ error: "Erro ao calcular estatisticas" });
  }
});

app.get('/api/EnergyMeters/delinquent', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
    const { name, state, distributor } = filters;

    let where = `(data->>'expiredPaymentsTotalAmount')::numeric > 0`;
    const params = [];

    if (name) {
      params.push(`%${name}%`);
      where += ` AND (data->>'name' ILIKE $${params.length} OR data->>'meterNumber' ILIKE $${params.length} OR data->>'registrationNumber' ILIKE $${params.length})`;
    }
    if (state) {
      params.push(state);
      where += ` AND data->>'addressState' = $${params.length}`;
    }
    if (distributor) {
      params.push(distributor);
      where += ` AND data->'distributor'->>'alias' = $${params.length}`;
    }

    const [result, aggregateResult] = await Promise.all([
      pool.query(`
        SELECT data FROM cmu_energy_meters
        WHERE ${where}
        ORDER BY (data->>'expiredPaymentsTotalAmount')::numeric DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `, params),
      pool.query(`
        SELECT
          COUNT(*)::int as count,
          COALESCE(SUM((data->>'expiredPaymentsTotalAmount')::numeric), 0)::float as total_amount,
          COALESCE(SUM((data->>'pendingPayments')::int), 0)::int as total_pending
        FROM cmu_energy_meters
        WHERE ${where}
      `, params)
    ]);

    const agg = aggregateResult.rows[0];
    res.json({
      data: result.rows.map(r => r.data),
      total: agg.count,
      aggregate: {
        totalAmount: agg.total_amount,
        totalPending: agg.total_pending,
        count: agg.count
      }
    });
  } catch (err) {
    console.error("Erro em /EnergyMeters/delinquent:", err);
    res.status(500).json({ error: "Erro ao buscar inadimplentes" });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend Solatio rodando em http://localhost:${PORT}`);
});
