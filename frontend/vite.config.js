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
    // Perf 2026-04-25 — split heavy vendor code out of the main bundle
    // so first-paint downloads only what it needs. lucide-react has
    // 141 importers across the app; React + react-dom + react-router
    // stay in their own chunk so a route change keeps them cached
    // separately from the app code; xlsx (~330 KB) lands only on the
    // /import wizard; leaflet only on /map; joyride only when an
    // AGENT runs a tour.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/lucide-react/')) return 'lucide';
          if (id.includes('/react-router')) return 'react-router';
          if (id.includes('/react-dom/') || id.match(/\/react\/[^/]*$/)) return 'react';
          if (id.includes('/leaflet') || id.includes('/react-leaflet')) return 'maps';
          if (id.includes('/xlsx/')) return 'xlsx';
          if (id.includes('/posthog-js/')) return 'analytics';
          if (id.includes('/react-joyride/')) return 'joyride';
          if (id.includes('@capacitor')) return 'capacitor';
          return undefined;
        },
      },
    },
  },
});
