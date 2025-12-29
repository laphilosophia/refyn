import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: resolve(__dirname, '../../'),
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@refyn/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@refyn/core/src': resolve(__dirname, '../../packages/core/src'),
    },
  },
  optimizeDeps: {
    exclude: ['@refyn/core'],
  },
  worker: {
    format: 'es',
  },
});
