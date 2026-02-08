import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    // Only lint TypeScript files - Svelte files are checked by svelte-check during build
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.svelte'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Prevent code smell
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console in Electron app
      'prefer-const': 'warn',
      'no-var': 'error',

      // Complexity limits
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],
      'complexity': ['warn', 15],
    },
  },
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', '*.config.js', '*.config.ts', '**/*.svelte'],
  },
];
