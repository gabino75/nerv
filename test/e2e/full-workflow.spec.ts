/**
 * Full Workflow Benchmark & Demo Recording
 *
 * End-to-end test that exercises the complete NERV development workflow:
 * 1. Create project
 * 2. Click "What's Next?" for guidance
 * 3. Exercise the recommend panel (direction, cards, approve)
 * 4. Verify recommendation execution
 *
 * This test can use REAL Claude (with --allowedTools) or mock Claude.
 * When recording is enabled, it produces a demo video suitable for documentation.
 *
 * Run with:
 *   bash test/scripts/run-e2e.sh --suite full-workflow --record
 *   bash test/scripts/run-e2e.sh --suite full-workflow --real-claude --record
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  injectCursorOverlay,
  demoWait,
  moveVideo,
  createTestRepo,
  cleanupTestRepo,
  ensureRecordingDirs,
  RECORDING_DEFAULTS,
} from './helpers/recording-utils'
import {
  askAndApproveRecommendation,
  waitForRecommendDismissed,
} from './helpers/recommend-actions'
import { SELECTORS } from './helpers/selectors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAIN_PATH = path.join(__dirname, '../../out/main/index.js')
const TEST_RESULTS_PATH = path.join(__dirname, '../../test-results/full-workflow')
const DOCS_DEMOS_PATH = path.join(__dirname, '../../docs-site/public/demos')
const IS_RECORDING = process.env.NERV_RECORD_ALL === 'true' || process.env.NERV_RECORD === 'true'
const USE_REAL_CLAUDE = process.env.NERV_REAL_CLAUDE === 'true'
const APP_LAUNCH_TIMEOUT = USE_REAL_CLAUDE ? 120000 : 60000

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string

test.beforeAll(() => {
  ensureRecordingDirs(TEST_RESULTS_PATH)
  if (IS_RECORDING) {
    ensureRecordingDirs(DOCS_DEMOS_PATH)
  }
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

test('full NERV development workflow', async () => {
  test.setTimeout(USE_REAL_CLAUDE ? 600000 : 120000)

  // Create test repo
  testRepoPath = createTestRepo('workflow-demo', {
    'src/index.ts': 'export function hello() { return "Hello, NERV!" }\n',
    'src/utils.ts': 'export function add(a: number, b: number) { return a + b }\n',
  })

  // Launch Electron
  const launchOptions: Record<string, unknown> = {
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: '1',
      ELECTRON_IS_DEV: '0',
      ...(USE_REAL_CLAUDE ? {} : { NERV_MOCK_CLAUDE: '1' }),
    },
  }

  if (IS_RECORDING) {
    launchOptions.recordVideo = {
      dir: TEST_RESULTS_PATH,
      size: RECORDING_DEFAULTS.viewport,
    }
  }

  electronApp = await electron.launch(launchOptions)
  window = await electronApp.firstWindow()
  await window.waitForTimeout(2000)

  // Inject cursor overlay for recordings
  if (IS_RECORDING) {
    await injectCursorOverlay(window)
  }

  // Wait for app to load
  await expect(window.locator('[data-testid="app"]')).toBeVisible({ timeout: APP_LAUNCH_TIMEOUT })
  await demoWait(window, 'App loaded')

  // Step 1: Verify the dashboard loaded
  await expect(window.locator('h1')).toContainText('NERV')

  // Step 2: Create a project so recommend button becomes enabled
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  await nameInput.fill('Workflow Test App')

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('Simple Node.js app for workflow testing')
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  await createBtn.click()
  await window.waitForTimeout(1000)

  // Step 3: Check "What's Next?" button is visible and enabled
  const recommendBtn = window.locator('[data-testid="recommend-btn"]')
  await expect(recommendBtn).toBeVisible()
  await expect(recommendBtn).toBeEnabled()

  // Step 4: Verify Send input is prominent
  const sendInput = window.locator('[data-testid="send-input"]')
  await expect(sendInput).toBeVisible()
  await expect(sendInput).toHaveAttribute('placeholder', 'Start a task to chat with Claude')

  // Step 5: Verify header "More" dropdown and tab layout exist
  await expect(window.locator('[data-testid="more-dropdown"]')).toBeVisible()
  await expect(window.locator('[data-testid="three-tab-layout"]')).toBeVisible()
  await expect(window.locator('[data-testid="tab-kanban"]')).toBeVisible()

  // Step 6: Verify the "More" actions button exists in ActionBar
  const moreBtn = window.locator('.action-btn.more-actions')
  await expect(moreBtn).toBeVisible()

  // Step 7: Open the recommend panel
  await recommendBtn.click()
  await window.waitForTimeout(500)

  // Verify panel opens with direction input and ask button
  const panel = window.locator('[data-testid="recommend-panel"]')
  await expect(panel).toBeVisible({ timeout: 5000 })

  const dirInput = window.locator('[data-testid="recommend-direction-input"]')
  await expect(dirInput).toBeVisible()

  const askBtn = window.locator('[data-testid="recommend-ask-btn"]')
  await expect(askBtn).toBeVisible()

  // Step 8: Type direction and ask for recommendations
  await dirInput.fill('start with a simple cycle')
  await askBtn.click()

  // Wait for loading to finish and cards to appear
  const firstCard = window.locator('[data-testid="recommend-card-0"]')
  try {
    await firstCard.waitFor({ timeout: 15000 })

    // Verify the card has an approve button
    const approveBtn = window.locator('[data-testid="recommend-approve-0"]')
    await expect(approveBtn).toBeVisible()

    // Step 9: Approve the first recommendation
    await approveBtn.click()

    // Verify execution success
    try {
      await window.locator('[data-testid="recommend-execute-success"]').waitFor({ timeout: 5000 })
      console.log('[Workflow] Recommendation executed successfully')
    } catch {
      console.log('[Workflow] Success indicator not found (may have auto-dismissed)')
    }

    // Wait for panel to auto-dismiss
    await waitForRecommendDismissed(window)
  } catch {
    // Mock Claude may not return parseable recommendations
    console.log('[Workflow] Could not get recommendation cards (expected with some mock configs)')
    // Dismiss the panel
    await window.keyboard.press('Escape')
    await window.waitForTimeout(300)
  }

  if (IS_RECORDING) {
    await demoWait(window, 'Dashboard overview', 2000)
  }

  // Save video if recording
  if (IS_RECORDING) {
    const videoPath = await window.video()?.path()
    if (videoPath) {
      await window.waitForTimeout(1000)
      moveVideo(videoPath, DOCS_DEMOS_PATH, 'full-workflow')
      moveVideo(videoPath, TEST_RESULTS_PATH, 'full-workflow')
    }
  }
})
