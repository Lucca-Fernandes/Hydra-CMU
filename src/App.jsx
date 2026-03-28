import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Inadimplencia from './pages/Inadimplencia';
import Rateio from './pages/Rateio';

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
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/inadimplencia" element={<Inadimplencia />} />
            <Route path="/rateio" element={<Rateio />} />
          </Routes>
        </Layout>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
