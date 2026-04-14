import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button,
  TextField, CircularProgress, Alert, Autocomplete, Divider,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaidIcon from '@mui/icons-material/Paid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ConstructionIcon from '@mui/icons-material/Construction';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { KPICard, formatCurrency } from '../components/shared';
import { BASE_URL } from '../api/api';

const STATUS_COLORS = ['#0288d1', '#2e7d32', '#ed6c02', '#6a1b9a', '#c62828', '#00838f', '#558b2f', '#ad1457'];

function formatMes(mm) {
  if (!mm || mm === 'sem-data') return mm;
  const [y, m] = mm.split('-');
  return `${m}/${y}`;
}

export default function GestaoDesembolso() {
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);

  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [mesInicial, setMesInicial] = useState('01/2024');
  const [mesFinal, setMesFinal] = useState('12/2025');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoadingEmpresas(true);
    fetch(`${BASE_URL}/uau/empresas`)
      .then((r) => r.json())
      .then((d) => setEmpresas(d.items || []))
      .catch((e) => setError(`Falha ao carregar empresas: ${e.message}`))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  const handleLoad = useCallback(async () => {
    if (!selectedEmpresa) {
      setError('Selecione uma empresa');
      return;
    }
    if (!/^\d{2}\/\d{4}$/.test(mesInicial) || !/^\d{2}\/\d{4}$/.test(mesFinal)) {
      setError('Formato de mes deve ser mm/yyyy');
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${BASE_URL}/uau/desembolso/empresa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa: selectedEmpresa.Codigo_emp,
          mesInicial, mesFinal,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedEmpresa, mesInicial, mesFinal]);

  const gridRows = useMemo(
    () => (result?.rows || []).map((r, i) => ({ id: i, ...r })),
    [result]
  );

  const gridColumns = useMemo(() => [
    { field: 'Obra', headerName: 'Obra', width: 90 },
    { field: '_ObraDescricao', headerName: 'Descricao', flex: 1, minWidth: 220 },
    { field: 'Status', headerName: 'Status', width: 110 },
    { field: 'Item', headerName: 'Item', width: 90 },
    { field: 'Composicao', headerName: 'Composicao', width: 110 },
    { field: 'Insumo', headerName: 'Insumo', width: 100 },
    { field: 'DtaRef', headerName: 'Mes Ref', width: 110, valueGetter: (v) => v ? String(v).slice(0, 7) : '' },
    { field: 'Total', headerName: 'Total', width: 130, type: 'number', valueFormatter: (v) => formatCurrency(v) },
    { field: 'TotalLiq', headerName: 'Total Liq', width: 130, type: 'number', valueFormatter: (v) => formatCurrency(v) },
    { field: 'TotalBruto', headerName: 'Total Bruto', width: 130, type: 'number', valueFormatter: (v) => formatCurrency(v) },
  ], []);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={0.5}>
        <InsightsIcon sx={{ color: 'primary.main', fontSize: 26 }} />
        <Typography variant="h5" fontWeight="900">Gestao de Desembolso</Typography>
        <Chip label="UAU / Planejamento" size="small" sx={{ bgcolor: '#0d1b2a', color: '#fff', fontWeight: 700 }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Metricas de desembolso planejado por empresa (SPE). Dados do endpoint
        <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.75rem', marginLeft: 4 }}>
          Planejamento.ConsultarDesembolsoPlanejamento
        </code>.
      </Typography>

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
                  <TextField {...params} size="small" label="Empresa (codigo / nome)" />
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
                fullWidth variant="contained" onClick={handleLoad} disabled={loading || !selectedEmpresa}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                sx={{ textTransform: 'none', height: 40 }}
              >
                {loading ? 'Carregando...' : 'Carregar'}
              </Button>
            </Grid>
          </Grid>
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
          {result && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              Empresa {result.empresa} — {result.obrasComDados}/{result.obrasTotal} obras com dados, {result.linhasTotal.toLocaleString('pt-BR')} linhas
              {result.errors?.length > 0 && ` — ${result.errors.length} erros`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Planejado Liquido" value={formatCurrency(result.totais.totalLiq)} icon={<PaidIcon />} color="#2e7d32" subtitle="bruto + acrescimo - desconto" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Planejado Bruto" value={formatCurrency(result.totais.totalBruto)} icon={<ReceiptLongIcon />} color="#0288d1" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Acrescimos - Desc." value={formatCurrency(result.totais.acrescimo - result.totais.desconto)} icon={<AccountBalanceIcon />} color="#ed6c02" subtitle={`+${formatCurrency(result.totais.acrescimo)} / -${formatCurrency(result.totais.desconto)}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KPICard title="Obras com dados" value={`${result.obrasComDados}/${result.obrasTotal}`} icon={<ConstructionIcon />} color="#6a1b9a" subtitle={`${result.linhasTotal.toLocaleString('pt-BR')} linhas`} />
            </Grid>
          </Grid>

          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 360 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  Desembolso por mes
                </Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={result.porMes.map(m => ({ ...m, mesLabel: formatMes(m.mes) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mesLabel" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="totalBruto" name="Bruto" fill="#0288d1" />
                    <Bar dataKey="totalLiq" name="Liquido" fill="#2e7d32" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 360 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  Distribuicao por status
                </Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={result.porStatus} dataKey="total" nameKey="status"
                      cx="50%" cy="50%" outerRadius={95}
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
          </Grid>

          <Grid container spacing={2} mb={2.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1 }}>
                  Top 10 obras por valor
                </Typography>
                <Stack spacing={0.75}>
                  {result.topObras.map((o) => (
                    <Stack key={o.obra} direction="row" spacing={1} alignItems="baseline" sx={{ borderBottom: '1px dashed #eee', pb: 0.5 }}>
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
                  Top 10 itens/composicoes
                </Typography>
                <Stack spacing={0.75}>
                  {result.topItens.map((it, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="baseline" sx={{ borderBottom: '1px dashed #eee', pb: 0.5 }}>
                      <Chip label={it.item || '-'} size="small" sx={{ fontSize: '0.62rem', height: 18 }} />
                      <Typography variant="caption" sx={{ flex: 1, fontSize: '0.7rem' }}>{it.composicao || '-'}</Typography>
                      <Typography variant="caption" fontWeight="800" sx={{ fontSize: '0.72rem', color: '#ed6c02' }}>
                        {formatCurrency(it.total)}
                      </Typography>
                    </Stack>
                  ))}
                  {result.topItens.length === 0 && <Typography variant="caption" color="text.secondary">Sem dados</Typography>}
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: '1px solid #eee' }}>
              <TableRowsIcon sx={{ fontSize: 18, color: '#555' }} />
              <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                Linhas brutas ({result.linhasTotal.toLocaleString('pt-BR')})
              </Typography>
            </Stack>
            <Box sx={{ height: 560 }}>
              <DataGrid
                rows={gridRows}
                columns={gridColumns}
                density="compact"
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
                sx={{ fontSize: '0.72rem', border: 'none' }}
              />
            </Box>
          </Paper>

          {result.errors?.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {result.errors.length} obra(s) falharam ao consultar. Primeiros erros: {result.errors.slice(0, 3).map(e => `${e.obra} (${e.status || '?'})`).join(', ')}
            </Alert>
          )}
        </>
      )}

      {!result && !loading && (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: '12px', textAlign: 'center' }}>
          <InsightsIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Selecione uma empresa e clique em <strong>Carregar</strong> para ver as metricas de desembolso.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Atencao: a carga itera todas as obras da empresa — pode levar alguns segundos (ou alguns minutos para empresas com muitas obras).
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
