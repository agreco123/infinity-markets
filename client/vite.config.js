import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuild: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
