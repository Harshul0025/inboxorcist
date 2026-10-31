import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'web',
            environment: 'jsdom',
            include: ['tests/unit/**/*.test.{ts,tsx}'],
            setupFiles: ['tests/setup.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'server',
            environment: 'node',
            include: ['tests/server/**/*.test.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
        // Only the two entry points that just wire real dependencies together are excluded.
        exclude: ['src/main.tsx', 'server/index.ts', '**/*.d.ts'],
        reporter: ['text', 'html', 'json-summary'],
        thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
      },
    },
  }),
);
