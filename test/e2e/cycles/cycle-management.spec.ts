/**
 * NERV Cycle Management Tests
 *
 * Tests for cycle lifecycle management:
 * - Cycle creation via UI
 * - Cycle completion with learnings
 * - Cycle history display
 *
 * Run:
 *   npm run test:e2e:docker -- --grep "cycle-management"
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// Import from centralized helpers
import {
  TIMEOUT,
  log,
  slowWait,
  microWait,
  cleanupTestRepo,
  safeAppClose,
  launchNervBenchmark,
  standardCleanup,
  setupBenchmarkProjectWithRepo,
} from '../helpers'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// CYCLE MANAGEMENT TESTS
// ============================================================================

test.describe('NERV Cycle Management Tests', () => {
  test.describe.configure({ timeout: TIMEOUT.benchmark })

  // Ensure cleanup happens after each test, even on failure
  test.afterEach(async () => {
    await standardCleanup()
  })

  // -------------------------------------------------------------------------
  // TEST: Cycle Management
  // PRD Feature: Cycles for iterative development (Cycle 0, 1, N...)
  // REAL UI: Click Cycles button, fill forms, verify UI updates
  // -------------------------------------------------------------------------
  test('real_cycle_management - NERV creates and manages development cycles via UI', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', 'TEST: real_cycle_management (REAL UI)')
      await window.waitForSelector('[data-testid="app"]', { timeout: TIMEOUT.ui })

      // Setup project with repo
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()

      // Select the project in the sidebar
      const projectItem = window.locator(`.project-item:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(500)
      }

      // STEP 1: Click Cycles button to open CyclePanel
      log('step', 'Opening CyclePanel via Cycles button')
      const cyclesBtn = window.locator('[data-testid="cycles-btn"]')
      await expect(cyclesBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await cyclesBtn.click()
      await slowWait(window, 'CyclePanel opening')

      // Verify CyclePanel is open
      const cyclePanel = window.locator('[data-testid="cycle-panel"]')
      await expect(cyclePanel).toBeVisible({ timeout: TIMEOUT.ui })
      log('check', 'CyclePanel is visible')

      // STEP 2: Click "Start Cycle 0" button
      log('step', 'Clicking Start Cycle 0 button')
      const startCycle0Btn = window.locator('[data-testid="start-cycle-0-btn"]')
      await expect(startCycle0Btn).toBeVisible({ timeout: TIMEOUT.ui })
      await startCycle0Btn.click()
      await slowWait(window, 'NewCycleModal opening')

      // STEP 3: Fill in cycle goal in the modal
      log('step', 'Filling cycle goal in NewCycleModal')
      const cycleGoalInput = window.locator('[data-testid="cycle-goal-input"]')
      await expect(cycleGoalInput).toBeVisible({ timeout: TIMEOUT.ui })
      await cycleGoalInput.fill('Proof of life - verify basic setup works')
      await microWait(window)

      // STEP 4: Click Create Cycle button
      log('step', 'Clicking Create Cycle button')
      const createCycleBtn = window.locator('[data-testid="create-cycle-btn"]')
      await createCycleBtn.click()
      await slowWait(window, 'Cycle creation')

      // STEP 5: Verify Cycle 0 appears in the UI
      log('check', 'Verifying Cycle 0 appears in CyclePanel')
      const cycle0Display = window.locator('.active-cycle:has-text("Cycle 0")')
      await expect(cycle0Display).toBeVisible({ timeout: TIMEOUT.ui })
      log('pass', 'Cycle 0 is visible in UI')

      // STEP 6: Click Complete Cycle button
      log('step', 'Clicking Complete Cycle button')
      const completeCycleBtn = window.locator('[data-testid="complete-cycle-btn"]')
      await expect(completeCycleBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await completeCycleBtn.click()
      await slowWait(window, 'CompleteCycleModal opening')

      // STEP 7: Fill in learnings
      log('step', 'Filling learnings in CompleteCycleModal')
      const learningsInput = window.locator('[data-testid="learnings-input"]')
      await expect(learningsInput).toBeVisible({ timeout: TIMEOUT.ui })
      await learningsInput.fill('API responds correctly. Rate limits are aggressive in dev mode.')
      await microWait(window)

      // STEP 8: Click Confirm Complete button
      log('step', 'Clicking Confirm Complete button')
      const confirmCompleteBtn = window.locator('[data-testid="confirm-complete-cycle-btn"]')
      await confirmCompleteBtn.click()
      await slowWait(window, 'Cycle completion')

      // STEP 9: Verify cycle moved to history
      log('check', 'Verifying Cycle 0 moved to history')
      // After completion, "No active cycle" or "Start Cycle 0" should appear again
      // OR cycle history should show the completed cycle
      const cycleHistory = window.locator('.cycle-history')
      const historyVisible = await cycleHistory.isVisible({ timeout: 5000 }).catch(() => false)
      log('check', 'Cycle history visible', { visible: historyVisible })

      // Also verify via database that cycle was actually completed
      const { projectId } = project!
      const completedCycle = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { cycles: { getForProject: (id: string) => Promise<Array<{ cycle_number: number; status: string; learnings: string | null }>> } } } }).api
        const cycles = await api.db.cycles.getForProject(id)
        return cycles.find(c => c.cycle_number === 0)
      }, projectId)

      log('check', 'Cycle 0 in database', { status: completedCycle?.status, hasLearnings: !!completedCycle?.learnings })
      expect(completedCycle?.status).toBe('completed')
      expect(completedCycle?.learnings).toContain('Rate limits')

      // Close the CyclePanel
      await window.locator('.close-btn').first().click()

      log('pass', 'Cycle management via UI test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Cycle History Display
  // PRD Feature: View completed cycles with learnings in CyclePanel
  // REAL UI: Open CyclePanel, complete a cycle, verify history shows
  // -------------------------------------------------------------------------
  test('real_cycle_history_display - NERV displays completed cycles in history', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', 'TEST: real_cycle_history_display (REAL UI)')
      await window.waitForSelector('[data-testid="app"]', { timeout: TIMEOUT.ui })

      // Setup project with repo
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Select the project in the sidebar
      const projectItem = window.locator(`.project-item:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(500)
      }

      // STEP 1: Open CyclePanel
      log('step', 'Opening CyclePanel')
      const cyclesBtn = window.locator('[data-testid="cycles-btn"]')
      await expect(cyclesBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await cyclesBtn.click()
      await slowWait(window, 'CyclePanel opening')

      const cyclePanel = window.locator('[data-testid="cycle-panel"]')
      await expect(cyclePanel).toBeVisible({ timeout: TIMEOUT.ui })

      // STEP 2: Create and complete Cycle 0
      log('step', 'Creating Cycle 0')
      const startCycle0Btn = window.locator('[data-testid="start-cycle-0-btn"]')
      await expect(startCycle0Btn).toBeVisible({ timeout: TIMEOUT.ui })
      await startCycle0Btn.click()
      await slowWait(window, 'NewCycleModal opening')

      // Fill cycle goal
      const cycleGoalInput = window.locator('[data-testid="cycle-goal-input"]')
      await expect(cycleGoalInput).toBeVisible({ timeout: TIMEOUT.ui })
      await cycleGoalInput.fill('Proof of life - verify API responds')
      await microWait(window)

      // Create cycle
      const createCycleBtn = window.locator('[data-testid="create-cycle-btn"]')
      await createCycleBtn.click()
      await slowWait(window, 'Cycle creation')

      // STEP 3: Complete Cycle 0 with learnings
      log('step', 'Completing Cycle 0 with learnings')
      const completeCycleBtn = window.locator('[data-testid="complete-cycle-btn"]')
      await expect(completeCycleBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await completeCycleBtn.click()
      await slowWait(window, 'CompleteCycleModal opening')

      // Fill learnings
      const learningsInput = window.locator('[data-testid="learnings-input"]')
      await expect(learningsInput).toBeVisible({ timeout: TIMEOUT.ui })
      await learningsInput.fill('API responds correctly. Rate limits are 100 req/min in dev mode.')
      await microWait(window)

      // Confirm complete
      const confirmCompleteBtn = window.locator('[data-testid="confirm-complete-cycle-btn"]')
      await confirmCompleteBtn.click()
      await slowWait(window, 'Cycle completion')

      // STEP 4: Verify Cycle 0 appears in history
      log('step', 'Verifying cycle history list appears')
      const cycleHistoryList = window.locator('[data-testid="cycle-history-list"]')
      await expect(cycleHistoryList).toBeVisible({ timeout: TIMEOUT.ui })
      log('pass', 'Cycle history list is visible')

      // STEP 5: Verify cycle history item for Cycle 0
      log('step', 'Verifying Cycle 0 appears in history')
      const historyItem = window.locator('[data-testid="cycle-history-item"][data-cycle-number="0"]')
      await expect(historyItem).toBeVisible({ timeout: TIMEOUT.ui })
      log('pass', 'Cycle 0 appears in history')

      // STEP 6: Click to expand the history item
      log('step', 'Expanding cycle history item')
      const historyHeader = historyItem.locator('[data-testid="cycle-history-header"]')
      await historyHeader.click()
      await slowWait(window, 'History expansion')

      // STEP 7: Verify expanded details show learnings
      log('step', 'Verifying learnings display in expanded history')
      const historyDetails = historyItem.locator('[data-testid="cycle-history-details"]')
      await expect(historyDetails).toBeVisible({ timeout: TIMEOUT.ui })
      log('pass', 'History details expanded')

      const learningsText = historyItem.locator('[data-testid="cycle-history-learnings"]')
      const learningsVisible = await learningsText.isVisible({ timeout: 5000 }).catch(() => false)

      if (learningsVisible) {
        const content = await learningsText.textContent()
        log('check', 'Learnings content', { content: content?.substring(0, 50) })
        expect(content).toContain('Rate limits')
        log('pass', 'Learnings displayed correctly')
      }

      // STEP 8: Create and complete a second cycle to verify multiple history items
      log('step', 'Creating Cycle 1')

      // Click "Plan Next" button to create Cycle 1
      const planNextBtn = window.locator('button:has-text("+ Plan Next")')
      const planNextVisible = await planNextBtn.isVisible({ timeout: 3000 }).catch(() => false)

      if (planNextVisible) {
        await planNextBtn.click()
        await slowWait(window, 'NewCycleModal opening')

        // Fill cycle 1 goal
        await expect(cycleGoalInput).toBeVisible({ timeout: TIMEOUT.ui })
        await cycleGoalInput.fill('Implement login flow')
        await microWait(window)

        // Create cycle 1
        await createCycleBtn.click()
        await slowWait(window, 'Cycle 1 creation')

        // Complete cycle 1
        await expect(completeCycleBtn).toBeVisible({ timeout: TIMEOUT.ui })
        await completeCycleBtn.click()
        await slowWait(window, 'CompleteCycleModal opening')

        await expect(learningsInput).toBeVisible({ timeout: TIMEOUT.ui })
        await learningsInput.fill('OAuth flow works. Token refresh needs implementation.')
        await microWait(window)

        await confirmCompleteBtn.click()
        await slowWait(window, 'Cycle 1 completion')

        // Verify both cycles appear in history
        log('step', 'Verifying multiple cycles in history')
        const historyItems = window.locator('[data-testid="cycle-history-item"]')
        const historyCount = await historyItems.count()
        log('check', 'History item count', { count: historyCount })
        expect(historyCount).toBeGreaterThanOrEqual(2)
        log('pass', 'Multiple cycles displayed in history')
      }

      // STEP 9: Verify database has the cycles
      const dbCycles = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { cycles: { getForProject: (id: string) => Promise<Array<{ cycle_number: number; status: string; learnings: string | null }>> } } } }).api
        return await api.db.cycles.getForProject(id)
      }, projectId)

      log('check', 'Cycles in database', { count: dbCycles.length })
      const completedCycles = dbCycles.filter(c => c.status === 'completed')
      expect(completedCycles.length).toBeGreaterThanOrEqual(1)
      expect(completedCycles[0].learnings).toBeTruthy()

      // Close the CyclePanel
      const closeBtn = window.locator('.close-btn').first()
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }

      log('pass', 'Cycle history display test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })
})
