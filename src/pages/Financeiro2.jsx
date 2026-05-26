import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button, ToggleButton,
  ToggleButtonGroup, TextField, CircularProgress, Alert, Autocomplete, Divider, LinearProgress,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaidIcon from '@mui/icons-material/Paid';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ConstructionIcon from '@mui/icons-material/Construction';
import SavingsIcon from '@mui/icons-material/Savings';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { BASE_URL } from '../api/api';

const BLOCO_COLOR = {
  'Financiamento': '#f87171',
  'O&M': '#38bdf8',
  'CAPEX': '#a78bfa',
  'Aportes': '#fbbf24',
  'Impostos': '#94a3b8',
  'Não classificado': '#475569',
};
const BLOCOS_ORDER = ['Financiamento', 'O&M', 'CAPEX', 'Aportes', 'Impostos', 'Não classificado'];

function fmtBRL(v, compact = true) {
  const n = Number(v) || 0;
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `R$ ${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
    if (abs >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}
function fmtMes(m) { if (!m) return m; const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Palavras-vazias (sufixos/prefixos societários e genéricos) que não ajudam no match
const STOP = new Set(['spe', 'sa', 's', 'a', 'ltda', 'eireli', 'me', 'epp', 'consorcio', 'cooperativa',
  'de', 'do', 'da', 'dos', 'das', 'e', 'energia', 'energias', 'participacoes', 'participacao',
  'holding', 'gd', 'ute', 'ufv', 'cgh', 'pch', 'usina', 'solar', 'renovaveis', 'matriz', 'filial']);
function tokens(s) {
  return normalize(s).split(' ').filter(w => w.length >= 2 && !STOP.has(w));
}
// Match best-effort: nomes UAU (SPE...) e CMU (Consórcio...) diferem muito, então
// pontuamos por token igual (peso 2) e substring (peso 1). Retorna o melhor candidato.
function autoMatchCmuOrg(name, orgs) {
  if (!name || !orgs.length) return null;
  const a = tokens(name);
  if (!a.length) return null;
  let best = null, bestScore = 0;
  for (const o of orgs) {
    const b = tokens(o.organization);
    let score = 0;
    for (const ta of a) for (const tb of b) {
      if (ta === tb) score += 2;
      else if (ta.length >= 3 && tb.includes(ta)) score += 1;
      else if (tb.length >= 3 && ta.includes(tb)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return bestScore > 0 ? best : null;
}

// --- KPI card escuro ---
function Kpi({ label, value, icon, color = '#38bdf8', sub }) {
  return (
    <Paper sx={{ p: 2, borderRadius: '14px', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', right: -8, top: -8, opacity: 0.08, color }}>
        <Box sx={{ fontSize: 76, lineHeight: 1 }}>{icon}</Box>
      </Box>
      <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.45rem', fontWeight: 900, color, lineHeight: 1.3, mt: 0.5 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.25 }}>{sub}</Typography>}
    </Paper>
  );
}

export default function Financeiro2() {
  const [nivel, setNivel] = useState('grupo');
  const [clusters, setClusters] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [mesInicial, setMesInicial] = useState('01/2025');
  const [mesFinal, setMesFinal] = useState('12/2026');
  const [data, setData] = useState(null);
  const [cmu, setCmu] = useState(null);
  const [cmuOrgs, setCmuOrgs] = useState([]);
  const [cmuOrg, setCmuOrg] = useState(null);   // organização CMU (salva > palpite, editável)
  const [cmuOrgSource, setCmuOrgSource] = useState(null); // 'salvo' | 'auto' | 'manual'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ao selecionar a SPE: usa o mapeamento SALVO se existir; senão, palpite automático.
  useEffect(() => {
    if (nivel !== 'spe' || !selectedEmpresa || !cmuOrgs.length) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BASE_URL}/fin2/spe-org/${selectedEmpresa.Codigo_emp}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.organization) {
          const saved = cmuOrgs.find(o => o.organization === d.organization);
          if (saved) { setCmuOrg(saved); setCmuOrgSource('salvo'); return; }
        }
        setCmuOrg(autoMatchCmuOrg(selectedEmpresa.Desc_emp, cmuOrgs));
        setCmuOrgSource('auto');
      } catch {
        if (!cancelled) { setCmuOrg(autoMatchCmuOrg(selectedEmpresa.Desc_emp, cmuOrgs)); setCmuOrgSource('auto'); }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedEmpresa, cmuOrgs, nivel]);

  useEffect(() => {
    fetch(`${BASE_URL}/fin2/clusters`).then(r => r.json()).then(d => setClusters(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${BASE_URL}/uau/empresas`).then(r => r.json()).then(d => setEmpresas(d.items || [])).catch(() => {});
    fetch(`${BASE_URL}/cmu/organizations`).then(r => r.json()).then(d => setCmuOrgs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null); setData(null); setCmu(null);
    let url;
    if (nivel === 'grupo') url = `${BASE_URL}/fin2/grupo`;
    else if (nivel === 'cluster') { if (!selectedCluster) { setError('Selecione um cluster'); return; } url = `${BASE_URL}/fin2/cluster/${encodeURIComponent(selectedCluster.cluster)}`; }
    else { if (!selectedEmpresa) { setError('Selecione uma SPE'); return; } url = `${BASE_URL}/fin2/spe/${selectedEmpresa.Codigo_emp}`; }
    url += `?mesInicial=${mesInicial}&mesFinal=${mesFinal}`;

    setLoading(true);
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
      // Cruzamento CMU no nível SPE: usa a organização selecionada (salva, palpite ou manual)
      if (nivel === 'spe' && cmuOrg && selectedEmpresa) {
        // Persiste o de-para SPE->org (vira autoritativo na próxima vez)
        fetch(`${BASE_URL}/fin2/spe-org`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa: selectedEmpresa.Codigo_emp, organization: cmuOrg.organization }),
        }).then(() => setCmuOrgSource('salvo')).catch(() => {});
        const cr = await fetch(`${BASE_URL}/cmu/org-stats`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organization: cmuOrg.organization, mesInicial, mesFinal }),
        });
        if (cr.ok) setCmu({ ...(await cr.json()), _org: cmuOrg.organization });
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [nivel, selectedCluster, selectedEmpresa, mesInicial, mesFinal, cmuOrg]);

  const t = data?.totais;
  const recebido = cmu?.payments?.recebido || 0;
  const resultadoCaixa = recebido - (t?.pago || 0);
  const dscr = t && t.servicoDivida > 0 ? (recebido - t.operacional) / t.servicoDivida : null;

  const serieData = useMemo(() => (data?.serieMensal || []).map(m => ({ ...m, mesLabel: fmtMes(m.mes) })), [data]);

  // Série cruzada: desembolso UAU (soma dos blocos/mês) vs faturado/recebido CMU
  const crossData = useMemo(() => {
    if (!cmu) return [];
    const desMap = {};
    for (const m of (data?.serieMensal || [])) {
      desMap[m.mes] = BLOCOS_ORDER.reduce((s, b) => s + (m[b] || 0), 0);
    }
    const map = {};
    for (const m of (cmu.porMes || [])) map[m.mes] = { mes: m.mes, faturado: m.faturado || 0, recebido: m.recebido || 0, desembolso: desMap[m.mes] || 0 };
    for (const [mes, des] of Object.entries(desMap)) { if (!map[mes]) map[mes] = { mes, faturado: 0, recebido: 0, desembolso: des }; }
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({ ...m, mesLabel: fmtMes(m.mes) }));
  }, [cmu, data]);

  return (
    <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5}>
        <AccountBalanceIcon sx={{ color: '#38bdf8', fontSize: 30 }} />
        <Typography variant="h5" sx={{ color: '#fff' }}>Financeiro 2.0</Typography>
        <Chip label="UAU × CMU" size="small" sx={{ bgcolor: 'rgba(56,189,248,0.16)', color: '#38bdf8', fontWeight: 800 }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Desembolso (UAU) cruzado com receita (CMU) — visão executiva por SPE, cluster e grupo.
      </Typography>

      {/* Controles */}
      <Card sx={{ borderRadius: '14px', mb: 2.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <ToggleButtonGroup
              value={nivel} exclusive size="small"
              onChange={(_, v) => { if (v) { setNivel(v); setData(null); setCmu(null); } }}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2 } }}
            >
              <ToggleButton value="grupo">Grupo</ToggleButton>
              <ToggleButton value="cluster">Cluster</ToggleButton>
              <ToggleButton value="spe">SPE</ToggleButton>
            </ToggleButtonGroup>

            {nivel === 'cluster' && (
              <Autocomplete
                size="small" sx={{ minWidth: 240 }} options={clusters}
                value={selectedCluster} onChange={(_, v) => setSelectedCluster(v)}
                getOptionLabel={(o) => o ? `${o.cluster} (${o.empresas} SPEs)` : ''}
                isOptionEqualToValue={(a, b) => a?.cluster === b?.cluster}
                renderInput={(p) => <TextField {...p} label="Cluster" />}
              />
            )}
            {nivel === 'spe' && (
              <Autocomplete
                size="small" sx={{ minWidth: 300 }} options={empresas}
                value={selectedEmpresa} onChange={(_, v) => setSelectedEmpresa(v)}
                getOptionLabel={(o) => o ? `${o.Codigo_emp} — ${o.Desc_emp}` : ''}
                isOptionEqualToValue={(a, b) => a?.Codigo_emp === b?.Codigo_emp}
                renderInput={(p) => <TextField {...p} label="SPE UAU (código / nome)" />}
              />
            )}
            {nivel === 'spe' && (
              <Autocomplete
                size="small" sx={{ minWidth: 300 }} options={cmuOrgs}
                value={cmuOrg} onChange={(_, v) => { setCmuOrg(v); setCmuOrgSource('manual'); }}
                getOptionLabel={(o) => o ? `${o.organization} (${o.ativas} ativas)` : ''}
                isOptionEqualToValue={(a, b) => a?.organization === b?.organization}
                renderInput={(p) => (
                  <TextField {...p} label="Org. CMU correspondente"
                    helperText={
                      !selectedEmpresa ? 'selecione a SPE primeiro'
                      : cmuOrgSource === 'salvo' ? '✓ mapeamento salvo'
                      : cmuOrgSource === 'manual' ? 'manual — salvo ao Carregar'
                      : cmuOrg ? '⚠ palpite automático (confira!) — corrija e salva ao Carregar'
                      : 'sem palpite — selecione a org manualmente'
                    } />
                )}
              />
            )}

            <TextField size="small" label="Mês inicial" value={mesInicial} onChange={(e) => setMesInicial(e.target.value)} sx={{ width: 120 }} />
            <TextField size="small" label="Mês final" value={mesFinal} onChange={(e) => setMesFinal(e.target.value)} sx={{ width: 120 }} />
            <Button
              variant="contained" onClick={load} disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              sx={{ minWidth: 130 }}
            >
              {loading ? 'Carregando' : 'Carregar'}
            </Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
          {data && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              {nivel === 'grupo' ? 'Grupo consolidado' : nivel === 'cluster' ? `Cluster ${data.cluster} — ${data.empresas?.length || 0} SPEs` : `SPE ${data.spe?.nome || data.empresa} — ${data.spe?.cluster || ''}`}
              {cmu && ` · CMU: ${cmu._org}`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {!data && !loading && (
        <Paper sx={{ p: 5, borderRadius: '14px', textAlign: 'center' }}>
          <AccountBalanceIcon sx={{ fontSize: 52, color: 'rgba(148,163,184,0.3)', mb: 1 }} />
          <Typography color="text.secondary">Escolha o nível, o período e clique em <b>Carregar</b>.</Typography>
        </Paper>
      )}

      {data && t && (
        <>
          {/* KPIs executivos */}
          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="Comprometido Total" value={fmtBRL(t.total)} icon={<PaidIcon fontSize="inherit" />} color="#38bdf8" sub={`Pago ${fmtBRL(t.pago)} · Pagar ${fmtBRL(t.pagar)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="Financiamento / Dívida" value={fmtBRL(t.financiamento)} icon={<AccountBalanceIcon fontSize="inherit" />} color="#f87171" sub={`${((t.financiamento / (t.total || 1)) * 100).toFixed(0)}% do total`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="Serviço da Dívida" value={fmtBRL(t.servicoDivida)} icon={<TrendingDownIcon fontSize="inherit" />} color="#fb923c" sub={`Amort. ${fmtBRL(t.amortizacao)} · Juros ${fmtBRL(t.juros)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="O&M (Operacional)" value={fmtBRL(t.operacional)} icon={<ConstructionIcon fontSize="inherit" />} color="#22c55e" sub={`CAPEX ${fmtBRL(t.capex)}`} /></Grid>
          </Grid>

          {/* Cruzamento CMU (nível SPE) */}
          {cmu && (
            <Grid container spacing={2} mb={2.5}>
              <Grid size={{ xs: 6, md: 3 }}><Kpi label="Receita Recebida (CMU)" value={fmtBRL(recebido)} icon={<SolarPowerIcon fontSize="inherit" />} color="#22c55e" sub={`${cmu.meters?.ativas || 0} UCs ativas`} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><Kpi label="Faturado (CMU)" value={fmtBRL(cmu.invoices?.faturado || 0)} icon={<ReceiptLongIcon fontSize="inherit" />} color="#38bdf8" /></Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Kpi label="Resultado de Caixa" value={fmtBRL(resultadoCaixa)} icon={<SavingsIcon fontSize="inherit" />} color={resultadoCaixa >= 0 ? '#22c55e' : '#f87171'} sub="Recebido − Pago UAU" />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Kpi label="DSCR (cobertura dívida)" value={dscr != null ? dscr.toFixed(2) + 'x' : '—'} icon={<AccountBalanceIcon fontSize="inherit" />} color={dscr != null && dscr >= 1 ? '#22c55e' : '#f87171'} sub="(Recebido − O&M) ÷ Serviço dívida" />
              </Grid>
            </Grid>
          )}

          {/* Cruzamento UAU × CMU por mês (nível SPE) */}
          {cmu && crossData.length > 0 && (
            <Paper sx={{ p: 2, borderRadius: '14px', height: 360, mb: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <SolarPowerIcon sx={{ color: '#22c55e', fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>
                  Cruzamento UAU × CMU — Receita vs Desembolso por mês
                </Typography>
              </Stack>
              <ResponsiveContainer width="100%" height="88%">
                <BarChart data={crossData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v} />
                  <Tooltip contentStyle={{ background: '#121a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, color: '#e8edf7' }} formatter={(v, n) => [fmtBRL(v), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="faturado" name="Faturado (CMU)" fill="#38bdf8" />
                  <Bar dataKey="recebido" name="Recebido (CMU)" fill="#22c55e" />
                  <Bar dataKey="desembolso" name="Desembolso (UAU)" fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {/* Aviso quando SPE sem org CMU casada */}
          {nivel === 'spe' && !cmu && (
            <Alert severity="info" sx={{ mb: 2.5 }}>
              Sem cruzamento CMU: selecione a <b>Organização CMU</b> correspondente acima e clique em Carregar para ver faturamento/recebimento.
            </Alert>
          )}

          <Grid container spacing={2.5}>
            {/* Série mensal empilhada por bloco */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 380 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
                  Desembolso mensal por bloco
                </Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={serieData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v} />
                    <Tooltip contentStyle={{ background: '#121a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, color: '#e8edf7' }} formatter={(v, n) => [fmtBRL(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {BLOCOS_ORDER.map(b => <Bar key={b} dataKey={b} stackId="a" fill={BLOCO_COLOR[b]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Composição por bloco (Pago/Pagar) */}
            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 380, overflow: 'auto' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
                  Composição por bloco
                </Typography>
                <Stack spacing={1.5}>
                  {BLOCOS_ORDER.filter(b => data.blocos[b]).map(b => {
                    const bl = data.blocos[b];
                    const pct = t.total > 0 ? (bl.total / t.total) * 100 : 0;
                    return (
                      <Box key={b}>
                        <Stack direction="row" justifyContent="space-between" mb={0.4}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: BLOCO_COLOR[b] }} />
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{b}</Typography>
                          </Stack>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: BLOCO_COLOR[b] }}>{fmtBRL(bl.total)}</Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={Math.min(pct, 100)} sx={{ height: 7, borderRadius: 4, bgcolor: 'rgba(148,163,184,0.1)', '& .MuiLinearProgress-bar': { bgcolor: BLOCO_COLOR[b], borderRadius: 4 } }} />
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.25 }}>
                          {pct.toFixed(1)}% · Pago {fmtBRL(bl.Pago)} · Pagar {fmtBRL(bl.Pagar)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            {/* Por categoria (detalhe, foco financiamento) */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, borderRadius: '14px' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
                  Top categorias (plano de contas)
                </Typography>
                <Stack spacing={0.75}>
                  {data.porCategoria.slice(0, 10).map((c) => {
                    const pct = t.total > 0 ? (c.total / t.total) * 100 : 0;
                    const col = BLOCO_COLOR[c.bloco] || '#94a3b8';
                    return (
                      <Stack key={c.categoria} direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ width: 200, flexShrink: 0, fontSize: '0.72rem' }} noWrap>{c.categoria}</Typography>
                        <Box sx={{ flex: 1, height: 8, bgcolor: 'rgba(148,163,184,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                          <Box sx={{ height: '100%', width: `${Math.min(pct, 100)}%`, bgcolor: col, borderRadius: 4 }} />
                        </Box>
                        <Typography sx={{ width: 90, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: col }}>{fmtBRL(c.total)}</Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            {/* Top obras OU por cluster (grupo) */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, borderRadius: '14px' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
                  {nivel === 'grupo' && data.porCluster ? 'Desembolso por cluster' : 'Top obras'}
                </Typography>
                <Stack spacing={0.75}>
                  {(nivel === 'grupo' && data.porCluster
                    ? data.porCluster.slice(0, 10).map((c) => ({ label: c.cluster, total: c.total }))
                    : data.topObras.map((o) => ({ label: `${o.obra}`, total: o.total }))
                  ).map((row, i) => {
                    const max = nivel === 'grupo' && data.porCluster ? (data.porCluster[0]?.total || 1) : (data.topObras[0]?.total || 1);
                    const pct = (row.total / max) * 100;
                    return (
                      <Stack key={i} direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ width: 150, flexShrink: 0, fontSize: '0.72rem' }} noWrap>{row.label}</Typography>
                        <Box sx={{ flex: 1, height: 8, bgcolor: 'rgba(148,163,184,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                          <Box sx={{ height: '100%', width: `${Math.min(pct, 100)}%`, bgcolor: '#38bdf8', borderRadius: 4 }} />
                        </Box>
                        <Typography sx={{ width: 90, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8' }}>{fmtBRL(row.total)}</Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
