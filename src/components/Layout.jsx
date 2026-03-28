import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HubIcon from '@mui/icons-material/Hub';
import { useNavigate, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 230;

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Clientes', path: '/clientes', icon: <PeopleIcon /> },
  { label: 'Inadimplência', path: '/inadimplencia', icon: <WarningAmberIcon /> },
  { label: 'Rateio', path: '/rateio', icon: <HubIcon /> },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            bgcolor: '#0d1b2a',
            color: '#fff',
            borderRight: 'none',
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: 1.5 }}>
          <Typography variant="h6" fontWeight="900" sx={{ color: '#fff', letterSpacing: 1 }}>
            SOLATIO
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            Power Analytics
          </Typography>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 1 }} />
        <List sx={{ px: 1 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <ListItemButton
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: '10px',
                  mb: 0.5,
                  bgcolor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                }}
              >
                <ListItemIcon sx={{ color: active ? '#64b5f6' : 'rgba(255,255,255,0.5)', minWidth: 36 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.85rem',
                    fontWeight: active ? 700 : 500,
                    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#f4f6f8', minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
