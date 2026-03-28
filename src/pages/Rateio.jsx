import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Box, Paper, Grid, Card, CardContent, LinearProgress, Container, Stack, Divider } from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { fetchApi } from '../api/api';

const Rateio = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [usinas] = useState([
    { id: 1, nome: 'Usina Solatio A', capacidadeTotal: 25000 },
    { id: 2, nome: 'Usina Solatio B', capacidadeTotal: 12000 },
    { id: 3, nome: 'Usina Solatio C', capacidadeTotal: 40000 },
  ]);

  useEffect(() => {
    const fetchDados = async () => {
      try {
        const data = await fetchApi('/dados-rateio');
        setClientes(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Erro na API:", error);
        setClientes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDados();
  }, []);

  const resultadoRateio = useMemo(() => {
    if (!clientes || clientes.length === 0) return { plantas: [], sobraram: [] };

    let plantas = usinas.map(u => ({ ...u, ocupacaoAtual: 0, clientes: [] }));
    const sobraram = [];

    clientes.forEach(cliente => {
      const consumo = parseFloat(cliente.average_consumption || cliente.contractConsumption || 0);
      const usinaDestino = plantas.find(p => (p.capacidadeTotal - p.ocupacaoAtual) >= consumo);

      if (usinaDestino) {
        usinaDestino.ocupacaoAtual += consumo;
        usinaDestino.clientes.push({ nome: cliente.name, consumo });
      } else {
        sobraram.push({ nome: cliente.name, consumo });
      }
    });

    return { plantas, sobraram };
  }, [clientes, usinas]);

  if (loading) return <Box sx={{ p: 5 }}><Typography variant="h6">Processando Logistica de Rateio Solatio...</Typography></Box>;

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Container maxWidth="xl" sx={{ flexGrow: 1, p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h5" fontWeight="900" color="#1a237e" mb={0.5}>Rateio</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Distribuicao baseada no Consumo Medio Real dos clientes contra a Capacidade de Geracao das Usinas.
        </Typography>

        <Grid container spacing={3}>
          {resultadoRateio.plantas.map((plant, idx) => {
            const porcentagemOcupacao = (plant.ocupacaoAtual / plant.capacidadeTotal) * 100;
            const disponivel = plant.capacidadeTotal - plant.ocupacaoAtual;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
                <Card sx={{
                  borderRadius: '20px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
                  border: '1px solid #e0e0e0',
                  transition: '0.3s',
                  '&:hover': { boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }
                }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                      <HubIcon sx={{ color: '#1a237e', fontSize: 30 }} />
                      <Typography variant="h6" fontWeight="700">{plant.nome}</Typography>
                    </Stack>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>Capacidade Ocupada</Typography>
                      <Typography variant="h5" fontWeight="800">
                        {plant.ocupacaoAtual.toFixed(0)} <span style={{ fontSize: '1rem', color: 'gray' }}>kWh</span>
                      </Typography>
                    </Box>

                    <LinearProgress
                      variant="determinate"
                      value={Math.min(porcentagemOcupacao, 100)}
                      sx={{
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: '#e0e0e0',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: porcentagemOcupacao > 90 ? '#ef5350' : '#4caf50'
                        }
                      }}
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {disponivel.toFixed(0)} kWh livres
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Meta: {plant.capacidadeTotal} kWh
                      </Typography>
                    </Box>

                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2">
                      <b>{plant.clientes.length}</b> clientes alocados nesta usina.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {resultadoRateio.sobraram.length > 0 && (
          <Paper sx={{ p: 3, mt: 4, bgcolor: '#fff4f4', borderRadius: '15px', border: '1px solid #feb2b2', display: 'flex', alignItems: 'center', gap: 2 }}>
            <ErrorOutlineIcon color="error" fontSize="large" />
            <Box>
              <Typography variant="h6" color="error" fontWeight="bold">Clientes Sem Usina Disponivel!</Typography>
              <Typography variant="body2">
                Ha {resultadoRateio.sobraram.length} clientes que nao couberam na distribuicao deste mes devido ao limite total de carga das usinas atuais.
              </Typography>
            </Box>
          </Paper>
        )}
      </Container>
    </Box>
  );
};

export default Rateio;
