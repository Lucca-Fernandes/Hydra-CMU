// Ingest do desembolso UAU para a tabela uau_desembolso (pré-classificada + pré-agregada).
// Bootstrap: lê o CSV de export (sem martelar a API). Reaplica a classificação 3-níveis
// (plano_contas exato -> wildcard por insumo -> prefixo) carregada do Postgres.
// Grão: (empresa, obra, categoria, bloco, status, ref_mes). Soma TotalLiq/TotalBruto.
//
// Uso: cd sync-service && node ingest_desembolso.js <arquivo.csv>
// (se omitir, usa o export mais recente na raiz do projeto)

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function resolveCsv() {
  if (process.argv[2]) return process.argv[2];
  const root = path.resolve(__dirname, '..');
  const files = fs.readdirSync(root).filter(f => /^desembolso_planejamento_\d+\.csv$/.test(f));
  if (!files.length) throw new Error('Nenhum CSV de export encontrado; passe o caminho como argumento');
  files.sort();
  return path.join(root, files[files.length - 1]);
}

async function loadClassificador(pool) {
  const exact = new Map();   // "iteminsumo" -> {categoria, bloco}
  const wild = new Map();    // insumo -> {categoria, bloco}
  const prefix = new Map();  // prefixo -> {categoria, bloco}
  const SEP = String.fromCharCode(1);

  const pc = await pool.query('SELECT item, insumo, categoria, bloco FROM plano_contas');
  for (const r of pc.rows) {
    if (r.item === '*') wild.set(r.insumo, { categoria: r.categoria, bloco: r.bloco });
    else exact.set(r.item + SEP + r.insumo, { categoria: r.categoria, bloco: r.bloco });
  }
  const pp = await pool.query('SELECT prefixo, categoria, bloco FROM plano_contas_prefixo');
  for (const r of pp.rows) prefix.set(r.prefixo, { categoria: r.categoria, bloco: r.bloco });

  console.log(`Classificador: ${exact.size} exatos, ${wild.size} wildcard, ${prefix.size} prefixos`);

  return function classify(item, insumo) {
    if (!insumo) return { categoria: 'Não classificado', bloco: 'Não classificado' };
    const e = exact.get(item + SEP + insumo);
    if (e) return e;
    const w = wild.get(insumo);
    if (w) return w;
    const m = insumo.match(/^([A-Za-z]+)/);
    if (m) { const p = prefix.get(m[1]); if (p) return p; }
    return { categoria: 'Não classificado', bloco: 'Não classificado' };
  };
}

async function main() {
  const CSV = resolveCsv();
  console.log('[in]', CSV);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  pool.on('error', (e) => console.warn('pool idle error (ignorado):', e.message));

  const classify = await loadClassificador(pool);

  // Índices das colunas (do header do CSV)
  const COLS = ['Status', 'Empresa', 'Obra', 'Contrato', 'Produto', 'Composicao', 'Item',
    'Insumo', 'DtaRef', 'DtaRefMes', 'DtaRefAno', 'Total', 'Acrescimo', 'Desconto',
    'TotalLiq', 'TotalBruto'];
  let idx = null;

  // Agregação: key -> { empresa, obra, categoria, bloco, status, ref_mes, total_liq, total_bruto, qtd }
  const agg = new Map();
  const SEP = String.fromCharCode(1);
  let totalRows = 0, naoClass = 0;

  function emitRow(fields) {
    if (idx === null) {
      idx = {};
      fields.forEach((h, i) => { idx[h.trim()] = i; });
      for (const c of ['Empresa', 'Obra', 'Item', 'Insumo', 'Status', 'DtaRef', 'TotalLiq', 'TotalBruto']) {
        if (idx[c] === undefined) throw new Error(`Coluna ${c} ausente no CSV`);
      }
      return;
    }
    totalRows++;
    const empresa = parseInt(fields[idx.Empresa], 10);
    if (!Number.isFinite(empresa)) return;
    const obra = (fields[idx.Obra] || '').trim();
    const item = (fields[idx.Item] || '').trim();
    const insumo = (fields[idx.Insumo] || '').trim();
    const status = (fields[idx.Status] || '').trim();
    const dtaRef = (fields[idx.DtaRef] || '').trim();
    const refMes = dtaRef ? dtaRef.slice(0, 7) + '-01' : null; // YYYY-MM-01
    const liq = parseFloat(fields[idx.TotalLiq]) || 0;
    const bruto = parseFloat(fields[idx.TotalBruto]) || 0;

    const { categoria, bloco } = classify(item, insumo);
    if (bloco === 'Não classificado') naoClass++;

    const key = [empresa, obra, categoria, bloco, status, refMes].join(SEP);
    let row = agg.get(key);
    if (!row) {
      row = { empresa, obra, categoria, bloco, status, ref_mes: refMes, total_liq: 0, total_bruto: 0, qtd: 0 };
      agg.set(key, row);
    }
    row.total_liq += liq;
    row.total_bruto += bruto;
    row.qtd++;

    if (totalRows % 200000 === 0) console.log(`[progress] ${totalRows} linhas, ${agg.size} grupos`);
  }

  // Stateful CSV parser (reaproveitado do csv_to_xlsx.js)
  let cur = '', fields = [], inQ = false, prevQ = false;
  const stream = fs.createReadStream(CSV, { encoding: 'utf8', highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQ) {
        if (prevQ) { prevQ = false; if (c === '"') { cur += '"'; continue; } inQ = false; }
        else if (c === '"') { prevQ = true; continue; }
        else { cur += c; continue; }
      }
      if (c === '"') { inQ = true; continue; }
      if (c === ',') { fields.push(cur); cur = ''; continue; }
      if (c === '\n') { fields.push(cur); cur = ''; emitRow(fields); fields = []; continue; }
      if (c === '\r') continue;
      cur += c;
    }
  }
  if (cur.length > 0 || fields.length > 0) { fields.push(cur); emitRow(fields); }

  const groups = [...agg.values()];
  console.log(`\nLinhas lidas: ${totalRows}, grupos agregados: ${groups.length}, não classificados (linhas): ${naoClass}`);

  // Persistir
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS uau_desembolso (
        empresa      INT NOT NULL,
        obra         TEXT,
        categoria    TEXT,
        bloco        TEXT,
        status       TEXT,
        ref_mes      DATE,
        total_liq    NUMERIC,
        total_bruto  NUMERIC,
        qtd_linhas   INT
      );
    `);
    await client.query('TRUNCATE uau_desembolso');

    const BATCH = 1000;
    for (let i = 0; i < groups.length; i += BATCH) {
      const slice = groups.slice(i, i + BATCH);
      const vals = [], params = [];
      slice.forEach((r, j) => {
        const b = j * 9;
        vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`);
        params.push(r.empresa, r.obra, r.categoria, r.bloco, r.status, r.ref_mes, r.total_liq, r.total_bruto, r.qtd);
      });
      await client.query(
        `INSERT INTO uau_desembolso (empresa, obra, categoria, bloco, status, ref_mes, total_liq, total_bruto, qtd_linhas)
         VALUES ${vals.join(',')}`, params
      );
      if (i % 50000 === 0) console.log(`[insert] ${i}/${groups.length}`);
    }

    await client.query('CREATE INDEX IF NOT EXISTS idx_uau_emp ON uau_desembolso (empresa)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_uau_bloco ON uau_desembolso (bloco)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_uau_mes ON uau_desembolso (ref_mes)');

    const resumo = await client.query(`
      SELECT bloco, status, COUNT(*)::int grupos, SUM(total_liq)::numeric total_liq
      FROM uau_desembolso GROUP BY bloco, status ORDER BY total_liq DESC NULLS LAST LIMIT 12
    `);
    console.log('\nuau_desembolso seeded. Top bloco/status por R$:');
    resumo.rows.forEach(r => console.log(`  ${(r.bloco||'?').padEnd(18)} ${(r.status||'?').padEnd(11)} ${r.grupos.toString().padStart(7)} grupos  R$ ${Number(r.total_liq).toLocaleString('pt-BR', {maximumFractionDigits:0})}`));
  } finally {
    client.release();
    await pool.end();
  }
  console.log('\n✓ Ingest concluído.');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
