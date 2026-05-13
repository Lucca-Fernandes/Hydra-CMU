import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Paper, CircularProgress, Tooltip as MuiTooltip } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EnergySavingsLeafIcon from '@mui/icons-material/EnergySavingsLeaf';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { KPICard, formatCurrency, formatNumber, PeriodFilter } from '../components/shared';
import { fetchApi } from '../api/api';

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#9c27b0', '#0288d1', '#757575', '#f44336', '#ff9800'];

const formatMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

const GEO_URL = 'https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/main/geojson/br_states.geojson';

// Projecao Mercator ajustada para o Brasil (viewBox 0 0 500 520)
const SCALE = 572, TX = 762.9, TY = 131.5;
function project([lon, lat]) {
  const x = (lon * Math.PI / 180) * SCALE + TX;
  const latR = lat * Math.PI / 180;
  const y = -Math.log(Math.tan(Math.PI / 4 + latR / 2)) * SCALE + TY;
  return [x, y];
}

function geoToPath(geometry) {
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flatMap(p => p);
  return rings.map(ring =>
    ring.map((pt, i) => {
      const [x, y] = project(pt);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z'
  ).join(' ');
}

function BrazilMap({ data }) {
  const [geoData, setGeoData] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });

  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, []);

  const countByState = Object.fromEntries((data || []).map(d => [d.state, d.count]));
  const max = Math.max(...Object.values(countByState), 1);

  const getColor = (uf) => {
    const count = countByState[uf] || 0;
    if (count === 0) return '#dde6f0';
    const t = 0.15 + (count / max) * 0.85;
    const r = Math.round(25 + (1 - t) * 160);
    const g = Math.round(118 - t * 80);
    const b = Math.round(210 - t * 50);
    return `rgb(${r},${g},${b})`;
  };

  if (!geoData) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="25 70 450 420" width="100%" height="100%" style={{ display: 'block' }}>
        {geoData.features.map(feat => {
          const uf = feat.properties.sigla;
          const name = feat.properties.nome;
          const count = countByState[uf] || 0;
          const d = geoToPath(feat.geometry);
          return (
            <path
              key={uf}
              d={d}
              fill={getColor(uf)}
              stroke="#fff"
              strokeWidth={0.8}
              style={{ cursor: 'default', transition: 'fill 0.15s' }}
              onMouseEnter={e => {
                setHovered(uf);
                const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, uf, name, count });
              }}
              onMouseMove={e => {
                const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                setTooltip(t => ({ ...t, x: e.clientX - rect.left, y: e.clientY - rect.top }));
              }}
              onMouseLeave={() => { setHovered(null); setTooltip(t => ({ ...t, visible: false })); }}
              opacity={hovered && hovered !== uf ? 0.75 : 1}
            />
          );
        })}
      </svg>
      {tooltip.visible && (
        <Box sx={{
          position: 'absolute', pointerEvents: 'none', zIndex: 10,
          left: tooltip.x + 8, top: tooltip.y - 36,
          bgcolor: 'rgba(0,0,0,0.78)', color: '#fff', borderRadius: '6px',
          px: 1, py: 0.5, fontSize: '0.7rem', whiteSpace: 'nowrap',
        }}>
          <b>{tooltip.name} ({tooltip.uf})</b><br />
          {tooltip.count.toLocaleString('pt-BR')} medidores
        </Box>
      )}
      <Box sx={{ position: 'absolute', bottom: 0, right: 4, display: 'flex', alignItems: 'center', gap: 0.4 }}>
        <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>Menos</Typography>
        {[0.15, 0.4, 0.65, 0.9].map((t, i) => {
          const r = Math.round(25 + (1-t)*160), g = Math.round(118 - t*80), b = Math.round(210 - t*50);
          return <Box key={i} sx={{ width: 11, height: 11, borderRadius: '2px', bgcolor: `rgb(${r},${g},${b})` }} />;
        })}
        <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>Mais</Typography>
      </Box>
    </Box>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});

  const loadStats = useCallback(async (f = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.startDate) params.set('startDate', f.startDate);
      if (f.endDate) params.set('endDate', f.endDate);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await fetchApi(`/dashboard/stats${query}`);
      setStats(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(filters); }, [loadStats, filters]);

  const handleFilter = useCallback((f) => {
    setFilters(f);
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>;
  }

  if (!stats) {
    return <Box sx={{ p: 4 }}><Typography color="error">Erro ao carregar dados do dashboard.</Typography></Box>;
  }

  const totalMeters = stats.metersByStatus.reduce((s, r) => s + r.count, 0);
  const activeMeters = stats.metersByStatus.find(r => r.status === 'Ativa')?.count || 0;
  const totalInvoiced = stats.invoicesByStatus.reduce((s, r) => s + r.total, 0);
  const pendingInvoices = stats.invoicesByStatus.find(r => r.status === 'Pendente') || { count: 0, total: 0 };
  const faturadoInvoices = stats.invoicesByStatus.find(r => r.status === 'Faturado') || { count: 0, total: 0 };

  const trendData = stats.monthlyTrend.map(r => ({
    month: formatMonth(r.month),
    receita: r.revenue,
    faturas: r.invoice_count,
  }));

  const statusPieData = stats.metersByStatus
    .filter(r => r.count > 0)
    .map(r => ({ name: r.status || 'N/A', value: r.count }));

  const statePieData = stats.metersByState.slice(0, 7).map(r => ({
    name: r.state || 'N/A',
    value: r.count,
  }));

  const distributorPieData = (stats.metersByDistributor || []).map(r => ({ name: r.distributor || 'N/A', value: r.count }));
  const classPieData = (stats.metersByClass || []).map(r => ({ name: r.class || 'N/A', value: r.count }));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>Visao geral do sistema Solatio Power Analytics</Typography>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '12px', mb: 2, display: 'inline-flex' }}>
        <PeriodFilter onApply={handleFilter} />
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="MEDIDORES ATIVOS" value={activeMeters.toLocaleString('pt-BR')} icon={<ElectricBoltIcon />} subtitle={`${totalMeters.toLocaleString('pt-BR')} total`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="RECEITA LIQUIDADA" value={formatCurrency(stats.totalRevenue)} icon={<AccountBalanceWalletIcon />} color="#2e7d32" subtitle="Pagamentos confirmados" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="FATURAS PENDENTES" value={`${pendingInvoices.count + faturadoInvoices.count}`} icon={<ReceiptLongIcon />} color="#ed6c02" subtitle={formatCurrency(pendingInvoices.total + faturadoInvoices.total)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="INADIMPLENCIA" value={formatCurrency(stats.delinquency.total)} icon={<WarningAmberIcon />} color="#d32f2f" subtitle={`${stats.delinquency.count} medidores`} />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="ENERGIA COMPENSADA" value={`${formatNumber(stats.energy?.compensated)} kWh`} icon={<EnergySavingsLeafIcon />} color="#0288d1" subtitle={`Eficiencia: ${(stats.energy?.efficiency || 0).toFixed(1)}%`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="ECONOMIA GERADA" value={formatCurrency(stats.totalEconomy)} icon={<SavingsIcon />} color="#2e7d32" subtitle="Total acumulado clientes" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="CUSTO CONCESSIONARIA" value={formatCurrency(stats.totalBillsCost)} icon={<AccountBalanceIcon />} color="#757575" subtitle="Total contas distribuidora" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard title="VOLUME FATURADO" value={formatCurrency(totalInvoiced)} icon={<TrendingUpIcon />} color="#9c27b0" subtitle="Todas as faturas validas" />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 340 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Faturamento Mensal (ultimos 12 meses)
            </Typography>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="receita" fill="#1976d2" radius={[4, 4, 0, 0]} name="Receita" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 132 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 0.5, color: 'text.secondary' }}>
                  Medidores por Status
                </Typography>
                <ResponsiveContainer width="100%" height={90}>
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" cx="50%" cy="50%" outerRadius={45} innerRadius={25} paddingAngle={2}>
                      {statusPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString('pt-BR')} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '0.65rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 200 }}>
                <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 0.5, color: 'text.secondary' }}>
                  Distribuicao por Estado
                </Typography>
                <Box sx={{ height: 160, position: 'relative' }}>
                  <BrazilMap data={stats.metersByState} />
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 280 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
              Medidores por Distribuidora
            </Typography>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={distributorPieData} dataKey="value" cx="50%" cy="45%" outerRadius={60} innerRadius={30} paddingAngle={2}>
                  {distributorPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString('pt-BR')} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.6rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 280 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
              Classe de Consumo
            </Typography>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={classPieData} dataKey="value" cx="50%" cy="45%" outerRadius={60} innerRadius={30} paddingAngle={2}>
                  {classPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString('pt-BR')} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.6rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 280 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
              Top Parceiros
            </Typography>
            <Box sx={{ overflow: 'auto', maxHeight: 230 }}>
              {(stats.topPartners || []).map((r, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.8, borderBottom: '1px solid #f0f0f0' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', bgcolor: COLORS[i % COLORS.length], borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {i + 1}
                    </Typography>
                    <Typography variant="body2" fontWeight="600" sx={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.partner}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#1976d2', flexShrink: 0, ml: 1 }}>
                    {r.count.toLocaleString('pt-BR')}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
              Faturas por Status
            </Typography>
            {stats.invoicesByStatus.map((r, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.7, borderBottom: '1px solid #f0f0f0' }}>
                <Typography variant="body2" fontWeight="600" sx={{ fontSize: '0.8rem' }}>{r.status || 'N/A'}</Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{r.count.toLocaleString('pt-BR')} faturas</Typography>
                  <Typography variant="caption" color="text.secondary">{formatCurrency(r.total)}</Typography>
                </Box>
              </Box>
            ))}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
              Pagamentos por Status
            </Typography>
            {stats.paymentsByStatus.map((r, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.7, borderBottom: '1px solid #f0f0f0' }}>
                <Typography variant="body2" fontWeight="600" sx={{ fontSize: '0.8rem' }}>{r.status || 'N/A'}</Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{r.count.toLocaleString('pt-BR')} pagamentos</Typography>
                  <Typography variant="caption" color="text.secondary">{formatCurrency(r.total)}</Typography>
                </Box>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
