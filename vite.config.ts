import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
      '@data': path.resolve(__dirname, '../data'),
      '@config': path.resolve(__dirname, '../config'),
    }
  },
  server: {
    fs: {
      // Allow importing JSON from parent directories (development/data, development/config)
      allow: [path.resolve(__dirname, '..')]
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['e2e/**', 'test-results/**']
  }
});