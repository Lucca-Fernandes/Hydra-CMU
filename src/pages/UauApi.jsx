import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button,
  TextField, CircularProgress, Alert, Divider, IconButton, Tooltip, Tabs, Tab,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ApiIcon from '@mui/icons-material/Api';
import BusinessIcon from '@mui/icons-material/Business';
import ConstructionIcon from '@mui/icons-material/Construction';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { KPICard } from '../components/shared';
import { BASE_URL } from '../api/api';

const RF_COLORS = {
  RF01: '#0288d1',
  RF02: '#2e7d32',
  RF04: '#ed6c02',
  MASTER: '#6a1b9a',
  DISCOVERY: '#757575',
};

const STATUS_CONFIG = {
  ok: { label: 'OK', color: '#2e7d32', bg: '#e8f5e9' },
  params: { label: 'PRECISA PARAMS', color: '#ed6c02', bg: '#fff3e0' },
  slow: { label: 'LENTO / TIMEOUT', color: '#c62828', bg: '#ffebee' },
  missing: { label: '404', color: '#616161', bg: '#f5f5f5' },
};

async function apiGet(path) {
  const r = await fetch(`${BASE_URL}${path}`);
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function apiPost(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

function JsonViewer({ data, maxHeight = 360 }) {
  const text = useMemo(() => {
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }, [data]);
  const copy = () => navigator.clipboard?.writeText(text);
  return (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title="Copiar">
        <IconButton size="small" onClick={copy} sx={{ position: 'absolute', top: 6, right: 6, zIndex: 1, bgcolor: 'rgba(255,255,255,0.8)' }}>
          <ContentCopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0, p: 2, bgcolor: '#0d1b2a', color: '#e0e0e0',
          borderRadius: 2, fontSize: '0.72rem', lineHeight: 1.5,
          maxHeight, overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

function StatusCard({ status, onRefresh }) {
  const connected = status?.connected;
  const color = connected ? 'success.main' : 'error.main';
  const Icon = connected ? CheckCircleIcon : ErrorIcon;
  return (
    <Card variant="outlined" sx={{ borderRadius: '12px', borderColor: connected ? 'success.light' : 'error.light' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Icon sx={{ color, fontSize: 20 }} />
            <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
              Conexao UAU
            </Typography>
          </Stack>
          <Button size="small" startIcon={<RefreshIcon />} onClick={onRefresh} sx={{ textTransform: 'none' }}>
            Atualizar
          </Button>
        </Stack>
        {connected ? (
          <Stack spacing={0.5}>
            <Row label="Base URL" value={status.baseUrl} />
            <Row label="Usuario" value={status.user} />
            <Row label="Token" value={status.tokenPreview} mono />
            <Row label="Expira em" value={status.tokenExpiresAt ? new Date(status.tokenExpiresAt).toLocaleString('pt-BR') : ''} />
          </Stack>
        ) : (
          <Alert severity="error" sx={{ mt: 1 }}>
            <Typography variant="caption" fontWeight="700">Falha: {status?.error || 'desconhecido'}</Typography>
            {status?.data && (
              <Box sx={{ mt: 1 }}><JsonViewer data={status.data} maxHeight={180} /></Box>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="caption" sx={{ minWidth: 80, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: mono ? 'ui-monospace, Menlo, monospace' : undefined, wordBreak: 'break-all' }}>
        {value || '---'}
      </Typography>
    </Stack>
  );
}

function CatalogSection({ catalog, onTest }) {
  if (!catalog?.rfs?.length) return null;
  return (
    <Stack spacing={1.5}>
      {catalog.rfs.map((rf) => (
        <Accordion key={rf.id} defaultExpanded={rf.id === 'MASTER'} disableGutters elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: '12px !important', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Chip
                label={rf.id}
                size="small"
                sx={{ bgcolor: RF_COLORS[rf.id] || '#555', color: '#fff', fontWeight: 800, fontSize: '0.65rem' }}
              />
              <Typography variant="subtitle2" fontWeight="700" sx={{ fontSize: '0.85rem' }}>
                {rf.title}
              </Typography>
              <Chip label={`${rf.endpoints.length} endpoints`} size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pt: 0 }}>
            <Stack spacing={0.75}>
              {rf.endpoints.map((ep) => {
                const st = STATUS_CONFIG[ep.status] || STATUS_CONFIG.missing;
                const isMissing = ep.status === 'missing';
                return (
                  <Paper
                    key={`${ep.controller}.${ep.method}`}
                    variant="outlined"
                    sx={{
                      p: 1.25, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5,
                      opacity: isMissing ? 0.55 : 1,
                      bgcolor: st.bg,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight="800" sx={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                          {ep.controller}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">.</Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, Menlo, monospace', color: 'primary.main' }}>
                          {ep.method}
                        </Typography>
                        <Chip label={st.label} size="small" sx={{ bgcolor: st.color, color: '#fff', fontSize: '0.6rem', height: 18, fontWeight: 700 }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'block', mt: 0.25 }}>
                        {ep.desc}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={isMissing}
                      startIcon={<PlayArrowIcon />}
                      onClick={() => onTest(ep.controller, ep.method, ep.body)}
                      sx={{ textTransform: 'none', fontSize: '0.7rem' }}
                    >
                      Testar
                    </Button>
                  </Paper>
                );
              })}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}

function Explorer({ controller, method, body, setController, setMethod, setBody, onCall, result, loading }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: '12px' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" fontWeight="800" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5 }}>
          Explorer de endpoints
        </Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth size="small" label="Controller" value={controller}
              onChange={(e) => setController(e.target.value)}
              placeholder="Ex: Empresa"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth size="small" label="Method" value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Ex: ObterEmpresasAtivas"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Button
              fullWidth variant="contained" disabled={!controller || !method || loading}
              onClick={onCall} startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
              sx={{ textTransform: 'none', height: 40 }}
            >
              Chamar
            </Button>
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth size="small" label="Body (JSON)" value={body} multiline minRows={3} maxRows={8}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{}'
              slotProps={{ htmlInput: { style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.75rem' } } }}
            />
          </Grid>
          {result && (
            <Grid size={12}>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                <Chip
                  label={result.ok ? `HTTP ${result.status} OK` : `HTTP ${result.status} ERRO`}
                  size="small"
                  color={result.ok ? 'success' : 'error'}
                />
                {result.ok && Array.isArray(result.data?.data) && (
                  <Chip label={`${result.data.data.length} itens`} size="small" variant="outlined" />
                )}
              </Stack>
              <JsonViewer data={result.data} maxHeight={440} />
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}

function GenericTable({ rows, loading }) {
  const columns = useMemo(() => {
    if (!rows?.length) return [];
    const sample = rows[0];
    const keys = Object.keys(sample).slice(0, 8);
    return keys.map((k) => ({
      field: k,
      headerName: k,
      flex: 1,
      minWidth: 140,
      valueGetter: (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
      },
    }));
  }, [rows]);

  const gridRows = useMemo(
    () => (rows || []).map((r, i) => ({ id: r.id ?? r.Id ?? r.codigo ?? r.Codigo ?? i, ...r })),
    [rows]
  );

  return (
    <Box sx={{ height: 440, width: '100%' }}>
      <DataGrid
        rows={gridRows}
        columns={columns}
        loading={loading}
        density="compact"
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
        sx={{ bgcolor: '#fff', borderRadius: '12px', fontSize: '0.75rem' }}
      />
    </Box>
  );
}

export default function UauApi() {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [catalog, setCatalog] = useState(null);

  const [empresas, setEmpresas] = useState(null);
  const [empresasLoading, setEmpresasLoading] = useState(false);
  const [obras, setObras] = useState(null);
  const [obrasLoading, setObrasLoading] = useState(false);

  const [tab, setTab] = useState(0);

  const [controller, setController] = useState('Empresa');
  const [method, setMethod] = useState('ObterEmpresasAtivas');
  const [body, setBody] = useState('{}');
  const [callResult, setCallResult] = useState(null);
  const [callLoading, setCallLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await apiGet('/uau/status');
      setStatus(r.data);
    } catch (e) {
      setStatus({ connected: false, error: e.message });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const r = await apiGet('/uau/catalog');
      setCatalog(r.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadEmpresas = useCallback(async () => {
    setEmpresasLoading(true);
    try {
      const r = await apiGet('/uau/empresas');
      setEmpresas(r.data);
    } catch (e) {
      setEmpresas({ error: e.message });
    } finally {
      setEmpresasLoading(false);
    }
  }, []);

  const loadObras = useCallback(async () => {
    setObrasLoading(true);
    try {
      const r = await apiGet('/uau/obras');
      setObras(r.data);
    } catch (e) {
      setObras({ error: e.message });
    } finally {
      setObrasLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadCatalog();
    loadEmpresas();
    loadObras();
  }, [loadStatus, loadCatalog, loadEmpresas, loadObras]);

  const handleCall = useCallback(async () => {
    setCallLoading(true);
    setCallResult(null);
    let parsedBody = {};
    try {
      parsedBody = body.trim() ? JSON.parse(body) : {};
    } catch {
      setCallResult({ ok: false, status: 0, data: { error: 'Body invalido — JSON mal formado' } });
      setCallLoading(false);
      return;
    }
    try {
      const r = await apiPost('/uau/call', { controller, method, body: parsedBody });
      setCallResult(r);
    } catch (e) {
      setCallResult({ ok: false, status: 0, data: { error: e.message } });
    } finally {
      setCallLoading(false);
    }
  }, [controller, method, body]);

  const handleTest = useCallback((ctrl, mtd, suggestedBody) => {
    setController(ctrl);
    setMethod(mtd);
    setBody(JSON.stringify(suggestedBody || {}, null, 2));
    setCallResult(null);
    setTab(2);
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, []);

  const empresasCount = empresas?.count ?? 0;
  const obrasCount = obras?.count ?? 0;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={0.5}>
        <ApiIcon sx={{ color: 'primary.main', fontSize: 26 }} />
        <Typography variant="h5" fontWeight="900">UAU API</Typography>
        <Chip label="Grupo GVS" size="small" sx={{ bgcolor: '#0d1b2a', color: '#fff', fontWeight: 700 }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Integracao com UAU ERP (Globaltec) — dados financeiros complementares ao CMU para G-Sentinel 2.
      </Typography>

      <Grid container spacing={2} mb={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          {statusLoading && !status ? (
            <Card variant="outlined" sx={{ borderRadius: '12px' }}>
              <CardContent><CircularProgress size={20} /></CardContent>
            </Card>
          ) : (
            <StatusCard status={status} onRefresh={loadStatus} />
          )}
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Empresas ativas"
            value={empresasLoading ? '...' : empresasCount.toLocaleString('pt-BR')}
            icon={<BusinessIcon />}
            color="#2e7d32"
            subtitle="SPEs das usinas GVS"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Obras ativas"
            value={obrasLoading ? '...' : obrasCount.toLocaleString('pt-BR')}
            icon={<ConstructionIcon />}
            color="#ed6c02"
            subtitle="Construcao / manutencao"
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: '12px', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab label="Catalogo G-Sentinel 2" sx={{ textTransform: 'none', fontWeight: 700 }} />
          <Tab label={`Empresas (${empresasCount})`} sx={{ textTransform: 'none', fontWeight: 700 }} />
          <Tab label="Explorer" sx={{ textTransform: 'none', fontWeight: 700 }} />
          <Tab label={`Obras (${obrasCount})`} sx={{ textTransform: 'none', fontWeight: 700 }} />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && (
            <>
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                  <strong>Como funciona:</strong> cada RF mapeia para um conjunto de endpoints UAU que trarao dados financeiros, fiscais e operacionais. Clique em "Testar" para executar e ver a resposta.
                </Typography>
              </Alert>
              <CatalogSection catalog={catalog} onTest={handleTest} />
            </>
          )}

          {tab === 1 && (
            empresas?.error ? (
              <Alert severity="error">Erro: {empresas.error}</Alert>
            ) : (
              <GenericTable rows={empresas?.items || []} loading={empresasLoading} />
            )
          )}

          {tab === 2 && (
            <Explorer
              controller={controller} setController={setController}
              method={method} setMethod={setMethod}
              body={body} setBody={setBody}
              onCall={handleCall} result={callResult} loading={callLoading}
            />
          )}

          {tab === 3 && (
            obras?.error ? (
              <Alert severity="error">Erro: {obras.error}</Alert>
            ) : (
              <GenericTable rows={obras?.items || []} loading={obrasLoading} />
            )
          )}
        </Box>
      </Paper>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
        Auth: <strong>X-INTEGRATION-Authorization</strong> (token fixo) + <strong>Authorization</strong> (token do usuario, sem prefixo Bearer, cache ~50min).
      </Typography>
    </Box>
  );
}
