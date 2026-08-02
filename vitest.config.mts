import { defineConfig } from 'vitest/config';
import path from 'path';

const rootDir = import.meta.dirname;

// Kept separate from vite.config.ts on purpose: the app config pulls in the
// Tailwind and React-babel plugins, which the unit suite does not need and
// which slow every run down.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/store/**', 'electron/**'],
      exclude: ['**/*.d.ts', 'electron/main.ts', 'electron/preload*.ts'],
    },
  },
});
