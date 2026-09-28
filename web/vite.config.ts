import http from 'node:http';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Without an agent the proxy opens a new connection per request and sends `Connection: close`, which
 * also closes the browser's connection each time. A long "Sim to…" then runs Windows out of ports.
 */
const agent = new http.Agent({ keepAlive: true });
const DATA = { target: 'http://127.0.0.1:5174', changeOrigin: true, agent };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': DATA,
      '/logos': DATA,
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**'],
  },
});
