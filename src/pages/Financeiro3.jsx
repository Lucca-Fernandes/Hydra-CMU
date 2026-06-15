import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button, ToggleButton,
  ToggleButtonGroup, TextField, CircularProgress, Alert, Autocomplete, Divider, LinearProgress,
  Table, TableBody, TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Select, MenuItem, FormControl, InputLabel, Snackbar,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import BoltIcon from '@mui/icons-material/Bolt';
import PaidIcon from '@mui/icons-material/Paid';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import SavingsIcon from '@mui/icons-material/Savings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ConstructionIcon from '@mui/icons-material/Construction';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HubIcon from '@mui/icons-material/Hub';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import MapIcon from '@mui/icons-material/Map';
import { BASE_URL } from '../api/api';

// ---------- formatadores ----------
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
function fmtMWh(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GWh`;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} MWh`;
}
function fmtMes(m) { if (!m) return m; const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }
function fmtDate(d) { if (!d) return '—'; const x = new Date(d); return x.toLocaleDateString('pt-BR'); }
const axisRS = (v) => (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v);
const tipBox = { background: '#121a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, color: '#e8edf7' };

// ---------- KPI card ----------
function Kpi({ label, value, icon, color = '#38bdf8', sub, dim }) {
  return (
    <Paper sx={{ p: 2, borderRadius: '14px', height: '100%', position: 'relative', overflow: 'hidden', opacity: dim ? 0.92 : 1 }}>
      <Box sx={{ position: 'absolute', right: -8, top: -8, opacity: 0.08, color }}>
        <Box sx={{ fontSize: 72, lineHeight: 1 }}>{icon}</Box>
      </Box>
      <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', textTransform: 'uppercase' }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.35rem', fontWeight: 900, color, lineHeight: 1.3, mt: 0.5 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', mt: 0.25 }}>{sub}</Typography>}
    </Paper>
  );
}
function PanelTitle({ icon, children, color = 'text.secondary' }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} mb={1}>
      {icon}
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color }}>{children}</Typography>
    </Stack>
  );
}
// barras horizontais reutilizáveis
function HBars({ rows, color = '#38bdf8', fmt = fmtBRL, labelW = 160 }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.total || 0)));
  return (
    <Stack spacing={0.75}>
      {rows.map((r, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center">
          <Typography sx={{ width: labelW, flexShrink: 0, fontSize: '0.72rem' }} noWrap>{r.label}</Typography>
          <Box sx={{ flex: 1, height: 8, bgcolor: 'rgba(148,163,184,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.min((Math.abs(r.total) / max) * 100, 100)}%`, bgcolor: color, borderRadius: 4 }} />
          </Box>
          <Typography sx={{ width: 92, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color }}>{fmt(r.total)}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

const FASE_COLOR = { 'OPERAÇÃO': '#22c55e', 'IMPLANTAÇÃO': '#fbbf24', 'DESENVOLVIMENTO': '#38bdf8' };

export default function Financeiro3() {
  const [nivel, setNivel] = useState('grupo');
  const [dims, setDims] = useState({ clusters: [], fontes: [], concessionarias: [], usinas: [] });
  const [selCluster, setSelCluster] = useState(null);
  const [selFonte, setSelFonte] = useState(null);
  const [mesInicial, setMesInicial] = useState('01/2025');
  const [mesFinal, setMesFinal] = useState('12/2026');
  const [resumo, setResumo] = useState(null);
  const [inad, setInad] = useState(null);
  const [fat, setFat] = useState(null);
  const [custos, setCustos] = useState(null);
  const [usinas, setUsinas] = useState([]);
  const [fatDim, setFatDim] = useState('cluster');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadVersao, setUploadVersao] = useState('');
  const [inadDim, setInadDim] = useState('aging');
  // mapeamento org→cluster
  const [mapOpen, setMapOpen] = useState(false);
  const [orgRows, setOrgRows] = useState([]);
  const [mapSaving, setMapSaving] = useState(null);
  const [mapSnack, setMapSnack] = useState('');
  const [newClusterName, setNewClusterName] = useState('');
  const [customClusters, setCustomClusters] = useState([]);
  // versão da planilha
  const [planVersao, setPlanVersao] = useState(null);

  const reloadDims = () => fetch(`${BASE_URL}/fin3/dimensions`).then(r => r.json()).then(setDims).catch(() => {});
  const loadVersao = () => fetch(`${BASE_URL}/fin3/planilha-versao`).then(r => r.json()).then(setPlanVersao).catch(() => {});
  const loadOrgMap = () => fetch(`${BASE_URL}/fin3/org-cluster`).then(r => r.json()).then(setOrgRows).catch(() => {});

  useEffect(() => {
    reloadDims();
    loadVersao();
  }, []);

  const saveOrgCluster = async (org, cluster, fonte) => {
    setMapSaving(org);
    try {
      await fetch(`${BASE_URL}/fin3/org-cluster`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization: org, cluster: cluster || null, fonte: fonte || null }),
      });
      setOrgRows(prev => prev.map(r => r.organization === org ? { ...r, cluster, fonte } : r));
      setMapSnack(`${org} salvo`);
    } catch (e) { setMapSnack(`Erro: ${e.message}`); }
    finally { setMapSaving(null); }
  };

  const load = useCallback(async () => {
    setError(null);
    const cluster = nivel === 'cluster' ? selCluster : null;
    if (nivel === 'cluster' && !cluster) { setError('Selecione um cluster'); return; }
    const qp = new URLSearchParams({ mesInicial, mesFinal });
    if (cluster) qp.set('cluster', cluster);
    if (selFonte) qp.set('fonte', selFonte);
    const q = `?${qp.toString()}`;
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(`${BASE_URL}/fin3/resumo${q}`).then(r => r.json()),
        fetch(`${BASE_URL}/fin3/inadimplencia${q}`).then(r => r.json()),
        fetch(`${BASE_URL}/fin3/faturamento${q}`).then(r => r.json()),
        fetch(`${BASE_URL}/fin3/custos${q}`).then(r => r.json()),
        fetch(`${BASE_URL}/fin3/usinas${cluster ? `?cluster=${encodeURIComponent(cluster)}` : ''}`).then(r => r.json()),
      ]);
      if (r1.error) throw new Error(r1.error);
      setResumo(r1); setInad(r2); setFat(r3); setCustos(r4); setUsinas(Array.isArray(r5) ? r5 : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [nivel, selCluster, selFonte, mesInicial, mesFinal]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true); setUploadResult(null); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadVersao) fd.append('versao', uploadVersao);
      const r = await fetch(`${BASE_URL}/fin3/upload-resumo`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro no upload');
      setUploadResult(data);
      reloadDims();
      loadVersao();
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  }, [uploadVersao]);

  const R = resumo?.real, P = resumo?.previsto;

  // série faturamento × inadimplência (real)
  const fatSerie = useMemo(() => (R?.serie || []).map(m => ({ ...m, mesLabel: fmtMes(m.mes) })), [R]);
  const energiaSerie = useMemo(() => (resumo?.energiaSerie || []).map(m => ({ ...m, mesLabel: fmtMes(m.mes) })), [resumo]);

  // Cruzamento CMU (o que ENTRA) × UAU (o que SAI) — restaura a visão do Financeiro 2.0
  const crossSerie = useMemo(() => {
    if (!resumo || !custos) return [];
    const BLs = ['Financiamento', 'O&M', 'CAPEX', 'Aportes', 'Impostos', 'Não classificado'];
    const des = {};
    for (const m of (custos.serieMensal || [])) des[m.mes] = { oem: m['O&M'] || 0, total: BLs.reduce((s, b) => s + (m[b] || 0), 0) };
    const map = {};
    for (const m of (resumo.real.serie || [])) map[m.mes] = { mes: m.mes, faturado: m.faturado, recebido: m.recebido, desembolso: des[m.mes]?.oem || 0 };
    for (const [mes, d] of Object.entries(des)) { if (!map[mes]) map[mes] = { mes, faturado: 0, recebido: 0, desembolso: d.oem }; }
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({ ...m, mesLabel: fmtMes(m.mes) }));
  }, [resumo, custos]);
  const resultadoCaixa = (R?.recebido || 0) - (R?.custos || 0);
  const dscr = custos?.totais?.servicoDivida > 0 ? ((R?.recebido || 0) - (R?.custos || 0)) / custos.totais.servicoDivida : null;

  const fatRows = useMemo(() => {
    if (!fat) return [];
    if (fatDim === 'cluster') return fat.previsto?.porCluster || [];
    if (fatDim === 'fonte') return fat.previsto?.porFonte || [];
    if (fatDim === 'concessionaria') return fat.real?.porConcessionaria || [];
    if (fatDim === 'tipo') return fat.real?.porTipo || [];
    return [];
  }, [fat, fatDim]);
  const fatRowsSorted = useMemo(() => [...fatRows].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 12), [fatRows]);

  const agingRows = useMemo(() => {
    if (!inad) return [];
    const a = inad.real.aging, t = a.total || 1;
    return [
      { label: 'Até 90 dias', total: a.d90, pct: (a.d90 / t) * 100, color: '#fbbf24' },
      { label: '91 – 180 dias', total: a.d180, pct: (a.d180 / t) * 100, color: '#fb923c' },
      { label: 'Acima de 180 dias', total: a.maior180, pct: (a.maior180 / t) * 100, color: '#f87171' },
    ];
  }, [inad]);

  return (
    <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5} flexWrap="wrap" useFlexGap>
        <TrendingUpIcon sx={{ color: '#22c55e', fontSize: 30 }} />
        <Typography variant="h5" sx={{ color: '#fff' }}>Financeiro 3.0</Typography>
        <Chip label="Realizado × Previsto" size="small" sx={{ bgcolor: 'rgba(34,197,94,0.16)', color: '#22c55e', fontWeight: 800 }} />
        {planVersao && (
          <Chip label={`Planilha: ${planVersao.versao || planVersao.arquivo} (${new Date(planVersao.uploaded_at).toLocaleDateString('pt-BR')})`}
            size="small" variant="outlined" sx={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.3)', fontSize: '0.68rem' }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<MapIcon />}
          onClick={() => { setMapOpen(true); loadOrgMap(); }}
          sx={{ textTransform: 'none', fontWeight: 700, borderColor: 'rgba(148,163,184,0.3)', color: '#94a3b8' }}>
          Mapeamento Org→Cluster
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Energia, faturamento, recebimento, inadimplência e custos — Realizado (CMU) vs Previsto (planejamento), por grupo / cluster / fonte.
      </Typography>

      {/* Controles */}
      <Card sx={{ borderRadius: '14px', mb: 2.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              value={nivel} exclusive size="small"
              onChange={(_, v) => { if (v) { setNivel(v); } }}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2 } }}
            >
              <ToggleButton value="grupo">Grupo</ToggleButton>
              <ToggleButton value="cluster">Cluster</ToggleButton>
            </ToggleButtonGroup>
            {nivel === 'cluster' && (
              <Autocomplete
                size="small" sx={{ minWidth: 220 }} options={dims.clusters}
                value={selCluster} onChange={(_, v) => setSelCluster(v)}
                renderInput={(p) => <TextField {...p} label="Cluster" />}
              />
            )}
            <Autocomplete
              size="small" sx={{ minWidth: 170 }} options={dims.fontes}
              value={selFonte} onChange={(_, v) => setSelFonte(v)}
              renderInput={(p) => <TextField {...p} label="Fonte (opcional)" />}
            />
            <TextField size="small" label="Mês inicial" value={mesInicial} onChange={(e) => setMesInicial(e.target.value)} sx={{ width: 120 }} />
            <TextField size="small" label="Mês final" value={mesFinal} onChange={(e) => setMesFinal(e.target.value)} sx={{ width: 120 }} />
            <Button variant="contained" onClick={load} disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />} sx={{ minWidth: 130 }}>
              {loading ? 'Carregando' : 'Carregar'}
            </Button>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <TextField size="small" label="Versão (ex: rev.38)" value={uploadVersao}
              onChange={(e) => setUploadVersao(e.target.value)} sx={{ width: 140 }} />
            <Button
              variant="outlined" component="label" disabled={uploading} size="small"
              startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
              sx={{ minWidth: 180, textTransform: 'none', fontWeight: 700 }}
            >
              {uploading ? 'Processando...' : 'Atualizar Planilha'}
              <input type="file" hidden accept=".xlsx,.xls" onChange={handleUpload} />
            </Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
          {uploadResult && (
            <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 1.5 }}
              onClose={() => setUploadResult(null)}>
              <b>{uploadResult.arquivo}</b> carregado — {uploadResult.linhas.toLocaleString('pt-BR')} registros
              ({uploadResult.resumo?.map(r => `${r.status}: ${r.usinas} usinas`).join(' · ')})
            </Alert>
          )}
          {resumo && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              {nivel === 'grupo' ? 'Grupo consolidado' : `Cluster ${resumo.cluster}`}
              {selFonte ? ` · Fonte ${selFonte}` : ''} · {mesInicial}–{mesFinal} · Real = CMU ao vivo · Previsto = planejamento
            </Typography>
          )}
        </CardContent>
      </Card>

      {!resumo && !loading && (
        <Paper sx={{ p: 5, borderRadius: '14px', textAlign: 'center' }}>
          <TrendingUpIcon sx={{ fontSize: 52, color: 'rgba(148,163,184,0.3)', mb: 1 }} />
          <Typography color="text.secondary">Escolha o nível, o período e clique em <b>Carregar</b>.</Typography>
        </Paper>
      )}

      {resumo && R && P && (
        <>
          {/* ===== 1. RESUMO GERAL ===== */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: 1, color: '#22c55e', mb: 1 }}>REALIZADO</Typography>
          <Grid container spacing={2} mb={2}>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi label="Compensado" value={fmtMWh(R.compensadaMWh)} icon={<BoltIcon fontSize="inherit" />} color="#38bdf8" sub="energia injetada p/ clientes" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi label="Faturado" value={fmtBRL(R.faturado)} icon={<ReceiptLongIcon fontSize="inherit" />} color="#818cf8" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi label="Recebido" value={fmtBRL(R.recebido)} icon={<PaidIcon fontSize="inherit" />} color="#22c55e" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi label="Inadimplência" value={fmtBRL(R.inadimplencia)} icon={<WarningAmberIcon fontSize="inherit" />} color="#f87171" sub="a receber (vencido + pendente)" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi label="Custos O&M" value={fmtBRL(R.custos)} icon={<ConstructionIcon fontSize="inherit" />} color="#fbbf24" sub={`Endividamento ${fmtBRL(R.endividamento)}`} /></Grid>
          </Grid>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: 1, color: '#a78bfa', mb: 1 }}>PREVISTO</Typography>
          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi dim label="Injetado (R$)" value={fmtBRL(P.injetadoRS)} icon={<SolarPowerIcon fontSize="inherit" />} color="#a78bfa" sub={fmtMWh(P.injetadaMWh)} /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi dim label="Faturado" value={fmtBRL(P.faturado)} icon={<ReceiptLongIcon fontSize="inherit" />} color="#818cf8" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi dim label="Recebido" value={fmtBRL(P.recebido)} icon={<PaidIcon fontSize="inherit" />} color="#22c55e" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi dim label="Inadimplência" value={P.inadimplencia > 0 ? fmtBRL(P.inadimplencia) : 'n/d'} icon={<WarningAmberIcon fontSize="inherit" />} color="#f87171" /></Grid>
            <Grid size={{ xs: 6, md: 2.4 }}><Kpi dim label="Custos O&M" value={fmtBRL(P.custos)} icon={<ConstructionIcon fontSize="inherit" />} color="#fbbf24" sub={`Média realizada ${fmtBRL(P.custosMediaRealizada)}/mês`} /></Grid>
          </Grid>

          {/* ===== CRUZAMENTO CMU (entra) × UAU (sai) — visão da 2.0 ===== */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: 1, color: '#38bdf8', mb: 1 }}>CRUZAMENTO — RECEITA (CMU) × DESEMBOLSO (UAU)</Typography>
          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="Resultado de Caixa (oper.)" value={fmtBRL(resultadoCaixa)} icon={<SavingsIcon fontSize="inherit" />} color={resultadoCaixa >= 0 ? '#22c55e' : '#f87171'} sub="Recebido − Custos O&M" /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label="DSCR (cobertura dívida)" value={dscr != null ? dscr.toFixed(2) + 'x' : '—'} icon={<AccountBalanceIcon fontSize="inherit" />} color={dscr != null && dscr >= 1 ? '#22c55e' : '#f87171'} sub="(Recebido − O&M) ÷ serviço dívida" /></Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 1.5, borderRadius: '14px', height: '100%', minHeight: 170 }}>
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', mb: 0.5 }}>Receita CMU × Desembolso O&M UAU por mês</Typography>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={crossSerie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={axisRS} />
                    <Tooltip contentStyle={tipBox} formatter={(v, n) => [fmtBRL(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="faturado" name="Faturado CMU" fill="#818cf8" />
                    <Bar dataKey="recebido" name="Recebido CMU" fill="#22c55e" />
                    <Bar dataKey="desembolso" name="Desembolso O&M UAU" fill="#fb923c" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={2.5}>
            {/* ===== 2. ENERGIA INJETADA × COMPENSADA + ESTOQUE ===== */}
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 380 }}>
                <PanelTitle icon={<BoltIcon sx={{ color: '#22c55e', fontSize: 18 }} />}>Energia Injetada × Compensada (MWh) + Estoque acumulado</PanelTitle>
                <ResponsiveContainer width="100%" height="90%">
                  <ComposedChart data={energiaSerie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis yAxisId="l" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={axisRS} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fb923c', fontSize: 11 }} tickFormatter={axisRS} />
                    <Tooltip contentStyle={tipBox} formatter={(v, n) => [fmtMWh(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="injetada" name="Injetada" fill="#22c55e" />
                    <Bar yAxisId="l" dataKey="compensada" name="Compensada" fill="#38bdf8" />
                    <Line yAxisId="r" type="monotone" dataKey="estoque" name="Estoque" stroke="#fb923c" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* ===== 5. INADIMPLÊNCIA (multi-dimensão — G2) ===== */}
            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 380, overflow: 'auto' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                  <PanelTitle icon={<WarningAmberIcon sx={{ color: '#f87171', fontSize: 18 }} />} color="#f87171">Inadimplência</PanelTitle>
                  <ToggleButtonGroup value={inadDim} exclusive size="small" onChange={(_, v) => v && setInadDim(v)}
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.2, px: 1, fontSize: '0.64rem' } }}>
                    <ToggleButton value="aging">Aging</ToggleButton>
                    <ToggleButton value="regiao">Região</ToggleButton>
                    <ToggleButton value="tipo">Tipo</ToggleButton>
                    <ToggleButton value="concess">Concess.</ToggleButton>
                    <ToggleButton value="faixa">Faixa R$</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {inadDim === 'aging' && (
                  <>
                    <Stack spacing={1.5} mb={2}>
                      {agingRows.map((a) => (
                        <Box key={a.label}>
                          <Stack direction="row" justifyContent="space-between" mb={0.4}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{a.label}</Typography>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: a.color }}>{fmtBRL(a.total)} ({a.pct.toFixed(0)}%)</Typography>
                          </Stack>
                          <LinearProgress variant="determinate" value={Math.min(a.pct, 100)} sx={{ height: 7, borderRadius: 4, bgcolor: 'rgba(148,163,184,0.1)', '& .MuiLinearProgress-bar': { bgcolor: a.color, borderRadius: 4 } }} />
                        </Box>
                      ))}
                      <Divider sx={{ borderColor: 'rgba(148,163,184,0.14)' }} />
                      <Stack direction="row" justifyContent="space-between">
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>Total</Typography>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 900, color: '#f87171' }}>{fmtBRL(inad?.real.total)}</Typography>
                      </Stack>
                    </Stack>
                  </>
                )}
                {inadDim === 'regiao' && <HBars rows={(inad?.real.porRegiao || []).slice(0, 10)} color="#f87171" labelW={60} />}
                {inadDim === 'tipo' && <HBars rows={(inad?.real.porTipo || []).slice(0, 8)} color="#fb923c" labelW={120} />}
                {inadDim === 'concess' && <HBars rows={(inad?.real.porConcessionaria || []).slice(0, 10)} color="#818cf8" labelW={130} />}
                {inadDim === 'faixa' && (
                  <Stack spacing={1}>
                    {(inad?.real.porFaixa || []).map((f, i) => (
                      <Stack key={i} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography sx={{ fontSize: '0.74rem', minWidth: 140 }}>{f.label}</Typography>
                        <Chip label={`${f.qtd} boletos`} size="small" sx={{ fontSize: '0.62rem', bgcolor: 'rgba(148,163,184,0.1)' }} />
                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, color: '#fb923c', minWidth: 100, textAlign: 'right' }}>{fmtBRL(f.total)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Grid>

            {/* ===== 3. FATURAMENTO + INADIMPLÊNCIA MENSAL ===== */}
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 360 }}>
                <PanelTitle icon={<ReceiptLongIcon sx={{ color: '#818cf8', fontSize: 18 }} />}>Faturamento × Inadimplência mensal (Realizado)</PanelTitle>
                <ResponsiveContainer width="100%" height="88%">
                  <ComposedChart data={fatSerie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={axisRS} />
                    <Tooltip contentStyle={tipBox} formatter={(v, n) => [fmtBRL(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="faturado" name="Faturado" fill="#818cf8" />
                    <Bar dataKey="recebido" name="Recebido" fill="#22c55e" />
                    <Line type="monotone" dataKey="emAberto" name="Inadimplência" stroke="#f87171" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* ===== 6. FATURAMENTO POR DIMENSÃO ===== */}
            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper sx={{ p: 2, borderRadius: '14px', height: 360, overflow: 'auto' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                  <PanelTitle icon={<TrendingUpIcon sx={{ color: '#38bdf8', fontSize: 18 }} />}>Faturamento por</PanelTitle>
                  <ToggleButtonGroup value={fatDim} exclusive size="small" onChange={(_, v) => v && setFatDim(v)}
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.2, px: 1, fontSize: '0.68rem' } }}>
                    <ToggleButton value="cluster">Cluster</ToggleButton>
                    <ToggleButton value="fonte">Fonte</ToggleButton>
                    <ToggleButton value="concessionaria">Concess.</ToggleButton>
                    <ToggleButton value="tipo">Tipo</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mb: 1 }}>
                  {fatDim === 'cluster' || fatDim === 'fonte' ? 'Previsto (planejamento)' : 'Realizado (CMU)'}
                </Typography>
                {fatRowsSorted.length ? <HBars rows={fatRowsSorted} color="#38bdf8" labelW={130} />
                  : <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>Sem dados nesta dimensão.</Typography>}
              </Paper>
            </Grid>

            {/* ===== 4. CUSTOS CLUSTERIZADOS + CARDS ===== */}
            <Grid size={{ xs: 12 }}>
              <Paper sx={{ p: 2, borderRadius: '14px' }}>
                <PanelTitle icon={<AccountBalanceIcon sx={{ color: '#fbbf24', fontSize: 18 }} />}>Custos por cluster (UAU) · endividamento destacado</PanelTitle>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Stack spacing={1.5}>
                      <Kpi label="Valor Pago" value={fmtBRL(custos?.cards.valorPago)} icon={<PaidIcon fontSize="inherit" />} color="#22c55e" />
                      <Kpi label="Valor Total (comprometido)" value={fmtBRL(custos?.cards.valorTotal)} icon={<PaidIcon fontSize="inherit" />} color="#38bdf8" />
                      <Kpi label="Endividamento" value={fmtBRL(custos?.cards.endividamento)} icon={<AccountBalanceIcon fontSize="inherit" />} color="#f87171" sub="serviço da dívida — regra a confirmar c/ Gui" />
                      <Kpi label="Data fim prevista" value={fmtDate(custos?.cards.dataFimPrevista)} icon={<ConstructionIcon fontSize="inherit" />} color="#fbbf24" />
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', mb: 1 }}>Desembolso total por cluster</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={(custos?.porCluster || []).slice(0, 12)} layout="vertical" margin={{ left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={axisRS} />
                        <YAxis type="category" dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} width={110} />
                        <Tooltip contentStyle={tipBox} formatter={(v, n) => [fmtBRL(v), n === 'endividamento' ? 'Endividamento' : n === 'pago' ? 'Pago' : 'Total']} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="pago" name="Pago" stackId="a" fill="#22c55e" />
                        <Bar dataKey="endividamento" name="Endividamento" fill="#f87171" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* ===== 7. CONEXÃO GERENCIAL ===== */}
            <Grid size={{ xs: 12 }}>
              <Paper sx={{ p: 2, borderRadius: '14px' }}>
                <PanelTitle icon={<HubIcon sx={{ color: '#38bdf8', fontSize: 18 }} />}>Conexão Gerencial — usinas ({usinas.length})</PanelTitle>
                <Box sx={{ maxHeight: 420, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {['Usina', 'Fonte', 'Cluster', 'Concessionária', 'MWp', 'Status', 'Data fim', 'Prazo (dias)'].map(h => (
                          <TableCell key={h} sx={{ bgcolor: '#0d1426', color: '#94a3b8', fontWeight: 800, fontSize: '0.7rem', borderColor: 'rgba(148,163,184,0.14)' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {usinas.map((u, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ color: '#e8edf7', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.usina}</TableCell>
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.fonte}</TableCell>
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.cluster}</TableCell>
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.concessionaria}</TableCell>
                          <TableCell sx={{ color: '#e8edf7', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.potencia ?? '—'}</TableCell>
                          <TableCell sx={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                            <Chip label={u.fase} size="small" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: `${FASE_COLOR[u.fase] || '#64748b'}22`, color: FASE_COLOR[u.fase] || '#94a3b8' }} />
                          </TableCell>
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{fmtDate(u.dataFimPrevista)}</TableCell>
                          <TableCell sx={{ color: u.prazoDias != null && u.prazoDias < 0 ? '#f87171' : '#94a3b8', fontSize: '0.74rem', borderColor: 'rgba(148,163,184,0.08)' }}>{u.prazoDias ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Paper>
            </Grid>
            {/* ===== 8. INADIMPLÊNCIA D15 — fechamento fixo (G2) ===== */}
            {inad?.d15?.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Paper sx={{ p: 2, borderRadius: '14px', height: 320 }}>
                  <PanelTitle icon={<WarningAmberIcon sx={{ color: '#fb923c', fontSize: 18 }} />}>
                    Recebido × Inadimplente — corte D15 (fechamento no 15° dia)
                  </PanelTitle>
                  <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mb: 1 }}>
                    Snapshot retroativo: para cada mês, quanto foi pago e quanto estava inadimplente até o dia 15 do mês seguinte.
                  </Typography>
                  <ResponsiveContainer width="100%" height="78%">
                    <BarChart data={inad.d15.map(m => ({ ...m, mesLabel: fmtMes(m.mes) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                      <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={axisRS} />
                      <Tooltip contentStyle={tipBox} formatter={(v, n) => [fmtBRL(v), n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="recebido_d15" name="Recebido até D15" fill="#22c55e" stackId="a" />
                      <Bar dataKey="inadimplente_d15" name="Inadimplente D15" fill="#f87171" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            )}

          </Grid>
        </>
      )}

      {/* ===== DIALOG MAPEAMENTO ORG → CLUSTER ===== */}
      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { bgcolor: '#0f172a', color: '#e8edf7', borderRadius: '16px', maxHeight: '90vh' } }}>
        <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ width: 38, height: 38, borderRadius: '10px', bgcolor: 'rgba(56,189,248,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapIcon sx={{ color: '#38bdf8', fontSize: 22 }} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>Mapeamento Organização → Cluster</Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>Vincule cada organização CMU a um cluster para que a receita apareça nos filtros</Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => setMapOpen(false)} sx={{ color: '#94a3b8' }}><CloseIcon /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {/* ---------- RESUMO CARDS ---------- */}
          {(() => {
            const mapped = orgRows.filter(r => r.cluster);
            const unmapped = orgRows.filter(r => !r.cluster);
            const fatPerdido = unmapped.reduce((s, r) => s + (r.faturado || 0), 0);
            const ucsPerdidas = unmapped.reduce((s, r) => s + (r.ativas || 0), 0);
            const fatTotal = orgRows.reduce((s, r) => s + (r.faturado || 0), 0);
            const pctPerdido = fatTotal > 0 ? ((fatPerdido / fatTotal) * 100).toFixed(0) : 0;
            return (
              <Grid container spacing={1.5} mb={2.5}>
                <Grid size={{ xs: 3 }}>
                  <Paper sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Mapeadas</Typography>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: '#22c55e' }}>{mapped.length}<Typography component="span" sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>/{orgRows.length}</Typography></Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Paper sx={{ p: 1.5, borderRadius: '12px', bgcolor: unmapped.length ? 'rgba(248,113,113,0.06)' : 'rgba(34,197,94,0.06)', border: `1px solid ${unmapped.length ? 'rgba(248,113,113,0.2)' : 'rgba(34,197,94,0.15)'}` }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sem Cluster</Typography>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: unmapped.length ? '#f87171' : '#22c55e' }}>{unmapped.length}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Paper sx={{ p: 1.5, borderRadius: '12px', bgcolor: ucsPerdidas ? 'rgba(251,191,36,0.06)' : 'rgba(34,197,94,0.06)', border: `1px solid ${ucsPerdidas ? 'rgba(251,191,36,0.15)' : 'rgba(34,197,94,0.15)'}` }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>UCs Invisíveis</Typography>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: ucsPerdidas ? '#fbbf24' : '#22c55e' }}>{ucsPerdidas.toLocaleString('pt-BR')}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Paper sx={{ p: 1.5, borderRadius: '12px', bgcolor: fatPerdido > 0 ? 'rgba(248,113,113,0.06)' : 'rgba(34,197,94,0.06)', border: `1px solid ${fatPerdido > 0 ? 'rgba(248,113,113,0.2)' : 'rgba(34,197,94,0.15)'}` }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Faturado Perdido</Typography>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: fatPerdido > 0 ? '#f87171' : '#22c55e' }}>{fmtBRL(fatPerdido)}</Typography>
                    {fatPerdido > 0 && <Typography sx={{ fontSize: '0.6rem', color: '#f87171' }}>{pctPerdido}% do total não aparece nos gráficos</Typography>}
                  </Paper>
                </Grid>
              </Grid>
            );
          })()}

          {/* ---------- CRIAR NOVO CLUSTER ---------- */}
          <Paper sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', mb: 2.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <HubIcon sx={{ color: '#818cf8', fontSize: 20 }} />
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#818cf8' }}>Criar novo cluster</Typography>
              <TextField size="small" placeholder="Ex: CLUSTER IX" value={newClusterName}
                onChange={(e) => setNewClusterName(e.target.value.toUpperCase())}
                sx={{ width: 200, '& .MuiInputBase-input': { fontSize: '0.74rem', color: '#e8edf7', py: 0.6, px: 1.2 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(129,140,248,0.3)' },
                  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(129,140,248,0.5)' } }} />
              <Button size="small" variant="contained" disabled={!newClusterName.trim()}
                onClick={() => {
                  const name = newClusterName.trim();
                  if (name && !dims.clusters.includes(name) && !customClusters.includes(name)) {
                    setCustomClusters(prev => [...prev, name]);
                    setNewClusterName('');
                    setMapSnack(`Cluster "${name}" criado — selecione nas organizações abaixo`);
                  }
                }}
                sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
                Criar
              </Button>
              {customClusters.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {customClusters.map(c => <Chip key={c} label={c} size="small" sx={{ fontWeight: 700, bgcolor: 'rgba(129,140,248,0.15)', color: '#a5b4fc', fontSize: '0.66rem' }} />)}
                </Stack>
              )}
            </Stack>
          </Paper>

          {/* ---------- ORGS SEM CLUSTER (primeiro) ---------- */}
          {(() => {
            const unmapped = orgRows.filter(r => !r.cluster);
            const mapped = orgRows.filter(r => r.cluster);
            const allClusters = [...new Set([...dims.clusters, ...customClusters])].sort();
            const selectSx = { fontSize: '0.72rem', color: '#e8edf7',
              '& .MuiSelect-icon': { color: '#94a3b8' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,0.2)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,0.4)' } };
            const cellSx = { borderColor: 'rgba(148,163,184,0.06)', py: 0.8 };
            const headSx = { color: '#64748b', fontWeight: 800, fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: 0.5, borderColor: 'rgba(148,163,184,0.12)', py: 0.8 };

            return (
              <>
                {/* --- SEM CLUSTER --- */}
                {unmapped.length > 0 && (
                  <Box mb={3}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f87171' }} />
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: '#f87171' }}>
                        Sem cluster ({unmapped.length})
                      </Typography>
                      <Typography sx={{ fontSize: '0.66rem', color: '#94a3b8' }}>— a receita destas organizações não aparece quando você filtra por cluster</Typography>
                    </Stack>
                    <Paper sx={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(248,113,113,0.12)' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'rgba(248,113,113,0.04)' }}>
                            <TableCell sx={headSx}>Organização CMU</TableCell>
                            <TableCell sx={headSx} align="right">UCs Ativas</TableCell>
                            <TableCell sx={headSx} align="right">Faturado (CMU)</TableCell>
                            <TableCell sx={{ ...headSx, width: 180 }}>Cluster</TableCell>
                            <TableCell sx={{ ...headSx, width: 30 }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {unmapped.map((r) => (
                            <TableRow key={r.organization} sx={{ opacity: mapSaving === r.organization ? 0.5 : 1,
                              '&:hover': { bgcolor: 'rgba(248,113,113,0.03)' } }}>
                              <TableCell sx={{ ...cellSx, color: '#fca5a5', fontWeight: 600, fontSize: '0.73rem' }}>
                                {r.organization}
                              </TableCell>
                              <TableCell sx={{ ...cellSx, color: '#e8edf7', fontSize: '0.73rem' }} align="right">{(r.ativas || 0).toLocaleString('pt-BR')}</TableCell>
                              <TableCell sx={{ ...cellSx, color: r.faturado > 0 ? '#fbbf24' : '#475569', fontSize: '0.73rem', fontWeight: r.faturado > 0 ? 700 : 400 }} align="right">
                                {r.faturado > 0 ? fmtBRL(r.faturado) : '—'}
                              </TableCell>
                              <TableCell sx={cellSx}>
                                <Select size="small" displayEmpty value="" sx={{ ...selectSx, minWidth: 170 }}
                                  onChange={(e) => saveOrgCluster(r.organization, e.target.value, r.fonte)}>
                                  <MenuItem value="" disabled><em style={{ color: '#64748b' }}>Selecione...</em></MenuItem>
                                  {allClusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                              </TableCell>
                              <TableCell sx={cellSx}>
                                <WarningAmberIcon sx={{ color: '#f87171', fontSize: 16, opacity: 0.6 }} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Paper>
                  </Box>
                )}

                {/* --- JÁ MAPEADAS --- */}
                {mapped.length > 0 && (
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: '#22c55e' }}>
                        Mapeadas ({mapped.length})
                      </Typography>
                    </Stack>
                    <Paper sx={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(34,197,94,0.12)' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'rgba(34,197,94,0.04)' }}>
                            <TableCell sx={headSx}>Organização CMU</TableCell>
                            <TableCell sx={headSx} align="right">UCs Ativas</TableCell>
                            <TableCell sx={headSx} align="right">Faturado (CMU)</TableCell>
                            <TableCell sx={{ ...headSx, width: 180 }}>Cluster</TableCell>
                            <TableCell sx={{ ...headSx, width: 30 }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mapped.map((r) => (
                            <TableRow key={r.organization} sx={{ opacity: mapSaving === r.organization ? 0.5 : 1,
                              '&:hover': { bgcolor: 'rgba(34,197,94,0.03)' } }}>
                              <TableCell sx={{ ...cellSx, color: '#e8edf7', fontSize: '0.73rem' }}>
                                {r.organization}
                              </TableCell>
                              <TableCell sx={{ ...cellSx, color: '#e8edf7', fontSize: '0.73rem' }} align="right">{(r.ativas || 0).toLocaleString('pt-BR')}</TableCell>
                              <TableCell sx={{ ...cellSx, color: '#94a3b8', fontSize: '0.73rem' }} align="right">
                                {r.faturado > 0 ? fmtBRL(r.faturado) : '—'}
                              </TableCell>
                              <TableCell sx={cellSx}>
                                <Select size="small" value={r.cluster || ''} sx={{ ...selectSx, minWidth: 170 }}
                                  onChange={(e) => saveOrgCluster(r.organization, e.target.value, r.fonte)}>
                                  <MenuItem value=""><em>(remover)</em></MenuItem>
                                  {allClusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                              </TableCell>
                              <TableCell sx={cellSx}>
                                <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 16 }} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Paper>
                  </Box>
                )}
              </>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid rgba(148,163,184,0.1)' }}>
          <Typography sx={{ flex: 1, fontSize: '0.66rem', color: '#64748b' }}>Alterações salvas automaticamente ao selecionar</Typography>
          <Button onClick={() => setMapOpen(false)} variant="contained" size="small"
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px' }}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!mapSnack} autoHideDuration={2500} onClose={() => setMapSnack('')}
        message={mapSnack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{ sx: { bgcolor: '#1e293b', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '10px' } }} />
    </Box>
  );
}
