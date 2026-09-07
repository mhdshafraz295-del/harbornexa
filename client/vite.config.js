import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0', // Explicitly bind to all IPv4 and IPv6 interfaces (0.0.0.0)
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    allowedHosts: [
      'gregarious-transformation-production.up.railway.app',
    ],
    proxy: {
      '/api': {
        target: 'https://harbornexa-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
