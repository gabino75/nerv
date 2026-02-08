/**
 * Playwright configuration for NERV E2E tests
 * Tests the Electron app in a headless environment
 */

import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built Electron app
const electronAppPath = path.join(__dirname, '../../out/main/index.js');

// Detect if running Claude integration tests (need longer timeouts)
const isClaudeTest = process.argv.some(arg => arg.includes('claude-integration'));
const testTimeout = isClaudeTest
  ? parseInt(process.env.NERV_CLAUDE_TIMEOUT || '3600000')  // 1 hour for Claude tests
  : 60000;  // 1 minute for UI tests

// Detect Docker environment (first Electron launch can be slow)
const isDocker = process.env.NODE_ENV === 'test' || process.env.NERV_TEST_MODE === 'true';
const workerCount = isDocker ? 1 : undefined;  // Serial in Docker, parallel locally

export default defineConfig({
  testDir: '.',

  // Test timeout - longer for Claude integration tests
  timeout: testTimeout,

  // Workers - serial in Docker to avoid first-launch timing issues
  workers: workerCount,

  // Expect timeout for assertions
  expect: {
    timeout: isClaudeTest ? 30000 : 10000,  // Longer for Claude tests
  },

  // Run sequentially - Claude tests shouldn't run in parallel
  fullyParallel: false,

  // No retries for Claude tests (expensive), 2 for UI tests in CI
  retries: isClaudeTest ? 0 : (process.env.CI ? 2 : 0),

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: '../test-results/html' }],
    ['json', { outputFile: '../test-results/results.json' }],
  ],

  // Global settings
  use: {
    // Trace - always on for benchmark tests, first-retry for others
    trace: process.env.NERV_RECORD_ALL === 'true' ? 'on' : 'on-first-retry',

    // Screenshot - always for benchmark/slow mode
    screenshot: process.env.NERV_RECORD_ALL === 'true' ? 'on' : 'only-on-failure',

    // Video recording - always on for benchmark/slow mode, first-retry otherwise
    video: process.env.NERV_RECORD_ALL === 'true' ? 'on' : 'on-first-retry',
  },

  // Output directory for test artifacts
  outputDir: '../test-results/artifacts',

  // Projects - we test the Electron app
  projects: [
    {
      name: 'electron',
      use: {
        // Custom Electron configuration
        // We'll use _electron from Playwright
      },
    },
  ],
});

/**
 * Electron app launch configuration
 * Used in test files to launch the app
 */
export const electronConfig = {
  // Path to main entry point
  main: electronAppPath,

  // Arguments to pass to Electron
  args: ['--no-sandbox', '--disable-gpu'],

  // Environment variables
  env: {
    NODE_ENV: 'test',
    NERV_TEST_MODE: 'true',
    NERV_MOCK_CLAUDE: process.env.NERV_MOCK_CLAUDE || 'true',
  },

  // Timeout for app launch
  timeout: 30000,
};
