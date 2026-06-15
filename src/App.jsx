import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Financeiro from './pages/Financeiro';
import Energia from './pages/Energia';
import Clientes from './pages/Clientes';
import Inadimplencia from './pages/Inadimplencia';
import SyncLogs from './pages/SyncLogs';
import UauApi from './pages/UauApi';
import GestaoDesembolso from './pages/GestaoDesembolso';
import Financeiro2 from './pages/Financeiro2';
import Financeiro3 from './pages/Financeiro3';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#38bdf8' },     // sky — acento principal
    secondary: { main: '#22c55e' },   // verde — positivo / energia
    success: { main: '#22c55e' },
    warning: { main: '#f59e0b' },
    error: { main: '#f87171' },
    info: { main: '#818cf8' },
    background: { default: '#0a0f1e', paper: '#121a2e' },
    divider: 'rgba(148,163,184,0.14)',
    text: { primary: '#e8edf7', secondary: '#94a3b8' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 800, letterSpacing: -0.3 },
    h6: { fontWeight: 800 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(148,163,184,0.12)',
          backgroundColor: '#121a2e',
        },
      },
    },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, borderRadius: 10 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/energia" element={<Energia />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/inadimplencia" element={<Inadimplencia />} />
            <Route path="/uau-api" element={<UauApi />} />
            <Route path="/financeiro-2" element={<Financeiro2 />} />
            <Route path="/financeiro-3" element={<Financeiro3 />} />
            <Route path="/gestao-desembolso" element={<GestaoDesembolso />} />
            <Route path="/sync" element={<SyncLogs />} />
          </Routes>
        </Layout>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
