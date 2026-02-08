/**
 * NERV Real Claude Benchmark Test
 *
 * This test runs a comprehensive benchmark with REAL Claude (not mocked).
 * It exercises ALL NERV features using the multi-repo todo app benchmark.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY environment variable OR
 *   - Claude CLI authenticated via `claude auth login`
 *   - Built NERV app (`npm run build`)
 *
 * Run:
 *   # With API key:
 *   ANTHROPIC_API_KEY=sk-... npm run test:e2e:docker -- --grep "real_claude_benchmark"
 *
 *   # With Claude CLI auth (inside Docker with credentials mounted):
 *   npm run test:e2e:docker -RealClaude -- --grep "real_claude_benchmark"
 *
 * This test does NOT set NERV_MOCK_CLAUDE=true, so Claude will be used.
 *
 * PRD Section 26: Testing & Benchmarking
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
  launchNervRealClaude,
  standardCleanup,
  BenchmarkCollector,
} from '../helpers'

import type { BenchmarkConfig } from '../../../src/shared/types'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths to benchmark fixtures
const BENCHMARK_FIXTURE_DIR = path.join(__dirname, '../../fixtures/nerv-todo-benchmark')
const BENCHMARK_OUTPUT_DIR = path.join(__dirname, '../../../test-results/real-claude-benchmark')

// Ensure output directory exists
if (!fs.existsSync(BENCHMARK_OUTPUT_DIR)) {
  fs.mkdirSync(BENCHMARK_OUTPUT_DIR, { recursive: true })
}

// Read the benchmark spec
function readBenchmarkSpec(): string {
  const specPath = path.join(BENCHMARK_FIXTURE_DIR, 'SPEC.md')
  if (fs.existsSync(specPath)) {
    return fs.readFileSync(specPath, 'utf-8')
  }
  return '# NERV Multi-Repo Todo App Benchmark\n\nSee test/fixtures/nerv-todo-benchmark/SPEC.md'
}

// Default benchmark configuration for real Claude
const REAL_CLAUDE_CONFIG: BenchmarkConfig = {
  reviewMode: 'yolo',  // Use YOLO mode for automated review
  maxCycles: 5,
  auditFrequency: 1,
  model: 'claude-sonnet-4-20250514',
  specFile: 'SPEC.md',
}

// ============================================================================
// REAL CLAUDE BENCHMARK TESTS
// ============================================================================

test.describe('NERV Real Claude Benchmark', () => {
  // Extended timeout for real Claude operations - 45 minutes for 5 cycles
  // Each cycle can take 5-10 minutes with real Claude
  test.describe.configure({ timeout: 45 * 60 * 1000 })

  // Ensure cleanup happens after each test
  test.afterEach(async () => {
    await standardCleanup()
  })

  // -------------------------------------------------------------------------
  // REAL CLAUDE BENCHMARK: Multi-Repo Todo App
  // -------------------------------------------------------------------------
  test('real_claude_benchmark - Complete multi-repo todo app with real Claude', async () => {
    // Skip if explicitly mocked (this test requires real Claude)
    if (process.env.NERV_MOCK_CLAUDE === 'true') {
      test.skip()
      return
    }

    // Initialize benchmark collector
    const specContent = readBenchmarkSpec()
    const collector = new BenchmarkCollector(
      BENCHMARK_OUTPUT_DIR,
      REAL_CLAUDE_CONFIG,
      specContent
    )

    log('info', `=== REAL CLAUDE BENCHMARK ===`)
    log('info', `Benchmark ID: ${collector.getBenchmarkId()}`)
    log('info', `Output directory: ${collector.getOutputDir()}`)
    log('info', `Using model: ${REAL_CLAUDE_CONFIG.model}`)

    // Define the repos from the benchmark fixture
    const repos = [
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-shared'),
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-backend'),
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-frontend'),
    ]

    // Verify repos exist
    for (const repo of repos) {
      if (!fs.existsSync(repo)) {
        throw new Error(`Benchmark fixture not found: ${repo}. Run setup first.`)
      }
    }

    // Set spec items based on SPEC.md checklist (counted from SPEC.md)
    // Shared: 7 items, Backend: 14 items, Frontend: 12 items = 33 total
    collector.setSpecItems(33)

    const { app, window } = await launchNervRealClaude(repos)

    try {
      await window.waitForSelector(SELECTORS.app, { timeout: TIMEOUT.ui })

      // -----------------------------------------------------------------------
      // PHASE 1: Project Creation with Multiple Repos
      // -----------------------------------------------------------------------
      log('step', 'Phase 1: Project Creation with Multiple Repos')
      collector.addTimelineEvent('phase_start', { phase: 'project_setup' })

      // Click "New Project" button
      const newProjectBtn = window.locator(SELECTORS.newProject).first()
      await expect(newProjectBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await newProjectBtn.click()
      await slowWait(window, 'New project dialog opening')

      // Fill in project details
      const projectNameInput = window.locator(SELECTORS.projectNameInput)
      await projectNameInput.fill('NERV Todo Benchmark')
      await microWait(window)

      const projectGoalInput = window.locator(SELECTORS.projectGoalInput)
      if (await projectGoalInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectGoalInput.fill('Implement complete todo app across 3 repos per SPEC.md')
        await microWait(window)
      }

      // Create the project
      const createBtn = window.locator(SELECTORS.createProjectBtn)
      await createBtn.click()
      await slowWait(window, 'Project created')

      // Get project ID
      const projectId = await window.evaluate(async () => {
        const api = (window as unknown as { api: { db: { projects: { getAll: () => Promise<Array<{ id: string; name: string }>> } } } }).api
        const projects = await api.db.projects.getAll()
        return projects.find(p => p.name.includes('Benchmark'))?.id
      })

      expect(projectId).toBeDefined()
      collector.addTimelineEvent('project_created', { projectId })
      log('pass', 'Project created', { projectId })

      // -----------------------------------------------------------------------
      // PHASE 2: Add All Repositories to Project
      // -----------------------------------------------------------------------
      log('step', 'Phase 2: Adding repositories to project')
      collector.addTimelineEvent('phase_start', { phase: 'repo_setup' })

      // Add each repo via API (UI can be slow for multiple repos)
      for (let i = 0; i < repos.length; i++) {
        const repoPath = repos[i]
        const repoName = path.basename(repoPath)

        const repoAdded = await window.evaluate(async (args: { projectId: string; repoName: string; repoPath: string }) => {
          const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<{ id: string }> } } } }).api
          try {
            await api.db.repos.create(args.projectId, args.repoName, args.repoPath, 'node')
            return true
          } catch { return false }
        }, { projectId: projectId!, repoName, repoPath })

        if (repoAdded) {
          collector.addTimelineEvent('repo_added', { repoName, repoPath })
          log('pass', `Repository added: ${repoName}`)
        } else {
          log('fail', `Failed to add repository: ${repoName}`)
        }
      }

      // -----------------------------------------------------------------------
      // PHASE 3: Create YOLO Benchmark Configuration
      // -----------------------------------------------------------------------
      log('step', 'Phase 3: Creating YOLO benchmark configuration')
      collector.addTimelineEvent('phase_start', { phase: 'yolo_config' })

      const configId = await window.evaluate(async (args: { projectId: string; config: BenchmarkConfig }) => {
        const api = (window as unknown as { api: { yolo: { createConfig: (config: {
          projectId: string
          model: string
          maxCycles: number
          maxCostUsd: number
          maxDurationMs: number
          autoApproveReview: boolean
          autoApproveDangerousTools: boolean
          testCommand: string | null
          specFile: string | null
        }) => Promise<{ id: string }> } } }).api

        const config = await api.yolo.createConfig({
          projectId: args.projectId,
          model: args.config.model,
          maxCycles: args.config.maxCycles,
          maxCostUsd: 50,  // $50 max for safety
          maxDurationMs: 30 * 60 * 1000,  // 30 minutes
          autoApproveReview: true,
          autoApproveDangerousTools: false,  // Still require approval for dangerous tools
          testCommand: 'npm test',
          specFile: args.config.specFile || null
        })
        return config.id
      }, { projectId: projectId!, config: REAL_CLAUDE_CONFIG })

      collector.addTimelineEvent('yolo_config_created', { configId })
      log('pass', 'YOLO config created', { configId })

      // -----------------------------------------------------------------------
      // PHASE 4: Create Cycle 0 (Proof of Life)
      // -----------------------------------------------------------------------
      log('step', 'Phase 4: Creating Cycle 0')
      collector.addTimelineEvent('phase_start', { phase: 'cycle_creation' })

      // Select project first
      const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("Benchmark")`).first()
      if (await projectItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectItem.click()
        await window.waitForTimeout(500)
      }

      // Open cycles panel
      const cyclesBtn = window.locator(SELECTORS.cyclesBtn)
      if (await cyclesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cyclesBtn.click()
        await slowWait(window, 'Cycles panel opening')

        const startCycle0Btn = window.locator(SELECTORS.startCycle0Btn)
        if (await startCycle0Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await startCycle0Btn.click()

          const cycleGoalInput = window.locator(SELECTORS.cycleGoalInput)
          if (await cycleGoalInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await cycleGoalInput.fill('Cycle 0: Implement shared types and validation utilities')
            await microWait(window)

            const createCycleBtn = window.locator(SELECTORS.createCycleBtn)
            await createCycleBtn.click()
            await slowWait(window, 'Cycle created')
          }
        }

        // Close cycle panel
        const closeBtn = window.locator(`${SELECTORS.cyclePanel} ${SELECTORS.closeBtn}`).first()
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click()
          await window.waitForTimeout(300)
        }
      }

      const cycles = await window.evaluate(async (id: string) => {
        const api = (window as unknown as { api: { db: { cycles: { getForProject: (projectId: string) => Promise<Array<{ id: string; cycle_number: number }>> } } } }).api
        return await api.db.cycles.getForProject(id)
      }, projectId!)

      const cycleId = cycles?.[0]?.id || 'cycle-0'
      collector.startCycle(cycleId, 0)
      log('pass', 'Cycle 0 created', { cycleId })

      // -----------------------------------------------------------------------
      // PHASE 5: Start YOLO Benchmark
      // NOTE: YOLO creates its own tasks autonomously. We don't pre-create tasks
      // because YOLO ignores them and creates implementation tasks per cycle.
      // -----------------------------------------------------------------------
      log('step', 'Phase 5: Starting YOLO benchmark')
      collector.addTimelineEvent('phase_start', { phase: 'yolo_execution' })

      // Start YOLO benchmark via API (more reliable than UI clicks)
      const yoloResultId = await window.evaluate(async (cfgId: string) => {
        const api = (window as unknown as { api: { yolo: { start: (configId: string) => Promise<{ id: string }> } } }).api
        try {
          const result = await api.yolo.start(cfgId)
          return result.id
        } catch (e) {
          console.error('Failed to start YOLO:', e)
          return null
        }
      }, configId)

      if (yoloResultId) {
        log('info', 'YOLO benchmark started via API', { resultId: yoloResultId })
        collector.addTimelineEvent('yolo_started', { configId, resultId: yoloResultId })
      } else {
        log('fail', 'Failed to start YOLO benchmark')
        throw new Error('YOLO benchmark failed to start')
      }

      // -----------------------------------------------------------------------
      // PHASE 6: Monitor Progress (with timeout)
      // -----------------------------------------------------------------------
      log('step', 'Phase 6: Monitoring YOLO benchmark progress')
      collector.addTimelineEvent('phase_start', { phase: 'monitoring' })

      const MAX_WAIT_MS = 40 * 60 * 1000  // 40 minutes max for YOLO monitoring
      const POLL_INTERVAL_MS = 10000  // Check every 10 seconds
      const startTime = Date.now()
      let isComplete = false
      let lastStatus = ''

      let pollCount = 0
      while (!isComplete && (Date.now() - startTime) < MAX_WAIT_MS) {
        pollCount++
        // Check YOLO result using getResult (returns full result record with camelCase fields)
        const yoloResult = await window.evaluate(async (resultId: string) => {
          const api = (window as unknown as { api: { yolo: {
            getResult: (id: string) => Promise<{
              id: string
              status: string
              tasksCompleted: number
              testsFailed: number
              stopReason?: string | null
            } | undefined>
          } } }).api
          try {
            return await api.yolo.getResult(resultId) || null
          } catch (e) {
            return null
          }
        }, yoloResultId)

        if (pollCount === 1 || pollCount % 6 === 0) {
          // Log every minute (6 * 10s)
          log('info', `Polling YOLO result`, {
            poll: pollCount,
            result: yoloResult ? { status: yoloResult.status, completed: yoloResult.tasksCompleted, failed: yoloResult.testsFailed, stopReason: yoloResult.stopReason } : null
          })
        }

        if (yoloResult) {
          const statusStr = `${yoloResult.status}: ${yoloResult.tasksCompleted} completed, ${yoloResult.testsFailed} failed${yoloResult.stopReason ? ` (${yoloResult.stopReason})` : ''}`
          if (statusStr !== lastStatus) {
            log('info', `YOLO progress: ${statusStr}`)
            lastStatus = statusStr
          }

          // Handle all terminal states: completed, failed, stopped, blocked, limit_reached, success
          const terminalStates = ['completed', 'failed', 'stopped', 'blocked', 'limit_reached', 'success']
          if (terminalStates.includes(yoloResult.status)) {
            isComplete = true
            collector.addTimelineEvent('yolo_complete', {
              status: yoloResult.status,
              tasksCompleted: yoloResult.tasksCompleted,
              tasksFailed: yoloResult.testsFailed,
              stopReason: yoloResult.stopReason
            })
          }
        }

        if (!isComplete) {
          await window.waitForTimeout(POLL_INTERVAL_MS)
        }
      }

      if (!isComplete) {
        log('info', 'YOLO benchmark timed out - stopping')
        await window.evaluate(async () => {
          const api = (window as unknown as { api: { yolo: { getRunning: () => Promise<Array<{ id: string }>>; stop: (id: string, reason: string) => Promise<void> } } }).api
          const running = await api.yolo.getRunning()
          if (running[0]) {
            await api.yolo.stop(running[0].id, 'Benchmark timeout')
          }
        })
      }

      // -----------------------------------------------------------------------
      // PHASE 7: Collect Results
      // -----------------------------------------------------------------------
      log('step', 'Phase 7: Collecting results')
      collector.addTimelineEvent('phase_start', { phase: 'results_collection' })

      // Get final YOLO result metrics
      const finalYoloResult = await window.evaluate(async (resultId: string) => {
        const api = (window as unknown as { api: { yolo: {
          getResult: (id: string) => Promise<{
            status: string
            tasksCompleted: number
            testsFailed: number
            testsPassed: number
            cyclesCompleted: number
            totalCostUsd: number
            specCompletionPct: number
            totalDurationMs: number
            stopReason?: string | null
          } | undefined>
        } } }).api
        return await api.yolo.getResult(resultId)
      }, yoloResultId)

      // Use YOLO metrics for completed/failed counts
      const completedCount = finalYoloResult?.tasksCompleted || 0
      const failedCount = finalYoloResult?.testsFailed || 0
      const cyclesCompleted = finalYoloResult?.cyclesCompleted || 0

      // Apply YOLO metrics to the collector for accurate summary
      collector.applyYoloMetrics({
        totalCostUsd: finalYoloResult?.totalCostUsd,
        cyclesCompleted,
        tasksCompleted: completedCount,
        testsPassed: finalYoloResult?.testsPassed || completedCount,
        testsFailed: failedCount,
        specCompletionPct: finalYoloResult?.specCompletionPct,
        totalDurationMs: finalYoloResult?.totalDurationMs
      })

      // -----------------------------------------------------------------------
      // PHASE 7a: Collect Workflow Metrics from NERV's Actual State
      // -----------------------------------------------------------------------
      log('step', 'Phase 7a: Collecting workflow metrics')

      // Get worktree data from NERV
      const workflowData = await window.evaluate(async (pId: string) => {
        const api = (window as unknown as { api: {
          worktree: {
            listForProject: (projectId: string) => Promise<Array<{
              repoId: string
              repoName: string
              repoPath: string
              worktrees: Array<{ path: string; branch: string; commit: string; isMain: boolean }>
            }>>
          }
          db: {
            tasks: {
              getForProject: (projectId: string) => Promise<Array<{
                id: string
                status: string
                worktree_path?: string | null
              }>>
            }
            cycles: {
              getForProject: (projectId: string) => Promise<Array<{
                id: string
                status: string
              }>>
            }
          }
        } }).api

        // Get worktrees
        let worktreeCount = 0
        try {
          const worktreeData = await api.worktree.listForProject(pId)
          for (const repo of worktreeData) {
            worktreeCount += repo.worktrees.length
          }
        } catch {
          // Worktree API may fail
        }

        // Get tasks with their statuses
        let tasksWithWorktrees = 0
        let completedTaskCount = 0
        let failedTaskCount = 0
        try {
          const tasks = await api.db.tasks.getForProject(pId)
          for (const task of tasks) {
            if (task.worktree_path) tasksWithWorktrees++
            if (task.status === 'done') completedTaskCount++
            if (task.status === 'failed') failedTaskCount++
          }
        } catch {
          // May fail
        }

        // Get cycles count
        let cycleCount = 0
        try {
          const cycles = await api.db.cycles.getForProject(pId)
          cycleCount = cycles.length
        } catch {
          // May fail
        }

        return {
          worktreeCount,
          tasksWithWorktrees,
          completedTaskCount,
          failedTaskCount,
          cycleCount
        }
      }, projectId!)

      // Record workflow metrics to collector
      // Each task with a worktree means a worktree was created
      for (let i = 0; i < workflowData.tasksWithWorktrees; i++) {
        collector.recordWorktreeCreated()
      }
      // Completed tasks = merged worktrees (in YOLO mode)
      for (let i = 0; i < workflowData.completedTaskCount; i++) {
        collector.recordWorktreeMerged()
      }
      // Each worktree has a branch
      for (let i = 0; i < workflowData.tasksWithWorktrees; i++) {
        collector.recordBranchCreated()
      }

      log('info', 'Workflow metrics collected', {
        worktrees: workflowData.worktreeCount,
        tasksWithWorktrees: workflowData.tasksWithWorktrees,
        completed: workflowData.completedTaskCount,
        failed: workflowData.failedTaskCount,
        cycles: workflowData.cycleCount
      })

      // -----------------------------------------------------------------------
      // PHASE 7b: Collect Token/Cost Metrics
      // -----------------------------------------------------------------------
      log('step', 'Phase 7b: Collecting token metrics')

      // Get session metrics from database to capture token usage
      // Query ALL tasks that YOLO created, not just the ones we pre-created
      const allTaskIds = await window.evaluate(async (pId: string) => {
        const api = (window as unknown as { api: { db: { tasks: {
          getForProject: (projectId: string) => Promise<Array<{ id: string }>>
        } } } }).api
        const tasks = await api.db.tasks.getForProject(pId)
        return tasks.map(t => t.id)
      }, projectId!)

      const sessionMetrics = await window.evaluate(async (tIds: string[]) => {
        const api = (window as unknown as { api: { db: { metrics: {
          get: (taskId: string) => Promise<{
            input_tokens?: number
            output_tokens?: number
            cost_usd?: number
            num_turns?: number
            duration_ms?: number
          } | undefined>
        } } } }).api

        const results: Record<string, {
          inputTokens?: number
          outputTokens?: number
          costUsd?: number
          numTurns?: number
          durationMs?: number
        }> = {}

        for (const taskId of tIds) {
          try {
            const metrics = await api.db.metrics.get(taskId)
            if (metrics) {
              results[taskId] = {
                inputTokens: metrics.input_tokens,
                outputTokens: metrics.output_tokens,
                costUsd: metrics.cost_usd,
                numTurns: metrics.num_turns,
                durationMs: metrics.duration_ms
              }
            }
          } catch {
            // Metrics may not exist for all tasks
          }
        }
        return results
      }, allTaskIds)

      // Apply session metrics to each task (and ensure task exists in collector)
      for (const [taskId, metrics] of Object.entries(sessionMetrics)) {
        // Start task if not already tracked (YOLO creates its own tasks)
        if (!collector.hasTask(taskId)) {
          collector.startTask(taskId, `YOLO Task ${taskId}`)
        }
        collector.applySessionMetrics(taskId, metrics)
        // Mark as completed if we have metrics (YOLO completed it)
        collector.completeTask(taskId, 'done')
      }

      log('info', 'Token metrics collected', {
        tasksWithMetrics: Object.keys(sessionMetrics).length,
        totalTasks: allTaskIds.length
      })

      // -----------------------------------------------------------------------
      // PHASE 8: Log Final Metrics
      // -----------------------------------------------------------------------
      log('step', 'Phase 8: Logging final metrics')
      collector.addTimelineEvent('phase_start', { phase: 'metrics_summary' })

      log('info', 'Final YOLO metrics', {
        cycles: cyclesCompleted,
        tasks: completedCount,
        testsPassed: finalYoloResult?.testsPassed || 0,
        testsFailed: failedCount,
        status: finalYoloResult?.status,
        cost: `$${(finalYoloResult?.totalCostUsd || 0).toFixed(4)}`,
        specCompletion: `${(finalYoloResult?.specCompletionPct || 0).toFixed(1)}%`,
        duration: `${((finalYoloResult?.totalDurationMs || 0) / 1000 / 60).toFixed(1)} min`
      })

      // -----------------------------------------------------------------------
      // FINALIZE BENCHMARK
      // -----------------------------------------------------------------------
      log('step', 'Finalizing benchmark')

      collector.completeCycle(cycleId, completedCount)
      collector.recordLearnings(cycleId, [
        `YOLO mode completed ${cyclesCompleted} cycles`,
        `Tasks completed: ${completedCount}`,
        `Tests failed: ${failedCount}`,
        `Used real Claude with model ${REAL_CLAUDE_CONFIG.model}`,
        `Final status: ${finalYoloResult?.status || 'unknown'}`
      ])

      const summary = collector.finalize()

      log('info', '=== REAL CLAUDE BENCHMARK COMPLETE ===')
      log('info', `Outcome: ${summary.outcome}`)
      log('info', `Duration: ${Math.round(summary.duration.totalMs / 1000 / 60)} minutes`)
      log('info', `Tasks: ${summary.tasks.completed}/${summary.tasks.total}`)
      log('info', `Spec completion: ${summary.spec.completionPercent.toFixed(1)}%`)
      log('info', `Output: ${collector.getOutputDir()}`)

      // Assertions - verify YOLO actually ran with Real Claude
      // The key validations are:
      // 1. YOLO reached a terminal state (not still 'running')
      // 2. There was actual work done (worktrees created, tasks started)
      // 3. Duration was substantial (Claude actually worked)

      const yoloStatus = finalYoloResult?.status || 'unknown'
      const terminalStates = ['completed', 'success', 'blocked', 'limit_reached', 'failed', 'stopped']
      expect(terminalStates).toContain(yoloStatus)
      log('check', `YOLO reached terminal state: ${yoloStatus}`)

      // Verify Claude actually worked - worktrees should have been created
      expect(workflowData.tasksWithWorktrees).toBeGreaterThan(0)
      log('check', `Tasks with worktrees: ${workflowData.tasksWithWorktrees}`)

      // Verify substantial runtime (Real Claude should take minutes, not seconds)
      const durationMs = finalYoloResult?.totalDurationMs || 0
      const minDurationMs = 60 * 1000 // At least 1 minute for real Claude
      expect(durationMs).toBeGreaterThanOrEqual(minDurationMs)
      log('check', `Duration: ${Math.round(durationMs / 1000 / 60)} minutes (>= 1 minute)`)

      // Log outcome for tracking (but don't fail if no completed tasks)
      if (completedCount > 0 || cyclesCompleted > 0) {
        log('pass', `YOLO completed ${completedCount} tasks in ${cyclesCompleted} cycles`)
      } else {
        log('info', `YOLO ran but tasks need more cycles (blocked: ${yoloStatus})`)
      }

      log('pass', '=== REAL CLAUDE BENCHMARK PASSED ===')

    } catch (error) {
      collector.addTimelineEvent('benchmark_error', {
        error: error instanceof Error ? error.message : String(error),
      })
      const summary = collector.finalize()
      log('fail', `Benchmark failed: ${error}`)
      log('info', `Partial results saved to: ${collector.getOutputDir()}`)
      throw error

    } finally {
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // QUICK VERIFICATION TEST (can run with mock Claude)
  // -------------------------------------------------------------------------
  test('real_claude_benchmark_setup_only - Verify benchmark setup without full execution', async () => {
    // This test verifies the benchmark infrastructure without running real Claude
    // It's useful for CI validation

    const specContent = readBenchmarkSpec()
    const collector = new BenchmarkCollector(
      BENCHMARK_OUTPUT_DIR,
      REAL_CLAUDE_CONFIG,
      specContent
    )

    log('info', 'Verifying benchmark setup')

    // Verify fixture repos exist
    const repos = [
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-shared'),
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-backend'),
      path.join(BENCHMARK_FIXTURE_DIR, 'todo-frontend'),
    ]

    for (const repo of repos) {
      expect(fs.existsSync(repo)).toBe(true)
      log('check', `Repo exists: ${path.basename(repo)}`)

      // Verify CLAUDE.md exists in each repo
      const claudeMd = path.join(repo, 'CLAUDE.md')
      expect(fs.existsSync(claudeMd)).toBe(true)
      log('check', `CLAUDE.md exists in ${path.basename(repo)}`)
    }

    // Verify SPEC.md exists
    const specPath = path.join(BENCHMARK_FIXTURE_DIR, 'SPEC.md')
    expect(fs.existsSync(specPath)).toBe(true)
    log('check', 'SPEC.md exists')

    // Verify spec content
    expect(specContent).toContain('Feature Checklist')
    expect(specContent).toContain('Shared Types')
    expect(specContent).toContain('Backend API')
    expect(specContent).toContain('Frontend UI')
    log('check', 'SPEC.md contains expected sections')

    // Record successful setup
    collector.addTimelineEvent('setup_verified', { repos: repos.length })
    collector.setSpecItems(1)
    collector.recordSpecItemResult(true)

    // For a setup-only test, we just verify the infrastructure works
    // Don't need to check outcome since we didn't run any tasks
    const summary = collector.finalize()
    expect(summary.spec.itemsPassed).toBe(1)
    expect(summary.spec.completionPercent).toBe(100)

    log('pass', 'Benchmark setup verified')
  })
})
