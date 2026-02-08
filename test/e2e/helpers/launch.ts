/**
 * NERV E2E Test Launch Utilities
 *
 * Functions for launching and managing the Electron app in tests.
 */

import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import os from 'os'
import { fileURLToPath } from 'url'
import { TIMEOUT, CONFIG } from './selectors'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths
const MAIN_PATH = path.join(__dirname, '../../../out/main/index.js')
const LOG_DIR = path.join(__dirname, '../../../test-results/benchmark')

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

/**
 * Test context returned by launchNervBenchmark
 */
export interface TestContext {
  app: ElectronApplication
  window: Page
  testRepoPath: string
}

/**
 * Structured logging for parseable output
 */
export function log(
  level: 'info' | 'step' | 'check' | 'pass' | 'fail',
  message: string,
  data?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString().substr(11, 12)
  const prefix = { info: '  ', step: '→', check: '?', pass: '✓', fail: '✗' }[level]
  const dataStr = data ? ` ${JSON.stringify(data)}` : ''
  console.log(`[${timestamp}] ${prefix} ${message}${dataStr}`)
}

/**
 * Wait helper that respects slow mode
 */
export async function slowWait(page: Page, label: string, ms: number = CONFIG.slowDelay): Promise<void> {
  if (CONFIG.slowMode) {
    log('info', `Pause: ${label}`, { ms })
    await page.waitForTimeout(ms)
  }
}

/**
 * Short pause for micro-actions (visible but quick)
 */
export async function microWait(page: Page): Promise<void> {
  if (CONFIG.slowMode) {
    await page.waitForTimeout(CONFIG.microDelay)
  }
}

/**
 * Create a temporary git repository for testing worktree creation
 */
export function createTestRepo(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-test-repo-'))

  // Initialize git repo with explicit main branch
  execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.email "test@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.name "NERV Test"', { cwd: tempDir, stdio: 'pipe' })

  // Create initial commit
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repo\n')
  execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' })

  // Verify repo was created correctly
  const branch = execSync('git branch --show-current', { cwd: tempDir, stdio: 'pipe' }).toString().trim()
  if (branch !== 'main') {
    console.log(`Warning: Branch is ${branch}, not main`)
  }

  return tempDir
}

/**
 * Clean up test repository
 */
export function cleanupTestRepo(repoPath: string): void {
  try {
    // Remove any worktrees first
    const worktreesDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`)
    if (fs.existsSync(worktreesDir)) {
      fs.rmSync(worktreesDir, { recursive: true, force: true })
    }
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch (e) {
    console.error(`Failed to cleanup test repo: ${e}`)
  }
}

// Module-level tracking for afterEach cleanup
let _currentApp: ElectronApplication | null = null
let _currentTestRepoPath: string | null = null
let _currentTestRepoPath2: string | null = null

/**
 * Get current app reference (for afterEach cleanup)
 */
export function getCurrentApp(): ElectronApplication | null {
  return _currentApp
}

/**
 * Get current test repo path (for afterEach cleanup)
 */
export function getCurrentTestRepoPath(): string | null {
  return _currentTestRepoPath
}

/**
 * Get second test repo path (for afterEach cleanup)
 */
export function getCurrentTestRepoPath2(): string | null {
  return _currentTestRepoPath2
}

/**
 * Clear all tracking references (for afterEach cleanup)
 */
export function clearTrackingRefs(): void {
  _currentApp = null
  _currentTestRepoPath = null
  _currentTestRepoPath2 = null
}

/**
 * Register test repo for cleanup (for tests that create multiple repos)
 */
export function registerTestRepo2(repoPath: string): void {
  _currentTestRepoPath2 = repoPath
}

/**
 * Safely close app and clear global reference
 * Use this in test finally blocks to prevent double-close in afterEach
 */
export async function safeAppClose(app: ElectronApplication): Promise<void> {
  // Clear global reference first to prevent afterEach from closing again
  if (_currentApp === app) {
    _currentApp = null
  }
  try {
    await app.close()
  } catch (e) {
    log('info', 'App close error', { error: String(e) })
  }
}

/**
 * Launch NERV with mock Claude in benchmark mode
 * Automatically registers app and repo for cleanup in afterEach
 */
export async function launchNervBenchmark(scenario: string = 'benchmark'): Promise<TestContext> {
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  const testRepoPath = createTestRepo()
  _currentTestRepoPath = testRepoPath  // Register for cleanup
  log('info', 'Created test repo', { path: testRepoPath })
  log('step', `Launching NERV`, { scenario, slowMode: CONFIG.slowMode })

  const useMock = process.env.NERV_MOCK_CLAUDE !== 'false'
  const app = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: useMock ? 'true' : 'false',
      ...(useMock ? { MOCK_CLAUDE_SCENARIO: scenario } : {}),
      NERV_LOG_LEVEL: 'debug',
      NERV_BENCHMARK_MODE: 'true',
      ELECTRON_ENABLE_LOGGING: '1'
    },
    timeout: TIMEOUT.launch
  })
  _currentApp = app  // Register for cleanup

  const window = await app.firstWindow({ timeout: TIMEOUT.launch })
  await window.waitForLoadState('domcontentloaded')
  log('info', 'App window ready')

  // Dismiss recovery dialog if present
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required")').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  return { app, window, testRepoPath }
}

/**
 * Test context with multiple repos (for multi-repo benchmarks)
 */
export interface MultiRepoTestContext {
  app: ElectronApplication
  window: Page
  repos: string[]  // Paths to all repos
}

/**
 * Launch NERV with REAL Claude for comprehensive benchmarking
 * This does NOT override NERV_MOCK_CLAUDE - it respects the environment variable
 *
 * Requires:
 * - ANTHROPIC_API_KEY environment variable OR
 * - Claude CLI authenticated via `claude auth login`
 *
 * @param repos - Array of repository paths to use (must already exist)
 */
export async function launchNervRealClaude(repos: string[]): Promise<MultiRepoTestContext> {
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  if (repos.length === 0) {
    throw new Error('At least one repository path is required')
  }

  // Verify all repos exist
  for (const repo of repos) {
    if (!fs.existsSync(repo)) {
      throw new Error(`Repository not found: ${repo}`)
    }
  }

  // NOTE: We do NOT register fixture repos for cleanup since they are permanent
  // Only temp repos created with createTestRepo() should be cleaned up
  // The app itself will be cleaned up via _currentApp

  const useMock = process.env.NERV_MOCK_CLAUDE === 'true'
  log('info', 'Repos configured', { count: repos.length, paths: repos })
  log('step', `Launching NERV`, { realClaude: !useMock, slowMode: CONFIG.slowMode })

  const app = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      // DO NOT set NERV_MOCK_CLAUDE - respect environment
      NERV_LOG_LEVEL: 'debug',
      NERV_BENCHMARK_MODE: 'true',
      ELECTRON_ENABLE_LOGGING: '1'
    },
    timeout: TIMEOUT.launch
  })
  _currentApp = app  // Register for cleanup

  const window = await app.firstWindow({ timeout: TIMEOUT.launch })
  await window.waitForLoadState('domcontentloaded')
  log('info', 'App window ready', { realClaude: !useMock })

  // Dismiss recovery dialog if present
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required")').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  return { app, window, repos }
}

/**
 * Standard afterEach cleanup function
 * Call this in test.afterEach() to ensure proper cleanup
 */
export async function standardCleanup(): Promise<void> {
  log('info', 'afterEach cleanup starting')

  // Force kill any remaining Electron processes with a timeout
  // The app may already be closed by the test's finally block
  if (_currentApp) {
    const appRef = _currentApp
    const pid = appRef.process()?.pid
    _currentApp = null  // Clear first to prevent re-entry
    try {
      log('info', 'Closing Electron app')

      // First try graceful quit via Electron API
      await appRef.evaluate(async ({ app }) => {
        app.quit()
      }).catch(() => {})

      // Add timeout to prevent hanging if app is already closed
      const closePromise = appRef.close()
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(async () => {
          log('info', 'App close timeout - forcing process termination')
          if (pid) {
            try {
              // On Windows, use taskkill for forceful termination
              if (process.platform === 'win32') {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
              } else {
                process.kill(pid, 'SIGKILL')
              }
            } catch {
              // Process may already be dead
            }
          }
          resolve()
        }, 5000)
      )
      await Promise.race([closePromise, timeoutPromise])
    } catch (e) {
      log('info', 'App close error (may already be closed)', { error: String(e) })
    }
  }

  // Clean up test repos
  if (_currentTestRepoPath) {
    log('info', 'Cleaning up test repo', { path: _currentTestRepoPath })
    cleanupTestRepo(_currentTestRepoPath)
    _currentTestRepoPath = null
  }
  if (_currentTestRepoPath2) {
    log('info', 'Cleaning up test repo 2', { path: _currentTestRepoPath2 })
    cleanupTestRepo(_currentTestRepoPath2)
    _currentTestRepoPath2 = null
  }

  // Give OS time to release file handles and process to fully terminate
  await new Promise(resolve => setTimeout(resolve, 1000))
  log('info', 'afterEach cleanup complete')
}
