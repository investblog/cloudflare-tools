import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@background': resolve(__dirname, 'src/background'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
