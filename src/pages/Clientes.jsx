import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Typography, Box, Paper, Modal, Grid,
  Button, IconButton, TextField, Stack, MenuItem
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SavingsIcon from '@mui/icons-material/Savings';
import HubIcon from '@mui/icons-material/Hub';
import PersonIcon from '@mui/icons-material/Person';
import HomeIcon from '@mui/icons-material/Home';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentIcon from '@mui/icons-material/Payment';
import { fetchApi } from '../api/api';
import {
  formatCurrency, formatNumber, formatDate,
  StatusBadge, KPICard, InfoCard, DataField
} from '../components/shared';


function getEmail(uc) {
  if (uc?.emails && uc.emails !== '') return uc.emails;
  if (uc?.customer?.email) return uc.customer.email;
  if (uc?.voucher?.prospector?.contactEmail) return uc.voucher.prospector.contactEmail;
  return null;
}

function getPhone(uc) {
  if (uc?.phones && uc.phones !== '') return uc.phones;
  if (uc?.customer?.phone) return uc.customer.phone;
  if (uc?.voucher?.prospector?.phone) return uc.voucher.prospector.phone;
  return null;
}

function getAddress(uc) {
  const addr = uc?.address;
  if (addr && !addr.includes('Não informado')) return addr;
  if (uc?.addressStreet && !uc.addressStreet.includes('Não informado')) {
    return `${uc.addressStreet}, ${uc.addressNumber || 'S/N'} - ${uc.addressDistrict || ''}, ${uc.addressCity || ''} - ${uc.addressState || ''}`;
  }
  return addr || null;
}

function getDistrict(uc) {
  const d = uc?.addressDistrict;
  if (d && d !== 'Não informado') return d;
  return null;
}

function Clientes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rowCount, setRowCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedUC, setSelectedUC] = useState(null);
  const [unifiedData, setUnifiedData] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filterObj = {};
      if (appliedFilter) filterObj.name = appliedFilter;
      if (statusFilter) filterObj.energyMeterStatus = statusFilter;
      const filtersQuery = Object.keys(filterObj).length > 0 ? `&filters=${encodeURIComponent(JSON.stringify(filterObj))}` : "";
      const apiPage = paginationModel.page + 1;
      const res = await fetchApi(`/EnergyMeters?page=${apiPage}&pageSize=${paginationModel.pageSize}${filtersQuery}`);
      if (res && res.data) {
        setRows(res.data);
        setRowCount(res.total);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [appliedFilter, statusFilter, paginationModel.page, paginationModel.pageSize]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => {
    setPaginationModel(prev => ({ ...prev, page: 0 }));
    setAppliedFilter(searchQuery);
  };

  const fetchDetails = async (uc) => {
    if (!uc) return;
    setLoadingDetails(true);
    try {
      const filterObj = { energyMeterID: uc.energyMeterID };
      const query = encodeURIComponent(JSON.stringify(filterObj));
      const [invData, payData] = await Promise.all([
        fetchApi(`/EnergyMeterInvoices?filters=${query}&rawData=false`),
        fetchApi(`/EnergyMeterPayments?filters=${query}&rawData=false`).catch(() => [])
      ]);
      if (Array.isArray(invData)) {
        setUnifiedData([...invData].sort((a, b) => new Date(b.referenceMonth) - new Date(a.referenceMonth)));
      }
      setPayments(Array.isArray(payData) ? payData : []);
    } catch (e) { console.error(e); } finally { setLoadingDetails(false); }
  };

  const stats = useMemo(() => {
    const validInvoices = unifiedData.filter(inv => !["Cancelado", "Reprovado"].includes(inv.energyMeterInvoiceStatus));
    const totalConsumed = validInvoices.reduce((acc, inv) => acc + (inv.consumedEnergy || 0), 0);
    const avgConsumed = validInvoices.length > 0 ? totalConsumed / validInvoices.length : 0;
    const lastMonth = validInvoices[0];
    const efficiency = lastMonth?.consumedEnergy > 0 ? (lastMonth.compensatedEnergy / lastMonth.consumedEnergy) * 100 : 0;
    const latestBalance = validInvoices.find(inv => inv.energyBalance != null)?.energyBalance ?? null;
    return { avgConsumed, efficiency, validCount: validInvoices.length, latestBalance };
  }, [unifiedData]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 3, pb: 1 }}>
        <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Clientes</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>Gerenciamento de medidores e unidades consumidoras</Typography>
      </Box>

      <Box sx={{ flex: 1, px: 3, pb: 3, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
        <Paper elevation={0} sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <TextField
              placeholder="Buscar cliente (Nome, CPF, Instalacao)..."
              size="small" sx={{ flexGrow: 1 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <TextField
              select size="small" label="Status UC" value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPaginationModel(p => ({...p, page: 0})); }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="Ativa">Ativa</MenuItem>
              <MenuItem value="Desconectada">Desconectada</MenuItem>
              <MenuItem value="Cancelada">Cancelada</MenuItem>
            </TextField>
            <Button variant="contained" size="small" onClick={handleSearch} sx={{ minWidth: 80, textTransform: 'none' }}>Filtrar</Button>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
          <DataGrid
            rows={rows}
            getRowId={(r) => r.energyMeterID}
            columns={[
              { field: 'meterNumber', headerName: 'Instalacao', width: 130 },
              { field: 'name', headerName: 'Cliente', flex: 1 },
              { field: 'addressCity', headerName: 'Cidade', width: 130 },
              { field: 'addressState', headerName: 'UF', width: 60 },
              {
                field: 'energyMeterStatus',
                headerName: 'Status',
                width: 120,
                renderCell: (p) => <StatusBadge status={p.value} />
              },
              {
                field: 'expiredPaymentsTotalAmount',
                headerName: 'Inadimplente',
                width: 130,
                renderCell: (p) => p.value > 0
                  ? <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '0.8rem' }}>{formatCurrency(p.value)}</Typography>
                  : <Typography variant="body2" sx={{ color: '#2e7d32', fontSize: '0.8rem' }}>Em dia</Typography>
              },
            ]}
            loading={loading}
            onRowClick={(p) => { setSelectedUC(p.row); fetchDetails(p.row); }}
            paginationMode="server"
            rowCount={rowCount}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            sx={{ border: 'none', '& .MuiDataGrid-row:hover': { cursor: 'pointer' } }}
          />
        </Paper>
      </Box>

      <Modal open={!!selectedUC} onClose={() => setSelectedUC(null)}>
        <Paper sx={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '94vw', height: '94vh', p: 3, display: 'flex', flexDirection: 'column', borderRadius: '20px', outline: 'none', overflowY: 'auto', bgcolor: '#fdfdfd'
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Typography variant="h5" fontWeight="900" color="primary.main">{selectedUC?.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Instalacao: {selectedUC?.meterNumber}</Typography>
                <StatusBadge status={selectedUC?.energyMeterStatus} />
                {selectedUC?.organization && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>{selectedUC.organization}</Typography>
                )}
              </Stack>
            </Box>
            <IconButton onClick={() => setSelectedUC(null)} size="small" sx={{ bgcolor: '#f0f0f0' }}><CloseIcon fontSize="small" /></IconButton>
          </Box>

          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="CONSUMO CONTRATADO" value={`${selectedUC?.contractConsumption || 0} kWh`} icon={<ElectricBoltIcon />} subtitle="Valor base do contrato" /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="CONSUMO MEDIO" value={`${formatNumber(stats.avgConsumed)} kWh`} icon={<TrendingUpIcon />} color="#9c27b0" subtitle={`Ref: ${stats.validCount} faturas validas`} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="EFICIENCIA USINA" value={`${stats.efficiency.toFixed(1)}%`} icon={<HubIcon />} color="#0288d1" subtitle="Cobertura Geracao x Consumo" /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="ECONOMIA" value={`${selectedUC?.discountEstimative || 0}%`} icon={<SavingsIcon />} color="#2e7d32" subtitle="Desconto em fatura" /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="SALDO ENERGIA" value={stats.latestBalance != null ? `${formatNumber(stats.latestBalance)} kWh` : '---'} icon={<ElectricBoltIcon />} color={stats.latestBalance > 0 ? '#0288d1' : '#d32f2f'} subtitle="Credito acumulado usina" /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><KPICard title="INADIMPLENTE" value={formatCurrency(selectedUC?.expiredPaymentsTotalAmount)} icon={<AccountBalanceWalletIcon />} color="#d32f2f" subtitle={`${selectedUC?.pendingPayments || 0} pendencias`} /></Grid>
          </Grid>

          <Paper variant="outlined" sx={{ minHeight: '350px', borderRadius: '12px', overflow: 'hidden', mb: 2 }}>
            <Box p={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>
              <ReceiptLongIcon sx={{ fontSize: 18, color: 'primary.main' }} />
              <Typography variant="button" fontWeight="800" sx={{ fontSize: '0.7rem' }}>Historico de Faturas</Typography>
            </Box>
            <DataGrid
              rows={unifiedData}
              getRowId={(r) => r.energyMeterInvoiceID}
              loading={loadingDetails}
              density="compact"
              columns={[
                { field: 'referenceMonth', headerName: 'Mes Ref', width: 90, renderCell: (p) => formatDate(p.value) },
                {
                  field: 'consumedEnergy',
                  headerName: 'Consumo (kWh)',
                  width: 140,
                  renderCell: (p) => {
                    const meta = selectedUC?.contractConsumption || 0;
                    const diff = meta > 0 ? ((p.value / meta) - 1) * 100 : 0;
                    return (
                      <Box>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{formatNumber(p.value)}</Typography>
                        {meta > 0 && (
                          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: diff > 0 ? '#d32f2f' : '#2e7d32', display: 'block', mt: -0.5 }}>
                            ({diff > 0 ? '+' : ''}{diff.toFixed(0)}% vs meta)
                          </Typography>
                        )}
                      </Box>
                    );
                  }
                },
                { field: 'compensatedEnergy', headerName: 'Gerado (kWh)', width: 110, renderCell: (p) => formatNumber(p.value) },
                {
                  field: 'energyBalance',
                  headerName: 'Saldo (kWh)',
                  width: 110,
                  renderCell: (p) => {
                    if (p.value == null) return <Typography variant="caption" color="text.secondary">---</Typography>;
                    return (
                      <Typography variant="body2" sx={{ color: p.value >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: 'bold', fontSize: '0.75rem' }}>
                        {formatNumber(p.value)}
                      </Typography>
                    );
                  }
                },
                { field: 'totalAmount', headerName: 'Valor Solatio', width: 110, renderCell: (p) => formatCurrency(p.value) },
                {
                  field: 'economy',
                  headerName: 'Economia',
                  width: 100,
                  renderCell: (p) => {
                    const econVal = p.row.economyValue || (p.row.consumedEnergy * (selectedUC?.discountEstimative / 100)) * 0.9;
                    return <Typography variant="body2" sx={{ color: '#2e7d32', fontWeight: 'bold', fontSize: '0.75rem' }}>{formatCurrency(econVal)}</Typography>;
                  }
                },
                {
                  field: 'energyMeterInvoiceStatus',
                  headerName: 'Fatura',
                  width: 90,
                  renderCell: (p) => <StatusBadge status={p.value} description={p.row.statusDescription} />
                },
                {
                  field: 'paymentStatus',
                  headerName: 'Pagamento',
                  width: 100,
                  renderCell: (params) => {
                    const pay = payments.find(p => p.referenceMonth === params.row.referenceMonth);
                    if (!pay) return <Typography variant="caption" color="text.secondary">---</Typography>;
                    return <StatusBadge status={pay.energyMeterPaymentStatus} />;
                  }
                },
                {
                  field: 'actions', headerName: 'Docs', width: 110, align: 'right',
                  renderCell: (params) => {
                    const pay = payments.find(p => p.referenceMonth === params.row.referenceMonth);
                    return (
                      <Stack direction="row" spacing={0.5}>
                        {pay?.paymentLinkURL && (
                          <IconButton size="small" sx={{ color: '#2e7d32' }} onClick={() => window.open(pay.paymentLinkURL, '_blank')}><PaymentIcon sx={{ fontSize: 16 }} /></IconButton>
                        )}
                        <IconButton size="small" color="primary" onClick={() => window.open(params.row.energyInvoiceFile, '_blank')} disabled={!params.row.energyInvoiceFile}><PictureAsPdfIcon sx={{ fontSize: 16 }} /></IconButton>
                        <IconButton size="small" color="secondary" onClick={() => window.open(params.row.energyMeterBill?.energyBillFile, '_blank')} disabled={!params.row.energyMeterBill?.energyBillFile}><ReceiptLongIcon sx={{ fontSize: 16 }} /></IconButton>
                      </Stack>
                    );
                  }
                }
              ]}
              sx={{ border: 'none' }}
              hideFooter
            />
          </Paper>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <InfoCard title="Unidade" icon={<PersonIcon />}>
                <DataField label="N Instalacao" value={selectedUC?.meterNumber} />
                <DataField label="N Cliente" value={selectedUC?.customerNumber} />
                <DataField label="Status" value={selectedUC?.energyMeterStatus} />
                <DataField label="Classe" value={selectedUC?.class} />
                <DataField label="Conexao" value={selectedUC?.connection} />
                <DataField label="Subgrupo" value={selectedUC?.tariffSubgroup} />
              </InfoCard>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <InfoCard title="Localizacao" icon={<HomeIcon />}>
                <DataField label="Endereco" value={getAddress(selectedUC)} />
                <DataField label="Bairro" value={getDistrict(selectedUC)} />
                <DataField label="Cidade/UF" value={selectedUC?.addressCity ? `${selectedUC.addressCity} - ${selectedUC.addressState}` : null} />
                <DataField label="CEP" value={selectedUC?.addressPostalCode} />
                <DataField label="Distribuidora" value={selectedUC?.distributor?.alias} />
              </InfoCard>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <InfoCard title="Contato" icon={<ContactPhoneIcon />}>
                <DataField label="E-mails" value={getEmail(selectedUC)} />
                <DataField label="Telefones" value={getPhone(selectedUC)} />
                <DataField label="Parceiro" value={selectedUC?.voucher?.prospector?.name || selectedUC?.prospector} />
                <DataField label="Contato Comercial" value={selectedUC?.voucher?.prospector?.contactEmail} />
              </InfoCard>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <InfoCard title="Contrato" icon={<AccountBalanceIcon />}>
                <DataField label="Voucher" value={selectedUC?.voucher?.code} />
                <DataField label="Economia" value={selectedUC?.discountEstimative ? `${selectedUC.discountEstimative}%` : null} />
                <DataField label="Metodo Pagamento" value={selectedUC?.paymentMethod} />
                <DataField label="Modo Cobranca" value={selectedUC?.billingMode} />
                <DataField label="Organizacao" value={selectedUC?.organization} />
                <DataField label="CPF/CNPJ" value={selectedUC?.registrationNumber} />
              </InfoCard>
            </Grid>
          </Grid>
        </Paper>
      </Modal>
    </Box>
  );
}

export default Clientes;
