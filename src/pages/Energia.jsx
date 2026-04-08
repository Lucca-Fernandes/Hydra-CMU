import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Paper, CircularProgress, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import BoltIcon from '@mui/icons-material/Bolt';
import EnergySavingsLeafIcon from '@mui/icons-material/EnergySavingsLeaf';
import SpeedIcon from '@mui/icons-material/Speed';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { KPICard, PeriodFilter, PlaceholderCard, formatCurrency, formatNumber } from '../components/shared';
import { fetchApi } from '../api/api';

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#9c27b0', '#0288d1', '#757575', '#f44336'];

const formatMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

const formatKwh = (v) => {
  if (!v && v !== 0) return '0';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return v.toFixed(0);
};

export default function Energia() {
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
      const data = await fetchApi(`/energy/stats${query}`);
      setStats(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(filters); }, [loadStats, filters]);

  const handleFilter = useCallback((f) => { setFilters(f); }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>;
  }

  if (!stats) {
    return <Box sx={{ p: 4 }}><Typography color="error">Erro ao carregar dados de energia.</Typography></Box>;
  }

  const energyData = stats.monthlyEnergy.map(r => ({
    month: formatMonth(r.month),
    Consumida: r.consumed,
    Compensada: r.compensated,
  }));

  const efficiencyData = stats.monthlyEnergy.map(r => ({
    month: formatMonth(r.month),
    eficiencia: r.efficiency,
  }));

  const economyData = stats.monthlyEnergy.map(r => ({
    month: formatMonth(r.month),
    economia: r.economy,
    custo: r.billsCost,
  }));

  const distPieData = stats.consumoByDistributor
    .filter(r => r.consumed > 0 && r.distributor)
    .slice(0, 8)
    .map(r => ({ name: r.distributor, value: r.consumed }));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Energia</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>Analise energetica: Consumo, Compensacao, Eficiencia e Economia</Typography>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '12px', mb: 2, display: 'inline-flex' }}>
        <PeriodFilter onApply={handleFilter} />
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="ENERGIA CONSUMIDA" value={`${formatKwh(stats.consumed)} kWh`} icon={<BoltIcon />} color="#1976d2" subtitle="Total no periodo" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="ENERGIA COMPENSADA" value={`${formatKwh(stats.compensated)} kWh`} icon={<EnergySavingsLeafIcon />} color="#2e7d32" subtitle="Geracao solar injetada" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="EFICIENCIA" value={`${stats.efficiency.toFixed(1)}%`} icon={<SpeedIcon />} color="#9c27b0" subtitle="Compensada / Consumida" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="SALDO ENERGETICO" value={`${formatKwh(stats.saldoTotal)} kWh`} icon={<BatteryChargingFullIcon />} color="#0288d1" subtitle="Saldo atual acumulado" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="ECONOMIA GERADA" value={formatCurrency(stats.economy)} icon={<SavingsIcon />} color="#2e7d32" subtitle="Economia total clientes" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="CUSTO CONCESSIONARIA" value={formatCurrency(stats.billsCost)} icon={<AccountBalanceIcon />} color="#757575" subtitle="Total contas distribuidora" />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 340 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Consumida vs Compensada (kWh)
            </Typography>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={energyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatKwh(v)} />
                <Tooltip formatter={(v) => `${formatNumber(v)} kWh`} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '0.7rem' }} />
                <Bar dataKey="Consumida" fill="#1976d2" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Compensada" fill="#2e7d32" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 340 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Eficiencia Mensal (%)
            </Typography>
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={efficiencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 'auto']} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                <Line type="monotone" dataKey="eficiencia" stroke="#9c27b0" strokeWidth={2} dot={{ r: 3 }} name="Eficiencia" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 340 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Economia vs Custo Concessionaria (R$)
            </Typography>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={economyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '0.7rem' }} />
                <Bar dataKey="economia" fill="#2e7d32" radius={[3, 3, 0, 0]} name="Economia" />
                <Bar dataKey="custo" fill="#757575" radius={[3, 3, 0, 0]} name="Custo Conc." />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 340 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
              Consumo por Distribuidora (kWh)
            </Typography>
            <ResponsiveContainer width="100%" height={290}>
              <PieChart>
                <Pie data={distPieData} dataKey="value" cx="50%" cy="45%" outerRadius={85} innerRadius={40} paddingAngle={2}>
                  {distPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${formatNumber(v)} kWh`} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.6rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', mb: 2 }}>
        <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
          Resumo Mensal de Energia
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Mes</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Consumida (kWh)</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Compensada (kWh)</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Eficiencia</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Economia</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Custo Conc.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.monthlyEnergy.slice().reverse().map((r, i) => (
              <TableRow key={i} sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}>
                <TableCell sx={{ fontSize: '0.75rem' }}>{formatMonth(r.month)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatNumber(r.consumed)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#2e7d32' }}>{formatNumber(r.compensated)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: r.efficiency >= 80 ? '#2e7d32' : r.efficiency >= 50 ? '#ed6c02' : '#d32f2f' }}>
                  {r.efficiency.toFixed(1)}%
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatCurrency(r.economy)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#757575' }}>{formatCurrency(r.billsCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <PlaceholderCard title="TUSD" source="ANEEL (dados publicos)" description="Tarifa de Uso do Sistema de Distribuicao" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PlaceholderCard title="Energia Projetada" source="Planilhas de projeto" description="Geracao projetada vs realizada por usina" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PlaceholderCard title="Captacao Projetada" source="RF02 / Planilhas" description="Captacao projetada vs realizada" />
        </Grid>
      </Grid>
    </Box>
  );
}
