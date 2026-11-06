/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
  },
});
