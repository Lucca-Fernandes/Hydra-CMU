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

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const formatNumber = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const formatDate = (ds) => {
  if (!ds) return "";
  const d = new Date(ds);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
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

  // --- CARGA DE DADOS (COM FILTROS DO SERVER) ---
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      
      // Nome (Campo 'name' do DTO)
      if (searchQuery) filters.name = searchQuery;
      
      // Status (Campo 'energyMeterStatus' do DTO)
      if (statusFilter) filters.energyMeterStatus = statusFilter;
      
      // Financeiro (Usando 'pendingPayments' que é o campo real no banco)
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
  }, [statusFilter, financeiroFilter]); // Recarrega ao mudar selects

  // --- BUSCA DE FATURAS (MODAL) ---
  const fetchInvoices = async (uc) => {
    if (!uc) return;
    setLoadingDetails(true);
    try {
      const url = `/EnergyMeterInvoices?filters=${encodeURIComponent(JSON.stringify({ energyMeterID: uc.energyMeterID }))}&rawData=false`;
      const data = await fetchApi(url);
      if (Array.isArray(data)) {
        const unique = [];
        const seen = new Set();
        [...data].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(item => {
          const m = formatDate(item.referenceMonth);
          if (!seen.has(m)) { seen.add(m); unique.push(item); }
        });
        setUnifiedData(unique.reverse());
      }
    } catch (e) { console.error(e); } finally { setLoadingDetails(false); }
  };

  const mainColumns = useMemo(() => [
    { field: 'meterNumber', headerName: 'Instalação', width: 130 },
    { field: 'name', headerName: 'Cliente', flex: 1 },
    { 
      field: 'lastInvoiceEnergyBalance', 
      headerName: 'Saldo (kWh)', 
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="700" color="primary.main">
          {formatNumber(params.value)}
        </Typography>
      )
    },
    { 
      field: 'pendingPayments', 
      headerName: 'Financeiro', 
      width: 150,
      renderCell: (params) => {
        const hasDebito = params.value > 0;
        return hasDebito ? (
          <MuiTooltip title={`${params.value} fatura(s) pendente(s)`} arrow>
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
        {/* BARRA DE FILTROS SIMPLIFICADA */}
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField 
              placeholder="Buscar por nome..." 
              size="small" 
              sx={{ flexGrow: 1 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && loadData()}
            />
            
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status UC</InputLabel>
              <Select value={statusFilter} label="Status UC" onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Ativa">Ativa</MenuItem>
                <MenuItem value="Inativa">Inativa</MenuItem>
                <MenuItem value="Suspenso">Suspenso</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Financeiro</InputLabel>
              <Select value={financeiroFilter} label="Financeiro" onChange={(e) => setFinanceiroFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="EM_DIA">Em dia</MenuItem>
                <MenuItem value="DEBITO">Débito</MenuItem>
              </Select>
            </FormControl>

            <Button variant="contained" disableElevation startIcon={<SearchIcon />} onClick={loadData}>
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

      {/* MODAL DE DETALHES */}
      <Modal open={!!selectedUC} onClose={() => setSelectedUC(null)}>
        <Paper sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90vw', height: '85vh', p: 4, borderRadius: 2 }}>
           <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h5" fontWeight="800">{selectedUC?.name}</Typography>
              <IconButton onClick={() => setSelectedUC(null)}><CloseIcon /></IconButton>
           </Box>
           
           <Box sx={{ display: 'flex', gap: 3, height: '80%' }}>
              <Box sx={{ flex: 2, border: '1px solid #eee', p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Consumo Mensal (kWh)</Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={unifiedData.map(i => ({ month: formatDate(i.referenceMonth), valor: i.consumedEnergy }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip cursor={{fill: '#f5f5f5'}}/>
                    <Bar dataKey="valor" fill="#1a237e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>

              <Box sx={{ flex: 1.5 }}>
                <DataGrid
                  rows={unifiedData}
                  getRowId={(r) => r.energyMeterInvoiceID}
                  density="compact"
                  columns={[
                    { field: 'referenceMonth', headerName: 'Mês', width: 100, renderCell: (p) => formatDate(p.value) },
                    { field: 'totalAmount', headerName: 'Valor', width: 110, renderCell: (p) => formatCurrency(p.value) },
                    { 
                      field: 'docs', 
                      headerName: 'Docs', 
                      flex: 1, 
                      renderCell: (p) => (
                        <Stack direction="row">
                          <IconButton size="small" onClick={() => window.open(p.row.energyInvoiceFile, '_blank')}><PictureAsPdfIcon fontSize="small" /></IconButton>
                        </Stack>
                      )
                    }
                  ]}
                  hideFooter
                />
              </Box>
           </Box>
        </Paper>
      </Modal>
    </Box>
  );
}

export default Clientes;