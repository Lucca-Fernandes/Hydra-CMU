import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Paper, Modal,
  Button, IconButton, TextField, Stack, Chip, Tooltip as MuiTooltip,
  MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { fetchApi } from '../api/api';

// --- Utilitários ---
const formatCurrency = (v) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatNumber = (v) => 
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const formatDate = (ds) => {
  if (!ds) return "";
  const d = new Date(ds);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)
    .toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
};

function Clientes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados dos Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); 
  const [financeiroFilter, setFinanceiroFilter] = useState("");

  const [selectedUC, setSelectedUC] = useState(null);
  const [unifiedData, setUnifiedData] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [dateStart, setDateStart] = useState(""); 
  const [dateEnd, setDateEnd] = useState("");

  // --- Carga de Dados via API com Filtros de Servidor ---
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      
      if (searchQuery) filters.name = searchQuery;
      if (statusFilter) filters.energyMeterStatus = statusFilter;
      
      if (financeiroFilter === "DEBITO") {
        filters.pendingPayments = { ">": 0 }; 
      } else if (financeiroFilter === "EM_DIA") {
        filters.pendingPayments = 0;
      }

      const filterString = Object.keys(filters).length > 0 
        ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` 
        : "";

      const url = `/EnergyMeters?page=1&pageSize=50${filterString}`;
      const res = await fetchApi(url);
      
      if (Array.isArray(res)) {
        setRows(res);
      }
    } catch (e) { 
      console.error("Erro na busca:", e); 
    } finally { 
      setLoading(false); 
    }
  }, [searchQuery, statusFilter, financeiroFilter]);

  useEffect(() => {
    loadData();
  }, [statusFilter, financeiroFilter]); 

  // --- Busca de Faturas (Modal) ---
  const fetchInvoices = async (uc, start = "", end = "") => {
    if (!uc) return;
    setLoadingDetails(true);
    try {
      const filterObj = { energyMeterID: uc.energyMeterID };
      if (start || end) {
        filterObj.referenceMonth = [
          start ? `${start}-01` : "2000-01-01", 
          end ? `${end}-28` : "2099-12-31"
        ];
      }
      const urlInvoices = `/EnergyMeterInvoices?filters=${encodeURIComponent(JSON.stringify(filterObj))}&rawData=false`;
      const data = await fetchApi(urlInvoices);
      
      if (Array.isArray(data)) {
        const uniqueInvoices = [];
        const seenMonths = new Set();
        const sortedData = [...data].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        sortedData.forEach(item => {
          const month = formatDate(item.referenceMonth);
          if (!seenMonths.has(month)) {
            seenMonths.add(month);
            uniqueInvoices.push(item);
          }
        });
        setUnifiedData(uniqueInvoices.reverse());
      }
    } catch (e) { console.error(e); } finally { setLoadingDetails(false); }
  };

  const chartData = useMemo(() => {
    return unifiedData.map(item => ({
      month: formatDate(item.referenceMonth),
      consumedEnergy: item.consumedEnergy || 0
    }));
  }, [unifiedData]);

  // --- Colunas da Grade Principal ---
  const mainColumns = useMemo(() => [
    { field: 'meterNumber', headerName: 'Instalação', width: 130 },
    { field: 'name', headerName: 'Cliente', flex: 1 },
    { 
      field: 'lastInvoiceEnergyBalance', 
      headerName: 'Saldo (kWh)', 
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="700" color="primary.main">
          {formatNumber(params.row.lastInvoiceEnergyBalance)}
        </Typography>
      )
    },
    { 
      field: 'expiredPayments', 
      headerName: 'Financeiro', 
      width: 150,
      renderCell: (params) => {
        const hasDebito = params.row.expiredPayments > 0;
        const total = formatCurrency(params.row.expiredPaymentsTotalAmount);
        return hasDebito ? (
          <MuiTooltip title={`Pendente: ${params.row.expiredPayments} fatura(s) | Total: ${total}`} arrow>
            <Chip icon={<WarningAmberIcon />} label="Débito" color="error" size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
          </MuiTooltip>
        ) : (
          <Chip icon={<CheckCircleOutlineIcon />} label="Em dia" color="success" size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
        );
      }
    },
    { field: 'registrationNumber', headerName: 'CPF/CNPJ', width: 160 },
    { field: 'energyMeterStatus', headerName: 'Status UC', width: 130 },
  ], []);

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', bgcolor: '#f8f9fa' }}>
      <AppBar position="static" sx={{ bgcolor: '#1a237e', boxShadow: 'none' }}>
        <Toolbar><Typography variant="h6" fontWeight="700">SOLATIO | Gestão de Clientes</Typography></Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Barra de Filtros */}
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField 
              placeholder="Buscar cliente por nome..." 
              size="small" 
              sx={{ flexGrow: 1 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && loadData()}
            />
            
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status UC</InputLabel>
              <Select value={statusFilter} label="Status UC" onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Ativa">Ativa</MenuItem>
                <MenuItem value="Inativa">Inativa</MenuItem>
                <MenuItem value="Suspenso">Suspenso</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Financeiro</InputLabel>
              <Select value={financeiroFilter} label="Financeiro" onChange={(e) => setFinanceiroFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="EM_DIA">Em dia</MenuItem>
                <MenuItem value="DEBITO">Débito</MenuItem>
              </Select>
            </FormControl>

            <Button variant="contained" disableElevation startIcon={<SearchIcon />} onClick={loadData} sx={{ height: 40 }}>
              FILTRAR
            </Button>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ flexGrow: 1, border: '1px solid #e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
          <DataGrid
            rows={rows}
            getRowId={(r) => r.energyMeterID}
            columns={mainColumns}
            loading={loading}
            onRowClick={(p) => { setSelectedUC(p.row); fetchInvoices(p.row); }}
            disableColumnFilter
            sx={{ border: 'none', '& .MuiDataGrid-columnHeaders': { bgcolor: '#f1f3f4' }, '& .MuiDataGrid-row:hover': { cursor: 'pointer' } }}
          />
        </Paper>
      </Box>

      {/* Modal de Detalhes */}
      <Modal open={!!selectedUC} onClose={() => setSelectedUC(null)}>
        <Paper sx={{ 
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
          width: '95vw', height: '92vh', p: 4, display: 'flex', flexDirection: 'column', borderRadius: 2 
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h5" fontWeight="800">{selectedUC?.name}</Typography>
              <Typography variant="body2" color="text.secondary">Instalação: {selectedUC?.meterNumber}</Typography>
            </Box>
            <IconButton onClick={() => setSelectedUC(null)}><CloseIcon /></IconButton>
          </Box>

          <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
            <TextField type="month" size="small" label="De" InputLabelProps={{ shrink: true }} value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            <TextField type="month" size="small" label="Até" InputLabelProps={{ shrink: true }} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            <Button variant="contained" disableElevation onClick={() => fetchInvoices(selectedUC, dateStart, dateEnd)}>FILTRAR PERÍODO</Button>
          </Stack>

          <Box sx={{ display: 'flex', gap: 4, flexGrow: 1, minHeight: 0 }}>
            {/* Gráfico */}
            <Box sx={{ width: '60%', border: '1px solid #eee', p: 2, borderRadius: 2 }}>
              <Typography variant="overline" color="text.secondary">Histórico de Consumo (kWh)</Typography>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f5f5f5'}} />
                  <Bar dataKey="consumedEnergy" fill="#1a237e" radius={[4, 4, 0, 0]} name="Consumo" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
             
            {/* Tabela de Faturas */}
            <Box sx={{ width: '40%' }}>
              <DataGrid
                rows={unifiedData}
                getRowId={(r) => r.energyMeterInvoiceID}
                columns={[
                  { field: 'referenceMonth', headerName: 'Mês', width: 100, renderCell: (p) => formatDate(p.value) },
                  { field: 'totalAmount', headerName: 'Valor', width: 120, renderCell: (p) => formatCurrency(p.value) },
                  { 
                    field: 'actions', 
                    headerName: 'Documentos', 
                    flex: 1,
                    renderCell: (params) => (
                      <Stack direction="row" spacing={1}>
                        <MuiTooltip title="Ver Fatura">
                          <IconButton size="small" color="primary" onClick={() => window.open(params.row.energyInvoiceFile, '_blank')} disabled={!params.row.energyInvoiceFile?.startsWith("http")}>
                            <PictureAsPdfIcon />
                          </IconButton>
                        </MuiTooltip>
                        <MuiTooltip title="Ver Comprovante">
                          <IconButton size="small" sx={{ color: '#757575' }} onClick={() => window.open(params.row.energyMeterBill?.energyBillFile, '_blank')} disabled={!params.row.energyMeterBill?.energyBillFile?.startsWith("http")}>
                            <ReceiptLongIcon />
                          </IconButton>
                        </MuiTooltip>
                      </Stack>
                    )
                  }
                ]}
                loading={loadingDetails}
                hideFooter
                density="compact"
                sx={{ border: '1px solid #eee', borderRadius: 2 }}
              />
            </Box>
          </Box>
        </Paper>
      </Modal>
    </Box>
  );
}

export default Clientes;