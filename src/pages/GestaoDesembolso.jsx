import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button,
  TextField, CircularProgress, Alert, Autocomplete, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaidIcon from '@mui/icons-material/Paid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ConstructionIcon from '@mui/icons-material/Construction';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import PersonIcon from '@mui/icons-material/Person';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BoltIcon from '@mui/icons-material/Bolt';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import { KPICard, formatCurrency } from '../components/shared';
import { BASE_URL } from '../api/api';

const STATUS_COLORS = ['#0288d1', '#2e7d32', '#ed6c02', '#6a1b9a', '#c62828', '#00838f', '#558b2f', '#ad1457'];

function formatMes(mm) {
  if (!mm || mm === 'sem-data') return mm;
  const [y, m] = mm.split('-');
  return `${m}/${y}`;
}

function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function autoMatchCmuOrg(empName, cmuOrgs) {
  if (!empName || !cmuOrgs.length) return null;
  const norm = normalizeForMatch(empName);
  const words = norm.split(' ').filter(w => w.length > 3);
  let best = null;
  let bestScore = 0;
  for (const org of cmuOrgs) {
    const orgNorm = normalizeForMatch(org.organization);
    const score = words.filter(w => orgNorm.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = org; }
  }
  return bestScore > 0 ? best : null;
}

export default function GestaoDesembolso() {
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [mesInicial, setMesInicial] = useState('01/2025');
  const [mesFinal, setMesFinal] = useState('12/2026');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedObra, setSelectedObra] = useState(null);
  const [obraDetails, setObraDetails] = useState(null);
  const [loadingObra, setLoadingObra] = useState(false);

  // CMU state
  const [cmuOrgs, setCmuOrgs] = useState([]);
  const [selectedCmuOrg, setSelectedCmuOrg] = useState(null);
  const [cmuStats, setCmuStats] = useState(null);
  const [loadingCmu, setLoadingCmu] = useState(false);
  const [cmuError, setCmuError] = useState(null);

  useEffect(() => {
    setLoadingEmpresas(true);
    fetch(`${BASE_URL}/uau/empresas`)
      .then((r) => r.json())
      .then((d) => setEmpresas(d.items || []))
      .catch((e) => setError(`Falha ao carregar empresas: ${e.message}`))
      .finally(() => setLoadingEmpresas(false));

    fetch(`${BASE_URL}/cmu/organizations`)
      .then((r) => r.json())
      .then((d) => setCmuOrgs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Auto-match CMU org when empresa changes
  useEffect(() => {
    if (!selectedEmpresa || !cmuOrgs.length) return;
    const match = autoMatchCmuOrg(selectedEmpresa.Desc_emp, cmuOrgs);
    setSelectedCmuOrg(match);
    setCmuStats(null);
    setCmuError(null);
  }, [selectedEmpresa, cmuOrgs]);

  const handleLoad = useCallback(async () => {
    if (!selectedEmpresa) { setError('Selecione uma empresa'); return; }
    if (!/^\d{2}\/\d{4}$/.test(mesInicial) || !/^\d{2}\/\d{4}$/.test(mesFinal)) {
      setError('Formato de mes deve ser mm/yyyy'); return;
    }
    setError(null);
    setCmuError(null);
    setLoading(true);
    setLoadingCmu(!!selectedCmuOrg);
    setResult(null);
    setCmuStats(null);

    const fetchUau = fetch(`${BASE_URL}/uau/desembolso/empresa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa: selectedEmpresa.Codigo_emp, mesInicial, mesFinal }),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    });

    const fetchCmu = selectedCmuOrg
      ? fetch(`${BASE_URL}/cmu/org-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organization: selectedCmuOrg.organization, mesInicial, mesFinal }),
        }).then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
          return data;
        })
      : Promise.resolve(null);

    const [uauResult, cmuResult] = await Promise.allSettled([fetchUau, fetchCmu]);

    if (uauResult.status === 'fulfilled') setResult(uauResult.value);
    else setError(uauResult.reason?.message || 'Erro ao buscar dados UAU');

    if (cmuResult.status === 'fulfilled') setCmuStats(cmuResult.value);
    else if (selectedCmuOrg) setCmuError(cmuResult.reason?.message || 'Erro ao buscar dados CMU');

    setLoading(false);
    setLoadingCmu(false);
  }, [selectedEmpresa, selectedCmuOrg, mesInicial, mesFinal]);

  const handleOpenObra = useCallback(async (obra) => {
    setSelectedObra(obra);
    setLoadingObra(true);
    try {
      const r = await fetch(`${BASE_URL}/uau/desembolso/obra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: selectedEmpresa.Codigo_emp, obra: obra.obra, mesInicial, mesFinal }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setObraDetails(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingObra(false);
    }
  }, [selectedEmpresa, mesInicial, mesFinal]);

  const handleCloseObra = useCallback(() => { setSelectedObra(null); setObraDetails(null); }, []);


  // Merge UAU + CMU por mes para grafico combinado
  const combinedChart = useMemo(() => {
    if (!result && !cmuStats) return [];
    const map = {};
    for (const m of (result?.porMes || [])) {
      map[m.mes] = { mes: m.mes, desembolso: m.totalLiq || 0, faturado: 0, recebido: 0 };
    }
    for (const m of (cmuStats?.porMes || [])) {
      if (map[m.mes]) { map[m.mes].faturado = m.faturado; map[m.mes].recebido = m.recebido; }
      else map[m.mes] = { mes: m.mes, desembolso: 0, faturado: m.faturado, recebido: m.recebido };
    }
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({ ...m, mesLabel: formatMes(m.mes) }));
  }, [result, cmuStats]);

  const uauPago = useMemo(
    () => result?.porStatus?.find(s => s.status === 'Pago')?.total || 0,
    [result]
  );
  const resultadoLiquido = (cmuStats?.payments?.recebido || 0) - uauPago;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={0.5}>
        <InsightsIcon sx={{ color: 'primary.main', fontSize: 26 }} />
        <Typography variant="h5" fontWeight="900">Gestao de Desembolso</Typography>
        <Chip label="UAU + CMU" size="small" sx={{ bgcolor: '#0d1b2a', color: '#fff', fontWeight: 700 }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Desembolso planejado (UAU) cruzado com receita de faturamento (CMU) por empresa/SPE.
      </Typography>

      {/* Filtros */}
      <Card variant="outlined" sx={{ borderRadius: '12px', mb: 2.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid size={{ xs: 12, md: 5 }}>
              <Autocomplete
                options={empresas}
                loading={loadingEmpresas}
                value={selectedEmpresa}
                onChange={(_, v) => setSelectedEmpresa(v)}
                getOptionLabel={(o) => o ? `${o.Codigo_emp} — ${o.Desc_emp}` : ''}
                isOptionEqualToValue={(a, b) => a?.Codigo_emp === b?.Codigo_emp}
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Empresa UAU (codigo / nome)" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <TextField fullWidth size="small" label="Mes inicial" value={mesInicial} onChange={(e) => setMesInicial(e.target.value)} placeholder="mm/yyyy" />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <TextField fullWidth size="small" label="Mes final" value={mesFinal} onChange={(e) => setMesFinal(e.target.value)} placeholder="mm/yyyy" />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                fullWidth variant="contained" onClick={handleLoad}
                disabled={loading || loadingCmu || !selectedEmpresa}
                startIcon={(loading || loadingCmu) ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                sx={{ textTransform: 'none', height: 40 }}
              >
                {(loading || loadingCmu) ? 'Carregando...' : 'Carregar'}
              </Button>
            </Grid>
          </Grid>

          {/* CMU org link */}
          <Divider sx={{ my: 1.5 }} />
          <Grid container spacing={1.5} alignItems="center">
            <Grid size={{ xs: 12, md: 9 }}>
              <Autocomplete
                options={cmuOrgs}
                value={selectedCmuOrg}
                onChange={(_, v) => { setSelectedCmuOrg(v); setCmuStats(null); }}
                getOptionLabel={(o) => o ? `${o.organization} (${o.ativas} ativas / ${o.total} total)` : ''}
                isOptionEqualToValue={(a, b) => a?.organization === b?.organization}
                renderInput={(params) => (
                  <TextField
                    {...params} size="small"
                    label="Organizacao CMU (correspondente)"
                    helperText={selectedEmpresa && selectedCmuOrg ? 'Auto-detectado — ajuste se necessario e clique em Carregar' : 'Selecione a empresa UAU para auto-detectar'}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <SolarPowerIcon sx={{ fontSize: 18, color: selectedCmuOrg ? '#2e7d32' : '#bbb' }} />
                <Typography variant="caption" color={selectedCmuOrg ? 'text.primary' : 'text.secondary'}>
                  {selectedCmuOrg ? `${selectedCmuOrg.ativas} UCs ativas` : 'Nenhuma org selecionada'}
                </Typography>
              </Stack>
            </Grid>
          </Grid>

          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
          {cmuError && <Alert severity="warning" sx={{ mt: 1 }}>{cmuError}</Alert>}
          {result && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              UAU: Empresa {result.empresa} — {result.obrasComDados}/{result.obrasTotal} obras com dados, {result.linhasTotal.toLocaleString('pt-BR')} linhas
              {result.errors?.length > 0 && ` — ${result.errors.length} erros`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* KPIs UAU */}
      {result && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1.5 }}>
            Desembolso UAU
          </Typography>
          <Grid container spacing={2} mb={2} mt={0.25}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper variant="outlined" sx={{ borderRadius: '12px', p: 2, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" mb={1}>
                  <Box sx={{ color: '#37474f', display: 'flex', mt: 0.25 }}><PaidIcon fontSize="small" /></Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.68rem', fontWeight: 700 }}>
                      Comprometido Total
                    </Typography>
                    <Typography variant="h6" fontWeight="900" sx={{ color: '#37474f', lineHeight: 1.2 }}>
                      {formatCurrency(result.totais.totalLiq)}
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ mb: 1 }} />
                <Stack spacing={0.4}>
                  {[
                    { label: 'Pago', color: '#2e7d32', icon: '✓' },
                    { label: 'Pagar', color: '#e65100', icon: '→' },
                    { label: 'Projetado', color: '#0288d1', icon: '~' },
                  ].map(({ label, color, icon }) => {
                    const val = result.porStatus?.find(s => s.status === label)?.total || 0;
                    const pct = result.totais.totalLiq > 0 ? (val / result.totais.totalLiq) * 100 : 0;
                    const cats = result.catPorStatus?.[label] || {};
                    const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3);
                    return (
                      <Box key={label}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography sx={{ fontSize: '0.65rem', width: 12, color }}>{icon}</Typography>
                          <Typography variant="caption" sx={{ flex: 1, fontSize: '0.68rem', color: 'text.secondary' }}>{label}</Typography>
                          <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color }}>{formatCurrency(val)}</Typography>
                          <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'text.disabled', width: 32, textAlign: 'right' }}>
                            {pct.toFixed(0)}%
                          </Typography>
                        </Stack>
                        {topCats.length > 0 && (
                          <Stack spacing={0} sx={{ pl: 2, mt: 0.25 }}>
                            {topCats.map(([cat, v]) => (
                              <Typography key={cat} variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1.4 }}>
                                · {cat}: {formatCurrency(v)}
                              </Typography>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Operacional" value={formatCurrency(result.totalOperacional)} icon={<ConstructionIcon />} color="#c62828" subtitle="excl. amortização e juros" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Amortização" value={formatCurrency(result.totalAmortizacao)} icon={<AccountBalanceIcon />} color="#6a1b9a" subtitle="PLN2429, PLN2430" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Juros Financiamento" value={formatCurrency(result.totalJuros)} icon={<ReceiptLongIcon />} color="#e65100" subtitle="PLN1823/24, PLN2431-34" />
            </Grid>
          </Grid>
        </>
      )}

      {/* Distribuicao por categoria UAU */}
      {result && result.porCategoria?.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', mb: 2.5 }}>
          <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5 }}>
            Distribuicao por categoria (plano de contas)
          </Typography>
          <Stack spacing={0.75}>
            {result.porCategoria.map((cat) => {
              const pct = result.totais.totalLiq > 0 ? (cat.total / result.totais.totalLiq) * 100 : 0;
              const isAmort = cat.categoria === 'Amortização';
              const isJuros = cat.categoria === 'Despesas Juros Financiamento';
              const color = isAmort ? '#6a1b9a' : isJuros ? '#e65100' : '#0288d1';
              return (
                <Stack key={cat.categoria} direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" sx={{ width: 220, flexShrink: 0, fontSize: '0.7rem', fontWeight: isAmort || isJuros ? 700 : 400 }}>
                    {cat.categoria}
                    {(isAmort || isJuros) && <Chip label={isAmort ? 'Amort.' : 'Juros'} size="small" sx={{ ml: 0.5, height: 14, fontSize: '0.55rem', bgcolor: color, color: '#fff' }} />}
                  </Typography>
                  <Box sx={{ flex: 1, height: 10, bgcolor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${Math.min(pct, 100)}%`, bgcolor: color, borderRadius: 4 }} />
                  </Box>
                  <Typography variant="caption" sx={{ width: 50, textAlign: 'right', fontSize: '0.68rem', color: 'text.secondary' }}>
                    {pct.toFixed(1)}%
                  </Typography>
                  <Typography variant="caption" fontWeight="800" sx={{ width: 110, textAlign: 'right', fontSize: '0.7rem', color }}>
                    {formatCurrency(cat.total)}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* KPIs CMU */}
      {cmuStats && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1.5 }}>
            Receita CMU — {cmuStats.organization}
          </Typography>
          <Grid container spacing={2} mb={2} mt={0.25}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="UCs Ativas" value={cmuStats.meters.ativas.toLocaleString('pt-BR')} icon={<BoltIcon />} color="#0288d1" subtitle={`${cmuStats.meters.total} total`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Faturado" value={formatCurrency(cmuStats.invoices.faturado)} icon={<ReceiptLongIcon />} color="#1565c0" subtitle="faturas emitidas no periodo" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Recebido" value={formatCurrency(cmuStats.payments.recebido)} icon={<PaidIcon />} color="#2e7d32" subtitle='pagamentos "Pago"' />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Inadimplente" value={formatCurrency(cmuStats.payments.pendente)} icon={<AccountBalanceIcon />} color="#e65100" subtitle="pendente + vencido" />
            </Grid>
          </Grid>
        </>
      )}

      {/* Resultado liquido */}
      {result && cmuStats && (
        <Card
          variant="outlined"
          sx={{
            borderRadius: '12px', mb: 2.5,
            borderColor: resultadoLiquido >= 0 ? '#2e7d32' : '#c62828',
            bgcolor: resultadoLiquido >= 0 ? '#f1f8e9' : '#ffebee',
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TrendingUpIcon sx={{ color: resultadoLiquido >= 0 ? '#2e7d32' : '#c62828', fontSize: 28 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Resultado Liquido Estimado (Recebido CMU - Pago UAU)
                </Typography>
                <Typography variant="h5" fontWeight="900" sx={{ color: resultadoLiquido >= 0 ? '#2e7d32' : '#c62828' }}>
                  {formatCurrency(resultadoLiquido)}
                </Typography>
              </Box>
              <Box sx={{ ml: 'auto !important' }}>
                <Stack direction="row" spacing={3}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Recebido CMU</Typography>
                    <Typography variant="body2" fontWeight={700} color="#2e7d32">{formatCurrency(cmuStats.payments.recebido)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Pago UAU</Typography>
                    <Typography variant="body2" fontWeight={700} color="#c62828">{formatCurrency(uauPago)}</Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Graficos */}
      {(result || cmuStats) && (
        <Grid container spacing={2} mb={2.5}>
          {/* Grafico combinado (aparece quando ambos tem dados) */}
          {combinedChart.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 380 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  {result && cmuStats ? 'Receita CMU vs Desembolso UAU por mes' : result ? 'Desembolso UAU por mes' : 'Receita CMU por mes'}
                </Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={combinedChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mesLabel" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    {cmuStats && <Bar dataKey="faturado" name="Faturado CMU" fill="#1565c0" />}
                    {cmuStats && <Bar dataKey="recebido" name="Recebido CMU" fill="#2e7d32" />}
                    {result && <Bar dataKey="desembolso" name="Desembolso UAU" fill="#c62828" />}
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* Pizza UAU por status */}
          {result && (
            <Grid size={{ xs: 12, lg: cmuStats ? 6 : 4 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 320 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  Distribuicao UAU por status
                </Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={result.porStatus} dataKey="total" nameKey="status"
                      cx="50%" cy="50%" outerRadius={90}
                      label={(e) => `${e.status}: ${((e.total / result.totais.total) * 100).toFixed(0)}%`}
                    >
                      {result.porStatus.map((_, i) => (
                        <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* UCs por status CMU */}
          {cmuStats && (
            <Grid size={{ xs: 12, lg: result ? 6 : 4 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 320 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  UCs CMU por status
                </Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {[
                    { label: 'Ativas', value: cmuStats.meters.ativas, color: '#2e7d32' },
                    { label: 'Desconectadas', value: cmuStats.meters.desconectadas, color: '#ed6c02' },
                    { label: 'Canceladas', value: cmuStats.meters.canceladas, color: '#c62828' },
                  ].map(({ label, value, color }) => (
                    <Stack key={label} spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" fontWeight={600}>{label}</Typography>
                        <Typography variant="caption" fontWeight={800}>{value.toLocaleString('pt-BR')}</Typography>
                      </Stack>
                      <Box sx={{ height: 8, bgcolor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${(value / cmuStats.meters.total) * 100}%`, bgcolor: color, borderRadius: 4 }} />
                      </Box>
                    </Stack>
                  ))}
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Energia compensada</Typography>
                    <Typography variant="caption" fontWeight={800}>{cmuStats.invoices.kwh_compensado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kWh</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Economia gerada</Typography>
                    <Typography variant="caption" fontWeight={800} color="#2e7d32">{formatCurrency(cmuStats.invoices.economia)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      {/* Top obras + itens UAU */}
      {result && (
        <Grid container spacing={2} mb={2.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
              <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                Top 10 obras por valor
              </Typography>
              <Stack spacing={0.75}>
                {result.topObras.map((o) => (
                  <Stack
                    key={o.obra}
                    direction="row" spacing={1} alignItems="baseline"
                    onClick={() => handleOpenObra(o)}
                    sx={{ borderBottom: '1px dashed #eee', pb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: '#f5f5f5', borderRadius: '4px', px: 1, mx: -1 }, transition: 'all 0.2s' }}
                  >
                    <Chip label={o.obra} size="small" sx={{ fontSize: '0.62rem', height: 18 }} />
                    <Typography variant="caption" sx={{ flex: 1, fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.descricao}
                    </Typography>
                    <Typography variant="caption" fontWeight="800" sx={{ fontSize: '0.72rem', color: '#0288d1' }}>
                      {formatCurrency(o.total)}
                    </Typography>
                  </Stack>
                ))}
                {result.topObras.length === 0 && <Typography variant="caption" color="text.secondary">Sem dados</Typography>}
              </Stack>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
              <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                Top categorias por item
              </Typography>
              <Stack spacing={0.75}>
                {result.topItens.map((it, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ borderBottom: '1px dashed #eee', pb: 0.5 }}>
                    <Chip
                      label={it.item || '-'}
                      size="small"
                      sx={{ fontSize: '0.62rem', height: 18, minWidth: 52, flexShrink: 0 }}
                    />
                    <Typography variant="caption" sx={{ flex: 1, fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.categoria}
                    </Typography>
                    <Typography variant="caption" fontWeight="800" sx={{ fontSize: '0.72rem', color: '#ed6c02', flexShrink: 0 }}>
                      {formatCurrency(it.total)}
                    </Typography>
                  </Stack>
                ))}
                {result.topItens.length === 0 && <Typography variant="caption" color="text.secondary">Sem dados</Typography>}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}


      {result?.errors?.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {result.errors.length} obra(s) falharam. Primeiros: {result.errors.slice(0, 3).map(e => `${e.obra} (${e.status || '?'})`).join(', ')}
        </Alert>
      )}

      {!result && !loading && (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: '12px', textAlign: 'center' }}>
          <InsightsIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Selecione uma empresa UAU e clique em <strong>Carregar Desembolso UAU</strong>.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            A organizacao CMU e auto-detectada pelo nome. Ajuste se necessario e clique em <strong>Carregar</strong> para ver a analise cruzada.
          </Typography>
        </Paper>
      )}

      {/* Modal de detalhes da obra */}
      <Dialog open={!!selectedObra} onClose={handleCloseObra} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Stack>
            <Typography variant="h6">{selectedObra?.descricao || 'Obra'}</Typography>
            <Typography variant="caption" color="text.secondary">Código: {selectedObra?.obra}</Typography>
          </Stack>
          <Button onClick={handleCloseObra} size="small" sx={{ minWidth: 'auto' }}><CloseIcon /></Button>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {loadingObra ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : obraDetails ? (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5 }}>
                  Informacoes
                </Typography>
                <Grid container spacing={1.5}>
                  {obraDetails.obra.Ender_obr && (
                    <Grid size={{ xs: 12 }}>
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <LocationOnIcon sx={{ fontSize: 18, mt: 0.5, color: '#666' }} />
                        <Typography variant="body2">{obraDetails.obra.Ender_obr}</Typography>
                      </Stack>
                    </Grid>
                  )}
                  {obraDetails.obra.Fone_obr && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PhoneIcon sx={{ fontSize: 18, color: '#666' }} />
                        <Typography variant="body2">{obraDetails.obra.Fone_obr}</Typography>
                      </Stack>
                    </Grid>
                  )}
                  {obraDetails.obra.Fisc_obr && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PersonIcon sx={{ fontSize: 18, color: '#666' }} />
                        <Typography variant="body2">Fiscal: {obraDetails.obra.Fisc_obr}</Typography>
                      </Stack>
                    </Grid>
                  )}
                  {obraDetails.obra.TipoObra_obr && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2"><strong>Tipo:</strong> {obraDetails.obra.TipoObra_obr}</Typography>
                    </Grid>
                  )}
                  {obraDetails.obra.DtIni_obr && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2"><strong>Inicio:</strong> {new Date(obraDetails.obra.DtIni_obr).toLocaleDateString('pt-BR')}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Paper>

              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Valor Total</Typography>
                    <Typography variant="h6" fontWeight="800" sx={{ color: '#2e7d32' }}>
                      {formatCurrency(obraDetails.totais.totalLiq)}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Ajustes</Typography>
                    <Typography variant="h6" fontWeight="800" sx={{ color: '#ed6c02' }}>
                      {formatCurrency(obraDetails.totais.acrescimo - obraDetails.totais.desconto)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {obraDetails.porStatus.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                    Distribuicao por Status
                  </Typography>
                  <Stack spacing={1}>
                    {obraDetails.porStatus.map((s) => (
                      <Stack key={s.status} direction="row" spacing={1} alignItems="center">
                        <Box sx={{ width: 80, fontSize: '0.75rem' }}>
                          <Chip label={s.status} size="small" sx={{ width: '100%' }} />
                        </Box>
                        <Box sx={{ flex: 1, height: 24, bgcolor: '#f0f0f0', borderRadius: 1, overflow: 'hidden' }}>
                          <Box sx={{ height: '100%', width: `${(s.total / obraDetails.totais.totalLiq) * 100}%`, bgcolor: STATUS_COLORS[obraDetails.porStatus.indexOf(s) % STATUS_COLORS.length] }} />
                        </Box>
                        <Typography variant="caption" fontWeight="800" sx={{ width: 100, textAlign: 'right' }}>
                          {formatCurrency(s.total)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              )}

              {obraDetails.topItens.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                    Top Itens/Composicoes
                  </Typography>
                  <Stack spacing={0.75}>
                    {obraDetails.topItens.map((it, i) => (
                      <Stack key={i} direction="row" spacing={1} alignItems="baseline" sx={{ borderBottom: '1px dashed #eee', pb: 0.5 }}>
                        <Chip label={it.item || '-'} size="small" sx={{ fontSize: '0.62rem', height: 18 }} />
                        <Typography variant="caption" sx={{ flex: 1, fontSize: '0.7rem' }}>
                          {it.composicao || '-'} {it.insumo && `(${it.insumo})`}
                        </Typography>
                        <Typography variant="caption" fontWeight="800" sx={{ fontSize: '0.72rem', color: '#ed6c02' }}>
                          {formatCurrency(it.total)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              )}
            </Stack>
          ) : (
            <Typography color="error">Erro ao carregar detalhes da obra</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseObra} variant="outlined">Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
