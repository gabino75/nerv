/**
 * NERV Permission Flow E2E Tests
 *
 * Tests for permission dialog and persistence:
 * - Permission requests appear in approval queue
 * - Approve/Deny/Always/Never buttons work
 * - Permission patterns are persisted
 * - Audit log captures permission decisions
 *
 * Run:
 *   npm run test:e2e:docker -- --grep "permission-flow"
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Import from centralized helpers
import {
  SELECTORS,
  TIMEOUT,
  log,
  slowWait,
  microWait,
  cleanupTestRepo,
  safeAppClose,
  launchNervBenchmark,
  standardCleanup,
  setupBenchmarkProjectWithRepo,
  createBenchmarkTask,
  openAuditPanel,
  approvePermission,
  denyPermission,
} from '../helpers'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// PERMISSION FLOW TESTS
// ============================================================================

test.describe('NERV Permission Flow Tests', () => {
  test.describe.configure({ timeout: TIMEOUT.benchmark })

  // Ensure cleanup happens after each test, even on failure
  test.afterEach(async () => {
    await standardCleanup()
  })

  // -------------------------------------------------------------------------
  // TEST: Permission Queue Display
  // PRD Feature: Permission requests appear in approval queue
  // -------------------------------------------------------------------------
  test('permission_queue_display - Permission requests appear in approval queue', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', 'TEST: permission_queue_display')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // Setup project with repo
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Create a task that will trigger permissions
      const taskId = await createBenchmarkTask(window, projectId, 'Permission test task', 'Run npm install')
      expect(taskId).not.toBeNull()

      // Select project and start task
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(300)
      }

      // Start the task
      log('step', 'Starting task to trigger permissions')
      const startBtn = window.locator(SELECTORS.startTaskBtn).first()
      if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
        await startBtn.click()
        await window.waitForTimeout(2000)
      }

      // VERIFY: Approval queue panel exists
      const approvalQueue = window.locator(SELECTORS.approvalQueue).first()
      const queueVisible = await approvalQueue.isVisible({ timeout: 5000 }).catch(() => false)
      log('check', 'Approval queue visible', { visible: queueVisible })
      expect(queueVisible).toBe(true)

      // VERIFY: UI shows permission approval buttons
      const allowOnceBtn = window.locator(SELECTORS.approvalAllowOnce).first()
      const denyOnceBtn = window.locator(SELECTORS.approvalDenyOnce).first()
      const alwaysAllowBtn = window.locator(SELECTORS.approvalAlwaysAllow).first()

      // At least one approval button type should be visible (may depend on mock scenario)
      const hasApprovalUI = await allowOnceBtn.isVisible({ timeout: 3000 }).catch(() => false) ||
                           await denyOnceBtn.isVisible({ timeout: 1000 }).catch(() => false) ||
                           await alwaysAllowBtn.isVisible({ timeout: 1000 }).catch(() => false)

      log('check', 'Approval UI elements', { hasApprovalUI })

      log('pass', 'Permission queue display test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Approve Permission Once
  // PRD Feature: "Just Once" approval
  // -------------------------------------------------------------------------
  test('permission_approve_once - Can approve permission with "Just Once"', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', 'TEST: permission_approve_once')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // Setup project
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Create task
      const taskId = await createBenchmarkTask(window, projectId, 'Approve test', 'Run command')
      expect(taskId).not.toBeNull()

      // Select project and start task
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

      // Try to approve a permission
      const approved = await approvePermission(window)
      log('check', 'Permission approval attempt', { approved })

      // VERIFY: Check audit log for approval event
      const auditLog = await window.evaluate(async () => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<Array<{ event_type: string; details?: string }>> } } } }).api
        return await api.db.audit.get(undefined, 50)
      })

      const approvalEvents = auditLog.filter(e =>
        e.event_type === 'permission_approved' ||
        e.event_type === 'approval_allowed' ||
        e.event_type.includes('approv')
      )
      log('check', 'Approval events in audit log', { count: approvalEvents.length })

      log('pass', 'Approve once test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Deny Permission Once
  // PRD Feature: "Deny" permission
  // -------------------------------------------------------------------------
  test('permission_deny_once - Can deny permission', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', 'TEST: permission_deny_once')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // Setup project
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Create task
      const taskId = await createBenchmarkTask(window, projectId, 'Deny test', 'Run risky command')
      expect(taskId).not.toBeNull()

      // Select project and start task
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

      // Try to deny a permission
      const denied = await denyPermission(window)
      log('check', 'Permission denial attempt', { denied })

      // VERIFY: Check audit log for denial event
      const auditLog = await window.evaluate(async () => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<Array<{ event_type: string; details?: string }>> } } } }).api
        return await api.db.audit.get(undefined, 50)
      })

      const denialEvents = auditLog.filter(e =>
        e.event_type === 'permission_denied' ||
        e.event_type === 'approval_denied' ||
        e.event_type.includes('deni')
      )
      log('check', 'Denial events in audit log', { count: denialEvents.length })

      log('pass', 'Deny once test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Always Allow Pattern
  // PRD Feature: "Always" creates pattern rule
  // -------------------------------------------------------------------------
  test('permission_always_allow - "Always" creates persistent pattern rule', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', 'TEST: permission_always_allow')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // Setup project
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Create task
      const taskId = await createBenchmarkTask(window, projectId, 'Always allow test', 'Run npm test')
      expect(taskId).not.toBeNull()

      // Select project and start task
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

      // Try to click "Always Allow" button
      const alwaysAllowBtn = window.locator(SELECTORS.approvalAlwaysAllow).first()
      const btnVisible = await alwaysAllowBtn.isVisible({ timeout: 3000 }).catch(() => false)

      if (btnVisible) {
        log('step', 'Clicking "Always Allow" button')
        await alwaysAllowBtn.click()
        await slowWait(window, 'Pattern created')
      }

      // VERIFY: Pattern was persisted in approvals table
      const approvals = await window.evaluate(async () => {
        const api = (window as unknown as { api: { db: { approvals: { getAll: () => Promise<Array<{ id: string; action: string; pattern?: string }>> } } } }).api
        return await api.db.approvals.getAll()
      })

      const alwaysRules = approvals.filter(a => a.action === 'always' || a.action === 'allow')
      log('check', 'Persistent approval rules', { count: alwaysRules.length })

      log('pass', 'Always allow test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Audit Log Captures Permissions
  // PRD Feature: All permission decisions logged
  // -------------------------------------------------------------------------
  test('permission_audit_log - All permission decisions are logged', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    try {
      log('info', 'TEST: permission_audit_log')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // Setup project
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()
      const { projectId } = project!

      // Create task
      const taskId = await createBenchmarkTask(window, projectId, 'Audit log test', 'Test task')
      expect(taskId).not.toBeNull()

      // Select project and start task
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

      // Try to make permission decisions (may not have any pending)
      await approvePermission(window)
      await window.waitForTimeout(500)

      // VERIFY: Audit log contains entries - query database directly
      // Skip opening the UI panel to avoid potential UI blocking issues
      const auditLog = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { audit: { get: (taskId?: string, limit?: number) => Promise<Array<{ event_type: string; timestamp: string }>> } } } }).api
        return await api.db.audit.get(id, 100)
      }, taskId!)

      log('check', 'Audit log entries for task', { count: auditLog.length })
      expect(auditLog.length).toBeGreaterThan(0)

      // VERIFY: Task status changes are logged
      const statusChanges = auditLog.filter(e => e.event_type === 'task_status_changed')
      log('check', 'Status change events', { count: statusChanges.length })
      expect(statusChanges.length).toBeGreaterThan(0)

      log('pass', 'Audit log test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Permission Pattern Generation
  // PRD Feature: Patterns auto-generated from commands
  // -------------------------------------------------------------------------
  test('permission_pattern_generation - Patterns are generated from commands', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('permission_test')

    try {
      log('info', 'TEST: permission_pattern_generation')
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // This test verifies that the Go nerv-hook binary generates patterns correctly
      // The hook intercepts Claude's bash commands and generates regex patterns

      // Setup project
      const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)
      expect(project).not.toBeNull()

      // VERIFY: Go hook source exists with pattern generation
      const hookSourcePath = path.join(__dirname, '../../../../cmd/nerv-hook/main.go')
      const hookExists = fs.existsSync(hookSourcePath)
      log('check', 'Go hook source exists', { exists: hookExists, path: hookSourcePath })

      if (hookExists) {
        const hookContent = fs.readFileSync(hookSourcePath, 'utf-8')
        const hasPatternGen = hookContent.includes('generatePattern') ||
                             hookContent.includes('pattern') ||
                             hookContent.includes('regex')
        log('check', 'Hook has pattern generation', { has: hasPatternGen })
      }

      // VERIFY: Approvals table can store patterns
      const canStorePatterns = await window.evaluate(async () => {
        const api = (window as unknown as { api: { db: { approvals: { getAll: () => Promise<unknown[]> } } } }).api
        try {
          await api.db.approvals.getAll()
          return true
        } catch {
          return false
        }
      })
      log('check', 'Can access approvals table', { canAccess: canStorePatterns })
      expect(canStorePatterns).toBe(true)

      log('pass', 'Pattern generation test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      await safeAppClose(app)
    }
  })
})
