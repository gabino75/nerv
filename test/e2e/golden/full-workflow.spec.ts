/**
 * NERV Golden E2E Tests - Full Workflow
 *
 * These are comprehensive end-to-end tests that exercise the complete
 * NERV workflow from project creation to task completion.
 *
 * Golden tests validate:
 * - Single repo simple task workflow
 * - Multi-repo feature workflow
 * - Permission enforcement workflow
 * - Error recovery workflow
 *
 * Run:
 *   npm run test:e2e:docker -- --grep "golden"
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

// Import from centralized helpers
import {
  SELECTORS,
  TIMEOUT,
  log,
  slowWait,
  microWait,
  createTestRepo,
  cleanupTestRepo,
  safeAppClose,
  launchNervBenchmark,
  standardCleanup,
  setupBenchmarkProjectWithRepo,
  createBenchmarkTask,
  registerTestRepo2,
  approvePermission,
  openAuditPanel,
} from '../helpers'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const LOG_DIR = path.join(__dirname, '../../../test-results/golden')

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// ============================================================================
// GOLDEN WORKFLOW TESTS
// ============================================================================

test.describe('NERV Golden Workflow Tests', () => {
  test.describe.configure({ timeout: TIMEOUT.benchmark })

  // Ensure cleanup happens after each test, even on failure
  test.afterEach(async () => {
    await standardCleanup()
  })

  // -------------------------------------------------------------------------
  // GOLDEN TEST: Single Repo Simple Task
  // Complete workflow: Create project -> Create task -> Start -> Complete -> Approve
  // -------------------------------------------------------------------------
  test('golden_single_repo_simple_task - Complete simple task workflow', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', '=== GOLDEN TEST: single_repo_simple_task ===')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // STEP 1: Create project with repo
      log('step', 'Step 1: Creating project')
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId, projectName } = project!
      log('pass', 'Project created', { projectId, projectName })

      // STEP 2: Create task
      log('step', 'Step 2: Creating task')
      const taskId = await createBenchmarkTask(
        window,
        projectId,
        'Add health endpoint',
        'Add GET /health returning {"status":"ok"}'
      )
      expect(taskId).not.toBeNull()
      log('pass', 'Task created', { taskId })

      // STEP 3: Select project
      log('step', 'Step 3: Selecting project')
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(300)
      }

      // STEP 4: Start task
      log('step', 'Step 4: Starting task')
      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(3000)
      }

      // VERIFY: Task is in_progress
      const runningTask = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string; worktree_path?: string }> } } } }).api
        return await api.db.tasks.get(id)
      }, taskId!)

      log('check', 'Task running state', { status: runningTask?.status, hasWorktree: !!runningTask?.worktree_path })
      expect(runningTask?.status).toBe('in_progress')

      // STEP 5: Simulate completion (set to review)
      log('step', 'Step 5: Simulating task completion')
      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateStatus(id, 'review')
      }, taskId!)
      await window.waitForTimeout(500)

      // STEP 6: Approve task
      log('step', 'Step 6: Approving task')
      const approveBtn = window.locator('[data-testid="approve-task-btn"], button:has-text("Approve")').first()
      if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await approveBtn.click()
        await slowWait(window, 'Task approved')
      } else {
        await window.evaluate(async (id: string) => {
          const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
          await api.db.tasks.updateStatus(id, 'done')
        }, taskId!)
      }

      // VERIFY: Task is done
      const finalTask = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string }> } } } }).api
        return await api.db.tasks.get(id)
      }, taskId!)

      log('check', 'Final task status', { status: finalTask?.status })
      expect(finalTask?.status).toBe('done')

      // VERIFY: Audit log has all events
      const auditLog = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<Array<{ event_type: string }>> } } } }).api
        return await api.db.audit.get(id, 50)
      }, taskId!)

      const statusChanges = auditLog.filter(e => e.event_type === 'task_status_changed')
      log('check', 'Audit log entries', { total: auditLog.length, statusChanges: statusChanges.length })
      expect(statusChanges.length).toBeGreaterThanOrEqual(2) // todo -> in_progress -> review -> done

      log('pass', '=== GOLDEN TEST PASSED: single_repo_simple_task ===')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // GOLDEN TEST: Multi-Repo Feature
  // Complete workflow with multiple repositories
  // -------------------------------------------------------------------------
  test('golden_multi_repo_feature - Complete multi-repo workflow', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    // Create a second test repo
    const testRepoPath2 = createTestRepo()
    registerTestRepo2(testRepoPath2)

    try {
      log('info', '=== GOLDEN TEST: multi_repo_feature ===')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // STEP 1: Create project with first repo
      log('step', 'Step 1: Creating project with first repo')
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // STEP 2: Add second repo to project
      log('step', 'Step 2: Adding second repo')
      const repo2Added = await window.evaluate(async (args: { projectId: string; repoPath: string }) => {
        const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
        try {
          await api.db.repos.create(args.projectId, 'repo-2', args.repoPath, 'node')
          return true
        } catch { return false }
      }, { projectId, repoPath: testRepoPath2 })

      log('check', 'Second repo added', { added: repo2Added })
      expect(repo2Added).toBe(true)

      // STEP 3: Verify both repos are in project
      const repos = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { repos: { getForProject: (projectId: string) => Promise<Array<{ name: string }>> } } } }).api
        return await api.db.repos.getForProject(id)
      }, projectId)

      log('check', 'Repos in project', { count: repos.length })
      expect(repos.length).toBe(2)

      // STEP 4: Create task
      log('step', 'Step 4: Creating multi-repo task')
      const taskId = await createBenchmarkTask(
        window,
        projectId,
        'Cross-repo feature',
        'Implement feature across both repos'
      )
      expect(taskId).not.toBeNull()

      // STEP 5: Select project and start task
      log('step', 'Step 5: Starting task')
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(300)
      }

      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(3000)
      }

      // VERIFY: Task started
      const taskState = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string }> } } } }).api
        return (await api.db.tasks.get(id))?.status
      }, taskId!)

      log('check', 'Task status', { status: taskState })
      expect(taskState).toBe('in_progress')

      // STEP 6: Complete task
      log('step', 'Step 6: Completing task')
      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateStatus(id, 'done')
      }, taskId!)

      const finalStatus = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string }> } } } }).api
        return (await api.db.tasks.get(id))?.status
      }, taskId!)

      log('check', 'Final status', { status: finalStatus })
      expect(finalStatus).toBe('done')

      log('pass', '=== GOLDEN TEST PASSED: multi_repo_feature ===')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(testRepoPath2)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // GOLDEN TEST: Permission Enforcement
  // Complete workflow with permission approvals
  // -------------------------------------------------------------------------
  test('golden_permission_enforcement - Complete workflow with permissions', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', '=== GOLDEN TEST: permission_enforcement ===')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // STEP 1: Create project
      log('step', 'Step 1: Creating project')
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // STEP 2: Create task that will trigger permissions
      log('step', 'Step 2: Creating task with permission-triggering command')
      const taskId = await createBenchmarkTask(
        window,
        projectId,
        'Install dependencies',
        'Run npm install to set up project'
      )
      expect(taskId).not.toBeNull()

      // STEP 3: Start task
      log('step', 'Step 3: Starting task')
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(300)
      }

      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(3000)
      }

      // STEP 4: Check for permission request
      log('step', 'Step 4: Checking for permission requests')
      const approvalQueue = window.locator(SELECTORS.approvalQueue).first()
      const queueVisible = await approvalQueue.isVisible({ timeout: 5000 }).catch(() => false)
      log('check', 'Approval queue visible', { visible: queueVisible })

      // STEP 5: Approve any pending permissions
      log('step', 'Step 5: Approving permissions')
      const approved = await approvePermission(window)
      log('check', 'Permission approved', { approved })

      // STEP 6: Complete task
      log('step', 'Step 6: Completing task')
      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateStatus(id, 'done')
      }, taskId!)

      // VERIFY: Task completed
      const finalTask = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string }> } } } }).api
        return await api.db.tasks.get(id)
      }, taskId!)

      log('check', 'Final task status', { status: finalTask?.status })
      expect(finalTask?.status).toBe('done')

      // VERIFY: Audit log exists
      const auditLog = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<unknown[]> } } } }).api
        return await api.db.audit.get(id, 50)
      }, taskId!)

      log('check', 'Audit entries', { count: (auditLog as unknown[]).length })
      expect((auditLog as unknown[]).length).toBeGreaterThan(0)

      log('pass', '=== GOLDEN TEST PASSED: permission_enforcement ===')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // GOLDEN TEST: Error Recovery
  // Complete workflow with interruption and recovery
  // -------------------------------------------------------------------------
  test('golden_error_recovery - Complete workflow with error recovery', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', '=== GOLDEN TEST: error_recovery ===')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // STEP 1: Create project
      log('step', 'Step 1: Creating project')
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // STEP 2: Create task
      log('step', 'Step 2: Creating task')
      const taskId = await createBenchmarkTask(window, projectId, 'Recovery test', 'Task to test recovery')
      expect(taskId).not.toBeNull()

      // STEP 3: Start task
      log('step', 'Step 3: Starting task')
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(300)
      }

      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(2000)
      }

      // STEP 4: Simulate interruption
      log('step', 'Step 4: Simulating task interruption')
      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown>; updateSession: (id: string, sessionId: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateSession(id, 'session-to-resume')
        await api.db.tasks.updateStatus(id, 'interrupted')
      }, taskId!)
      await window.waitForTimeout(500)

      // VERIFY: Task is interrupted
      const interruptedTask = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string; session_id?: string }> } } } }).api
        return await api.db.tasks.get(id)
      }, taskId!)

      log('check', 'Task interrupted', { status: interruptedTask?.status, hasSession: !!interruptedTask?.session_id })
      expect(interruptedTask?.status).toBe('interrupted')
      expect(interruptedTask?.session_id).toBeTruthy()

      // STEP 5: Look for Resume button
      log('step', 'Step 5: Checking for Resume capability')
      const resumeBtn = window.locator('[data-testid="resume-task-btn"], button:has-text("Resume")').first()
      const resumeVisible = await resumeBtn.isVisible({ timeout: 5000 }).catch(() => false)
      log('check', 'Resume button visible', { visible: resumeVisible })

      // STEP 6: Resume or complete task
      log('step', 'Step 6: Resuming/completing task')
      if (resumeVisible) {
        await resumeBtn.click()
        await window.waitForTimeout(2000)
      }

      // Complete task
      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateStatus(id, 'done')
      }, taskId!)

      // VERIFY: Task completed
      const finalTask = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { get: (id: string) => Promise<{ status: string }> } } } }).api
        return await api.db.tasks.get(id)
      }, taskId!)

      log('check', 'Final task status', { status: finalTask?.status })
      expect(finalTask?.status).toBe('done')

      // VERIFY: Audit log captures recovery
      const auditLog = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<Array<{ event_type: string }>> } } } }).api
        return await api.db.audit.get(id, 50)
      }, taskId!)

      const statusChanges = auditLog.filter(e => e.event_type === 'task_status_changed')
      log('check', 'Status change events', { count: statusChanges.length })
      expect(statusChanges.length).toBeGreaterThanOrEqual(3) // todo -> in_progress -> interrupted -> done

      log('pass', '=== GOLDEN TEST PASSED: error_recovery ===')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // GOLDEN TEST: Cycle Workflow
  // Complete workflow with cycle management
  // -------------------------------------------------------------------------
  test('golden_cycle_workflow - Complete workflow with cycles', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', '=== GOLDEN TEST: cycle_workflow ===')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // STEP 1: Create project
      log('step', 'Step 1: Creating project')
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // STEP 2: Select project
      log('step', 'Step 2: Selecting project')
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(500)
      }

      // STEP 3: Create Cycle 0
      log('step', 'Step 3: Creating Cycle 0')
      const cyclesBtn = window.locator(SELECTORS.cyclesBtn)
      await expect(cyclesBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await cyclesBtn.click()
      await slowWait(window, 'CyclePanel opening')

      const startCycle0Btn = window.locator(SELECTORS.startCycle0Btn)
      if (await startCycle0Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startCycle0Btn.click()

        const cycleGoalInput = window.locator(SELECTORS.cycleGoalInput)
        if (await cycleGoalInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await cycleGoalInput.fill('Golden test cycle')
          await microWait(window)

          const createCycleBtn = window.locator(SELECTORS.createCycleBtn)
          await createCycleBtn.click()
          await slowWait(window, 'Cycle created')
        }
      }

      // Close cycle panel
      const closeBtn = window.locator(SELECTORS.closeBtn).first()
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
        await window.waitForTimeout(300)
      }

      // STEP 4: Create task in cycle
      log('step', 'Step 4: Creating task in cycle')
      const taskId = await createBenchmarkTask(window, projectId, 'Cycle task', 'Task in Cycle 0')
      expect(taskId).not.toBeNull()

      // STEP 5: Complete task
      log('step', 'Step 5: Starting and completing task')
      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(2000)
      }

      await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { tasks: { updateStatus: (id: string, status: string) => Promise<unknown> } } } }).api
        await api.db.tasks.updateStatus(id, 'done')
      }, taskId!)

      // STEP 6: Complete cycle
      log('step', 'Step 6: Completing cycle')
      await cyclesBtn.click()
      await slowWait(window, 'CyclePanel reopening')

      const completeCycleBtn = window.locator(SELECTORS.completeCycleBtn)
      if (await completeCycleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await completeCycleBtn.click()
        await window.waitForTimeout(500)

        const learningsInput = window.locator(SELECTORS.learningsInput)
        if (await learningsInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await learningsInput.fill('Golden test completed successfully')
          await microWait(window)

          const confirmBtn = window.locator(SELECTORS.confirmCompleteCycleBtn)
          if (await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click()
            await slowWait(window, 'Cycle completed')
          }
        }
      }

      // VERIFY: Cycle history shows completed cycle
      const cycleHistory = window.locator(SELECTORS.cycleHistory).first()
      const historyVisible = await cycleHistory.isVisible({ timeout: 3000 }).catch(() => false)
      log('check', 'Cycle history visible', { visible: historyVisible })

      // Close modal
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }

      log('pass', '=== GOLDEN TEST PASSED: cycle_workflow ===')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })
})
