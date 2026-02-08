/**
 * Screenshot Capture Test
 *
 * Captures PNG screenshots at key UI states for documentation.
 * Screenshots are saved to test-results/screenshots/ (copied back by Docker)
 * and docs-site/public/screenshots/ (for docs build).
 *
 * Run in Docker:
 *   docker run --rm --shm-size=2gb \
 *     -v $(pwd):/app/host \
 *     -e NERV_MOCK_CLAUDE=true \
 *     nerv-e2e "npx playwright test test/e2e/screenshots.spec.ts"
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createTestRepo, cleanupTestRepo, ensureRecordingDirs } from './helpers/recording-utils'
import { SELECTORS, TIMEOUT } from './helpers/selectors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAIN_PATH = path.join(__dirname, '../../out/main/index.js')
// Primary output: test-results (Docker copies this back to host)
const RESULTS_SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/screenshots')
// Secondary output: docs-site (for local builds)
const DOCS_SCREENSHOTS_DIR = path.join(__dirname, '../../docs-site/public/screenshots')

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string

/** Save screenshot to both test-results and docs-site directories */
async function captureScreenshot(
  source: Page | ReturnType<Page['locator']>,
  name: string
): Promise<void> {
  const resultsPath = path.join(RESULTS_SCREENSHOTS_DIR, `${name}.png`)
  await source.screenshot({ path: resultsPath })
  console.log(`[Screenshots] Captured: ${name}.png`)

  // Also copy to docs-site if that directory exists
  const docsPath = path.join(DOCS_SCREENSHOTS_DIR, `${name}.png`)
  try {
    fs.copyFileSync(resultsPath, docsPath)
  } catch {
    // docs-site dir may not exist in Docker
  }
}

/** Dismiss the recommend panel and verify it's gone */
async function dismissRecommendPanel(page: Page): Promise<void> {
  const panel = page.locator('[data-testid="recommend-panel"]')
  const isOpen = await panel.isVisible().catch(() => false)
  if (!isOpen) return

  // Click the backdrop to dismiss (it has onclick={dismiss})
  // The backdrop is position:fixed inset:0 z-index:99, so it intercepts
  // pointer events on everything behind it — we must click it, not through it.
  const backdrop = page.locator('.recommend-backdrop')
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 10, y: 10 } })
  }
  // Assert it actually dismissed
  await expect(panel).not.toBeVisible({ timeout: 3000 })
}

test.beforeAll(() => {
  ensureRecordingDirs(RESULTS_SCREENSHOTS_DIR)
  ensureRecordingDirs(DOCS_SCREENSHOTS_DIR)
})

test.afterEach(async () => {
  if (electronApp) {
    try {
      await electronApp.evaluate(async ({ app }) => { app.quit() }).catch(() => {})
      const closePromise = electronApp.close()
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000))
      await Promise.race([closePromise, timeout])
    } catch {
      // Best effort cleanup
    }
  }
  if (testRepoPath) {
    cleanupTestRepo(testRepoPath)
  }
})

test('capture UI screenshots for documentation', async () => {
  test.setTimeout(120000)

  // Create test repo
  testRepoPath = createTestRepo('screenshot-demo', {
    'src/index.ts': 'export function hello() { return "Hello, NERV!" }\n',
    'src/utils.ts': 'export function add(a: number, b: number) { return a + b }\n',
  })

  // Launch Electron
  electronApp = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: '1',
      ELECTRON_IS_DEV: '0',
      NERV_MOCK_CLAUDE: '1',
    },
  })

  window = await electronApp.firstWindow()
  await window.waitForTimeout(2000)

  // Wait for app to load
  await expect(window.locator(SELECTORS.app)).toBeVisible({ timeout: TIMEOUT.launch })

  // === Screenshot 1: Empty dashboard ===
  await window.waitForTimeout(500)
  await captureScreenshot(window, 'dashboard-empty')

  // === Create a project ===
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: TIMEOUT.ui })
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  await expect(nameInput).toBeVisible({ timeout: TIMEOUT.ui })
  await nameInput.fill('My REST API')

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('REST API with user authentication and JWT tokens')
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  await expect(createBtn).toBeVisible({ timeout: TIMEOUT.ui })
  await createBtn.click()
  await window.waitForTimeout(1000)

  // === Screenshot 2: Dashboard with project ===
  await captureScreenshot(window, 'dashboard-project')

  // === Screenshot 3: Recommend panel ===
  const recommendBtn = window.locator('[data-testid="recommend-btn"]')
  await expect(recommendBtn).toBeVisible({ timeout: TIMEOUT.ui })
  await recommendBtn.click()
  await window.waitForTimeout(500)

  const panel = window.locator('[data-testid="recommend-panel"]')
  await expect(panel).toBeVisible({ timeout: TIMEOUT.ui })

  // Click Ask to trigger recommendation
  const askBtn = window.locator('[data-testid="recommend-ask-btn"]')
  await expect(askBtn).toBeVisible()
  await askBtn.click()
  // Wait for loading to complete (mock Claude should be fast)
  await window.waitForTimeout(3000)

  await captureScreenshot(window, 'recommend-panel')

  // === Dismiss recommend panel before clicking anything else ===
  await dismissRecommendPanel(window)

  // === Screenshot 4: Action bar ===
  const actionBar = window.locator('footer.action-bar')
  await expect(actionBar).toBeVisible({ timeout: TIMEOUT.ui })
  await captureScreenshot(actionBar, 'action-bar')

  // === Open cycles panel ===
  const cyclesBtn = window.locator(SELECTORS.cyclesBtn)
  await expect(cyclesBtn).toBeVisible({ timeout: TIMEOUT.ui })
  await cyclesBtn.click()
  await window.waitForTimeout(500)

  // === Screenshot 5: Cycle panel ===
  await captureScreenshot(window, 'cycle-panel')

  // Create a cycle
  const startCycleBtn = window.locator(SELECTORS.startFirstCycleBtn)
  if (await startCycleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await startCycleBtn.click()
    await window.waitForTimeout(500)

    const cycleGoalInput = window.locator(SELECTORS.cycleGoalInput)
    await expect(cycleGoalInput).toBeVisible({ timeout: TIMEOUT.ui })
    await cycleGoalInput.fill('Core auth endpoints with E2E tests')

    const createCycleBtn = window.locator(SELECTORS.createCycleBtn)
    await expect(createCycleBtn).toBeVisible()
    await createCycleBtn.click()
    await window.waitForTimeout(500)
  }

  // Close cycle panel via the close button
  const cycleCloseBtn = window.locator('[data-testid="cycle-panel"] .close-btn')
  await expect(cycleCloseBtn).toBeVisible({ timeout: TIMEOUT.ui })
  await cycleCloseBtn.click()
  // Verify cycle panel dismissed
  const cyclePanel = window.locator('[data-testid="cycle-panel"]')
  await expect(cyclePanel).not.toBeVisible({ timeout: 3000 })

  // === Create tasks for task board screenshot ===
  const addTaskBtn = window.locator(SELECTORS.addTaskBtn)
  await expect(addTaskBtn).toBeVisible({ timeout: TIMEOUT.ui })

  // First task
  await addTaskBtn.click()
  await window.waitForTimeout(300)
  const taskTitle = window.locator(SELECTORS.taskTitleInput)
  await expect(taskTitle).toBeVisible({ timeout: TIMEOUT.ui })
  await taskTitle.fill('Implement user registration endpoint')
  const createTaskBtn = window.locator(SELECTORS.createTaskBtn)
  await expect(createTaskBtn).toBeVisible()
  await createTaskBtn.click()
  await window.waitForTimeout(500)

  // Second task
  await addTaskBtn.click()
  await window.waitForTimeout(300)
  const taskTitle2 = window.locator(SELECTORS.taskTitleInput)
  await expect(taskTitle2).toBeVisible({ timeout: TIMEOUT.ui })
  await taskTitle2.fill('Add JWT authentication middleware')
  const createTaskBtn2 = window.locator(SELECTORS.createTaskBtn)
  await expect(createTaskBtn2).toBeVisible()
  await createTaskBtn2.click()
  await window.waitForTimeout(500)

  // === Screenshot 6: Task board ===
  await captureScreenshot(window, 'task-board')

  // === Verify all required screenshots exist ===
  const requiredScreenshots = [
    'dashboard-empty',
    'dashboard-project',
    'recommend-panel',
    'action-bar',
    'cycle-panel',
    'task-board',
  ]
  for (const name of requiredScreenshots) {
    const filePath = path.join(RESULTS_SCREENSHOTS_DIR, `${name}.png`)
    const stats = fs.statSync(filePath)
    // Must be a real screenshot, not a 70-byte placeholder
    expect(stats.size).toBeGreaterThan(1000)
    console.log(`[Screenshots] Verified: ${name}.png (${stats.size} bytes)`)
  }

  console.log('[Screenshots] All captures complete. Files in:', RESULTS_SCREENSHOTS_DIR)
})
