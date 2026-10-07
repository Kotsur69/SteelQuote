import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests for pure modules (lib/access rule engine, routing, scope). No DB, no Next runtime.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
});
