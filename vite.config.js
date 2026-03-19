import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // vite.config.js
server: {
  proxy: {
    '/api-solatio': {
      target: 'https://dev-server.solatioenergialivre.com.br', // Volte para a URL de dev
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\/api-solatio/, ''),
    },
  },
},
});