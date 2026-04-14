import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Paper, Card, CardContent, Stack, Chip, Button,
  CircularProgress, Alert, Divider, IconButton, Tooltip, Switch, FormControlLabel,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Select, MenuItem, TextField,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import StorageIcon from '@mui/icons-material/Storage';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';
import { KPICard } from '../components/shared';
import { BASE_URL } from '../api/api';

const ENDPOINT_ORDER = [
  'EnergyMeters',
  'Contacts',
  'Customers',
  'Prospectors',
  'Vouchers',
  'EnergyMeterBills',
  'EnergyMeterInvoices',
  'EnergyMeterPayments',
];

const LEVEL_COLORS = {
  INFO: { bg: '#e3f2fd', fg: '#0d47a1', label: 'INFO' },
  WARN: { bg: '#fff3e0', fg: '#e65100', label: 'WARN' },
  ERROR: { bg: '#ffebee', fg: '#b71c1c', label: 'ERROR' },
  DEBUG: { bg: '#f3e5f5', fg: '#4a148c', label: 'DEBUG' },
};

const MODE_COLORS = {
  full: { bg: '#e8f5e9', fg: '#1b5e20' },
  incremental: { bg: '#e3f2fd', fg: '#0d47a1' },
};

function formatRelative(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (isNaN(d)) return 'nunca';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'agora';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const dy = Math.floor(h / 24);
  if (dy < 30) return `${dy}d atrás`;
  const mo = Math.floor(dy / 30);
  return `${mo}mês atrás`;
}

function formatFullDate(iso) {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch { return iso; }
}

function classifyEndpoint(row) {
  const last = row.last_sync_completed_at;
  const updated = row.updated_at;
  if (!last) return { key: 'never', label: 'Nunca', color: 'default', icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> };
  const diffMin = (Date.now() - new Date(last).getTime()) / 60000;
  const updatedMin = updated ? (Date.now() - new Date(updated).getTime()) / 60000 : null;
  if (updatedMin !== null && updatedMin < 2 && diffMin > 2) {
    return { key: 'running', label: 'Rodando', color: 'info', icon: <HourglassTopIcon sx={{ fontSize: 14 }} /> };
  }
  if (diffMin < 60) return { key: 'recent', label: 'Recente', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> };
  if (diffMin < 24 * 60) return { key: 'today', label: 'Hoje', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> };
  if (diffMin < 7 * 24 * 60) return { key: 'week', label: 'Esta semana', color: 'warning', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> };
  return { key: 'stale', label: 'Desatualizado', color: 'error', icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} /> };
}

async function apiGet(path) {
  const r = await fetch(`${BASE_URL}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function StatusChip({ cls }) {
  return (
    <Chip
      size="small"
      icon={cls.icon}
      label={cls.label}
      color={cls.color}
      sx={{ fontSize: '0.65rem', fontWeight: 700, height: 22 }}
    />
  );
}

function ModeChip({ mode }) {
  const cfg = MODE_COLORS[mode] || { bg: '#eee', fg: '#555' };
  return (
    <Chip
      size="small"
      label={(mode || '---').toUpperCase()}
      sx={{ bgcolor: cfg.bg, color: cfg.fg, fontSize: '0.6rem', fontWeight: 800, height: 20 }}
    />
  );
}

function LevelChip({ level }) {
  const cfg = LEVEL_COLORS[level?.toUpperCase()] || { bg: '#eee', fg: '#555', label: level || '---' };
  return (
    <Chip
      size="small"
      label={cfg.label}
      sx={{ bgcolor: cfg.bg, color: cfg.fg, fontSize: '0.6rem', fontWeight: 800, height: 18, minWidth: 50 }}
    />
  );
}

function ControlTable({ rows, loading }) {
  const ordered = useMemo(() => {
    if (!rows) return [];
    const byName = Object.fromEntries(rows.map((r) => [r.endpoint_name, r]));
    const known = ENDPOINT_ORDER.filter((n) => byName[n]).map((n) => byName[n]);
    const extras = rows.filter((r) => !ENDPOINT_ORDER.includes(r.endpoint_name));
    return [...known, ...extras];
  }, [rows]);

  if (loading && !rows?.length) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!rows?.length) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        Nenhum endpoint registrado em <code>sync_control</code>. Rode <code>node sync_v2.js --full</code> para começar.
      </Alert>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', boxShadow: 'none' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8f9fa' }}>
            <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Endpoint</TableCell>
            <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Status</TableCell>
            <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Modo</TableCell>
            <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Última página</TableCell>
            <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Concluído em</TableCell>
            <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary' }}>Atualizado em</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ordered.map((row) => {
            const cls = classifyEndpoint(row);
            return (
              <TableRow key={row.endpoint_name} hover>
                <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>{row.endpoint_name}</TableCell>
                <TableCell><StatusChip cls={cls} /></TableCell>
                <TableCell><ModeChip mode={row.sync_mode} /></TableCell>
                <TableCell align="right" sx={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {row.last_page_processed ?? '---'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.72rem' }}>
                  <Tooltip title={formatFullDate(row.last_sync_completed_at)} arrow>
                    <span>{formatRelative(row.last_sync_completed_at)}</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                  <Tooltip title={formatFullDate(row.updated_at)} arrow>
                    <span>{formatRelative(row.updated_at)}</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function RunsTable({ runs, loading }) {
  if (loading && !runs?.length) {
    return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} /></Box>;
  }
  if (!runs?.length) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        Nenhuma execução registrada em <code>sync_runs</code>. Esta tabela é populada por versões antigas do sync — o <code>sync_v2.js</code> atual usa apenas <code>sync_control</code>.
      </Alert>
    );
  }
  const columns = Object.keys(runs[0]);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', boxShadow: 'none', maxHeight: 500 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c} sx={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary', bgcolor: '#f8f9fa' }}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((r, idx) => (
            <TableRow key={r.id ?? idx} hover>
              {columns.map((c) => {
                const v = r[c];
                const display = v === null || v === undefined ? '---' :
                  typeof v === 'object' ? JSON.stringify(v) :
                  (c.includes('_at') || c.includes('date')) && typeof v === 'string' ? formatFullDate(v) :
                  String(v);
                return (
                  <TableCell key={c} sx={{ fontSize: '0.72rem', fontFamily: c === 'id' ? 'ui-monospace, Menlo, monospace' : undefined }}>
                    {display}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function LogsStream({ logs, loading, level, setLevel }) {
  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={1.5}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
          Nível:
        </Typography>
        <Select size="small" value={level} onChange={(e) => setLevel(e.target.value)} sx={{ fontSize: '0.75rem', minWidth: 110 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="INFO">INFO</MenuItem>
          <MenuItem value="WARN">WARN</MenuItem>
          <MenuItem value="ERROR">ERROR</MenuItem>
          <MenuItem value="DEBUG">DEBUG</MenuItem>
        </Select>
        {loading && <CircularProgress size={14} />}
      </Stack>
      {!logs?.length ? (
        <Alert severity="info">
          Nenhum log em <code>sync_logs</code>. O <code>sync_v2.js</code> atual escreve logs apenas no console — para persistir, adicione inserts em <code>sync_logs</code>.
        </Alert>
      ) : (
        <Box sx={{ maxHeight: 500, overflow: 'auto', borderRadius: 2, border: '1px solid #e0e0e0' }}>
          {logs.map((log, idx) => (
            <Box
              key={log.id ?? idx}
              sx={{
                display: 'flex', gap: 1.5, px: 1.5, py: 0.75,
                borderBottom: '1px solid #f0f0f0',
                fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.72rem',
                '&:hover': { bgcolor: '#fafafa' },
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.disabled', minWidth: 130, fontSize: '0.68rem' }}>
                {formatFullDate(log.created_at)}
              </Typography>
              <LevelChip level={log.level} />
              {log.endpoint_name && (
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, minWidth: 130 }}>
                  [{log.endpoint_name}]
                </Typography>
              )}
              <Typography variant="caption" sx={{ flex: 1, color: '#333', wordBreak: 'break-word' }}>
                {log.message}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function SyncLogs() {
  const [control, setControl] = useState([]);
  const [controlLoading, setControlLoading] = useState(true);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [level, setLevel] = useState('');

  const [tab, setTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [ctrl, runsData, logsData] = await Promise.allSettled([
        apiGet('/sync/control'),
        apiGet('/sync/runs?limit=30'),
        apiGet(`/sync/logs/recent?limit=200${level ? `&level=${level}` : ''}`),
      ]);
      if (ctrl.status === 'fulfilled') setControl(Array.isArray(ctrl.value) ? ctrl.value : []);
      if (runsData.status === 'fulfilled') setRuns(Array.isArray(runsData.value) ? runsData.value : []);
      if (logsData.status === 'fulfilled') setLogs(Array.isArray(logsData.value) ? logsData.value : []);

      const failed = [ctrl, runsData, logsData].filter((r) => r.status === 'rejected');
      if (failed.length === 3) {
        setError('Backend offline ou banco inacessível');
      }
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setControlLoading(false);
      setRunsLoading(false);
      setLogsLoading(false);
    }
  }, [level]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { loadAll(); }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadAll]);

  const kpis = useMemo(() => {
    const total = control.length;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const recentCount = control.filter((r) => {
      if (!r.last_sync_completed_at) return false;
      return now - new Date(r.last_sync_completed_at).getTime() < dayMs;
    }).length;
    const neverCount = control.filter((r) => !r.last_sync_completed_at).length;
    const staleCount = control.filter((r) => {
      if (!r.last_sync_completed_at) return false;
      return now - new Date(r.last_sync_completed_at).getTime() > 7 * dayMs;
    }).length;
    const lastGlobal = control
      .map((r) => r.last_sync_completed_at)
      .filter(Boolean)
      .sort()
      .pop();
    return { total, recentCount, neverCount, staleCount, lastGlobal };
  }, [control]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5} flexWrap="wrap" useFlexGap>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SyncIcon sx={{ color: 'primary.main', fontSize: 26 }} />
          <Typography variant="h5" fontWeight="900">Sync Logs</Typography>
          <Chip
            label={lastUpdate ? `atualizado ${formatRelative(lastUpdate.toISOString())}` : 'carregando...'}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem' }}
          />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />}
            label={<Typography variant="caption" fontWeight="700">Auto-refresh (5s)</Typography>}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadAll}
            sx={{ textTransform: 'none' }}
          >
            Atualizar
          </Button>
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Progresso e histórico do sync CMU Solatio → Postgres.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} mb={2.5}>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Endpoints"
            value={kpis.total}
            icon={<StorageIcon />}
            color="#1976d2"
            subtitle={`${ENDPOINT_ORDER.length} esperados`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Sincronizados (24h)"
            value={kpis.recentCount}
            icon={<CheckCircleIcon />}
            color="#2e7d32"
            subtitle="com sucesso"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Nunca sincronizados"
            value={kpis.neverCount}
            icon={<WarningAmberIcon />}
            color="#ed6c02"
            subtitle="aguardando primeiro run"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KPICard
            title="Desatualizados"
            value={kpis.staleCount}
            icon={<ErrorOutlineIcon />}
            color="#d32f2f"
            subtitle="> 7 dias"
          />
        </Grid>
      </Grid>

      {kpis.lastGlobal && (
        <Alert
          icon={<InfoOutlinedIcon fontSize="small" />}
          severity="info"
          sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { fontSize: '0.78rem' } }}
        >
          Último sync global concluído em <strong>{formatFullDate(kpis.lastGlobal)}</strong> ({formatRelative(kpis.lastGlobal)})
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: '12px' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab
            icon={<StorageIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Controle (${control.length})`}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
          />
          <Tab
            icon={<HistoryIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Execuções (${runs.length})`}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
          />
          <Tab
            icon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Logs recentes (${logs.length})`}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
          />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && <ControlTable rows={control} loading={controlLoading} />}
          {tab === 1 && <RunsTable runs={runs} loading={runsLoading} />}
          {tab === 2 && (
            <LogsStream
              logs={logs}
              loading={logsLoading}
              level={level}
              setLevel={setLevel}
            />
          )}
        </Box>
      </Paper>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
        Fontes: <code>/api/sync/control</code>, <code>/api/sync/runs</code>, <code>/api/sync/logs/recent</code>. Para rodar um sync: <code>cd sync-service && node sync_v2.js</code> (incremental) ou <code>--full</code>.
      </Typography>
    </Box>
  );
}
