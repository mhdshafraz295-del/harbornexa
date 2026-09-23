import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,

    allowedHosts: true,

    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    host: '0.0.0.0',
    port: 5173,

    allowedHosts: true,

    proxy: {
      '/api': {
        target: 'https://harbornexa-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});