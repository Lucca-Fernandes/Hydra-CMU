import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Financeiro from './pages/Financeiro';
import Energia from './pages/Energia';
import Clientes from './pages/Clientes';
import Inadimplencia from './pages/Inadimplencia';
import SyncLogs from './pages/SyncLogs';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
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
            <Route path="/sync" element={<SyncLogs />} />
          </Routes>
        </Layout>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
