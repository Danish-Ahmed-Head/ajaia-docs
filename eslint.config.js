import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'data/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright specs run in Node but pass callbacks that execute inside the browser (page.evaluate).
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
