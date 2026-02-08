/**
 * NERV Documentation Screenshot Generator
 *
 * This test generates screenshots for the USER-GUIDE.md documentation.
 * Run with: powershell -File test/scripts/run-e2e.ps1 -Suite docs
 *
 * Screenshots are saved to docs/images/ for use in documentation.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import os from 'os'
import { fileURLToPath } from 'url'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths
const MAIN_PATH = path.join(__dirname, '../../out/main/index.js')
const DOCS_IMAGES_PATH = path.join(__dirname, '../../docs/images')

// Test timeout - Electron can be slow in CI
const APP_LAUNCH_TIMEOUT = 60000
const SCREENSHOT_DELAY = 500 // Delay before screenshots for UI to settle

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string

/**
 * Create a temporary git repository for testing
 */
function createTestRepo(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-docs-test-'))

  // Initialize git repo with explicit main branch
  execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.email "test@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.name "NERV Test"', { cwd: tempDir, stdio: 'pipe' })

  // Create initial commit with some files
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Demo Project\n\nA sample project for documentation screenshots.\n')
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'demo-project',
    version: '1.0.0',
    scripts: {
      test: 'echo "Tests pass"',
      build: 'echo "Build complete"'
    }
  }, null, 2))
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tempDir, 'src/index.ts'), '// Main entry point\nconsole.log("Hello, NERV!");\n')

  execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' })

  return tempDir
}

/**
 * Clean up test repository
 */
function cleanupTestRepo(repoPath: string): void {
  try {
    const worktreesDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`)
    if (fs.existsSync(worktreesDir)) {
      fs.rmSync(worktreesDir, { recursive: true, force: true })
    }
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch (e) {
    console.error(`Failed to cleanup test repo: ${e}`)
  }
}

/**
 * Take a screenshot with consistent settings
 */
async function takeScreenshot(page: Page, name: string): Promise<void> {
  // Wait for UI to settle
  await page.waitForTimeout(SCREENSHOT_DELAY)

  const screenshotPath = path.join(DOCS_IMAGES_PATH, `${name}.png`)
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
    animations: 'disabled'
  })
  console.log(`Screenshot saved: ${screenshotPath}`)
}

/**
 * Setup: Create docs/images directory and launch Electron
 */
test.beforeAll(async () => {
  // Ensure docs/images directory exists
  if (!fs.existsSync(DOCS_IMAGES_PATH)) {
    fs.mkdirSync(DOCS_IMAGES_PATH, { recursive: true })
  }
})

test.beforeEach(async () => {
  // Verify the built app exists
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Create test repo
  testRepoPath = createTestRepo()

  // Launch Electron
  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'benchmark',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT
  })

  // Get the first window
  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required")').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }
})

test.afterEach(async () => {
  if (electronApp) {
    try {
      const pid = electronApp.process()?.pid

      // Try graceful quit
      await electronApp.evaluate(async ({ app }) => {
        app.quit()
      }).catch(() => {})

      // Race between close and timeout
      const closePromise = electronApp.close()
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log('App close timeout - forcing process termination')
          if (pid) {
            try {
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
      console.log('App close error (may already be closed):', e)
    }
  }
  if (testRepoPath) {
    cleanupTestRepo(testRepoPath)
  }
})

// ============================================================================
// Documentation Screenshot Tests
// ============================================================================

/**
 * Screenshot: App launched (initial empty state)
 */
test('docs_screenshot_app_launched', async () => {
  // Wait for app to fully render
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })
  await takeScreenshot(window, 'app-launched')
})

/**
 * Screenshot: New project dialog
 */
test('docs_screenshot_new_project_dialog', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Click "New Project" button
  const newProjectButton = await window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
  await expect(newProjectButton).toBeVisible({ timeout: 5000 })
  await newProjectButton.dispatchEvent('click')

  // Wait for dialog to appear
  await window.waitForSelector('[role="dialog"], .modal, [data-testid="new-project-dialog"]', { timeout: 5000 })
  await takeScreenshot(window, 'new-project-dialog')
})

/**
 * Screenshot: Task board with tasks
 */
test('docs_screenshot_task_board', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for task board
  const taskBoard = await window.locator('[data-testid="task-board"], .task-list, .tasks-panel').first()
  if (await taskBoard.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'task-board')
  }
})

/**
 * Screenshot: Terminal panel
 */
test('docs_screenshot_terminal_panel', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for terminal panel
  const terminalPanel = await window.locator('[data-testid="terminal-panel"], .terminal-panel, .xterm').first()
  if (await terminalPanel.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'terminal-panel')
  }
})

/**
 * Screenshot: Context monitor
 */
test('docs_screenshot_context_monitor', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for context monitor
  const contextMonitor = await window.locator('[data-testid="context-monitor"], .context-monitor').first()
  if (await contextMonitor.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'context-monitor')
  }
})

/**
 * Screenshot: Approval dialog (permission request)
 */
test('docs_screenshot_approval_dialog', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for approval queue
  const approvalQueue = await window.locator('[data-testid="approval-queue"], .approval-queue').first()
  if (await approvalQueue.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'approval-dialog')
  }
})

/**
 * Screenshot: Multi-tab session view
 */
test('docs_screenshot_multi_tab', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for tab container
  const tabContainer = await window.locator('[data-testid="tab-container"], .tab-container').first()
  if (await tabContainer.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'multi-tab')
  }
})

/**
 * Screenshot: Agent selector
 */
test('docs_screenshot_agent_selector', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Try to open Knowledge panel which has agent editor
  const knowledgeButton = await window.locator('button:has-text("Knowledge"), [data-testid="knowledge-button"]').first()
  if (await knowledgeButton.isVisible().catch(() => false)) {
    const isEnabled = await knowledgeButton.isEnabled().catch(() => false)
    if (isEnabled) {
      await knowledgeButton.click()
      await window.waitForTimeout(500)

      // Look for agents tab
      const agentsTab = await window.locator('button:has-text("Agents"), [data-testid="agents-tab"]').first()
      if (await agentsTab.isVisible().catch(() => false)) {
        await agentsTab.click()
        await window.waitForTimeout(300)
        await takeScreenshot(window, 'agent-selector')
      }
    }
  }
})

/**
 * Screenshot: YOLO mode configuration
 */
test('docs_screenshot_yolo_config', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for YOLO mode toggle or settings
  const yoloToggle = await window.locator('[data-testid="yolo-toggle"], .yolo-mode, :text("YOLO")').first()
  if (await yoloToggle.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'yolo-config')
  }
})

/**
 * Screenshot: Worktree panel
 */
test('docs_screenshot_worktree_panel', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Try to open worktree panel
  const worktreeButton = await window.locator('button:has-text("Worktrees"), [data-testid="worktree-button"]').first()
  if (await worktreeButton.isVisible().catch(() => false)) {
    const isEnabled = await worktreeButton.isEnabled().catch(() => false)
    if (isEnabled) {
      await worktreeButton.click()
      await window.waitForTimeout(500)
      await takeScreenshot(window, 'worktree-panel')
    }
  }
})

/**
 * Screenshot: Cycle panel
 */
test('docs_screenshot_cycle_panel', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Try to open cycle panel
  const cycleButton = await window.locator('button:has-text("Cycles"), [data-testid="cycle-button"]').first()
  if (await cycleButton.isVisible().catch(() => false)) {
    const isEnabled = await cycleButton.isEnabled().catch(() => false)
    if (isEnabled) {
      await cycleButton.click()
      await window.waitForTimeout(500)
      await takeScreenshot(window, 'cycle-panel')
    }
  }
})

/**
 * Screenshot: Branching dialog
 */
test('docs_screenshot_branching_dialog', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Try to open branching dialog
  const branchButton = await window.locator('button:has-text("Branch"), [data-testid="branch-button"]').first()
  if (await branchButton.isVisible().catch(() => false)) {
    const isEnabled = await branchButton.isEnabled().catch(() => false)
    if (isEnabled) {
      await branchButton.click()
      await window.waitForTimeout(500)
      await takeScreenshot(window, 'branching-dialog')
    }
  }
})

/**
 * Screenshot: Settings panel
 */
test('docs_screenshot_settings', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Try to open settings
  const settingsButton = await window.locator('button:has-text("Settings"), [data-testid="settings-button"]').first()
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click()
    await window.waitForTimeout(500)
    await takeScreenshot(window, 'settings')
  }
})

/**
 * Screenshot: Task start flow
 */
test('docs_screenshot_task_start', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Look for Start Task button
  const startButton = await window.locator('button:has-text("Start"), [data-testid="start-task"]').first()
  if (await startButton.isVisible().catch(() => false)) {
    await takeScreenshot(window, 'task-start')
  }
})

/**
 * Full workflow screenshot sequence
 */
test('docs_screenshot_full_workflow', async () => {
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // 1. Initial state
  await takeScreenshot(window, 'workflow-01-initial')

  // 2. Open new project dialog
  const newProjectButton = await window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
  if (await newProjectButton.isVisible().catch(() => false)) {
    await newProjectButton.dispatchEvent('click')
    await window.waitForTimeout(500)
    await takeScreenshot(window, 'workflow-02-new-project')

    // Fill in project details
    const nameInput = await window.locator('input[placeholder*="name" i], input[name="name"]').first()
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Demo OAuth Feature')
      await window.waitForTimeout(200)
    }

    const goalInput = await window.locator('textarea, input[placeholder*="goal" i]').first()
    if (await goalInput.isVisible().catch(() => false)) {
      await goalInput.fill('Add OAuth2 authentication with Google and GitHub providers')
      await window.waitForTimeout(200)
    }

    await takeScreenshot(window, 'workflow-03-project-details')

    // Close dialog (cancel or escape)
    const cancelButton = await window.locator('button:has-text("Cancel")').first()
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click()
      await window.waitForTimeout(300)
    }
  }

  // 3. Final state
  await takeScreenshot(window, 'workflow-04-final')
})
