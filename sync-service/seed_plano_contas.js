// Seed da tabela plano_contas a partir de docs/Classificações.xlsx (Planilha1).
// Roda UMA VEZ no setup (ou quando a planilha mudar). O sistema NUNCA lê o .xlsx
// em runtime — depois deste seed, o conhecimento vive no Postgres.
//
// Planilha1: col A = PLANO DE CONTAS (categoria) | B = Item_SiAp | C = InsumoPl_Des (insumo)
// Chave de classificação = (Item + Insumo). Resolve ambiguidade por frequência + prioridade.
//
// Uso: cd sync-service && node seed_plano_contas.js

const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const XLSX_PATH = path.resolve(__dirname, '../docs/Classificações.xlsx');

// categoria (normalizada) -> bloco financeiro
const BLOCO = {
  // Financiamento / Dívida
  'Amortização': 'Financiamento',
  'Despesas Juros Financiamento': 'Financiamento',
  'Outros empréstimos': 'Financiamento',
  'Empréstimo entre SPEs (Super/Def)': 'Financiamento',
  'Empréstimo da SPE/Consórcio': 'Financiamento',
  'Empréstimos Consórcios': 'Financiamento',
  'Despesas Financeiras': 'Financiamento',
  'Despesa Juros Financiamento': 'Financiamento', // variante de grafia do plural
  // O&M / Operacional
  'O&M (Material/Peças/Serviços)': 'O&M',
  'Folha': 'O&M',
  'Despesas Administrativas': 'O&M',
  'Arrendamento Terras': 'O&M',
  'Encargos de Transmissão': 'O&M',
  'Comercialização da Energia': 'O&M',
  'Seguros': 'O&M',
  'O&M AGOE': 'O&M',
  'O&M AB': 'O&M',
  'O&M FAT. DIR.': 'O&M',
  'Aluguel Máquina de Siloxano': 'O&M',
  'Locação Usina': 'O&M',
  'Royalties': 'O&M',
  // CAPEX
  'Implantação': 'CAPEX',
  // Aportes / Sócios
  'Aporte Sócios AFAC': 'Aportes',
  'GVS Holding': 'Aportes',
  'Adiantamento construtora': 'Aportes',
  // Impostos
  '(-) Pis': 'Impostos',
  '(-) Cofins': 'Impostos',
  'Imposto De Renda': 'Impostos',
  'Contribuição Social': 'Impostos',
  // Outros
  'Outros': 'Não classificado',
};

// Prioridade pra desempate (índice menor = vence). Doc: Financiamento > Impostos > Folha > Implantação > O&M
const PRIORITY = [
  'Amortização', 'Despesas Juros Financiamento', 'Outros empréstimos',
  'Empréstimo entre SPEs (Super/Def)', 'Empréstimo da SPE/Consórcio', 'Despesas Financeiras',
  '(-) Pis', '(-) Cofins', 'Imposto De Renda', 'Contribuição Social',
  'Aporte Sócios AFAC', 'GVS Holding', 'Adiantamento construtora',
  'Folha', 'Implantação', 'O&M (Material/Peças/Serviços)',
];
const rank = (cat) => { const i = PRIORITY.indexOf(cat); return i === -1 ? 999 : i; };

// Normaliza categoria (corrige duplicata de casing 'folha' -> 'Folha', trim)
function normCat(c) {
  const t = (c || '').toString().trim();
  if (!t) return null;
  if (t.toLowerCase() === 'folha') return 'Folha';
  return t;
}

async function main() {
  console.log('Lendo', XLSX_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('Planilha1');
  if (!ws) throw new Error('Planilha1 não encontrada');

  // (item|insumo) -> { categoria -> contagem }
  const SEP = String.fromCharCode(1); // separador improvável nos dados
  const counts = new Map();
  let dataRows = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const categoria = normCat(row.getCell(1).value);
    const itemRaw = row.getCell(2).value;
    const insumoRaw = row.getCell(3).value;
    if (!categoria || !insumoRaw) return;
    const item = (itemRaw == null ? '' : String(itemRaw).trim());
    const insumo = String(insumoRaw).trim();
    if (!insumo) return;
    dataRows++;
    const key = item + SEP + insumo;
    if (!counts.has(key)) counts.set(key, new Map());
    const cmap = counts.get(key);
    cmap.set(categoria, (cmap.get(categoria) || 0) + 1);
  });

  // Resolver cada chave: frequência -> prioridade. Marca revisao se havia >1 categoria.
  const resolved = [];
  let ambiguos = 0, semBloco = new Set();
  for (const [key, cmap] of counts) {
    const [item, insumo] = key.split(SEP);
    const cats = [...cmap.entries()];
    const multi = cats.length > 1;
    if (multi) ambiguos++;
    cats.sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0])));
    const categoria = cats[0][0];
    const bloco = BLOCO[categoria] || 'Não classificado';
    if (!BLOCO[categoria]) semBloco.add(categoria);
    // revisao = ambíguo OU sem bloco mapeado (ex: categoria "VERIFICAR" da planilha)
    resolved.push({ item, insumo, categoria, bloco, revisao: multi || !BLOCO[categoria] });
  }

  // Fallback por insumo (item='*'): dados reais do UAU terão combos (Item+Insumo)
  // que não estão na planilha. Pra esses, classificamos pelo insumo dominante.
  const byInsumo = new Map(); // insumo -> { categoria -> count }
  for (const [key, cmap] of counts) {
    const insumo = key.split(SEP)[1];
    if (!byInsumo.has(insumo)) byInsumo.set(insumo, new Map());
    const agg = byInsumo.get(insumo);
    for (const [cat, n] of cmap) agg.set(cat, (agg.get(cat) || 0) + n);
  }
  for (const [insumo, agg] of byInsumo) {
    const cats = [...agg.entries()].sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0])));
    const categoria = cats[0][0];
    const bloco = BLOCO[categoria] || 'Não classificado';
    resolved.push({ item: '*', insumo, categoria, bloco, revisao: cats.length > 1 || !BLOCO[categoria] });
  }

  // Tier 3 — fallback por PREFIXO (ex: PLN, FI, EMP). Pros códigos do UAU real que
  // nem aparecem na planilha. Categoria dominante do prefixo entre os códigos mapeados.
  const byPrefix = new Map(); // prefixo -> { categoria -> count }
  for (const [key, cmap] of counts) {
    const insumo = key.split(SEP)[1];
    const m = insumo.match(/^([A-Za-z]+)/);
    if (!m) continue;
    const pref = m[1];
    if (!byPrefix.has(pref)) byPrefix.set(pref, new Map());
    const agg = byPrefix.get(pref);
    for (const [cat, n] of cmap) agg.set(cat, (agg.get(cat) || 0) + n);
  }
  const prefixRows = [];
  for (const [pref, agg] of byPrefix) {
    const cats = [...agg.entries()].sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0])));
    const categoria = cats[0][0];
    const bloco = BLOCO[categoria] || 'Não classificado';
    prefixRows.push({ prefixo: pref, categoria, bloco });
  }
  // Adições manuais inequívocas (prefixos ausentes da planilha mas óbvios)
  const MANUAL_PREFIX = { FOL: 'Folha' }; // folha de pagamento
  for (const [pref, cat] of Object.entries(MANUAL_PREFIX)) {
    if (!byPrefix.has(pref)) prefixRows.push({ prefixo: pref, categoria: cat, bloco: BLOCO[cat] || 'Não classificado' });
  }

  console.log(`Linhas de dados: ${dataRows}`);
  console.log(`Chaves (Item+Insumo): ${resolved.length}, ambíguas (revisao): ${ambiguos}`);
  if (semBloco.size) console.log('⚠ categorias sem bloco mapeado:', [...semBloco]);

  // Persistir
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  pool.on('error', (e) => console.warn('pool idle error (ignorado):', e.message));

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS plano_contas (
        item       TEXT NOT NULL DEFAULT '',
        insumo     TEXT NOT NULL,
        categoria  TEXT NOT NULL,
        bloco      TEXT NOT NULL,
        revisao    BOOLEAN DEFAULT false,
        PRIMARY KEY (item, insumo)
      );
    `);
    await client.query('TRUNCATE plano_contas');

    // insert em lotes
    const BATCH = 500;
    for (let i = 0; i < resolved.length; i += BATCH) {
      const slice = resolved.slice(i, i + BATCH);
      const vals = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * 5;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
        params.push(r.item, r.insumo, r.categoria, r.bloco, r.revisao);
      });
      await client.query(
        `INSERT INTO plano_contas (item, insumo, categoria, bloco, revisao) VALUES ${vals.join(',')}
         ON CONFLICT (item, insumo) DO UPDATE SET categoria=EXCLUDED.categoria, bloco=EXCLUDED.bloco, revisao=EXCLUDED.revisao`,
        params
      );
    }

    // tabela de fallback por prefixo (tier 3)
    await client.query(`
      CREATE TABLE IF NOT EXISTS plano_contas_prefixo (
        prefixo    TEXT PRIMARY KEY,
        categoria  TEXT NOT NULL,
        bloco      TEXT NOT NULL
      );
    `);
    await client.query('TRUNCATE plano_contas_prefixo');
    for (const p of prefixRows) {
      await client.query(
        `INSERT INTO plano_contas_prefixo (prefixo, categoria, bloco) VALUES ($1,$2,$3)
         ON CONFLICT (prefixo) DO UPDATE SET categoria=EXCLUDED.categoria, bloco=EXCLUDED.bloco`,
        [p.prefixo, p.categoria, p.bloco]
      );
    }

    const byBloco = await client.query(
      `SELECT bloco, COUNT(*)::int n FROM plano_contas GROUP BY 1 ORDER BY 2 DESC`
    );
    console.log('\nplano_contas seeded. Por bloco:');
    byBloco.rows.forEach(r => console.log(`  ${r.bloco.padEnd(18)} ${r.n}`));
    console.log(`plano_contas_prefixo: ${prefixRows.length} prefixos`);
  } finally {
    client.release();
    await pool.end();
  }
  console.log('\n✓ Seed concluído.');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
