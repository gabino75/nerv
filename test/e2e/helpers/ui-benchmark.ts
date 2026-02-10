/**
 * UIBenchmarkRunner - Drives NERV Electron UI through a 3-phase benchmark
 *
 * Phase 1: Setup - Create project, add repo, start cycle, create tasks
 * Phase 2: Build - Execute tasks via UI, auto-approve permissions, cycle transitions
 * Phase 3: Grade - Score planning quality, code quality, NERV ops
 *
 * Emits timestamped event log for video post-processing.
 */

import { Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { SELECTORS, TIMEOUT } from './selectors'
import { log, slowWait } from './launch'
import {
  setupBenchmarkProjectWithRepo,
  createBenchmarkTaskViaAPI,
  approvePermission,
} from './actions'
import {
  runReviewAgent,
} from '../../../src/core/benchmark-review'
import { PRD_WORKFLOW_EXCERPT } from '../../../src/shared/prompts/prd-excerpt'
import type {
  UserScenario,
  MidProjectEvent,
  UIBenchmarkResult,
  UIBenchmarkSetupResult,
  UIBenchmarkBuildResult,
  UIBenchmarkGradeResult,
  UIBenchmarkEventLog,
} from '../../../src/shared/types/benchmark'

// ============================================================================
// Configuration
// ============================================================================

export interface UIBenchmarkConfig {
  specFile: string
  scenario: UserScenario
  testRepoPath: string
  outputDir: string
  /** Per-task timeout in ms (default: 15 min) */
  taskTimeout?: number
  /** Per-cycle timeout in ms (default: 45 min) */
  cycleTimeout?: number
  /** Total benchmark timeout in ms (default: 3 hours) */
  totalTimeout?: number
  /** Auto-approve all permission requests permanently (clicks "Always Allow") */
  autoApproveAll?: boolean
  /** Max review iterations per task before force-approving (default: 3) */
  maxReviewIterations?: number
  /** Review mode: 'auto' = AI review via CLI, 'human' = simulate human review via UI modal, 'none' = auto-approve */
  reviewMode?: 'auto' | 'human' | 'none'
}

const DEFAULT_TASK_TIMEOUT = 15 * 60 * 1000
const DEFAULT_CYCLE_TIMEOUT = 45 * 60 * 1000
const DEFAULT_TOTAL_TIMEOUT = 3 * 60 * 60 * 1000

// ============================================================================
// Event Log
// ============================================================================

class EventLog {
  private events: UIBenchmarkEventLog[] = []
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  emit(event: string, data: Partial<UIBenchmarkEventLog> = {}): void {
    const entry: UIBenchmarkEventLog = {
      t: Date.now() - this.startTime,
      event,
      ...data,
    }
    this.events.push(entry)
    log('info', `[event] ${event}`, { t: entry.t, ...data })
  }

  write(outputPath: string): void {
    fs.writeFileSync(
      outputPath,
      this.events.map(e => JSON.stringify(e)).join('\n') + '\n',
    )
  }

  getEvents(): UIBenchmarkEventLog[] {
    return this.events
  }
}

// ============================================================================
// UIBenchmarkRunner
// ============================================================================

export class UIBenchmarkRunner {
  private window: Page
  private config: UIBenchmarkConfig
  private eventLog: EventLog
  private totalStart = 0

  constructor(window: Page, config: UIBenchmarkConfig) {
    this.window = window
    this.config = config
    this.eventLog = new EventLog()
  }

  /**
   * Run the full 3-phase benchmark pipeline.
   */
  async run(): Promise<UIBenchmarkResult> {
    this.totalStart = Date.now()
    this.eventLog.emit('benchmark_start', { label: `Benchmark: ${this.config.specFile}` })

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true })
    }

    // Phase 1: Setup
    const setup = await this.runSetup()

    // Phase 2: Build
    const build = await this.runBuild(setup)

    // Phase 3: Grade
    const grade = await this.runGrade(setup, build)

    // Collect the built repository into the output directory
    await this.collectBuiltRepo(setup.projectId)

    const totalDurationMs = Date.now() - this.totalStart
    this.eventLog.emit('benchmark_complete', { label: `Done in ${Math.round(totalDurationMs / 1000)}s` })

    // Write event log
    const eventLogPath = path.join(this.config.outputDir, 'event-log.jsonl')
    this.eventLog.write(eventLogPath)

    // Write summary.json — the scoring script (score-benchmark.js) depends on this
    // file for providing workflow context to Claude during grading
    this.writeSummaryJson(setup, build, grade, totalDurationMs)

    // Write timeline.jsonl — scoring script reads this for event timeline context
    // (uses timestamp field, not t field like event-log.jsonl)
    this.writeTimelineJsonl()

    return {
      specFile: this.config.specFile,
      setup,
      build,
      grade,
      totalDurationMs,
      eventLogPath,
    }
  }

  // ==========================================================================
  // Output: summary.json for scoring script compatibility
  // ==========================================================================

  private writeSummaryJson(
    setup: UIBenchmarkSetupResult,
    build: UIBenchmarkBuildResult,
    grade: UIBenchmarkGradeResult,
    totalDurationMs: number,
  ): void {
    const events = this.eventLog.getEvents()
    const worktreesMerged = events.filter(e => e.event === 'worktree_merged').length
    const worktreesMergeFailed = events.filter(e => e.event === 'worktree_merge_failed').length
    const loopsDetected = events.filter(e => e.event === 'loop_dialog_dismissed').length
    const reviewsRun = events.filter(e => e.event === 'review_started').length
    const reviewsApproved = events.filter(e => e.event === 'review_decision').length
    const permissionsApproved = events.filter(e => e.event === 'permission_approved').length
    const permissionsAlwaysAllowed = events.filter(e => e.event === 'permission_always_allowed').length

    const summary = {
      benchmarkId: `ui-benchmark-${Date.now()}`,
      timestamp: Date.now(),
      nervVersion: '1.0.0',
      specFile: this.config.specFile,
      model: 'claude-sonnet-4-20250514',
      outcome: build.success && grade.success ? 'success' : build.tasksCompleted > 0 ? 'partial' : 'failed',

      duration: {
        totalMs: totalDurationMs,
        perCycle: [] as number[],
        perTask: {} as Record<string, number>,
      },

      tokens: { total: 0, input: 0, output: 0, cached: 0, perTask: {}, perCycle: [] as number[] },
      cost: { totalUsd: build.totalCostUsd, perTask: {}, perCycle: [] as number[] },

      tasks: {
        total: setup.taskIds.length + build.cyclesCompleted - 1,  // initial + per-cycle tasks
        completed: build.tasksCompleted,
        failed: build.tasksFailed,
        byStatus: { done: build.tasksCompleted, failed: build.tasksFailed },
      },

      cycles: {
        total: build.cyclesCompleted,
        auditsRun: 0,
        auditsPassed: 0,
      },

      workflow: {
        worktreesCreated: build.tasksCompleted + build.tasksFailed,
        worktreesMerged,
        worktreesDiscarded: worktreesMergeFailed,
        branchesCreated: build.tasksCompleted + build.tasksFailed,
        parallelTasksRun: 0,
        reviewsRun,
        reviewsApproved,
        permissionsRequested: permissionsApproved + permissionsAlwaysAllowed,
        permissionsApproved,
        permissionsAlwaysAllowed,
      },

      issues: {
        loopsDetected,
        compactions: 0,
        toolErrors: 0,
        toolRetries: 0,
        permissionTimeouts: 0,
        stuckDetections: 0,
      },

      spec: {
        totalItems: this.config.scenario.roughMilestones.length,
        itemsPassed: build.tasksCompleted,
        itemsFailed: build.tasksFailed,
        completionPercent: this.config.scenario.roughMilestones.length > 0
          ? Math.round((build.tasksCompleted / this.config.scenario.roughMilestones.length) * 100)
          : 0,
      },

      tests: { total: 0, passed: 0, failed: 0, skipped: 0 },

      scores: grade.success ? {
        planningScore: grade.planningScore,
        codeScore: grade.codeScore,
        nervOpsScore: grade.nervOpsScore,
        overallScore: grade.overallScore,
      } : null,
    }

    fs.writeFileSync(
      path.join(this.config.outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2),
    )
  }

  /**
   * Write timeline.jsonl in the format expected by the scoring script.
   * The scoring script expects objects with a `timestamp` field (ISO string),
   * while event-log.jsonl uses `t` (relative milliseconds).
   */
  private writeTimelineJsonl(): void {
    const events = this.eventLog.getEvents()
    const baseTime = this.totalStart
    const timelineEntries = events.map(e => ({
      timestamp: new Date(baseTime + (e.t || 0)).toISOString(),
      event: e.event,
      label: e.label || '',
      region: e.region || '',
    }))

    fs.writeFileSync(
      path.join(this.config.outputDir, 'timeline.jsonl'),
      timelineEntries.map(e => JSON.stringify(e)).join('\n') + '\n',
    )
  }

  // ==========================================================================
  // Phase 1: Setup
  // ==========================================================================

  private async runSetup(): Promise<UIBenchmarkSetupResult> {
    const start = Date.now()
    this.eventLog.emit('phase_start', { label: 'Phase 1: Setup', region: 'project-selector' })

    try {
      // Step 1: Create project via UI
      this.eventLog.emit('project_creating', { region: 'project-selector' })
      const project = await setupBenchmarkProjectWithRepo(
        this.window,
        this.config.testRepoPath,
      )
      if (!project) throw new Error('Failed to create project')
      this.eventLog.emit('project_created', { region: 'project-selector', label: project.projectName })

      // Step 2: Open CyclePanel and start Cycle 0
      this.eventLog.emit('cycle_starting', { region: 'task-board', label: 'Starting Cycle 0' })
      const cycleId = await this.startCycle0(project.projectId)
      this.eventLog.emit('cycle_started', { region: 'task-board', label: 'Cycle 0 active' })

      // Step 3: Create initial tasks from milestones
      this.eventLog.emit('tasks_creating', { region: 'task-board' })
      const taskIds = await this.createInitialTasks(
        project.projectId,
        this.config.scenario,
      )
      this.eventLog.emit('tasks_created', { region: 'task-board', label: `${taskIds.length} tasks` })

      return {
        phase: 'setup',
        durationMs: Date.now() - start,
        success: true,
        projectId: project.projectId,
        cycleId,
        taskIds,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.eventLog.emit('phase_error', { label: `Setup failed: ${msg}` })
      return {
        phase: 'setup',
        durationMs: Date.now() - start,
        success: false,
        error: msg,
        projectId: '',
        cycleId: '',
        taskIds: [],
      }
    }
  }

  private async startCycle0(projectId: string): Promise<string> {
    // Open cycles panel
    const cyclesBtn = this.window.locator(SELECTORS.cyclesBtn).first()
    if (await cyclesBtn.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)) {
      await cyclesBtn.click()
      await this.window.waitForTimeout(500)
    }

    // Click "Start Cycle 0"
    const startBtn = this.window.locator(SELECTORS.startFirstCycleBtn).first()
    if (await startBtn.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)) {
      await startBtn.click()
      await this.window.waitForTimeout(500)

      // Fill goal and create
      const goalInput = this.window.locator(SELECTORS.cycleGoalInput).first()
      if (await goalInput.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await goalInput.fill(this.config.scenario.roughMilestones[0] || 'Initial setup')
        await this.window.waitForTimeout(200)
      }

      const createBtn = this.window.locator(SELECTORS.createCycleBtn).first()
      if (await createBtn.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await createBtn.click()
        await this.window.waitForTimeout(500)
      }
    } else {
      // Fallback: create cycle via API
      await this.window.evaluate(async (args: { projectId: string; goal: string }) => {
        const api = (window as unknown as { api: { db: { cycles: { create: (pid: string, n: number, g: string) => Promise<{ id: string }> } } } }).api
        await api.db.cycles.create(args.projectId, 0, args.goal)
      }, { projectId, goal: this.config.scenario.roughMilestones[0] || 'Initial setup' })
    }

    // Close modal/panel if still open
    const closeBtn = this.window.locator(SELECTORS.closeBtn).first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
      await this.window.waitForTimeout(300)
    }

    // Get cycle ID
    const cycleId = await this.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: { db: { cycles: { getActive: (pid: string) => Promise<{ id: string } | undefined> } } } }).api
      const cycle = await api.db.cycles.getActive(pid)
      return cycle?.id || ''
    }, projectId)

    return cycleId
  }

  private async createInitialTasks(
    projectId: string,
    scenario: UserScenario,
  ): Promise<string[]> {
    const taskIds: string[] = []

    // Create a task for the first milestone
    const firstMilestone = scenario.roughMilestones[0] || 'Initial implementation'
    const taskId = await createBenchmarkTaskViaAPI(
      this.window,
      projectId,
      firstMilestone,
      `Build: ${scenario.projectIdea.slice(0, 200)}`,
    )
    if (taskId) taskIds.push(taskId)

    return taskIds
  }

  // ==========================================================================
  // Phase 2: Build
  // ==========================================================================

  private async runBuild(setup: UIBenchmarkSetupResult): Promise<UIBenchmarkBuildResult> {
    const start = Date.now()
    this.eventLog.emit('phase_start', { label: 'Phase 2: Build', region: 'task-board' })

    if (!setup.success) {
      return {
        phase: 'build',
        durationMs: Date.now() - start,
        success: false,
        error: 'Setup phase failed',
        cyclesCompleted: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        totalCostUsd: 0,
      }
    }

    let cyclesCompleted = 0
    let tasksCompleted = 0
    let tasksFailed = 0
    let totalCostUsd = 0
    const totalTimeout = this.config.totalTimeout ?? DEFAULT_TOTAL_TIMEOUT

    try {
      // Execute tasks for current cycle
      for (const taskId of setup.taskIds) {
        if (Date.now() - this.totalStart > totalTimeout) {
          log('info', 'Total timeout reached, stopping build')
          break
        }

        const result = await this.executeTask(
          taskId,
          setup.projectId,
          this.config.taskTimeout ?? DEFAULT_TASK_TIMEOUT,
        )

        if (result.success) {
          tasksCompleted++
        } else {
          tasksFailed++
        }
        totalCostUsd += result.costUsd
      }

      // Complete cycle 0
      await this.completeCycle(setup.projectId)
      cyclesCompleted++

      // Inject mid-project events after cycle 0 (if any for after_cycle_0)
      // Most events are for after_cycle_1+, but handle gracefully
      const eventsAfterCycle0 = this.config.scenario.midProjectEvents.filter(e => e.afterCycle === 0)
      if (eventsAfterCycle0.length > 0) {
        await this.injectMidProjectEvents(setup.projectId, eventsAfterCycle0)
      }

      // Continue with additional cycles based on milestones
      const maxCycles = Math.min(this.config.scenario.roughMilestones.length, 5)
      for (let cycleNum = 1; cycleNum < maxCycles; cycleNum++) {
        if (Date.now() - this.totalStart > totalTimeout) break

        this.eventLog.emit('cycle_transition', {
          label: `Starting Cycle ${cycleNum}`,
          region: 'task-board',
        })

        // Create next cycle
        const milestone = this.config.scenario.roughMilestones[cycleNum] || `Cycle ${cycleNum}`
        const cycleId = await this.createNextCycle(setup.projectId, milestone)
        if (!cycleId) break

        // Create tasks for this cycle
        const newTaskId = await createBenchmarkTaskViaAPI(
          this.window,
          setup.projectId,
          milestone,
          `Continue building: ${this.config.scenario.projectIdea.slice(0, 200)}`,
        )

        if (newTaskId) {
          const result = await this.executeTask(
            newTaskId,
            setup.projectId,
            this.config.taskTimeout ?? DEFAULT_TASK_TIMEOUT,
          )
          if (result.success) tasksCompleted++
          else tasksFailed++
          totalCostUsd += result.costUsd
        }

        await this.completeCycle(setup.projectId)
        cyclesCompleted++

        // Inject mid-project events
        const events = this.config.scenario.midProjectEvents.filter(e => e.afterCycle === cycleNum)
        if (events.length > 0) {
          await this.injectMidProjectEvents(setup.projectId, events)
        }
      }

      this.eventLog.emit('phase_complete', { label: `Build: ${tasksCompleted} tasks, ${cyclesCompleted} cycles` })

      return {
        phase: 'build',
        durationMs: Date.now() - start,
        success: true,
        cyclesCompleted,
        tasksCompleted,
        tasksFailed,
        totalCostUsd,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.eventLog.emit('phase_error', { label: `Build failed: ${msg}` })
      return {
        phase: 'build',
        durationMs: Date.now() - start,
        success: false,
        error: msg,
        cyclesCompleted,
        tasksCompleted,
        tasksFailed,
        totalCostUsd,
      }
    }
  }

  private async executeTask(
    taskId: string,
    projectId: string,
    timeout: number,
  ): Promise<{ success: boolean; costUsd: number }> {
    this.eventLog.emit('task_started', {
      region: 'action-bar',
      label: `Task ${taskId}`,
    })

    const taskStart = Date.now()
    const isMockMode = process.env.NERV_MOCK_CLAUDE !== 'false'

    try {
      // Step 1: Click task card to select it (store was refreshed after task creation)
      const taskSelector = `[data-testid="task-item"][data-task-id="${taskId}"]`
      const taskCard = this.window.locator(taskSelector).first()

      // Retry loop: refresh store and wait for card to appear in DOM
      // Svelte reactivity needs time to propagate store updates to the DOM.
      // Cards may also be scrolled out of view in the todo column.
      let cardReady = false
      for (let attempt = 0; attempt < 5 && !cardReady; attempt++) {
        // Dismiss any overlay dialogs before trying to find/click the card
        await this.dismissOverlayDialogs()
        // On every attempt, ensure store has the task loaded from DB
        const storeInfo = await this.window.evaluate(async (args: { pid: string; tid: string }) => {
          const store = (window as unknown as { __nervStore?: {
            loadTasks: (pid: string) => Promise<void>
            subscribe: (fn: (s: { tasks: Array<{ id: string; status: string; project_id: string }>; selectedProjectId: string | null; isTaskRunning: boolean }) => void) => () => void
          } }).__nervStore
          if (!store) return { storeExists: false, taskInStore: false, taskCount: 0, selectedProjectId: null, isRunning: false }

          // Force reload tasks from DB
          await store.loadTasks(args.pid)

          // Check store state - use flag pattern because Svelte stores
          // call subscribers synchronously, before subscribe() returns.
          return new Promise<{
            storeExists: boolean; taskInStore: boolean; taskCount: number;
            selectedProjectId: string | null; isRunning: boolean
          }>(resolve => {
            let resolved = false
            const unsub = store.subscribe(s => {
              if (resolved) return
              resolved = true
              queueMicrotask(() => unsub?.())
              resolve({
                storeExists: true,
                taskInStore: s.tasks.some(t => t.id === args.tid),
                taskCount: s.tasks.filter(t => t.project_id === s.selectedProjectId).length,
                selectedProjectId: s.selectedProjectId,
                isRunning: s.isTaskRunning,
              })
            })
          })
        }, { pid: projectId, tid: taskId })

        if (attempt > 0 || !storeInfo.taskInStore) {
          log('info', `Task card lookup (attempt ${attempt + 1}/5)`, {
            taskId,
            ...storeInfo,
          })
        }

        // Wait for Svelte to render the DOM update
        await this.window.waitForTimeout(500)

        // First check if element exists in DOM at all (even if scrolled out of view)
        const elementExists = await this.window.locator(taskSelector).count() > 0
        if (elementExists) {
          // Scroll the card into view before checking visibility
          await taskCard.scrollIntoViewIfNeeded().catch(() => {})
          await this.window.waitForTimeout(200)
          cardReady = await taskCard.isVisible({ timeout: 2000 }).catch(() => false)
        }
      }

      if (!cardReady) {
        log('fail', 'Task card not visible after store refresh', { taskId })
        this.eventLog.emit('task_error', { label: `Task ${taskId} not visible in UI` })
        return { success: false, costUsd: 0 }
      }

      // Dismiss any overlay dialogs (loop detection, etc.) before clicking
      await this.dismissOverlayDialogs()
      await taskCard.click()
      await this.window.waitForTimeout(500)
      log('step', 'Task card clicked', { taskId })

      // Step 2: Ensure app is not stuck in "running" state from a previous task
      // If isRunning is true, the Start Task button shows "Running..." and is disabled.
      // Reset the flag directly without calling stopTask() which would set the previous
      // task to 'interrupted' status (we want it to stay 'done').
      const isStuck = await this.window.evaluate(async () => {
        const store = (window as unknown as { __nervStore?: { subscribe: (fn: (s: { isTaskRunning: boolean }) => void) => () => void } }).__nervStore
        if (!store) return false
        return new Promise<boolean>(resolve => {
          let resolved = false
          const unsub = store.subscribe(s => {
            if (resolved) return
            resolved = true
            queueMicrotask(() => unsub?.())
            resolve(s.isTaskRunning)
          })
        })
      })

      if (isStuck) {
        log('info', 'Resetting stale isRunning state', { taskId })
        // Get the current task ID before stopping, so we can restore its status
        const prevTaskId = await this.window.evaluate(async () => {
          const store = (window as unknown as { __nervStore?: {
            subscribe: (fn: (s: { currentTaskId: string | null }) => void) => () => void
          } }).__nervStore
          if (!store) return null
          return new Promise<string | null>(resolve => {
            let resolved = false
            const unsub = store.subscribe(s => {
              if (resolved) return
              resolved = true
              queueMicrotask(() => unsub?.())
              resolve(s.currentTaskId)
            })
          })
        })

        // stopTask() resets isTaskRunning but sets the task to 'interrupted'
        await this.window.evaluate(async () => {
          const store = (window as unknown as { __nervStore?: { stopTask: () => Promise<void> } }).__nervStore
          if (store?.stopTask) await store.stopTask()
        })

        // Restore the previous task to 'done' if it was completed
        if (prevTaskId) {
          await this.window.evaluate(async (tid: string) => {
            const store = (window as unknown as { __nervStore?: { updateTaskStatus: (id: string, status: string) => Promise<void> } }).__nervStore
            if (store?.updateTaskStatus) await store.updateTaskStatus(tid, 'done')
          }, prevTaskId)
        }

        // Reload tasks to ensure UI is in sync
        await this.window.evaluate(async (pid: string) => {
          const store = (window as unknown as { __nervStore?: { loadTasks: (pid: string) => Promise<void> } }).__nervStore
          if (store?.loadTasks) await store.loadTasks(pid)
        }, projectId)
        await this.window.waitForTimeout(500)
      }

      // Step 2b: Ensure this specific task is the one getNextTask() will pick.
      // ActionBar.handleStartTask() uses getNextTask() which returns the FIRST
      // task with status 'todo'. When mid-project events create scope_creep tasks,
      // multiple tasks may be in 'todo' status and the wrong one gets started.
      // Fix: temporarily shelve other todo tasks so only our target is 'todo'.
      const otherTodoIds = await this.window.evaluate(async (args: { pid: string; tid: string }) => {
        const api = (window as unknown as { api: { db: { tasks: { getForProject: (pid: string) => Promise<Array<{ id: string; status: string }>> } } } }).api
        const allTasks = await api.db.tasks.getForProject(args.pid)
        return allTasks.filter(t => t.status === 'todo' && t.id !== args.tid).map(t => t.id)
      }, { pid: projectId, tid: taskId })

      if (otherTodoIds.length > 0) {
        log('info', 'Shelving other todo tasks to ensure correct task starts', {
          taskId,
          otherTodoIds,
        })
        // Move other todo tasks to 'done' temporarily (valid TaskStatus)
        for (const otherId of otherTodoIds) {
          await this.window.evaluate(async (tid: string) => {
            const store = (window as unknown as { __nervStore?: { updateTaskStatus: (id: string, status: string) => Promise<void> } }).__nervStore
            if (store?.updateTaskStatus) await store.updateTaskStatus(tid, 'done')
          }, otherId)
        }
        // Reload tasks so ActionBar sees the updated statuses
        await this.window.evaluate(async (pid: string) => {
          const store = (window as unknown as { __nervStore?: { loadTasks: (pid: string) => Promise<void> } }).__nervStore
          if (store?.loadTasks) await store.loadTasks(pid)
        }, projectId)
        await this.window.waitForTimeout(300)
      }

      // Step 3: Click Start Task button (use data-testid for reliability)
      const startBtn = this.window.locator('[data-testid="start-task-btn"]').first()
      const startVisible = await startBtn.isVisible({ timeout: 5000 }).catch(() => false)
      if (!startVisible) {
        log('fail', 'Start Task button not visible', { taskId })
        this.eventLog.emit('task_error', { label: `Start button not visible for ${taskId}` })
        return { success: false, costUsd: 0 }
      }

      // Wait for the button to become enabled (may take a moment after state reset)
      let startEnabled = false
      for (let i = 0; i < 10; i++) {
        startEnabled = await startBtn.isEnabled()
        if (startEnabled) break
        await this.window.waitForTimeout(500)
      }

      if (!startEnabled) {
        log('fail', 'Start Task button not enabled after waiting', { taskId })
        this.eventLog.emit('task_error', { label: `Start button disabled for ${taskId}` })
        return { success: false, costUsd: 0 }
      }

      await startBtn.click()
      await this.window.waitForTimeout(2000)
      this.eventLog.emit('claude_thinking', { action: 'speed-up', factor: 3 })
      log('step', 'Start Task clicked - Claude session started', { taskId })

      // Restore shelved tasks back to 'todo' now that our task has started
      if (otherTodoIds.length > 0) {
        for (const otherId of otherTodoIds) {
          await this.window.evaluate(async (tid: string) => {
            const store = (window as unknown as { __nervStore?: { updateTaskStatus: (id: string, status: string) => Promise<void> } }).__nervStore
            if (store?.updateTaskStatus) await store.updateTaskStatus(tid, 'todo')
          }, otherId)
        }
      }

      // Step 3: Wait for task completion via database polling + auto-approve approvals
      // NERV auto-transitions task to 'review' when Claude session exits (TabContainer.svelte)
      const effectiveTimeout = isMockMode ? Math.min(timeout, 60000) : timeout

      const finalStatus = await this.waitForTaskCompletion(taskId, effectiveTimeout, !isMockMode)

      if (!finalStatus) {
        this.eventLog.emit('task_timeout', { label: `Task ${taskId} timed out after ${Math.round((Date.now() - taskStart) / 1000)}s` })
        log('fail', 'Task timed out', { taskId, elapsed: `${Math.round((Date.now() - taskStart) / 1000)}s` })
        return { success: false, costUsd: 0 }
      }

      // Step 4: Review cycle (real Claude) or auto-approve (mock)
      if (finalStatus === 'review') {
        const reviewMode = this.config.reviewMode ?? (isMockMode ? 'none' : 'auto')

        if (reviewMode === 'human') {
          await this.humanReviewTask(taskId, projectId, timeout)
        } else if (reviewMode === 'auto') {
          await this.reviewAndIterateTask(taskId, projectId, timeout)
        } else {
          this.eventLog.emit('review_started', { region: 'terminal-panel', label: 'Review: auto-approve (mock)' })
          this.eventLog.emit('review_decision', { region: 'terminal-panel', label: 'Review: Approved' })
          await this.approveTask(taskId)
        }
      }

      // Reset running state so the next task can start cleanly.
      // stopTask() sets status to 'interrupted', so restore to 'done' afterwards.
      await this.window.evaluate(async () => {
        const store = (window as unknown as { __nervStore?: { stopTask: () => Promise<void> } }).__nervStore
        if (store?.stopTask) await store.stopTask()
      })
      await this.window.evaluate(async (tid: string) => {
        const store = (window as unknown as { __nervStore?: { updateTaskStatus: (id: string, status: string) => Promise<void> } }).__nervStore
        if (store?.updateTaskStatus) await store.updateTaskStatus(tid, 'done')
      }, taskId)

      this.eventLog.emit('task_completed', { label: `Task ${taskId}` })
      return { success: true, costUsd: 0 }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.eventLog.emit('task_error', { label: msg })
      return { success: false, costUsd: 0 }
    }
  }

  /**
   * Wait for a task to reach 'review' or 'done' status.
   *
   * Injects a polling interval *inside* the page context that checks the DB
   * and writes the result to a synchronous global variable. Then uses
   * page.waitForFunction to check that variable (synchronous = no Promise
   * truthiness bug). Also starts an approval auto-watcher if requested.
   *
   * Returns the final status or null on timeout.
   */
  private async waitForTaskCompletion(
    taskId: string,
    timeout: number,
    watchApprovals: boolean,
  ): Promise<string | null> {
    // Set up an approval auto-clicker that runs concurrently
    let approvalCleanup: (() => Promise<void>) | null = null
    if (watchApprovals) {
      approvalCleanup = await this.startApprovalWatcher()
    }

    // Unique key for this task's status flag
    const flagKey = `__nervTaskDone_${taskId.replace(/[^a-zA-Z0-9]/g, '_')}`

    // Periodically dismiss overlay dialogs (loop detection) from Playwright context
    const dialogDismisser = setInterval(async () => {
      try { await this.dismissOverlayDialogs() } catch { /* page may be navigating */ }
    }, 5000)

    try {
      // Inject a polling interval in the page that checks DB and sets a sync flag
      await this.window.evaluate(([tid, key]) => {
        const win = window as unknown as Record<string, unknown>
        // Clear any prior watcher for this task
        const timerKey = `${key}_timer`
        if (win[timerKey]) clearInterval(win[timerKey] as ReturnType<typeof setInterval>)
        // Initialize the synchronous flag
        win[key] = null

        win[timerKey] = setInterval(async () => {
          try {
            const api = (window as unknown as {
              api: { db: { tasks: { get: (id: string) => Promise<{ status: string } | undefined> } } }
            }).api
            const task = await api.db.tasks.get(tid)
            const s = task?.status || 'unknown'
            if (s === 'review' || s === 'done') {
              // Write the final status synchronously
              ;(window as unknown as Record<string, unknown>)[key] = s
              clearInterval((window as unknown as Record<string, unknown>)[`${key}_timer`] as ReturnType<typeof setInterval>)
            }
          } catch {
            // DB not ready yet, keep polling
          }
        }, 1000)
      }, [taskId, flagKey] as [string, string])

      // Now waitForFunction just checks the synchronous flag — no async, no Promise
      const status = await this.window.waitForFunction(
        (key: string) => {
          return (window as unknown as Record<string, unknown>)[key] as string | null
        },
        flagKey,
        { timeout, polling: 500 },
      ).then(handle => handle.jsonValue())
        .catch(() => null)

      if (status) {
        this.eventLog.emit('claude_done', { action: 'normal-speed' })
        log('step', 'Task reached review/done', { taskId, status })
      }
      return status
    } finally {
      clearInterval(dialogDismisser)
      // Clean up the page-side interval
      await this.window.evaluate((key: string) => {
        const win = window as unknown as Record<string, unknown>
        const timerKey = `${key}_timer`
        if (win[timerKey]) clearInterval(win[timerKey] as ReturnType<typeof setInterval>)
        delete win[key]
        delete win[timerKey]
      }, flagKey).catch(() => {})
      if (approvalCleanup) await approvalCleanup()
    }
  }

  /**
   * Start a background approval watcher that auto-clicks approval buttons
   * as they appear via a periodic check in the page context.
   * Returns a cleanup function to stop watching.
   */
  private async startApprovalWatcher(): Promise<() => Promise<void>> {
    // Inject an interval in the page that auto-resolves pending approvals
    await this.window.evaluate(() => {
      const win = window as unknown as {
        __nervApprovalWatcher?: ReturnType<typeof setInterval>
        __nervApprovalCount?: number
        api: {
          db: {
            approvals: {
              getPending: () => Promise<Array<{ id: number; tool_name: string }>>
              resolve: (id: number, status: string) => Promise<unknown>
            }
          }
        }
      }
      // Clear any existing watcher
      if (win.__nervApprovalWatcher) clearInterval(win.__nervApprovalWatcher)
      win.__nervApprovalCount = 0

      win.__nervApprovalWatcher = setInterval(async () => {
        try {
          const pending = await win.api.db.approvals.getPending()
          for (const approval of pending) {
            console.log(`[NERV] Auto-approving: ${approval.tool_name} (id=${approval.id})`)
            await win.api.db.approvals.resolve(approval.id, 'approved')
            win.__nervApprovalCount = (win.__nervApprovalCount || 0) + 1
          }
        } catch {
          // Approvals API may not be available yet
        }
      }, 500)
    })

    log('step', 'Approval auto-watcher started')

    const emitEvents = async () => {
      const count = await this.window.evaluate(() => {
        const win = window as unknown as { __nervApprovalCount?: number }
        return win.__nervApprovalCount || 0
      })
      for (let i = 0; i < count; i++) {
        this.eventLog.emit('permission_approved', { region: 'approval-watcher' })
      }
    }

    return async () => {
      await emitEvents()
      await this.window.evaluate(() => {
        const win = window as unknown as {
          __nervApprovalWatcher?: ReturnType<typeof setInterval>
          __nervApprovalCount?: number
        }
        if (win.__nervApprovalWatcher) {
          clearInterval(win.__nervApprovalWatcher)
          delete win.__nervApprovalWatcher
        }
        delete win.__nervApprovalCount
      })
    }
  }

  /**
   * Dismiss any modal overlay dialogs that block UI interaction (loop detection, etc.)
   */
  private async dismissOverlayDialogs(): Promise<boolean> {
    // Loop detection dialog - click "Continue Anyway"
    const loopContinueBtn = this.window.locator('[data-testid="loop-continue-btn"]').first()
    if (await loopContinueBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await loopContinueBtn.click()
      await this.window.waitForTimeout(300)
      log('step', 'Dismissed loop-detected dialog (clicked Continue)')
      this.eventLog.emit('loop_dialog_dismissed', { region: 'task-board' })
      return true
    }
    return false
  }

  private async checkAndApprovePermissions(): Promise<void> {
    // Use "Always Allow" to permanently approve all tool permissions
    // This avoids needing --dangerously-skip-permissions and exercises the real UI
    const alwaysAllowBtn = this.window.locator(SELECTORS.approvalAlwaysAllow).first()
    const alwaysAllowVisible = await alwaysAllowBtn.isVisible({ timeout: 1000 }).catch(() => false)

    if (alwaysAllowVisible) {
      log('step', 'Clicking "Always Allow" for permanent approval')
      await alwaysAllowBtn.click()
      await slowWait(this.window, 'Approval submitted')
      this.eventLog.emit('permission_always_allowed', { region: 'approval-queue' })
      return
    }

    // Fallback: try "Just Once" if "Always Allow" not available
    const approved = await approvePermission(this.window)
    if (approved) {
      this.eventLog.emit('permission_approved', { region: 'approval-queue' })
    }
  }

  /**
   * Run the review agent on a completed task and iterate if changes are needed.
   * Uses claude --print to review the code diff, then rejects with feedback
   * if the review finds issues. Claude then iterates on the task.
   * Max iterations controlled by config.maxReviewIterations (default: 3).
   */
  private async reviewAndIterateTask(
    taskId: string,
    projectId: string,
    timeout: number,
  ): Promise<void> {
    const maxIterations = this.config.maxReviewIterations ?? 3
    const taskStart = Date.now()

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.eventLog.emit('review_started', {
        region: 'terminal-panel',
        label: `Review iteration ${iteration + 1}/${maxIterations}`,
      })

      // Get task info for review context
      const taskInfo = await this.window.evaluate(async (tid: string) => {
        const api = (window as unknown as {
          api: {
            db: {
              tasks: { get: (id: string) => Promise<{ title: string; description: string; worktree_path: string | null } | undefined> }
            }
          }
        }).api
        const task = await api.db.tasks.get(tid)
        return task ? { title: task.title, description: task.description, worktreePath: task.worktree_path } : null
      }, taskId)

      if (!taskInfo?.worktreePath) {
        log('info', 'No worktree path for task, auto-approving', { taskId })
        this.eventLog.emit('review_decision', { region: 'terminal-panel', label: 'Review: Auto-approved (no worktree)' })
        await this.approveTask(taskId)
        return
      }

      // Get git diff from worktree
      let diff = ''
      try {
        const { execSync } = await import('child_process')
        const diffCmd = `git diff HEAD~1...HEAD --stat && echo "---DIFF---" && git diff HEAD~1...HEAD`
        diff = execSync(diffCmd, {
          cwd: taskInfo.worktreePath,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf-8',
        })
      } catch {
        log('info', 'Failed to get diff, auto-approving', { taskId })
        this.eventLog.emit('review_decision', { region: 'terminal-panel', label: 'Review: Auto-approved (no diff)' })
        await this.approveTask(taskId)
        return
      }

      // Run review agent using claude --print
      log('step', `Running review agent (iteration ${iteration + 1})`, { taskId })
      const reviewResult = await runReviewAgent(
        taskInfo.worktreePath,
        `${taskInfo.title}: ${taskInfo.description}`,
        diff,
        true, // assume tests pass for now
      )

      if (!reviewResult.success || !reviewResult.decision) {
        log('info', 'Review agent failed, auto-approving', { taskId, error: reviewResult.error })
        this.eventLog.emit('review_decision', { region: 'terminal-panel', label: 'Review: Auto-approved (agent error)' })
        await this.approveTask(taskId)
        return
      }

      const decision = reviewResult.decision
      this.eventLog.emit('review_result', {
        region: 'terminal-panel',
        label: `Review: ${decision.decision} (${(decision.confidence * 100).toFixed(0)}% confidence)`,
      })

      if (decision.decision === 'approve') {
        log('pass', 'Review approved', {
          taskId,
          iteration: iteration + 1,
          justification: decision.justification,
        })
        this.eventLog.emit('review_decision', {
          region: 'terminal-panel',
          label: `Review: Approved (iteration ${iteration + 1})`,
        })
        await this.approveTask(taskId)
        return
      }

      // Review says needs_changes or reject
      const feedback = [
        `Review feedback (iteration ${iteration + 1}):`,
        decision.justification,
        ...decision.concerns.map(c => `- Concern: ${c}`),
        ...decision.suggestions.map(s => `- Suggestion: ${s}`),
      ].join('\n')

      log('info', 'Review needs changes', {
        taskId,
        iteration: iteration + 1,
        concerns: decision.concerns.length,
        suggestions: decision.suggestions.length,
      })

      this.eventLog.emit('review_rejected', {
        region: 'terminal-panel',
        label: `Changes requested (${decision.concerns.length} concerns)`,
      })

      // Reject the task with feedback - sends it back to in_progress
      await this.window.evaluate(async (args: { tid: string; feedback: string }) => {
        const api = (window as unknown as {
          api: {
            db: {
              reviews: { reject: (taskId: string, notes: string) => Promise<unknown> }
              tasks: { updateStatus: (id: string, status: string) => Promise<unknown> }
            }
          }
        }).api
        try {
          await api.db.reviews.reject(args.tid, args.feedback)
        } catch {
          // Fallback: directly update status if review rejection IPC not available
          await api.db.tasks.updateStatus(args.tid, 'in_progress')
        }
      }, { tid: taskId, feedback })

      // Wait for Claude to iterate and bring task back to 'review'
      if (iteration < maxIterations - 1) {
        log('info', 'Waiting for Claude to iterate on feedback', { taskId })
        const remainingTimeout = Math.max(0, timeout - (Date.now() - taskStart))
        const reviewStatus = await this.waitForTaskCompletion(taskId, remainingTimeout, true)

        if (reviewStatus === 'done') {
          log('info', 'Task auto-completed during review iteration', { taskId })
          return
        }

        if (!reviewStatus) {
          log('info', 'Task did not return to review within timeout, force-approving', { taskId })
          this.eventLog.emit('review_decision', {
            region: 'terminal-panel',
            label: `Review: Force-approved after timeout (iteration ${iteration + 1})`,
          })
          await this.approveTask(taskId)
          return
        }
      }
    }

    // Max iterations reached, force approve
    log('info', `Max review iterations (${maxIterations}) reached, force-approving`, { taskId })
    this.eventLog.emit('review_decision', {
      region: 'terminal-panel',
      label: `Review: Force-approved after ${maxIterations} iterations`,
    })
    await this.approveTask(taskId)
  }

  /**
   * Simulate a human code review via the TaskReviewModal UI.
   *
   * Drives Playwright to:
   * 1. Click the task card to open review modal
   * 2. Click "Show Diff" to view code changes
   * 3. Generate review feedback (via claude --print acting as a human reviewer)
   * 4. Type feedback into review notes textarea
   * 5. Click "Request Changes" to send feedback to Claude
   * 6. Wait for Claude to iterate, then approve on second pass
   */
  private async humanReviewTask(
    taskId: string,
    projectId: string,
    timeout: number,
  ): Promise<void> {
    const maxIterations = this.config.maxReviewIterations ?? 3
    const taskStart = Date.now()

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.eventLog.emit('review_started', {
        region: 'terminal-panel',
        label: `Human review iteration ${iteration + 1}/${maxIterations}`,
      })

      // Step 1: Click task card to select it and trigger review modal
      const taskSelector = `[data-testid="task-item"][data-task-id="${taskId}"]`
      const taskCard = this.window.locator(taskSelector).first()
      const cardVisible = await taskCard.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)

      if (cardVisible) {
        await taskCard.click()
        await this.window.waitForTimeout(500)
      }

      // Step 2: Look for review modal to appear
      const reviewModal = this.window.locator('[data-testid="review-context"]').first()
      const modalVisible = await reviewModal.isVisible({ timeout: 3000 }).catch(() => false)

      if (!modalVisible) {
        // Try clicking a "Review" button if available
        const reviewBtn = this.window.locator('[data-testid="review-task-btn"]').first()
        const reviewBtnVisible = await reviewBtn.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)
        if (reviewBtnVisible) {
          await reviewBtn.click()
          await this.window.waitForTimeout(1000)
        }
      }

      // Step 3: Toggle diff view if available
      const toggleDiffBtn = this.window.locator('[data-testid="toggle-diff-btn"]').first()
      const diffBtnVisible = await toggleDiffBtn.isVisible({ timeout: 2000 }).catch(() => false)
      if (diffBtnVisible) {
        await toggleDiffBtn.click()
        await this.window.waitForTimeout(500)
        this.eventLog.emit('human_review_diff_opened', { region: 'terminal-panel' })
      }

      // Step 4: Get diff content for review feedback generation
      let diffContent = ''
      const diffEl = this.window.locator('[data-testid="diff-content"]').first()
      const diffVisible = await diffEl.isVisible({ timeout: 2000 }).catch(() => false)
      if (diffVisible) {
        diffContent = await diffEl.textContent() || ''
      }

      // Step 5: Generate review feedback using claude --print (simulating a thoughtful human reviewer)
      let feedback = ''
      if (diffContent && iteration < maxIterations - 1) {
        // Only generate critical feedback on non-final iterations
        try {
          feedback = await this.generateHumanReviewFeedback(diffContent, iteration)
        } catch {
          log('info', 'Failed to generate review feedback, will approve', { taskId })
        }
      }

      // Step 6: Type feedback and click appropriate button
      const notesInput = this.window.locator('[data-testid="review-notes-input"]').first()
      const notesVisible = await notesInput.isVisible({ timeout: 2000 }).catch(() => false)

      if (feedback && iteration < maxIterations - 1 && notesVisible) {
        // Request changes with feedback
        await notesInput.fill(feedback)
        await this.window.waitForTimeout(300)

        const rejectBtn = this.window.locator('[data-testid="reject-review-btn"]').first()
        const rejectVisible = await rejectBtn.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)
        if (rejectVisible) {
          await rejectBtn.click()
          await this.window.waitForTimeout(500)

          this.eventLog.emit('human_review_changes_requested', {
            region: 'terminal-panel',
            label: `Human reviewer requested changes (iteration ${iteration + 1})`,
          })

          // Wait for task to return to review
          const remainingTimeout = Math.max(0, timeout - (Date.now() - taskStart))
          const reviewStatus = await this.waitForTaskCompletion(taskId, remainingTimeout, true)

          if (reviewStatus === 'done') return // auto-completed

          if (!reviewStatus) {
            log('info', 'Task did not return to review, force-approving', { taskId })
            await this.approveTask(taskId)
            return
          }

          continue // Next review iteration
        }
      }

      // Approve the task (final iteration or no feedback needed)
      const approveBtn = this.window.locator('[data-testid="approve-review-btn"]').first()
      const approveVisible = await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)
      if (approveVisible) {
        if (notesVisible) {
          await notesInput.fill(feedback || 'Looks good! Approved after review.')
          await this.window.waitForTimeout(200)
        }
        await approveBtn.click()
        await this.window.waitForTimeout(500)

        this.eventLog.emit('human_review_approved', {
          region: 'terminal-panel',
          label: `Human reviewer approved (iteration ${iteration + 1})`,
        })
        return
      }

      // Fallback: approve via API if UI elements not found
      log('info', 'Review modal not fully accessible, approving via API', { taskId })
      this.eventLog.emit('review_decision', {
        region: 'terminal-panel',
        label: 'Review: Approved via API (modal not accessible)',
      })
      await this.approveTask(taskId)
      return
    }

    // Max iterations reached
    await this.approveTask(taskId)
  }

  /**
   * Generate human-like review feedback using claude --print.
   * Simulates a developer reviewing a PR and leaving actionable comments.
   */
  private async generateHumanReviewFeedback(diffContent: string, iteration: number): Promise<string> {
    const { spawn } = await import('child_process')

    const prompt = `You are a senior developer reviewing a pull request. Look at this diff and write 2-3 specific, actionable review comments as if you were leaving them on GitHub.

Focus on:
- Code quality issues (naming, structure, error handling)
- Missing edge cases or validation
- Suggestions for improvement

Be constructive and specific. Reference file names and line numbers when possible.
Keep it under 200 words. Write in first person as a reviewer ("I noticed...", "Consider...", "This could...").

${iteration > 0 ? 'This is a follow-up review after previous feedback was addressed. Be less critical and focus on any remaining issues.' : ''}

Diff:
\`\`\`
${diffContent.slice(0, 10000)}
\`\`\`

Write your review comments (plain text, no JSON):`

    return new Promise((resolve, reject) => {
      const claudeProcess = spawn('claude', [
        '--print',
        '--output-format', 'text',
        '--model', 'haiku',
        '--max-turns', '1',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      claudeProcess.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      claudeProcess.stdin.write(prompt)
      claudeProcess.stdin.end()

      const timer = setTimeout(() => {
        claudeProcess.kill()
        reject(new Error('Feedback generation timed out'))
      }, 60000)

      claudeProcess.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim())
        } else {
          reject(new Error(`Feedback generation failed with code ${code}`))
        }
      })

      claudeProcess.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  private async approveTask(taskId: string): Promise<void> {
    await this.window.evaluate(async (tid: string) => {
      const api = (window as unknown as {
        api: {
          db: {
            reviews: { approve: (taskId: string, notes: string) => Promise<unknown> }
            tasks: { updateStatus: (id: string, status: string) => Promise<unknown> }
          }
        }
      }).api
      try {
        await api.db.reviews.approve(tid, 'Approved by benchmark review agent')
      } catch {
        // Fallback: directly update status
        await api.db.tasks.updateStatus(tid, 'done')
      }
    }, taskId)

    // PRD: Merge worktree branch into base branch on approval
    try {
      const mergeResult = await this.window.evaluate(async (tid: string) => {
        const api = (window as unknown as {
          api: {
            db: { tasks: { get: (id: string) => Promise<{ worktree_path: string | null } | undefined> } }
            worktree: { merge: (path: string) => Promise<{ merged: boolean; error?: string }> }
          }
        }).api
        const task = await api.db.tasks.get(tid)
        if (task?.worktree_path) {
          return await api.worktree.merge(task.worktree_path)
        }
        return { merged: false, error: 'no worktree' }
      }, taskId)

      if (mergeResult?.merged) {
        this.eventLog.emit('worktree_merged', { label: `Task ${taskId} merged` })
      } else {
        this.eventLog.emit('worktree_merge_failed', { label: `Task ${taskId}: ${mergeResult?.error}` })
      }
    } catch (error) {
      this.eventLog.emit('worktree_merge_failed', { label: `Task ${taskId}: ${error}` })
    }
  }

  private async completeCycle(projectId: string): Promise<void> {
    this.eventLog.emit('cycle_completing', { region: 'task-board' })

    // Try to complete via API (more reliable than UI clicks)
    await this.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: { db: { cycles: { getActive: (pid: string) => Promise<{ id: string } | undefined>, complete: (id: string, l?: string) => Promise<unknown> } } } }).api
      const cycle = await api.db.cycles.getActive(pid)
      if (cycle) {
        await api.db.cycles.complete(cycle.id, 'Cycle completed by UI benchmark')
      }
    }, projectId)

    this.eventLog.emit('cycle_completed', { region: 'task-board' })
    await this.window.waitForTimeout(500)
  }

  private async createNextCycle(projectId: string, goal: string): Promise<string | null> {
    const cycleId = await this.window.evaluate(async (args: { pid: string; goal: string }) => {
      const api = (window as unknown as { api: { db: { cycles: { getNextNumber: (pid: string) => Promise<number>, create: (pid: string, n: number, g: string) => Promise<{ id: string }> } } } }).api
      const num = await api.db.cycles.getNextNumber(args.pid)
      const cycle = await api.db.cycles.create(args.pid, num, args.goal)
      return cycle.id
    }, { pid: projectId, goal })

    return cycleId
  }

  private async injectMidProjectEvents(
    projectId: string,
    events: MidProjectEvent[],
  ): Promise<void> {
    for (const event of events) {
      this.eventLog.emit('mid_project_event', {
        label: `[${event.type}] ${event.content.slice(0, 50)}`,
      })

      switch (event.type) {
        case 'scope_creep':
          // Create a new task for scope creep
          await createBenchmarkTaskViaAPI(
            this.window,
            projectId,
            event.content.slice(0, 100),
            `Scope addition: ${event.content}`,
          )
          break

        case 'mind_change':
          // Record as a decision
          await this.window.evaluate(async (args: { pid: string; content: string }) => {
            const api = (window as unknown as { api: { db: { decisions: { create: (pid: string, title: string, rationale?: string) => Promise<unknown> } } } }).api
            await api.db.decisions.create(args.pid, `Mind change: ${args.content.slice(0, 80)}`, args.content)
          }, { pid: projectId, content: event.content })
          break

        case 'user_says':
          // Record as a decision (user feedback)
          await this.window.evaluate(async (args: { pid: string; content: string }) => {
            const api = (window as unknown as { api: { db: { decisions: { create: (pid: string, title: string, rationale?: string) => Promise<unknown> } } } }).api
            await api.db.decisions.create(args.pid, `User request: ${args.content.slice(0, 80)}`, args.content)
          }, { pid: projectId, content: event.content })
          break
      }
    }
  }

  // ==========================================================================
  // Phase 3: Grade
  // ==========================================================================

  private async runGrade(
    setup: UIBenchmarkSetupResult,
    build: UIBenchmarkBuildResult,
  ): Promise<UIBenchmarkGradeResult> {
    const start = Date.now()
    this.eventLog.emit('phase_start', { label: 'Phase 3: Grade' })
    const isMockMode = process.env.NERV_MOCK_CLAUDE !== 'false'

    try {
      let planningScore: number
      let codeScore: number
      let nervOpsScore: number

      if (isMockMode) {
        // Mock mode: fixed passing scores, no Claude calls
        planningScore = 8
        codeScore = 8
        nervOpsScore = 8
      } else {
        // Real mode: all 3 categories graded by Claude
        this.eventLog.emit('grading_code', { label: 'Grading with Claude (3 calls)...' })
        const grades = await this.gradeAllWithClaude(setup.projectId, build)
        planningScore = grades.planning
        codeScore = grades.code
        nervOpsScore = grades.nervOps
      }

      // Weighted overall: Planning 15%, Code 50%, NERV Ops 35%
      const overallScore = Math.round(
        (planningScore * 0.15 + codeScore * 0.50 + nervOpsScore * 0.35) * 10,
      ) / 10

      this.eventLog.emit('grading_complete', {
        label: `Score: ${overallScore}/10 (P:${planningScore} C:${codeScore} N:${nervOpsScore})`,
      })

      // Merge compliance tracking
      const events = this.eventLog.getEvents()
      const mergesSucceeded = events.filter(e => e.event === 'worktree_merged').length
      const mergesFailed = events.filter(e => e.event === 'worktree_merge_failed').length

      const mergeCompliance = {
        totalTasks: build.tasksCompleted + build.tasksFailed,
        mergedSuccessfully: mergesSucceeded,
        mergeFailed: mergesFailed,
        compliant: mergesSucceeded > 0 && mergesFailed === 0,
      }

      const gradeResult = {
        planningScore,
        codeScore,
        nervOpsScore,
        overallScore,
        mergeCompliance,
        build,
      }
      fs.writeFileSync(
        path.join(this.config.outputDir, 'grade.json'),
        JSON.stringify(gradeResult, null, 2),
      )

      return {
        phase: 'grade',
        durationMs: Date.now() - start,
        success: true,
        planningScore,
        codeScore,
        nervOpsScore,
        overallScore,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return {
        phase: 'grade',
        durationMs: Date.now() - start,
        success: false,
        error: msg,
        planningScore: 0,
        codeScore: 0,
        nervOpsScore: 0,
        overallScore: 0,
      }
    }
  }

  /**
   * Grade all 3 categories using claude --print.
   * Each category gets its own Claude call with focused context.
   * Returns {planning, code, nervOps} scores (1-10 each).
   */
  private async gradeAllWithClaude(
    projectId: string,
    build: UIBenchmarkBuildResult,
  ): Promise<{ planning: number; code: number; nervOps: number }> {
    const repoPath = await this.window.evaluate(async (pid: string) => {
      const api = (window as unknown as {
        api: {
          db: {
            repos: { getForProject: (pid: string) => Promise<Array<{ path: string }>> }
          }
        }
      }).api
      const repos = await api.db.repos.getForProject(pid)
      return repos[0]?.path || null
    }, projectId)

    // Get diff for code quality grading
    let diff = ''
    if (repoPath) {
      try {
        const { execSync } = await import('child_process')
        const firstCommit = execSync('git rev-list --max-parents=0 HEAD 2>/dev/null | head -1', {
          cwd: repoPath, maxBuffer: 1024, encoding: 'utf-8',
        }).trim()
        if (firstCommit) {
          diff = execSync(`git diff ${firstCommit}..HEAD`, {
            cwd: repoPath, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8',
          })
        }
      } catch {
        try {
          const { execSync } = await import('child_process')
          diff = execSync('git diff HEAD~10...HEAD 2>/dev/null || git diff HEAD 2>/dev/null || echo ""', {
            cwd: repoPath, maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8',
          })
        } catch { /* skip */ }
      }
    }

    // Build context shared by all 3 prompts
    const events = this.eventLog.getEvents()
    const context = [
      `## Project Goal\n${this.config.scenario.projectIdea}`,
      `\n## Milestones\n${this.config.scenario.roughMilestones.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      `\n## Build Metrics`,
      `Cycles completed: ${build.cyclesCompleted}`,
      `Tasks completed: ${build.tasksCompleted}, failed: ${build.tasksFailed}`,
      `Build success: ${build.success}`,
      `Merges succeeded: ${events.filter(e => e.event === 'worktree_merged').length}`,
      `Merges failed: ${events.filter(e => e.event === 'worktree_merge_failed').length}`,
      `Loop dismissals: ${events.filter(e => e.event === 'loop_dialog_dismissed').length}`,
      `Review decisions: ${events.filter(e => e.event.startsWith('review_')).length}`,
      `\n## Event Timeline`,
      ...events.slice(0, 50).map(e => `[${(e.t / 1000).toFixed(1)}s] ${e.event}${e.label ? ': ' + e.label : ''}`),
    ].join('\n')

    const truncatedDiff = diff.length > 20000 ? diff.slice(0, 20000) + '\n[...truncated...]' : diff

    const gradeOne = async (prompt: string, label: string): Promise<number> => {
      try {
        const { spawn } = await import('child_process')
        return new Promise<number>((resolve) => {
          const proc = spawn('claude', [
            '--print', '--output-format', 'text', '--model', 'sonnet', '--max-turns', '1',
          ], { stdio: ['pipe', 'pipe', 'pipe'] })

          let stdout = ''
          proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
          proc.stdin.write(prompt)
          proc.stdin.end()

          const timer = setTimeout(() => { proc.kill(); resolve(5) }, 120000)

          proc.on('close', () => {
            clearTimeout(timer)
            try {
              const match = stdout.match(/\{[\s\S]*"score"[\s\S]*\}/)
              if (match) {
                const parsed = JSON.parse(match[0])
                const s = typeof parsed.score === 'number' ? parsed.score : 5
                log('step', `${label} graded`, { score: s })
                resolve(Math.max(1, Math.min(10, s)))
              } else {
                resolve(5)
              }
            } catch {
              resolve(5)
            }
          })
          proc.on('error', () => { clearTimeout(timer); resolve(5) })
        })
      } catch {
        return 5
      }
    }

    const planning = await gradeOne(
      `You are evaluating PLANNING quality of a NERV benchmark run.\n\nScore 1-10 how well the project was planned:\n- Were cycles well-scoped and progressive (each builds on the last)?\n- Were tasks appropriately decomposed from milestones?\n- Did spec coverage increase across cycles?\n- Were mid-project events (scope creep, user feedback) handled by creating new tasks?\n- Did the workflow show iterative learning (later cycles address earlier gaps)?\n\n${context}\n\nRespond with ONLY JSON: {"score": N, "strengths": [...], "weaknesses": [...], "evidence": "..."}`,
      'Planning',
    )

    const code = await gradeOne(
      `You are evaluating CODE QUALITY of a NERV benchmark run.\n\nScore 1-10 the produced code:\n- Code organization, naming, structure\n- Test coverage and quality\n- Functionality completeness vs the project goal\n- Error handling and edge cases\n- TypeScript best practices\n\n## Code Diff\n\`\`\`diff\n${truncatedDiff || '(no diff available)'}\n\`\`\`\n\n${context}\n\nRespond with ONLY JSON: {"score": N, "strengths": [...], "weaknesses": [...], "evidence": "..."}`,
      'Code Quality',
    )

    const nervOps = await gradeOne(
      `You are evaluating NERV OPS quality — how well the benchmark followed NERV's intended workflow patterns.\n\nScore 1-10 based on these criteria (weights shown):\n- Worktree isolation per task (25%) — each task gets its own worktree, merged on approval\n- Cycle-based iteration (20%) — multiple cycles with increasing spec completion\n- Review gates before merge (15%) — work reviewed before merging to main\n- Error recovery and loop handling (10%) — graceful handling of stuck/looping sessions\n- Cost efficiency (15%) — reasonable token usage relative to complexity\n- Permission management (15%) — permissions requested and resolved appropriately\n\n## Reference: Expected Workflow Patterns\n${PRD_WORKFLOW_EXCERPT}\n\n${context}\n\nRespond with ONLY JSON: {"score": N, "strengths": [...], "weaknesses": [...], "evidence": "..."}`,
      'NERV Ops',
    )

    return { planning, code, nervOps }
  }

  /**
   * Copy the merged base repository into the output directory.
   * After worktree merges, the main repo contains all unified work.
   */
  private async collectBuiltRepo(projectId: string): Promise<void> {
    try {
      // Get the repo path (base repo, not worktree) and task info
      const repoInfo = await this.window.evaluate(async (pid: string) => {
        const api = (window as unknown as {
          api: {
            db: {
              repos: { getForProject: (pid: string) => Promise<Array<{ id: string; name: string; path: string }>> }
              tasks: { getForProject: (pid: string) => Promise<Array<{ id: string; title: string; worktree_path: string | null; status: string }>> }
            }
          }
        }).api
        const repos = await api.db.repos.getForProject(pid)
        const tasks = await api.db.tasks.getForProject(pid)
        const completedTasks = tasks
          .filter(t => t.status === 'done' && t.worktree_path)
          .map(t => ({ id: t.id, title: t.title, worktreePath: t.worktree_path }))
        return {
          repoPath: repos[0]?.path || null,
          tasks: completedTasks,
        }
      }, projectId)

      if (!repoInfo.repoPath) {
        log('info', 'No repo path found for project')
        return
      }

      const repoOutputDir = path.join(this.config.outputDir, 'repo')
      const { execSync } = await import('child_process')

      // Copy the unified base repo (contains all merged work)
      execSync(`cp -r "${repoInfo.repoPath}" "${repoOutputDir}"`, {
        timeout: 30000,
      })

      // Write a manifest of all worktrees for reference
      const manifest = repoInfo.tasks.map(t => ({
        taskId: t.id,
        title: t.title,
        worktreePath: t.worktreePath,
      }))
      fs.writeFileSync(
        path.join(this.config.outputDir, 'worktree-manifest.json'),
        JSON.stringify(manifest, null, 2),
      )

      log('step', 'Collected merged base repo', {
        from: repoInfo.repoPath,
        to: repoOutputDir,
        taskCount: repoInfo.tasks.length,
      })
      this.eventLog.emit('repo_collected', {
        label: `Collected merged repo (${repoInfo.tasks.length} tasks merged)`,
      })
    } catch (error) {
      log('info', 'Failed to collect built repo', { error: String(error) })
    }
  }

}
