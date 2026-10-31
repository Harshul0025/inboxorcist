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
        exclude: [
          // Entry points that only wire real dependencies together.
          'src/main.tsx',
          'server/index.ts',
          // Thin wrappers around the Firebase SDK, covered by the rules tests and Playwright raid e2e.
          'src/lib/firebaseApp.ts',
          'src/features/raid/raidService.ts',
          '**/*.d.ts',
        ],
        reporter: ['text', 'html', 'json-summary'],
        thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
      },
    },
  }),
);
