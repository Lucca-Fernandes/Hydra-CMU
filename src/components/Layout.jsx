import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider, Chip } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BoltIcon from '@mui/icons-material/Bolt';
import PeopleIcon from '@mui/icons-material/People';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SyncIcon from '@mui/icons-material/Sync';
import ApiIcon from '@mui/icons-material/Api';
import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useNavigate, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 244;

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Financeiro', path: '/financeiro', icon: <AttachMoneyIcon /> },
  { label: 'Energia', path: '/energia', icon: <BoltIcon /> },
  { label: 'Clientes', path: '/clientes', icon: <PeopleIcon /> },
  { label: 'Inadimplência', path: '/inadimplencia', icon: <WarningAmberIcon /> },
  { label: 'UAU API', path: '/uau-api', icon: <ApiIcon /> },
  { label: 'Financeiro 2.0', path: '/financeiro-2', icon: <AccountBalanceIcon /> },
  { label: 'Financeiro 3.0', path: '/financeiro-3', icon: <TrendingUpIcon />, highlight: true, badge: '3.0' },
  { label: 'Sync Logs', path: '/sync', icon: <SyncIcon /> },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            border: 'none',
            background: 'linear-gradient(180deg, #0d1426 0%, #0a0f1e 100%)',
            color: '#e8edf7',
            borderRight: '1px solid rgba(148,163,184,0.10)',
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              width: 34, height: 34, borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #22c55e 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(56,189,248,0.35)',
            }}>
              <BoltIcon sx={{ color: '#0a0f1e', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight="900" sx={{ color: '#fff', lineHeight: 1, letterSpacing: 0.5 }}>
                SOLATIO
              </Typography>
              <Typography variant="caption" sx={{ color: '#64b5f6', fontWeight: 600, fontSize: '0.62rem', letterSpacing: 1 }}>
                POWER ANALYTICS
              </Typography>
            </Box>
          </Box>
        </Box>
        <Divider sx={{ borderColor: 'rgba(148,163,184,0.10)', mb: 1 }} />
        <List sx={{ px: 1.25 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <ListItemButton
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: '11px',
                  mb: 0.4,
                  py: 0.9,
                  position: 'relative',
                  bgcolor: active ? 'rgba(56,189,248,0.12)' : 'transparent',
                  '&:hover': { bgcolor: active ? 'rgba(56,189,248,0.16)' : 'rgba(148,163,184,0.08)' },
                  '&::before': active ? {
                    content: '""', position: 'absolute', left: 0, top: '20%', height: '60%', width: 3,
                    borderRadius: 4, background: 'linear-gradient(180deg,#38bdf8,#22c55e)',
                  } : {},
                }}
              >
                <ListItemIcon sx={{ color: active ? '#38bdf8' : '#64748b', minWidth: 38 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.84rem',
                    fontWeight: active ? 800 : 600,
                    color: active ? '#fff' : '#94a3b8',
                  }}
                />
                {item.highlight && !active && (
                  <Chip label={item.badge || '2.0'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(34,197,94,0.18)', color: '#22c55e', fontWeight: 800 }} />
                )}
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.default', minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
