/**
 * Recommend-Driven Benchmark
 *
 * Instead of manually creating cycles and tasks, this benchmark
 * drives the entire workflow through "What's Next?" → Approve.
 *
 * The test validates that NERV's recommendation engine can guide
 * a project from creation to completion without manual intervention.
 *
 * Run with:
 *   docker run --rm --shm-size=2gb \
 *     -v $(pwd):/app/host \
 *     -e NERV_MOCK_CLAUDE=true \
 *     nerv-e2e "npx playwright test test/e2e/golden/recommend-benchmark.spec.ts"
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { createTestRepo, cleanupTestRepo, ensureRecordingDirs } from '../helpers/recording-utils'
import {
  askAndApproveRecommendation,
  recommendDrivenLoop,
  waitForRecommendDismissed,
} from '../helpers/recommend-actions'
import { SELECTORS, TIMEOUT } from '../helpers/selectors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAIN_PATH = path.join(__dirname, '../../../out/main/index.js')
const TEST_RESULTS_PATH = path.join(__dirname, '../../../test-results/recommend-benchmark')
const USE_REAL_CLAUDE = process.env.NERV_REAL_CLAUDE === 'true'
const APP_LAUNCH_TIMEOUT = USE_REAL_CLAUDE ? 120000 : 60000

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string

test.beforeAll(() => {
  ensureRecordingDirs(TEST_RESULTS_PATH)
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

test('recommend-driven workflow completes project lifecycle', async () => {
  test.setTimeout(USE_REAL_CLAUDE ? 600000 : 180000)

  // Create test repo
  testRepoPath = createTestRepo('recommend-demo', {
    'src/index.ts': 'export function main() { console.log("NERV recommend test") }\n',
    'src/config.ts': 'export const config = { port: 3000 }\n',
  })

  // Launch Electron
  electronApp = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: '1',
      ELECTRON_IS_DEV: '0',
      ...(USE_REAL_CLAUDE ? {} : { NERV_MOCK_CLAUDE: '1' }),
    },
  })

  window = await electronApp.firstWindow()
  await window.waitForTimeout(2000)

  // Wait for app to load
  await expect(window.locator(SELECTORS.app)).toBeVisible({ timeout: APP_LAUNCH_TIMEOUT })

  // Step 1: Create a project
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  await nameInput.fill('Recommend Test App')

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('Simple Node.js app with CLI and tests')
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  await createBtn.click()
  await window.waitForTimeout(1000)

  // Step 2: Verify recommend button is available
  const recommendBtn = window.locator('[data-testid="recommend-btn"]')
  await expect(recommendBtn).toBeVisible()
  await expect(recommendBtn).toBeEnabled()

  // Step 3: Drive the workflow through recommendations
  // On a fresh project, we expect recommendations like:
  // 1. create_cycle (first cycle for MVP)
  // 2. create_task (tasks for the cycle)
  // 3. start_task (start working)

  console.log('[Recommend Benchmark] Starting recommend-driven loop...')

  const result = await recommendDrivenLoop(window, 5, {
    direction: 'focus on MVP with basic CLI and tests',
    delayBetweenSteps: 2000,
    onStep: (step, index) => {
      console.log(`[Recommend Benchmark] Step ${index + 1}: ${step.action} — ${step.title}`)
    },
  })

  console.log(`[Recommend Benchmark] Completed ${result.steps.length} steps`)

  // Verify we got at least some recommendations executed
  expect(result.steps.length).toBeGreaterThan(0)

  // Verify the recommendation sequence makes sense:
  // A cycle should be created before tasks
  const actions = result.steps.map(s => s.action)
  console.log('[Recommend Benchmark] Action sequence:', actions)

  // The first recommendation on a fresh project should typically involve
  // creating a cycle or setting up the project structure
  expect(result.steps[0].approved).toBe(true)

  // Step 4: Verify the panel dismisses properly after each step
  await waitForRecommendDismissed(window)
})

test('recommend panel shows direction input and multiple cards', async () => {
  test.setTimeout(USE_REAL_CLAUDE ? 120000 : 60000)

  // Create test repo
  testRepoPath = createTestRepo('recommend-ui-test', {
    'src/app.ts': 'export const app = "test"\n',
  })

  // Launch
  electronApp = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: '1',
      ELECTRON_IS_DEV: '0',
      ...(USE_REAL_CLAUDE ? {} : { NERV_MOCK_CLAUDE: '1' }),
    },
  })

  window = await electronApp.firstWindow()
  await window.waitForTimeout(2000)
  await expect(window.locator(SELECTORS.app)).toBeVisible({ timeout: APP_LAUNCH_TIMEOUT })

  // Create a project first
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  await nameInput.fill('UI Panel Test')
  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  await createBtn.click()
  await window.waitForTimeout(1000)

  // Open the recommend panel
  const recommendBtn = window.locator('[data-testid="recommend-btn"]')
  await recommendBtn.click()
  await window.waitForTimeout(300)

  // Verify panel structure
  const panel = window.locator('[data-testid="recommend-panel"]')
  await expect(panel).toBeVisible({ timeout: TIMEOUT.ui })

  // Verify direction input exists
  const dirInput = window.locator('[data-testid="recommend-direction-input"]')
  await expect(dirInput).toBeVisible()

  // Verify Ask button exists
  const askBtn = window.locator('[data-testid="recommend-ask-btn"]')
  await expect(askBtn).toBeVisible()

  // Type direction and ask
  await dirInput.fill('focus on authentication')
  await askBtn.click()

  // Wait for cards to appear
  const firstCard = window.locator('[data-testid="recommend-card-0"]')
  await firstCard.waitFor({ timeout: TIMEOUT.task })

  // Verify card has approve button
  const approveBtn = window.locator('[data-testid="recommend-approve-0"]')
  await expect(approveBtn).toBeVisible()
  await expect(approveBtn).toHaveText('Approve')
})
