import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Paper, CircularProgress, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import { KPICard, PeriodFilter, PlaceholderCard, formatCurrency } from '../components/shared';
import { fetchApi } from '../api/api';

const COLORS = ['#2e7d32', '#ed6c02', '#d32f2f', '#1976d2', '#9c27b0', '#0288d1'];

const formatMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

export default function Financeiro() {
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
      const data = await fetchApi(`/financial/stats${query}`);
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
    return <Box sx={{ p: 4 }}><Typography color="error">Erro ao carregar dados financeiros.</Typography></Box>;
  }

  const flowData = stats.monthlyFlow.map(r => ({
    month: formatMonth(r.month),
    Faturado: r.faturado,
    Recebido: r.recebido,
    Vencido: r.vencido,
    Pendente: r.pendente,
  }));

  const taxaData = stats.monthlyFlow
    .filter(r => r.faturado > 0)
    .map(r => ({
      month: formatMonth(r.month),
      taxa: r.faturado > 0 ? (r.recebido / r.faturado) * 100 : 0,
    }));

  const payPieData = stats.paymentsByStatus
    .filter(r => r.count > 0)
    .map(r => ({ name: r.status, value: r.total }));

  const invPieData = stats.invoicesByStatus
    .filter(r => r.count > 0)
    .map(r => ({ name: r.status, value: r.total }));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Financeiro</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>Fluxo financeiro: Faturamento → Cobranca → Recebimento → Inadimplencia</Typography>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '12px', mb: 2, display: 'inline-flex' }}>
        <PeriodFilter onApply={handleFilter} />
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="FATURAMENTO REALIZADO" value={formatCurrency(stats.faturamento)} icon={<ReceiptLongIcon />} color="#1976d2" subtitle="Faturas com status Faturado" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="RECEITA RECEBIDA" value={formatCurrency(stats.receita)} icon={<AccountBalanceWalletIcon />} color="#2e7d32" subtitle={`${stats.receitaCount} pagamentos confirmados`} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="INADIMPLENCIA" value={formatCurrency(stats.inadimplencia)} icon={<WarningAmberIcon />} color="#d32f2f" subtitle="Pagamentos vencidos" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="EM ABERTO" value={formatCurrency(stats.emAberto)} icon={<HourglassEmptyIcon />} color="#ed6c02" subtitle="Pagamentos pendentes" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="TAXA RECEBIMENTO" value={`${stats.taxaRecebimento.toFixed(1)}%`} icon={<TrendingUpIcon />} color="#9c27b0" subtitle="Recebido / Faturado" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <KPICard title="TICKET MEDIO" value={formatCurrency(stats.ticketMedio)} icon={<ConfirmationNumberIcon />} color="#0288d1" subtitle="Valor medio por pagamento" />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 360 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Fluxo Financeiro Mensal
            </Typography>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={flowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '0.7rem' }} />
                <Bar dataKey="Faturado" fill="#1976d2" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Recebido" fill="#2e7d32" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Vencido" fill="#d32f2f" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Pendente" fill="#ed6c02" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 360 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
              Distribuicao Pagamentos (R$)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={payPieData} dataKey="value" cx="50%" cy="45%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {payPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.65rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 320 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 2, color: 'text.secondary' }}>
              Taxa de Recebimento Mensal (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={taxaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 'auto']} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                <Line type="monotone" dataKey="taxa" stroke="#9c27b0" strokeWidth={2} dot={{ r: 3 }} name="Taxa Recebimento" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', height: 320 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1, color: 'text.secondary' }}>
              Distribuicao Faturas (R$)
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={invPieData} dataKey="value" cx="50%" cy="45%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {invPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.65rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', mb: 2 }}>
        <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5, color: 'text.secondary' }}>
          Resumo Mensal
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Mes</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Faturado</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Recebido</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Vencido</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Pendente</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Taxa (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.monthlyFlow.slice().reverse().map((r, i) => (
              <TableRow key={i} sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}>
                <TableCell sx={{ fontSize: '0.75rem' }}>{formatMonth(r.month)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatCurrency(r.faturado)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#2e7d32' }}>{formatCurrency(r.recebido)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#d32f2f' }}>{formatCurrency(r.vencido)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#ed6c02' }}>{formatCurrency(r.pendente)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  {r.faturado > 0 ? ((r.recebido / r.faturado) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PlaceholderCard title="Faturamento Projetado" source="UAU / Planilhas" description="Comparativo faturamento projetado vs realizado" />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <PlaceholderCard title="Conciliacao Bancaria" source="UAU (ERP)" description="Cruzamento de recebimentos com extrato bancario" />
        </Grid>
      </Grid>
    </Box>
  );
}
