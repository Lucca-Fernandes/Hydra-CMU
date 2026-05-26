// Seed da tabela spe_estrutura a partir de docs/Classificações.xlsx (Planilha2).
// Roda UMA VEZ no setup. Mapeia empresa (Codigo_emp do UAU) -> cluster/holding/tipo.
// Habilita o nível "Cluster" do FINANCEIRO 2.0 e o de-para UAU↔CMU.
//
// Planilha2: linhas de SEÇÃO (col A=☀, col B=nome da seção, ex "CLUSTER VI") agrupam
// as empresas seguintes. Linhas de empresa: B=código, C="cod - NOME", D=classificação
// (texto livre, inconsistente), E=tipo (HOLDING/SPE/CONSÓRCIO/...), F=status planilha.
// A SEÇÃO é o agrupamento de cluster confiável (col D é bagunçada).
//
// Uso: cd sync-service && node seed_spe_estrutura.js

const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const XLSX_PATH = path.resolve(__dirname, '../docs/Classificações.xlsx');

function parseNome(c) {
  const s = (c == null ? '' : String(c)).trim();
  return s.replace(/^\d+\s*-\s*/, '').trim(); // tira "123 - " do começo
}

async function main() {
  console.log('Lendo', XLSX_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('Planilha2');
  if (!ws) throw new Error('Planilha2 não encontrada');

  const rows = [];
  let secaoAtual = null;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // pula linhas de cabeçalho
    const b = row.getCell(2).value;
    const c = row.getCell(3).value;
    const d = row.getCell(4).value;
    const e = row.getCell(5).value;
    const f = row.getCell(6).value;

    const bStr = (b == null ? '' : String(b)).trim();
    if (!bStr) return;

    // Linha de seção: col B é texto não-numérico -> atualiza cluster atual
    if (!/^\d+$/.test(bStr)) {
      secaoAtual = bStr;
      return;
    }

    // Linha de empresa
    const empresa = parseInt(bStr, 10);
    if (!Number.isFinite(empresa)) return;
    rows.push({
      empresa,
      nome: parseNome(c),
      cluster: secaoAtual,                                  // seção = cluster confiável
      classificacao: (d == null ? '' : String(d)).trim(),  // col D bruta (referência)
      tipo: (e == null ? '' : String(e)).trim(),
      status_planilha: (f == null ? '' : String(f)).trim(),
    });
  });

  // Dedup por empresa (mesmo código pode aparecer em >1 seção). Mantém a 1ª ocorrência;
  // prefere uma com status ATIVO se houver duplicata.
  const byEmpresa = new Map();
  let dupes = 0;
  for (const r of rows) {
    const prev = byEmpresa.get(r.empresa);
    if (!prev) { byEmpresa.set(r.empresa, r); continue; }
    dupes++;
    if (prev.status_planilha !== 'ATIVO' && r.status_planilha === 'ATIVO') byEmpresa.set(r.empresa, r);
  }
  const uniqueRows = [...byEmpresa.values()];
  console.log(`Linhas: ${rows.length}, empresas únicas: ${uniqueRows.length}, duplicatas: ${dupes}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  pool.on('error', (e) => console.warn('pool idle error (ignorado):', e.message));

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS spe_estrutura (
        empresa          INT PRIMARY KEY,
        nome             TEXT,
        cluster          TEXT,
        classificacao    TEXT,
        tipo             TEXT,
        status_planilha  TEXT
      );
    `);
    await client.query('TRUNCATE spe_estrutura');

    const BATCH = 200;
    for (let i = 0; i < uniqueRows.length; i += BATCH) {
      const slice = uniqueRows.slice(i, i + BATCH);
      const vals = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * 6;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
        params.push(r.empresa, r.nome, r.cluster, r.classificacao, r.tipo, r.status_planilha);
      });
      await client.query(
        `INSERT INTO spe_estrutura (empresa, nome, cluster, classificacao, tipo, status_planilha)
         VALUES ${vals.join(',')}
         ON CONFLICT (empresa) DO UPDATE SET nome=EXCLUDED.nome, cluster=EXCLUDED.cluster,
           classificacao=EXCLUDED.classificacao, tipo=EXCLUDED.tipo, status_planilha=EXCLUDED.status_planilha`,
        params
      );
    }

    const byCluster = await client.query(
      `SELECT cluster, COUNT(*)::int n FROM spe_estrutura GROUP BY 1 ORDER BY 2 DESC LIMIT 25`
    );
    console.log('\nspe_estrutura seeded. Por cluster:');
    byCluster.rows.forEach(r => console.log(`  ${(r.cluster||'?').padEnd(28)} ${r.n}`));
  } finally {
    client.release();
    await pool.end();
  }
  console.log('\n✓ Seed concluído.');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
