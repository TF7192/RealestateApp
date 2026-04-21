import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:6002',
        changeOrigin: true,
        // Forward WebSocket upgrades (chat widget hits /api/chat/ws). Without
        // this, the upgrade request lands on vite-dev and returns 404, and
        // the frontend reconnect loop spams the console every 3s.
        ws: true,
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY || 'http://localhost:6002',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the built SPA and is what CI uses. It does not
  // inherit `server.proxy` — Vite treats them as separate servers — so
  // mirror the proxy block here. Without this, Playwright's global-setup
  // POST /api/auth/login against the preview baseURL 404s and the whole
  // E2E suite fails at startup.
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:6002',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY || 'http://localhost:6002',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
