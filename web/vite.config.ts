import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5174',
      '/logos': 'http://127.0.0.1:5174',
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**'],
  },
});
