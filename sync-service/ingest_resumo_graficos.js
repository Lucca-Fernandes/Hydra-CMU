// Ingest da planilha "DADOS GERAIS.xlsx" (aba "Resumo Graficos") -> tabela fin3_resumo.
// Roda UMA VEZ no setup (ou quando o gestor enviar planilha nova). Mesmo princípio do
// Financeiro 2.0: a planilha é absorvida pro Postgres; o runtime NUNCA lê .xlsx.
//
// A aba tem 1 linha por (Usina, Status, métrica "Dados") e 36 colunas de mês (jan/24..dez/26).
// Aqui despivotamos: cada (usina, status, metrica, mês) com valor numérico vira 1 linha.
//
// Fonte do PREVISTO (Status='PROJETADO') do Financeiro 3.0. O REALIZADO da planilha também
// é carregado (útil para métricas de geração que a CMU não tem: Injetada/Bruta/Estoque).
//
// Uso: cd sync-service && node ingest_resumo_graficos.js [caminho.xlsx]

const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const XLSX_PATH = process.argv[2] ||
  path.resolve(__dirname, '../docs/financeiro 3.0/DADOS GERAIS.xlsx');
const SHEET = 'Resumo Graficos';

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

// Extrai valor de célula (lida com fórmulas cross-workbook que trazem .result)
function cv(v) {
  if (v && typeof v === 'object') {
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    if (v.richText) return v.richText.map(t => t.text).join('');
    return null;
  }
  return v;
}
function toNum(v) {
  const x = cv(v);
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(String(x).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function txt(v) {
  const x = cv(v);
  return x === null || x === undefined ? '' : String(x).trim();
}

// "jan/24" -> "2024-01-01" (ou null se não for cabeçalho de mês)
function mesHeaderToDate(h) {
  const s = txt(h).toLowerCase();
  const m = s.match(/^([a-zç]{3})\/(\d{2})$/);
  if (!m) return null;
  const mm = MESES[m[1]];
  if (!mm) return null;
  const yyyy = 2000 + parseInt(m[2], 10);
  return `${yyyy}-${String(mm).padStart(2, '0')}-01`;
}

// xlsx usa "I".."XII"/"BGO"; spe_estrutura/UAU usa "CLUSTER I".."CLUSTER XII"/"BGO".
const ROMANOS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']);
function normCluster(c) {
  const s = txt(c).toUpperCase();
  if (!s) return null;
  if (ROMANOS.has(s)) return `CLUSTER ${s}`;
  return s; // BGO, etc.
}

async function main() {
  console.log('Lendo', XLSX_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Aba "${SHEET}" não encontrada`);

  // Mapeia colunas de mês (a partir da col 9) -> data
  const monthCols = [];
  for (let c = 9; c <= ws.columnCount; c++) {
    const d = mesHeaderToDate(ws.getRow(1).getCell(c).value);
    if (d) monthCols.push({ col: c, ref: d });
  }
  console.log(`Colunas de mês detectadas: ${monthCols.length} (${monthCols[0]?.ref} .. ${monthCols[monthCols.length - 1]?.ref})`);

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const usina = txt(row.getCell(3).value);
    const metrica = txt(row.getCell(8).value);
    const statusRaw = txt(row.getCell(7).value).toUpperCase();
    if (!usina || !metrica || !statusRaw) continue;

    const cluster = normCluster(row.getCell(1).value);
    const fonte = txt(row.getCell(2).value) || null;
    const concessionaria = txt(row.getCell(4).value) || null;
    const potencia = toNum(row.getCell(5).value);
    const operandoRaw = txt(row.getCell(6).value).toUpperCase();
    const operando = operandoRaw === 'SIM' ? true : operandoRaw === 'NÃO' || operandoRaw === 'NAO' ? false : null;
    const status = statusRaw.startsWith('PROJ') ? 'PROJETADO' : 'REALIZADO';

    for (const { col, ref } of monthCols) {
      const valor = toNum(row.getCell(col).value);
      if (valor === null) continue; // só meses com valor numérico
      rows.push({ usina, cluster, fonte, concessionaria, potencia, operando, status, metrica, ref, valor });
    }
  }
  console.log(`Linhas despivotadas: ${rows.length}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  pool.on('error', (e) => console.warn('pool idle error (ignorado):', e.message));

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fin3_resumo (
        usina           TEXT,
        cluster         TEXT,
        fonte           TEXT,
        concessionaria  TEXT,
        potencia_mw     NUMERIC,
        operando        BOOLEAN,
        status          TEXT,
        metrica         TEXT,
        ref_mes         DATE,
        valor           NUMERIC
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fin3_smr ON fin3_resumo (status, metrica, ref_mes)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fin3_cluster ON fin3_resumo (cluster)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fin3_fonte ON fin3_resumo (fonte)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fin3_usina ON fin3_resumo (usina)`);
    await client.query('TRUNCATE fin3_resumo');

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const vals = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * 10;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`);
        params.push(r.usina, r.cluster, r.fonte, r.concessionaria, r.potencia, r.operando, r.status, r.metrica, r.ref, r.valor);
      });
      await client.query(
        `INSERT INTO fin3_resumo (usina, cluster, fonte, concessionaria, potencia_mw, operando, status, metrica, ref_mes, valor)
         VALUES ${vals.join(',')}`,
        params
      );
    }

    const resumo = await client.query(`
      SELECT status, COUNT(*)::int n, COUNT(DISTINCT usina)::int usinas,
             MIN(ref_mes) min, MAX(ref_mes) max
      FROM fin3_resumo GROUP BY 1 ORDER BY 1`);
    console.log('\nfin3_resumo carregada:');
    resumo.rows.forEach(r => console.log(`  ${r.status.padEnd(10)} linhas=${r.n} usinas=${r.usinas} ${String(r.min).slice(0,10)}..${String(r.max).slice(0,10)}`));
    const clusters = await client.query(`SELECT DISTINCT cluster FROM fin3_resumo ORDER BY 1`);
    console.log('  clusters:', clusters.rows.map(r => r.cluster).join(', '));
    const metricas = await client.query(`SELECT metrica, COUNT(*)::int n FROM fin3_resumo GROUP BY 1 ORDER BY 2 DESC`);
    console.log('  métricas:', metricas.rows.map(r => r.metrica).join(' | '));
  } finally {
    client.release();
    await pool.end();
  }
  console.log('\n✓ Ingest concluído.');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
