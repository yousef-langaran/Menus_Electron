import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ['typescript'],
        },
      },
    }),
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    open: false, // Don't open browser automatically
  },
  build: {
    outDir: 'dist-react',
    emptyOutDir: true,
  },
  root: '.', // Ensure root is current directory
  define: {
    'process.env': {},
  },
});

