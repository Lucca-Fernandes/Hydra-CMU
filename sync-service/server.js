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
let financialCache = { data: null, timestamp: 0, key: '' };
let energyCache = { data: null, timestamp: 0, key: '' };
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

// ============================================================
// FINANCIAL STATS (RF04)
// ============================================================

app.get('/api/financial/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `fin_${startDate || ''}_${endDate || ''}`;

    if (financialCache.data && financialCache.key === cacheKey && (Date.now() - financialCache.timestamp) < CACHE_TTL) {
      return res.json(financialCache.data);
    }

    let dateFilterInv = `data->>'energyMeterInvoiceStatus' = 'Faturado'`;
    let dateFilterPay = `data->>'energyMeterPaymentStatus' NOT IN ('Errado','Cancelado','Simulação')`;
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilterInv += ` AND data->>'referenceMonth' >= $${params.length}`;
      dateFilterPay += ` AND data->>'referenceMonth' >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilterInv += ` AND data->>'referenceMonth' <= $${params.length}`;
      dateFilterPay += ` AND data->>'referenceMonth' <= $${params.length}`;
    }

    const [
      faturamentoResult, receitaResult, inadResult, abertoResult,
      monthlyPayResult, monthlyInvResult, payStatusResult, invStatusResult
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_invoices WHERE ${dateFilterInv}`, params),
      pool.query(`SELECT COALESCE(SUM(COALESCE(NULLIF(data->>'paidAmount','')::numeric, (data->>'totalAmount')::numeric)), 0)::float as total, COUNT(*)::int as count FROM cmu_energy_meter_payments WHERE data->>'energyMeterPaymentStatus' = 'Pago' AND ${dateFilterPay}`, params),
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_payments WHERE data->>'energyMeterPaymentStatus' = 'Vencido' AND ${dateFilterPay}`, params),
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_payments WHERE data->>'energyMeterPaymentStatus' = 'Pendente' AND ${dateFilterPay}`, params),
      pool.query(`
        SELECT data->>'referenceMonth' as month,
          COALESCE(SUM(CASE WHEN data->>'energyMeterPaymentStatus' = 'Pago' THEN COALESCE(NULLIF(data->>'paidAmount','')::numeric, (data->>'totalAmount')::numeric) ELSE 0 END), 0)::float as recebido,
          COALESCE(SUM(CASE WHEN data->>'energyMeterPaymentStatus' = 'Vencido' THEN (data->>'totalAmount')::numeric ELSE 0 END), 0)::float as vencido,
          COALESCE(SUM(CASE WHEN data->>'energyMeterPaymentStatus' = 'Pendente' THEN (data->>'totalAmount')::numeric ELSE 0 END), 0)::float as pendente
        FROM cmu_energy_meter_payments WHERE ${dateFilterPay}
        GROUP BY 1 ORDER BY 1 DESC ${!startDate && !endDate ? 'LIMIT 12' : ''}
      `, params),
      pool.query(`
        SELECT data->>'referenceMonth' as month,
          COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as faturado
        FROM cmu_energy_meter_invoices WHERE ${dateFilterInv}
        GROUP BY 1 ORDER BY 1 DESC ${!startDate && !endDate ? 'LIMIT 12' : ''}
      `, params),
      pool.query(`
        SELECT data->>'energyMeterPaymentStatus' as status, COUNT(*)::int as count,
          COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total
        FROM cmu_energy_meter_payments WHERE ${dateFilterPay}
        GROUP BY 1 ORDER BY 2 DESC
      `, params),
      pool.query(`
        SELECT data->>'energyMeterInvoiceStatus' as status, COUNT(*)::int as count,
          COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total
        FROM cmu_energy_meter_invoices
        WHERE data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')
          ${startDate ? `AND data->>'referenceMonth' >= $1` : ''}
          ${endDate ? `AND data->>'referenceMonth' <= $${startDate ? 2 : 1}` : ''}
        GROUP BY 1 ORDER BY 2 DESC
      `, params),
    ]);

    const faturamento = faturamentoResult.rows[0].total;
    const receita = receitaResult.rows[0].total;
    const receitaCount = receitaResult.rows[0].count;

    const invByMonth = {};
    monthlyInvResult.rows.forEach(r => { invByMonth[r.month] = r.faturado; });

    const allMonths = new Set([
      ...monthlyPayResult.rows.map(r => r.month),
      ...monthlyInvResult.rows.map(r => r.month)
    ]);

    const monthlyFlow = Array.from(allMonths).sort().map(month => {
      const pay = monthlyPayResult.rows.find(r => r.month === month) || { recebido: 0, vencido: 0, pendente: 0 };
      const fat = invByMonth[month] || 0;
      return { month, faturado: fat, recebido: pay.recebido, vencido: pay.vencido, pendente: pay.pendente };
    });

    const stats = {
      faturamento,
      receita,
      receitaCount,
      inadimplencia: inadResult.rows[0].total,
      emAberto: abertoResult.rows[0].total,
      taxaRecebimento: faturamento > 0 ? (receita / faturamento) * 100 : 0,
      ticketMedio: receitaCount > 0 ? receita / receitaCount : 0,
      monthlyFlow,
      paymentsByStatus: payStatusResult.rows,
      invoicesByStatus: invStatusResult.rows,
    };

    financialCache = { data: stats, timestamp: Date.now(), key: cacheKey };
    res.json(stats);
  } catch (err) {
    console.error('Erro em /financial/stats:', err);
    res.status(500).json({ error: 'Erro ao calcular estatisticas financeiras' });
  }
});

// ============================================================
// ENERGY STATS (RF01/RF03)
// ============================================================

app.get('/api/energy/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `eng_${startDate || ''}_${endDate || ''}`;

    if (energyCache.data && energyCache.key === cacheKey && (Date.now() - energyCache.timestamp) < CACHE_TTL) {
      return res.json(energyCache.data);
    }

    let invFilter = `data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')`;
    let billFilter = `1=1`;
    const params = [];

    if (startDate) {
      params.push(startDate);
      invFilter += ` AND data->>'referenceMonth' >= $${params.length}`;
      billFilter += ` AND data->>'referenceMonth' >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      invFilter += ` AND data->>'referenceMonth' <= $${params.length}`;
      billFilter += ` AND data->>'referenceMonth' <= $${params.length}`;
    }

    const [
      energyTotals, billsCost, saldoResult,
      monthlyEnergy, monthlyBills, consumoByDist
    ] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM((data->>'consumedEnergy')::numeric), 0)::float as consumed,
               COALESCE(SUM((data->>'compensatedEnergy')::numeric), 0)::float as compensated,
               COALESCE(SUM((data->>'economyValue')::numeric), 0)::float as economy
        FROM cmu_energy_meter_invoices WHERE ${invFilter}
      `, params),
      pool.query(`SELECT COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as total FROM cmu_energy_meter_bills WHERE ${billFilter}`, params),
      pool.query(`
        SELECT COALESCE(SUM(saldo), 0)::float as total FROM (
          SELECT DISTINCT ON ((data->>'energyMeterID')::int)
            COALESCE(NULLIF(data->>'energyBalanceOffPeakTime','')::numeric, 0) +
            COALESCE(NULLIF(data->>'energyBalancePeakTime','')::numeric, 0) as saldo
          FROM cmu_energy_meter_bills
          ORDER BY (data->>'energyMeterID')::int, data->>'referenceMonth' DESC
        ) sub
      `),
      pool.query(`
        SELECT data->>'referenceMonth' as month,
          COALESCE(SUM((data->>'consumedEnergy')::numeric), 0)::float as consumed,
          COALESCE(SUM((data->>'compensatedEnergy')::numeric), 0)::float as compensated,
          COALESCE(SUM((data->>'economyValue')::numeric), 0)::float as economy
        FROM cmu_energy_meter_invoices WHERE ${invFilter}
        GROUP BY 1 ORDER BY 1 DESC ${!startDate && !endDate ? 'LIMIT 12' : ''}
      `, params),
      pool.query(`
        SELECT data->>'referenceMonth' as month,
          COALESCE(SUM((data->>'totalAmount')::numeric), 0)::float as cost
        FROM cmu_energy_meter_bills WHERE ${billFilter}
        GROUP BY 1 ORDER BY 1 DESC ${!startDate && !endDate ? 'LIMIT 12' : ''}
      `, params),
      pool.query(`
        SELECT m.data->'distributor'->>'alias' as distributor,
          COALESCE(SUM((i.data->>'consumedEnergy')::numeric), 0)::float as consumed
        FROM cmu_energy_meter_invoices i
        JOIN cmu_energy_meters m ON (i.data->>'energyMeterID')::int = m.id
        WHERE i.data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado','Reprovado')
          ${startDate ? `AND i.data->>'referenceMonth' >= $1` : ''}
          ${endDate ? `AND i.data->>'referenceMonth' <= $${startDate ? 2 : 1}` : ''}
        GROUP BY 1 ORDER BY 2 DESC
      `, params),
    ]);

    const en = energyTotals.rows[0];
    const billsByMonth = {};
    monthlyBills.rows.forEach(r => { billsByMonth[r.month] = r.cost; });

    const monthlyData = monthlyEnergy.rows.reverse().map(r => ({
      month: r.month,
      consumed: r.consumed,
      compensated: r.compensated,
      efficiency: r.consumed > 0 ? (r.compensated / r.consumed) * 100 : 0,
      economy: r.economy,
      billsCost: billsByMonth[r.month] || 0,
    }));

    const stats = {
      consumed: en.consumed,
      compensated: en.compensated,
      efficiency: en.consumed > 0 ? (en.compensated / en.consumed) * 100 : 0,
      saldoTotal: saldoResult.rows[0].total,
      economy: en.economy,
      billsCost: billsCost.rows[0].total,
      monthlyEnergy: monthlyData,
      consumoByDistributor: consumoByDist.rows,
    };

    energyCache = { data: stats, timestamp: Date.now(), key: cacheKey };
    res.json(stats);
  } catch (err) {
    console.error('Erro em /energy/stats:', err);
    res.status(500).json({ error: 'Erro ao calcular estatisticas de energia' });
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

const initRateioTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rateio_plants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      base_capacity NUMERIC NOT NULL DEFAULT 744000,
      default_factor NUMERIC DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS rateio_snapshots (
      id SERIAL PRIMARY KEY,
      reference_month DATE NOT NULL UNIQUE,
      total_generation_kwh NUMERIC,
      total_ucs INT,
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'rascunho'
    );
    CREATE TABLE IF NOT EXISTS rateio_generation (
      id SERIAL PRIMARY KEY,
      plant_id INT REFERENCES rateio_plants(id) ON DELETE CASCADE,
      snapshot_id INT REFERENCES rateio_snapshots(id) ON DELETE CASCADE,
      factor NUMERIC NOT NULL DEFAULT 1.0,
      generated_kwh NUMERIC,
      UNIQUE(plant_id, snapshot_id)
    );
    CREATE TABLE IF NOT EXISTS rateio_results (
      id SERIAL PRIMARY KEY,
      snapshot_id INT REFERENCES rateio_snapshots(id) ON DELETE CASCADE,
      energy_meter_id INT NOT NULL,
      meter_name TEXT,
      meter_number TEXT,
      class_priority TEXT,
      consumo_medio NUMERIC DEFAULT 0,
      consumo_override NUMERIC,
      saldo_anterior NUMERIC DEFAULT 0,
      need_kwh NUMERIC DEFAULT 0,
      allocation_pct NUMERIC DEFAULT 0,
      allocated_kwh NUMERIC DEFAULT 0,
      saldo_previsto NUMERIC DEFAULT 0,
      meses_saldo NUMERIC DEFAULT 0,
      UNIQUE(snapshot_id, energy_meter_id)
    );
  `);

  await pool.query(`ALTER TABLE rateio_plants ADD COLUMN IF NOT EXISTS default_factor NUMERIC DEFAULT 0`);

  const existing = await pool.query('SELECT COUNT(*)::int as c FROM rateio_plants');
  if (parseInt(existing.rows[0].c) === 0) {
    const seed = [
      ['Mandaguari', 744000, 0.6],
      ['Alto Furnas', 744000, 0.8],
      ['Alto Furnas II', 744000, 0],
      ['Chica II (Sao Felix II)', 744000, 1.6],
      ['Bom Retiro II', 744000, 1.5],
      ['Bom Retiro III', 744000, 0],
      ['Carangola I', 744000, 1.7],
      ['Carangola II', 744000, 0],
      ['Santa Cruz', 744000, 0.62],
      ['Chica III', 744000, 0],
      ['Talisma', 744000, 0],
      ['Olhos d\'agua', 744000, 0],
      ['Sao Felix', 744000, 0.7],
      ['Para de Minas', 744000, 0.22],
      ['Japaraiba', 744000, 0.25],
      ['UFV Araguari', 744000, 0.2],
      ['Bom Retiro IV', 744000, 0],
      ['Centro Oeste', 744000, 0.7],
      ['Raul Soares', 744000, 0.9],
      ['Sao Joao del Rei', 744000, 0.5],
      ['Raul Soares II', 744000, 0],
      ['Planura', 744000, 1.0],
      ['Bom Retiro I', 730000, 0.5],
      ['Chica I', 730000, 0.57],
      ['Nova Uniao', 730000, 0.18],
      ['Cedro', 730000, 0.57],
      ['UFV Carangola', 672000, 0.67],
      ['Bom Jesus', 730000, 0.15],
      ['Ponte Queimada', 730000, 0.2],
      ['Santa Barbara', 730000, 0.35],
      ['Divino', 730000, 0.4],
      ['Faria Lemos', 730000, 0.4],
    ];
    for (const [name, cap, factor] of seed) {
      await pool.query(
        'INSERT INTO rateio_plants (name, base_capacity, default_factor) VALUES ($1, $2, $3)',
        [name, cap, factor]
      );
    }
    console.log(`Seed: ${seed.length} usinas inseridas`);
  }
};
initRateioTables().catch(err => console.error('Erro ao criar tabelas rateio:', err));

app.get('/api/rateio/plants', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rateio_plants WHERE active = true ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usinas' });
  }
});

app.post('/api/rateio/plants', async (req, res) => {
  try {
    const { name, base_capacity } = req.body;
    const result = await pool.query(
      'INSERT INTO rateio_plants (name, base_capacity) VALUES ($1, $2) RETURNING *',
      [name, base_capacity || 648000]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar usina' });
  }
});

app.delete('/api/rateio/plants/:id', async (req, res) => {
  try {
    await pool.query('UPDATE rateio_plants SET active = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover usina' });
  }
});

app.get('/api/rateio/snapshots', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rateio_snapshots ORDER BY reference_month DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar snapshots' });
  }
});

app.post('/api/rateio/calculate', async (req, res) => {
  const { reference_month, plant_factors } = req.body;
  try {
    const plantsResult = await pool.query('SELECT * FROM rateio_plants WHERE active = true');
    const plants = plantsResult.rows;
    const factorMap = {};
    (plant_factors || []).forEach(pf => { factorMap[pf.plant_id] = parseFloat(pf.factor) || 0; });

    let totalGeneration = 0;
    const generationData = plants.map(p => {
      const factor = factorMap[p.id] || 0;
      const generated = parseFloat(p.base_capacity) * factor;
      totalGeneration += generated;
      return { plant_id: p.id, factor, generated_kwh: generated };
    });

    const metersResult = await pool.query(`
      SELECT id, data->>'name' as name, data->>'meterNumber' as meter_number,
             COALESCE(NULLIF(data->>'contractConsumption','')::numeric, 0) as contract_consumption
      FROM cmu_energy_meters WHERE data->>'energyMeterStatus' = 'Ativa'
    `);
    const meters = metersResult.rows;

    const refDate = new Date(reference_month);
    const threeBack = new Date(refDate);
    threeBack.setMonth(threeBack.getMonth() - 3);
    const startMonth = threeBack.toISOString().split('T')[0] + 'T00:00:00';
    const endMonth = refDate.toISOString().split('T')[0] + 'T00:00:00';

    const consumoResult = await pool.query(`
      SELECT (data->>'energyMeterID')::int as meter_id,
             AVG(COALESCE(NULLIF(data->>'consumedEnergy','')::numeric, 0)) as avg_consumed
      FROM cmu_energy_meter_invoices
      WHERE data->>'energyMeterInvoiceStatus' NOT IN ('Cancelado', 'Reprovado')
        AND data->>'referenceMonth' >= $1 AND data->>'referenceMonth' < $2
      GROUP BY 1
    `, [startMonth, endMonth]);
    const consumoMap = {};
    consumoResult.rows.forEach(r => { consumoMap[r.meter_id] = parseFloat(r.avg_consumed); });

    const saldoResult = await pool.query(`
      SELECT DISTINCT ON ((data->>'energyMeterID')::int)
        (data->>'energyMeterID')::int as meter_id,
        COALESCE(NULLIF(data->>'energyBalanceOffPeakTime','')::numeric, 0) +
        COALESCE(NULLIF(data->>'energyBalancePeakTime','')::numeric, 0) as saldo
      FROM cmu_energy_meter_bills
      WHERE data->>'referenceMonth' < $1
      ORDER BY (data->>'energyMeterID')::int, data->>'referenceMonth' DESC
    `, [endMonth]);
    const saldoMap = {};
    saldoResult.rows.forEach(r => { saldoMap[r.meter_id] = parseFloat(r.saldo); });

    const results = [];
    let totalNeed = 0;

    meters.forEach(m => {
      const consumo = consumoMap[m.id] || parseFloat(m.contract_consumption) || 0;
      const saldo = saldoMap[m.id] || 0;
      const need = Math.max(consumo - saldo, 0);
      totalNeed += need;

      let cls = 'D';
      if (consumo > 10000) cls = 'AA';
      else if (consumo > 5000) cls = 'A';
      else if (consumo > 1000) cls = 'B';
      else if (consumo > 500) cls = 'C';

      results.push({
        energy_meter_id: m.id, meter_name: m.name, meter_number: m.meter_number,
        class_priority: cls, consumo_medio: consumo, saldo_anterior: saldo, need_kwh: need,
      });
    });

    results.forEach(r => {
      r.allocation_pct = totalNeed > 0 ? r.need_kwh / totalNeed : 0;
      r.allocated_kwh = r.allocation_pct * totalGeneration;
      r.saldo_previsto = r.saldo_anterior + r.allocated_kwh - r.consumo_medio;
      r.meses_saldo = r.consumo_medio > 0 ? r.saldo_previsto / r.consumo_medio : 0;
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const snapResult = await client.query(`
        INSERT INTO rateio_snapshots (reference_month, total_generation_kwh, total_ucs)
        VALUES ($1, $2, $3)
        ON CONFLICT (reference_month) DO UPDATE SET
          total_generation_kwh = $2, total_ucs = $3, calculated_at = NOW()
        RETURNING id
      `, [reference_month, totalGeneration, results.length]);
      const snapshotId = snapResult.rows[0].id;

      await client.query('DELETE FROM rateio_generation WHERE snapshot_id = $1', [snapshotId]);
      await client.query('DELETE FROM rateio_results WHERE snapshot_id = $1', [snapshotId]);

      for (const g of generationData) {
        await client.query(
          'INSERT INTO rateio_generation (plant_id, snapshot_id, factor, generated_kwh) VALUES ($1, $2, $3, $4)',
          [g.plant_id, snapshotId, g.factor, g.generated_kwh]
        );
      }

      const BATCH = 200;
      for (let i = 0; i < results.length; i += BATCH) {
        const batch = results.slice(i, i + BATCH);
        const values = [];
        const placeholders = batch.map((r, j) => {
          const b = j * 12;
          values.push(snapshotId, r.energy_meter_id, r.meter_name, r.meter_number, r.class_priority,
            r.consumo_medio, r.saldo_anterior, r.need_kwh, r.allocation_pct, r.allocated_kwh,
            r.saldo_previsto, r.meses_saldo);
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
        });
        await client.query(`
          INSERT INTO rateio_results (snapshot_id, energy_meter_id, meter_name, meter_number, class_priority,
            consumo_medio, saldo_anterior, need_kwh, allocation_pct, allocated_kwh, saldo_previsto, meses_saldo)
          VALUES ${placeholders.join(',')}
        `, values);
      }

      await client.query('COMMIT');
      res.json({ snapshot_id: snapshotId, total_generation: totalGeneration, total_ucs: results.length, total_need: totalNeed });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro em /rateio/calculate:', err.message, err.stack);
    res.status(500).json({ error: 'Erro ao calcular rateio', detail: err.message });
  }
});

app.get('/api/rateio/results/:month', async (req, res) => {
  try {
    const { month } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    const search = req.query.search || '';
    const classFilter = req.query.class || '';

    const snap = await pool.query(
      'SELECT id, total_generation_kwh, total_ucs, status FROM rateio_snapshots WHERE reference_month = $1', [month]
    );
    if (snap.rows.length === 0) return res.json({ data: [], total: 0, snapshot: null });

    const snapshotId = snap.rows[0].id;
    let where = 'snapshot_id = $1';
    const params = [snapshotId];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (meter_name ILIKE $${params.length} OR meter_number ILIKE $${params.length})`;
    }
    if (classFilter) {
      params.push(classFilter);
      where += ` AND class_priority = $${params.length}`;
    }

    const [results, countResult, aggResult] = await Promise.all([
      pool.query(`SELECT * FROM rateio_results WHERE ${where} ORDER BY allocated_kwh DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
      pool.query(`SELECT COUNT(*)::int as count FROM rateio_results WHERE ${where}`, params),
      pool.query(`
        SELECT SUM(need_kwh)::float as total_need, SUM(allocated_kwh)::float as total_allocated,
               AVG(allocation_pct)::float as avg_pct, AVG(meses_saldo)::float as avg_meses
        FROM rateio_results WHERE snapshot_id = $1
      `, [snapshotId])
    ]);

    const genResult = await pool.query(
      `SELECT g.*, p.name as plant_name, p.base_capacity FROM rateio_generation g
       JOIN rateio_plants p ON g.plant_id = p.id WHERE g.snapshot_id = $1 ORDER BY p.name`,
      [snapshotId]
    );

    res.json({
      data: results.rows,
      total: countResult.rows[0].count,
      snapshot: snap.rows[0],
      generation: genResult.rows,
      aggregate: aggResult.rows[0],
    });
  } catch (err) {
    console.error('Erro em /rateio/results:', err);
    res.status(500).json({ error: 'Erro ao buscar resultados' });
  }
});

app.patch('/api/rateio/results/:id', async (req, res) => {
  try {
    const { consumo_override } = req.body;
    const { id } = req.params;

    const row = await pool.query('SELECT snapshot_id FROM rateio_results WHERE id = $1', [id]);
    if (row.rows.length === 0) return res.status(404).json({ error: 'Resultado nao encontrado' });
    const snapshotId = row.rows[0].snapshot_id;

    await pool.query('UPDATE rateio_results SET consumo_override = $1 WHERE id = $2', [consumo_override, id]);

    const snapResult = await pool.query('SELECT total_generation_kwh FROM rateio_snapshots WHERE id = $1', [snapshotId]);
    const totalGen = parseFloat(snapResult.rows[0].total_generation_kwh);

    await pool.query(`
      WITH effective AS (
        SELECT id, COALESCE(consumo_override, consumo_medio) as consumo, saldo_anterior
        FROM rateio_results WHERE snapshot_id = $1
      ),
      needs AS (
        SELECT id, consumo, saldo_anterior,
          GREATEST(consumo - saldo_anterior, 0) as need,
          CASE WHEN consumo > 10000 THEN 'AA' WHEN consumo > 5000 THEN 'A'
               WHEN consumo > 1000 THEN 'B' WHEN consumo > 500 THEN 'C' ELSE 'D' END as cls
        FROM effective
      ),
      totals AS (SELECT SUM(need) as total_need FROM needs),
      calc AS (
        SELECT n.id, n.cls,  n.need,
          CASE WHEN t.total_need > 0 THEN n.need / t.total_need ELSE 0 END as pct,
          CASE WHEN t.total_need > 0 THEN (n.need / t.total_need) * $2 ELSE 0 END as alloc,
          n.saldo_anterior + (CASE WHEN t.total_need > 0 THEN (n.need / t.total_need) * $2 ELSE 0 END) - n.consumo as saldo_prev,
          CASE WHEN n.consumo > 0 THEN
            (n.saldo_anterior + (CASE WHEN t.total_need > 0 THEN (n.need / t.total_need) * $2 ELSE 0 END) - n.consumo) / n.consumo
          ELSE 0 END as meses
        FROM needs n, totals t
      )
      UPDATE rateio_results r SET
        class_priority = c.cls, need_kwh = c.need, allocation_pct = c.pct,
        allocated_kwh = c.alloc, saldo_previsto = c.saldo_prev, meses_saldo = c.meses
      FROM calc c WHERE r.id = c.id
    `, [snapshotId, totalGen]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro em PATCH /rateio/results:', err);
    res.status(500).json({ error: 'Erro ao atualizar resultado' });
  }
});

// ============================================================
// SYNC LOGS API
// ============================================================

app.get('/api/sync/runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await pool.query(
      'SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT $1', [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar execuções' });
  }
});

app.get('/api/sync/runs/:id/logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sync_logs WHERE run_id = $1 ORDER BY created_at ASC', [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

app.get('/api/sync/control', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_control ORDER BY endpoint_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar sync_control' });
  }
});

app.get('/api/sync/logs/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    let query = 'SELECT * FROM sync_logs';
    const params = [];
    if (level) {
      params.push(level);
      query += ' WHERE level = $1';
    }
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs recentes' });
  }
});

// ============================================================
// UAU ERP (Globaltec / Grupo GVS) — Proxy Routes
// ============================================================
// Autenticacao de 2 fatores:
//   1. X-INTEGRATION-Authorization: token de integracao (fixo no .env)
//   2. Authorization: <token do usuario>  (SEM prefixo Bearer!)
// Token de usuario: obtido via POST /api/v1.0/Autenticador/AutenticarUsuario
// Corpo minimo obrigatorio em POSTs: {}  (IIS exige Content-Length)
// ============================================================

const axios = require('axios');

const UAU_BASE_URL = process.env.UAU_BASE_URL;
const UAU_INTEGRATION_TOKEN = process.env.UAU_INTEGRATION_TOKEN;
const UAU_USER = process.env.UAU_USER;
const UAU_PASS = process.env.UAU_PASS;

let uauTokenCache = { token: null, expiresAt: 0 };
const UAU_TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min (UAU expira em ~1h)

async function getUauUserToken({ force = false } = {}) {
  if (!force && uauTokenCache.token && Date.now() < uauTokenCache.expiresAt) {
    return uauTokenCache.token;
  }
  if (!UAU_BASE_URL || !UAU_INTEGRATION_TOKEN || !UAU_USER || !UAU_PASS) {
    throw new Error('Variaveis UAU_* nao configuradas no .env');
  }
  const url = `${UAU_BASE_URL}/api/v1.0/Autenticador/AutenticarUsuario`;
  const { data } = await axios.post(
    url,
    { Login: UAU_USER, Senha: UAU_PASS },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-INTEGRATION-Authorization': UAU_INTEGRATION_TOKEN,
      },
      timeout: 30000,
    }
  );
  const token = data?.Token || data?.token || data?.AccessToken || data;
  if (!token || typeof token !== 'string') {
    throw new Error('Resposta de autenticacao UAU nao retornou token reconhecivel');
  }
  uauTokenCache = { token, expiresAt: Date.now() + UAU_TOKEN_TTL_MS };
  return token;
}

async function uauCall(controller, method, body = {}, { retryOn401 = true, timeout = 60000 } = {}) {
  const token = await getUauUserToken();
  const url = `${UAU_BASE_URL}/api/v1.0/${controller}/${method}`;
  try {
    const { data } = await axios.post(url, body || {}, {
      headers: {
        'Content-Type': 'application/json',
        'X-INTEGRATION-Authorization': UAU_INTEGRATION_TOKEN,
        'Authorization': token,
      },
      timeout,
    });
    return data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 && retryOn401) {
      await getUauUserToken({ force: true });
      return uauCall(controller, method, body, { retryOn401: false });
    }
    throw err;
  }
}

function uauErrorPayload(err) {
  return {
    error: err.message,
    status: err.response?.status,
    data: err.response?.data,
  };
}

// --- Health / status da conexao ---
app.get('/api/uau/status', async (req, res) => {
  try {
    const token = await getUauUserToken();
    res.json({
      connected: true,
      baseUrl: UAU_BASE_URL,
      user: UAU_USER,
      tokenPreview: token.slice(0, 24) + '...',
      tokenExpiresAt: new Date(uauTokenCache.expiresAt).toISOString(),
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ connected: false, ...uauErrorPayload(err) });
  }
});

// --- Forca refresh do token ---
app.post('/api/uau/auth/refresh', async (req, res) => {
  try {
    const token = await getUauUserToken({ force: true });
    res.json({ ok: true, tokenPreview: token.slice(0, 24) + '...' });
  } catch (err) {
    res.status(500).json(uauErrorPayload(err));
  }
});

// --- Empresas ativas (SPEs das usinas GVS) ---
app.get('/api/uau/empresas', async (req, res) => {
  try {
    const data = await uauCall('Empresa', 'ObterEmpresasAtivas', {});
    res.json({ count: Array.isArray(data) ? data.length : 0, items: data });
  } catch (err) {
    res.status(500).json(uauErrorPayload(err));
  }
});

// --- Obras ativas ---
app.get('/api/uau/obras', async (req, res) => {
  try {
    const data = await uauCall('Obras', 'ObterObrasAtivas', {});
    res.json({ count: Array.isArray(data) ? data.length : 0, items: data });
  } catch (err) {
    res.status(500).json(uauErrorPayload(err));
  }
});

// --- Cache simples de obras (5 min) para nao bater o UAU a cada consulta ---
let obrasCache = { data: null, expiresAt: 0 };
async function getObrasCached() {
  if (obrasCache.data && Date.now() < obrasCache.expiresAt) return obrasCache.data;
  const data = await uauCall('Obras', 'ObterObrasAtivas', {});
  obrasCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
  return data;
}

// --- Desembolso agregado por empresa ---
// Body: { empresa: int, mesInicial: "mm/yyyy", mesFinal: "mm/yyyy" }
// Percorre todas as obras da empresa, chama Planejamento.ConsultarDesembolsoPlanejamento,
// agrega e devolve KPIs + series prontas para o grafico + rows brutas.
app.post('/api/uau/desembolso/empresa', async (req, res) => {
  const { empresa, mesInicial, mesFinal } = req.body || {};
  if (!empresa || !mesInicial || !mesFinal) {
    return res.status(400).json({ error: 'empresa, mesInicial e mesFinal sao obrigatorios' });
  }
  const empCode = Number(empresa);
  if (!Number.isFinite(empCode) || empCode <= 0) {
    return res.status(400).json({ error: 'empresa deve ser um numero positivo' });
  }
  try {
    const obras = await getObrasCached();
    const obrasDaEmpresa = obras.filter(o => Number(o.Empresa_obr) === empCode);
    if (obrasDaEmpresa.length === 0) {
      return res.json({
        empresa: empCode, mesInicial, mesFinal,
        obrasTotal: 0, obrasComDados: 0, linhasTotal: 0,
        totais: { total: 0, totalLiq: 0, totalBruto: 0, acrescimo: 0, desconto: 0 },
        porMes: [], porStatus: [], topObras: [], topItens: [], rows: [], errors: [],
      });
    }

    const CONCURRENCY = 6;
    const rows = [];
    const errors = [];
    let obrasComDados = 0;

    async function worker(slice) {
      for (const obra of slice) {
        try {
          const data = await uauCall(
            'Planejamento', 'ConsultarDesembolsoPlanejamento',
            { Empresa: empCode, Obra: obra.Cod_obr, MesInicial: mesInicial, MesFinal: mesFinal },
            { timeout: 120000 }
          );
          if (Array.isArray(data)) {
            if (data.length > 0) obrasComDados++;
            for (const r of data) {
              rows.push({ ...r, _ObraDescricao: obra.Descr_obr });
            }
          }
        } catch (err) {
          errors.push({
            obra: obra.Cod_obr, descricao: obra.Descr_obr,
            error: err.message, status: err.response?.status,
          });
        }
      }
    }

    const chunks = Array.from({ length: CONCURRENCY }, () => []);
    obrasDaEmpresa.forEach((o, i) => chunks[i % CONCURRENCY].push(o));
    await Promise.all(chunks.map(worker));

    const totais = rows.reduce((acc, r) => {
      acc.total += Number(r.Total) || 0;
      acc.totalLiq += Number(r.TotalLiq) || 0;
      acc.totalBruto += Number(r.TotalBruto) || 0;
      acc.acrescimo += Number(r.Acrescimo) || 0;
      acc.desconto += Number(r.Desconto) || 0;
      return acc;
    }, { total: 0, totalLiq: 0, totalBruto: 0, acrescimo: 0, desconto: 0 });

    const mesMap = new Map();
    const statusMap = new Map();
    const obraMap = new Map();
    const itemMap = new Map();

    for (const r of rows) {
      const liq = Number(r.TotalLiq) || 0;
      const bruto = Number(r.TotalBruto) || 0;

      const ref = r.DtaRef ? String(r.DtaRef).slice(0, 7) : 'sem-data';
      const mm = mesMap.get(ref) || { mes: ref, totalLiq: 0, totalBruto: 0, count: 0 };
      mm.totalLiq += liq;
      mm.totalBruto += bruto;
      mm.count++;
      mesMap.set(ref, mm);

      const st = r.Status || 'sem-status';
      const sm = statusMap.get(st) || { status: st, total: 0, count: 0 };
      sm.total += liq;
      sm.count++;
      statusMap.set(st, sm);

      const obraKey = r.Obra;
      const om = obraMap.get(obraKey) || { obra: obraKey, descricao: r._ObraDescricao, total: 0, count: 0 };
      om.total += liq;
      om.count++;
      obraMap.set(obraKey, om);

      const itemKey = `${r.Item || '-'} | ${r.Composicao || '-'}`;
      const im = itemMap.get(itemKey) || { item: r.Item, composicao: r.Composicao, total: 0, count: 0 };
      im.total += liq;
      im.count++;
      itemMap.set(itemKey, im);
    }

    const porMes = Array.from(mesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));
    const porStatus = Array.from(statusMap.values()).sort((a, b) => b.total - a.total);
    const topObras = Array.from(obraMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
    const topItens = Array.from(itemMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    res.json({
      empresa: empCode, mesInicial, mesFinal,
      obrasTotal: obrasDaEmpresa.length,
      obrasComDados,
      linhasTotal: rows.length,
      totais,
      porMes, porStatus, topObras, topItens,
      rows,
      errors,
    });
  } catch (err) {
    res.status(500).json(uauErrorPayload(err));
  }
});

// --- Proxy generico: POST { controller, method, body } ---
app.post('/api/uau/call', async (req, res) => {
  const { controller, method, body, timeout } = req.body || {};
  if (!controller || !method) {
    return res.status(400).json({ error: 'controller e method sao obrigatorios' });
  }
  try {
    const data = await uauCall(controller, method, body || {}, { timeout: timeout || 60000 });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.response?.status || 500).json(uauErrorPayload(err));
  }
});

// --- Catalogo de endpoints UAU (validado em 2026-04-14) ---
// status: 'ok' = funciona | 'params' = existe mas exige parametros | 'slow' = timeout | 'missing' = 404
app.get('/api/uau/catalog', (req, res) => {
  res.json({
    rfs: [
      {
        id: 'MASTER',
        title: 'Dados mestre — funcionais sem parametros',
        endpoints: [
          { controller: 'Empresa', method: 'ObterEmpresasAtivas', desc: '322 SPEs do Grupo GVS', status: 'ok', body: {} },
          { controller: 'Obras', method: 'ObterObrasAtivas', desc: '1429 obras (CGHs, ADM, manutencao)', status: 'ok', body: {} },
        ],
      },
      {
        id: 'RF02',
        title: 'Captacao Projetada x Realizada — exige parametros',
        endpoints: [
          {
            controller: 'Planejamento', method: 'ConsultarDesembolsoPlanejamento',
            desc: 'Desembolso planejado por obra/mes — retorna Status, Item, Insumo, DtaRef, Total, TotalLiq',
            status: 'params',
            body: { Empresa: 1, Obra: '102', MesInicial: '01/2024', MesFinal: '12/2025' },
          },
          {
            controller: 'ProcessoPagamento', method: 'ConsultarProcessos',
            desc: 'Processos de pagamento — endpoint MUITO lento (timeout >3min mesmo com filtros)',
            status: 'slow',
            body: { Empresa: 1, Obra: '102' },
          },
        ],
      },
      {
        id: 'RF04',
        title: 'Medicao de obras — consulta pontual',
        endpoints: [
          {
            controller: 'Medicao', method: 'ConsultarMedicao',
            desc: 'Detalha uma medicao especifica — exige codigo do contrato e da medicao',
            status: 'params',
            body: { empresa: 1, contrato: 1, medicao: 1 },
          },
        ],
      },
      {
        id: 'DISCOVERY',
        title: 'Endpoints chutados que NAO existem (404)',
        endpoints: [
          { controller: 'Pessoas', method: 'ObterPessoas', desc: '404 — controller nao existe', status: 'missing' },
          { controller: 'Localidade', method: 'ObterLocalidades', desc: '404', status: 'missing' },
          { controller: 'Recebiveis', method: 'ConsultarRecebiveis', desc: '404', status: 'missing' },
          { controller: 'ExtratoDoCliente', method: 'ObterExtratoDoCliente', desc: '404', status: 'missing' },
          { controller: 'BoletoServices', method: 'ObterBoletoPorTitulo', desc: '404', status: 'missing' },
          { controller: 'CobrancaPix', method: 'ObterCobrancaPix', desc: '404', status: 'missing' },
          { controller: 'CessaoRecebiveis', method: 'ObterCessoes', desc: '404', status: 'missing' },
          { controller: 'Venda', method: 'ObterVendasPorEmpresa', desc: '404', status: 'missing' },
          { controller: 'NotasFiscais', method: 'ConsultarNotasFiscais', desc: '404', status: 'missing' },
          { controller: 'Fiscal', method: 'ObterImpostos', desc: '404', status: 'missing' },
          { controller: 'Contabil', method: 'ConsultarLancamentos', desc: '404', status: 'missing' },
          { controller: 'Planejamento', method: 'ConsultarCurvaFisicoFinanceira', desc: '404 — metodo nao existe', status: 'missing' },
        ],
      },
    ],
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend Solatio rodando em http://localhost:${PORT}`);
});
