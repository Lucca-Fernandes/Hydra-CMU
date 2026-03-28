import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Paper, TextField, Button, Stack } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PeopleIcon from '@mui/icons-material/People';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SearchIcon from '@mui/icons-material/Search';
import { KPICard, StatusBadge, formatCurrency, PeriodFilter } from '../components/shared';
import { fetchApi } from '../api/api';

export default function Inadimplencia() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rowCount, setRowCount] = useState(0);
  const [aggregate, setAggregate] = useState({ totalAmount: 0, totalPending: 0, count: 0 });
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFilters, setDateFilters] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const apiPage = paginationModel.page + 1;
      const filterObj = {};
      if (appliedSearch) filterObj.name = appliedSearch;
      if (dateFilters.startDate) filterObj.startDate = dateFilters.startDate;
      if (dateFilters.endDate) filterObj.endDate = dateFilters.endDate;
      const filtersParam = Object.keys(filterObj).length > 0
        ? `&filters=${encodeURIComponent(JSON.stringify(filterObj))}`
        : '';
      const res = await fetchApi(`/EnergyMeters/delinquent?page=${apiPage}&pageSize=${paginationModel.pageSize}${filtersParam}`);
      if (res && res.data) {
        setRows(res.data);
        setRowCount(res.total);
        if (res.aggregate) setAggregate(res.aggregate);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [paginationModel.page, paginationModel.pageSize, appliedSearch, dateFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => {
    setPaginationModel(prev => ({ ...prev, page: 0 }));
    setAppliedSearch(searchQuery);
  };

  const handleDateFilter = useCallback((f) => {
    setDateFilters(f);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, []);

  const ticketMedio = aggregate.count > 0 ? aggregate.totalAmount / aggregate.count : 0;

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Inadimplencia</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>Medidores com pagamentos vencidos</Typography>

      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 2, mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <TextField
            placeholder="Buscar (Nome, CPF, Instalacao)..."
            size="small" sx={{ flexGrow: 1, minWidth: 200 }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="contained" size="small" onClick={handleSearch} sx={{ minWidth: 80, textTransform: 'none' }}>Filtrar</Button>
          {appliedSearch && (
            <Button variant="text" size="small" onClick={() => { setSearchQuery(''); setAppliedSearch(''); setPaginationModel(p => ({...p, page: 0})); }}
              sx={{ textTransform: 'none', color: 'text.secondary' }}>Limpar</Button>
          )}
          <PeriodFilter onApply={handleDateFilter} />
        </Stack>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <KPICard title="TOTAL INADIMPLENTE" value={formatCurrency(aggregate.totalAmount)} icon={<WarningAmberIcon />} color="#d32f2f" subtitle="Soma dos filtrados" />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <KPICard title="MEDIDORES DEVEDORES" value={aggregate.count.toLocaleString('pt-BR')} icon={<PeopleIcon />} color="#ed6c02" subtitle="Total filtrado" />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <KPICard title="BOLETOS PENDENTES" value={aggregate.totalPending.toLocaleString('pt-BR')} icon={<AccountBalanceWalletIcon />} color="#d32f2f" subtitle="Total filtrado" />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <KPICard title="TICKET MEDIO" value={formatCurrency(ticketMedio)} icon={<TrendingDownIcon />} color="#9c27b0" subtitle="Divida media por medidor" />
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 2, overflow: 'hidden', minHeight: 0 }}>
        <DataGrid
          rows={rows}
          getRowId={(r) => r.energyMeterID}
          loading={loading}
          columns={[
            { field: 'name', headerName: 'Cliente', flex: 1, minWidth: 180 },
            { field: 'meterNumber', headerName: 'Instalacao', width: 130 },
            { field: 'addressState', headerName: 'UF', width: 55 },
            { field: 'addressCity', headerName: 'Cidade', width: 130 },
            {
              field: 'expiredPaymentsTotalAmount',
              headerName: 'Valor Vencido',
              width: 140,
              renderCell: (p) => (
                <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '0.8rem' }}>
                  {formatCurrency(p.value)}
                </Typography>
              )
            },
            {
              field: 'pendingPayments',
              headerName: 'Pendencias',
              width: 100,
              renderCell: (p) => (
                <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                  {p.value || 0}
                </Typography>
              )
            },
            {
              field: 'energyMeterStatus',
              headerName: 'Status UC',
              width: 110,
              renderCell: (p) => <StatusBadge status={p.value} />
            },
            { field: 'prospector', headerName: 'Parceiro', width: 140 },
            { field: 'organization', headerName: 'Organizacao', width: 170 },
          ]}
          paginationMode="server"
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sx={{ border: 'none', '& .MuiDataGrid-row:hover': { cursor: 'pointer' } }}
        />
      </Paper>
    </Box>
  );
}
