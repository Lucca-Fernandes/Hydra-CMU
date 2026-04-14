require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const UAU_BASE_URL = process.env.UAU_BASE_URL;
const UAU_INTEGRATION_TOKEN = process.env.UAU_INTEGRATION_TOKEN;
const UAU_USER = process.env.UAU_USER;
const UAU_PASS = process.env.UAU_PASS;

const MES_INI = '01/2010';
const MES_FIM = '12/2030';
const CONCURRENCY = 6;
const OUT_CSV = path.resolve(__dirname, `../desembolso_planejamento_${Date.now()}.csv`);

let userToken = null;

async function authenticate() {
  const url = `${UAU_BASE_URL}/api/v1.0/Autenticador/AutenticarUsuario`;
  const { data } = await axios.post(
    url,
    { Login: UAU_USER, Senha: UAU_PASS },
    { headers: { 'Content-Type': 'application/json', 'X-INTEGRATION-Authorization': UAU_INTEGRATION_TOKEN }, timeout: 30000 }
  );
  userToken = data?.Token || data?.token || data?.AccessToken || data;
  if (!userToken || typeof userToken !== 'string') throw new Error('Falha autenticacao');
  console.log(`[auth] token obtido (${userToken.slice(0, 16)}...)`);
}

async function uauCall(controller, method, body, retry = true) {
  try {
    const { data } = await axios.post(
      `${UAU_BASE_URL}/api/v1.0/${controller}/${method}`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-INTEGRATION-Authorization': UAU_INTEGRATION_TOKEN,
          'Authorization': userToken,
        },
        timeout: 120000,
      }
    );
    return data;
  } catch (err) {
    if (err.response?.status === 401 && retry) {
      await authenticate();
      return uauCall(controller, method, body, false);
    }
    throw err;
  }
}

async function fetchObras() {
  console.log('[obras] baixando lista...');
  const obras = await uauCall('Obras', 'ObterObrasAtivas', {});
  console.log(`[obras] ${obras.length} obras`);
  return obras;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function main() {
  console.log(`[config] periodo ${MES_INI} -> ${MES_FIM} | concorrencia ${CONCURRENCY}`);
  await authenticate();
  const obras = await fetchObras();

  const allRows = [];
  const errors = [];
  let done = 0;
  let withData = 0;

  async function worker(slice) {
    for (const obra of slice) {
      const empresa = obra.Empresa_obr;
      const cod = obra.Cod_obr;
      try {
        const res = await uauCall('Planejamento', 'ConsultarDesembolsoPlanejamento', {
          Empresa: empresa, Obra: cod, MesInicial: MES_INI, MesFinal: MES_FIM,
        });
        if (Array.isArray(res)) {
          if (res.length > 0) withData++;
          for (const row of res) {
            allRows.push({
              ...row,
              _ObraDescricao: obra.Descr_obr,
              _ObraStatus: obra.Status_obr,
              _ObraTipo: obra.TipoObra_obr,
              _ObraDtIni: obra.DtIni_obr,
              _ObraDtFim: obra.Dtfim_obr,
            });
          }
        } else if (typeof res === 'string') {
          // "Não foram encontrados valores para o período informado."
        } else {
          errors.push({ empresa, cod, error: 'resposta inesperada', data: res });
        }
      } catch (err) {
        errors.push({
          empresa, cod,
          error: err.message,
          status: err.response?.status,
          data: err.response?.data,
        });
      }
      done++;
      if (done % 25 === 0 || done === obras.length) {
        console.log(`[progress] ${done}/${obras.length} obras | ${allRows.length} linhas | ${withData} com dados | ${errors.length} erros`);
      }
    }
  }

  const chunks = Array.from({ length: CONCURRENCY }, () => []);
  obras.forEach((o, i) => chunks[i % CONCURRENCY].push(o));
  await Promise.all(chunks.map(worker));

  console.log(`[done] ${allRows.length} linhas totais, ${withData} obras com dados, ${errors.length} erros`);

  if (allRows.length === 0) {
    console.log('[csv] nenhum dado para escrever');
    return;
  }

  const allKeys = new Set();
  for (const r of allRows) Object.keys(r).forEach(k => allKeys.add(k));
  const headers = Array.from(allKeys);

  const lines = [headers.join(',')];
  for (const r of allRows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  fs.writeFileSync(OUT_CSV, lines.join('\n'), 'utf8');
  console.log(`[csv] escrito em ${OUT_CSV} (${lines.length} linhas)`);

  if (errors.length) {
    const errFile = OUT_CSV.replace('.csv', '_errors.json');
    fs.writeFileSync(errFile, JSON.stringify(errors, null, 2), 'utf8');
    console.log(`[errors] ${errors.length} erros em ${errFile}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
