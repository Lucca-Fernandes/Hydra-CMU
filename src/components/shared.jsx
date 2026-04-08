import React, { useState, useCallback } from 'react';
import { Card, CardContent, Stack, Typography, Box, Grid, Chip, Tooltip as MuiTooltip, TextField, Button } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';

export const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const formatNumber = (v) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

export const formatDate = (ds) => {
  if (!ds) return "";
  const d = new Date(ds);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)
    .toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
};

export const formatFullDate = (ds) => {
  if (!ds) return "";
  return new Date(ds).toLocaleDateString('pt-BR');
};

const statusConfigs = {
  'Pago': { color: 'success', label: 'Pago' },
  'Liquidado': { color: 'success', label: 'Liquidado' },
  'Faturado': { color: 'info', label: 'Faturado' },
  'Pendente': { color: 'warning', label: 'Pendente' },
  'Cancelado': { color: 'error', label: 'Cancelado' },
  'Reprovado': { color: 'error', label: 'Reprovado' },
  'Retido': { color: 'default', label: 'Retido' },
  'Disponível': { color: 'secondary', label: 'Disponível' },
  'Vencido': { color: 'error', label: 'Vencido' },
  'Errado': { color: 'error', label: 'Errado' },
  'Simulação': { color: 'default', label: 'Simulação' },
};

export const StatusBadge = ({ status, description }) => {
  const config = statusConfigs[status] || { color: 'default', label: status };
  const badge = <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 'bold', fontSize: '0.65rem' }} />;
  if (description) {
    return <MuiTooltip title={description} arrow placement="top"><span>{badge}</span></MuiTooltip>;
  }
  return badge;
};

export const KPICard = ({ title, value, icon, color = "primary.main", subtitle }) => (
  <Card variant="outlined" sx={{ height: '100%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderRadius: '12px' }}>
    <CardContent sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
        {React.cloneElement(icon, { sx: { color, fontSize: 18 } })}
        <Typography variant="overline" sx={{ lineHeight: 1, fontWeight: 'bold', color: 'text.secondary', fontSize: '0.65rem' }}>{title}</Typography>
      </Stack>
      <Typography variant="h6" fontWeight="800">{value}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>{subtitle}</Typography>}
    </CardContent>
  </Card>
);

export const InfoCard = ({ title, icon, children }) => (
  <Card variant="outlined" sx={{ borderRadius: '12px', height: '100%', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
    <Box sx={{ p: 2, bgcolor: '#f8f9fa', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 1 }}>
      {React.cloneElement(icon, { sx: { color: 'primary.main', fontSize: 18 } })}
      <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{title}</Typography>
    </Box>
    <CardContent sx={{ p: 2 }}><Grid container spacing={1.5}>{children}</Grid></CardContent>
  </Card>
);

export const PeriodFilter = ({ onApply, extraFilters }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const apply = useCallback((s, e) => {
    onApply({ startDate: s || undefined, endDate: e || undefined });
  }, [onApply]);

  const handleStart = (e) => {
    const v = e.target.value ? e.target.value + '-01' : '';
    setStartDate(v);
    apply(v, endDate);
  };

  const handleEnd = (e) => {
    const v = e.target.value ? e.target.value + '-28' : '';
    setEndDate(v);
    apply(startDate, v);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    onApply({});
  };

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField
        type="month" size="small" label="De" value={startDate ? startDate.substring(0, 7) : ''}
        onChange={handleStart}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 155 }}
      />
      <TextField
        type="month" size="small" label="Ate" value={endDate ? endDate.substring(0, 7) : ''}
        onChange={handleEnd}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 155 }}
      />
      {extraFilters}
      {(startDate || endDate) && (
        <Button variant="text" size="small" startIcon={<ClearIcon />} onClick={handleClear} sx={{ textTransform: 'none', color: 'text.secondary' }}>Limpar</Button>
      )}
    </Stack>
  );
};

export const PlaceholderCard = ({ title, source, description }) => (
  <Card variant="outlined" sx={{ borderRadius: '12px', border: '2px dashed #ccc', bgcolor: '#fafafa', height: '100%' }}>
    <CardContent sx={{ p: 3, textAlign: 'center' }}>
      <Typography variant="subtitle1" fontWeight="700" color="text.secondary">{title}</Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        Aguardando integracao com {source}
      </Typography>
      {description && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
          {description}
        </Typography>
      )}
    </CardContent>
  </Card>
);

export const DataField = ({ label, value }) => (
  <Grid size={12}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: '700', textTransform: 'uppercase', fontSize: '0.6rem', display: 'block' }}>{label}</Typography>
    <Typography variant="body2" fontWeight="500" sx={{ fontSize: '0.8rem', color: '#444' }}>{value || '---'}</Typography>
  </Grid>
);
