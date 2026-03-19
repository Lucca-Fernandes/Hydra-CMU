import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Clientes from './pages/Clientes';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Clientes />
    </ThemeProvider>
  );
}

export default App;