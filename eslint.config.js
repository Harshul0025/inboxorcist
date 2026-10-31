import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Conflicts with no-non-null-assertion from the strict preset.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      // Test doubles: supertest bodies and vi.fn() mocks are loosely typed by design.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
