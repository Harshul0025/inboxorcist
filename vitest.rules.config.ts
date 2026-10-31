import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
