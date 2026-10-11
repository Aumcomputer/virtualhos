import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            const clientIp = req.socket?.remoteAddress;
            if (clientIp) {
              const existing = req.headers['x-forwarded-for'];
              proxyReq.setHeader('x-forwarded-for', existing ? `${existing}, ${clientIp}` : clientIp);
            }
          });
        },
      },
    },
  },
});
