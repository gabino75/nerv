/**
 * YOLO Benchmark execution loop
 */

import { isAppShuttingDown } from '../app-state'
import { databaseService } from '../database'
import { createWorktreesForTask } from '../worktree'
import { spawnClaude, hasClaudeSession, getClaudeSessionInfo, killClaudeSession } from '../claude'
import { generateNervMd } from '../nerv-md'
import { broadcastToRenderers } from '../utils'
import { activeBenchmarks, completeBenchmark } from './lifecycle'
import { sleep, runTests, calculateSpecCompletion, buildTaskPrompt } from './utils'
import { runReviewAgent } from './review-agent'
import { estimateCost } from '../../core/claude-config.js'
import type { YoloBenchmarkConfig, YoloBenchmarkResult, ClaudeSpawnConfig, CustomAgentsConfig } from '../../shared/types'
import type { ActiveBenchmark, CycleResult, ClaudeCompletionResult } from './types'

/** Check if benchmark should stop due to limits */
function checkBenchmarkLimits(
  result: YoloBenchmarkResult, config: YoloBenchmarkConfig, startTime: number
): string | null {
  if (result.cyclesCompleted >= config.maxCycles) return `Max cycles reached: ${config.maxCycles}`
  if (result.totalCostUsd >= config.maxCostUsd) return `Max cost reached: $${config.maxCostUsd}`
  if (Date.now() - startTime >= config.maxDurationMs) return `Max duration reached: ${config.maxDurationMs}ms`
  return null
}

/** Process successful cycle result */
function processSuccessfulCycle(
  resultId: string, result: YoloBenchmarkResult, cycleResult: CycleResult
): boolean {
  databaseService.updateYoloBenchmarkResult(resultId, {
    cyclesCompleted: result.cyclesCompleted + 1,
    tasksCompleted: result.tasksCompleted + cycleResult.tasksCompleted,
    totalCostUsd: result.totalCostUsd + cycleResult.costUsd,
    testsPassed: result.testsPassed + cycleResult.testsPassed,
    testsFailed: result.testsFailed + cycleResult.testsFailed,
    specCompletionPct: cycleResult.specCompletionPct
  })

  const MIN_SPEC_COMPLETION_PCT = 10
  const specMeetsThreshold = cycleResult.specCompletionPct >= MIN_SPEC_COMPLETION_PCT

  if (cycleResult.allTestsPass && specMeetsThreshold) return true
  if (cycleResult.allTestsPass && !specMeetsThreshold) {
    console.warn(`[YOLO] Tests pass but spec completion too low (${cycleResult.specCompletionPct}% < ${MIN_SPEC_COMPLETION_PCT}%)`)
  }
  return false
}

/** Get custom agents from project configuration */
function getProjectCustomAgents(projectId: string): CustomAgentsConfig | undefined {
  const project = databaseService.getProject(projectId)
  if (!project?.custom_agents) return undefined
  try {
    return JSON.parse(project.custom_agents) as CustomAgentsConfig
  } catch {
    return undefined
  }
}

/** Create a debug task when tests fail (PRD Section 3: Debug & Research Workflow) */
function createDebugTaskForTestFailure(
  projectId: string,
  cycleId: string,
  testsFailed: number,
  failureOutput: string | undefined
): void {
  const description = `## Debug Investigation

### Test Failure Summary
- **Tests Failed**: ${testsFailed}

### Failure Output
\`\`\`
${failureOutput || 'No output captured'}
\`\`\`

### Investigation Goals
- Analyze the test failure root cause
- Identify the affected code paths
- Document suggested fixes (do NOT modify code)
- Propose prevention strategies

### Expected Output
A research report with:
1. Root cause analysis
2. Affected components
3. Suggested code fixes (as diff snippets)
4. Test improvements if applicable`

  const task = databaseService.createTaskWithType(
    projectId,
    `Debug: Investigate ${testsFailed} test failure${testsFailed > 1 ? 's' : ''}`,
    'debug',
    description,
    cycleId
  )

  console.log(`[YOLO] Created debug task ${task.id} for test failures`)
  broadcastToRenderers('yolo:debugTaskCreated', task.id, testsFailed)
}

/** Process Claude completion result and update task status */
function processCycleClaudeResult(
  taskId: string,
  sessionId: string,
  claudeResult: ClaudeCompletionResult,
  config: YoloBenchmarkConfig,
  result: CycleResult
): boolean {
  databaseService.updateSessionMetrics(taskId, {
    inputTokens: claudeResult.inputTokens,
    outputTokens: claudeResult.outputTokens,
    costUsd: claudeResult.costUsd,
    durationMs: claudeResult.durationMs,
    model: config.model,
    sessionId
  })

  const MIN_DURATION_MS = 1000
  if (claudeResult.durationMs < MIN_DURATION_MS) {
    console.warn(`[YOLO] Task ${taskId} completed too quickly (${claudeResult.durationMs}ms)`)
    result.blocked = true
    result.blockReason = `Task completed too quickly (${claudeResult.durationMs}ms) - Claude did not perform work`
    databaseService.updateTaskStatus(taskId, 'interrupted')
    return false
  }

  // Mark task as ready for review - actual approval handled after tests
  databaseService.updateTaskStatus(taskId, 'review')
  result.costUsd = claudeResult.costUsd
  return true
}

/**
 * Wait for Claude session to complete
 */
async function waitForClaudeCompletion(
  sessionId: string,
  active: ActiveBenchmark
): Promise<ClaudeCompletionResult> {
  const result: ClaudeCompletionResult = {
    blocked: false,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0
  }

  const startTime = Date.now()
  const envTimeout = parseInt(process.env.NERV_CLAUDE_TIMEOUT || '0', 10)
  // Use remaining benchmark time instead of hardcoded 15 min.
  // The overall benchmark duration limit (checkBenchmarkLimits) is the real constraint;
  // the per-task timeout just prevents a single task from consuming all remaining time
  // when there are multiple cycles to attempt.
  const remainingBenchmarkMs = active.config.maxDurationMs - (Date.now() - active.startTime)
  const maxWaitMs = envTimeout > 0 ? envTimeout : Math.max(remainingBenchmarkMs, 2 * 60 * 1000)

  while (hasClaudeSession(sessionId)) {
    if (active.stopRequested || isAppShuttingDown()) return result

    if (active.isPaused) {
      await sleep(1000)
      continue
    }

    if (Date.now() - startTime > maxWaitMs) {
      result.blocked = true
      result.blockReason = 'Task timeout exceeded'
      killClaudeSession(sessionId)
      return result
    }

    await sleep(500)
  }

  result.durationMs = Date.now() - startTime

  const sessionInfo = getClaudeSessionInfo(sessionId)
  if (sessionInfo) {
    result.inputTokens = sessionInfo.tokenUsage.inputTokens
    result.outputTokens = sessionInfo.tokenUsage.outputTokens

    result.costUsd = estimateCost(
      {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: sessionInfo.tokenUsage.cacheReadTokens || 0,
        cacheCreationTokens: sessionInfo.tokenUsage.cacheCreationTokens || 0,
      },
      active.config.model
    )
  }

  return result
}

/**
 * Run a single benchmark cycle
 */
async function runBenchmarkCycle(active: ActiveBenchmark): Promise<CycleResult> {
  const result: CycleResult = {
    success: false, blocked: false, tasksCompleted: 0, costUsd: 0,
    testsPassed: 0, testsFailed: 0, allTestsPass: false, specCompletionPct: 0
  }

  const cycleNumber = databaseService.getNextCycleNumber(active.config.projectId)
  const cycle = databaseService.createCycle(
    active.config.projectId, cycleNumber, `YOLO Benchmark Cycle ${cycleNumber}`
  )
  active.currentCycleId = cycle.id
  broadcastToRenderers('yolo:cycleStarted', active.resultId, cycle.id, cycleNumber)

  try {
    const task = databaseService.createTaskWithType(
      active.config.projectId, `YOLO Cycle ${cycleNumber} Implementation`,
      'implementation', `Autonomous implementation task for YOLO benchmark cycle ${cycleNumber}`, cycle.id
    )
    active.currentTaskId = task.id
    broadcastToRenderers('yolo:taskStarted', active.resultId, task.id)

    const worktreeResults = await createWorktreesForTask(task.id, active.config.projectId)
    if (worktreeResults.length === 0) {
      result.blocked = true
      result.blockReason = 'Failed to create worktrees'
      return result
    }

    const primaryWorktree = worktreeResults[0]
    databaseService.updateTaskWorktree(task.id, primaryWorktree.worktreePath)
    databaseService.updateTaskStatus(task.id, 'in_progress')

    const spawnConfig: ClaudeSpawnConfig = {
      taskId: task.id, projectId: active.config.projectId, cwd: primaryWorktree.worktreePath,
      prompt: buildTaskPrompt(active.config.specFile, active.config.testCommand, cycleNumber),
      systemPrompt: generateNervMd(active.config.projectId),
      model: active.config.model, additionalDirs: worktreeResults.slice(1).map(w => w.worktreePath),
      customAgents: getProjectCustomAgents(active.config.projectId)
    }

    const spawnResult = spawnClaude(spawnConfig)
    if (!spawnResult.success || !spawnResult.sessionId) {
      result.blocked = true
      result.blockReason = spawnResult.error || 'Failed to spawn Claude'
      return result
    }

    const sessionId = spawnResult.sessionId
    databaseService.updateTaskSession(task.id, sessionId)

    const claudeResult = await waitForClaudeCompletion(sessionId, active)

    if (active.stopRequested) {
      killClaudeSession(sessionId)
      return result
    }
    if (claudeResult.blocked) {
      result.blocked = true
      result.blockReason = claudeResult.blockReason
      return result
    }

    if (!processCycleClaudeResult(task.id, sessionId, claudeResult, active.config, result)) {
      return result
    }

    // Run tests if configured
    let testsOutput: string | undefined
    if (active.config.testCommand) {
      const testResult = await runTests(active.config.testCommand, primaryWorktree.worktreePath)
      result.testsPassed = testResult.passed
      result.testsFailed = testResult.failed
      result.allTestsPass = testResult.failed === 0 && testResult.passed > 0
      testsOutput = testResult.failureOutput

      // PRD Section 3: Auto-create debug task on test failure
      if (testResult.failed > 0) {
        createDebugTaskForTestFailure(
          active.config.projectId,
          cycle.id,
          testResult.failed,
          testResult.failureOutput
        )
      }
    }

    if (active.config.specFile) {
      result.specCompletionPct = calculateSpecCompletion(active.config.specFile, primaryWorktree.worktreePath)
    }

    // PRD Section 4: Review agent integration
    if (active.config.autoApproveReview) {
      console.log('[YOLO] Running review agent for task evaluation...')
      const taskInfo = databaseService.getTask(task.id)
      const reviewResult = await runReviewAgent(
        primaryWorktree.worktreePath,
        taskInfo?.description || `YOLO Cycle ${cycleNumber} Implementation`,
        active.config.projectId,
        active,
        result.allTestsPass,
        testsOutput
      )

      // Add review cost to cycle result
      result.costUsd += reviewResult.costUsd

      if (reviewResult.success && reviewResult.decision) {
        const decision = reviewResult.decision
        console.log(`[YOLO] Review decision: ${decision.decision} (confidence: ${decision.confidence})`)

        // Broadcast review result for UI display
        broadcastToRenderers('yolo:reviewCompleted', active.resultId, task.id, decision)

        if (decision.decision === 'approve') {
          // In YOLO mode with autoApproveReview, always accept approve decisions
          // regardless of confidence/autoMerge flags (which may be unreliable
          // from heuristic fallback when Claude's JSON can't be parsed)
          databaseService.updateTaskStatus(task.id, 'done')
          result.tasksCompleted = 1
        } else if (decision.decision === 'needs_changes') {
          // Keep in review status for potential retry
          result.blocked = true
          result.blockReason = `Review agent: needs changes - ${decision.justification}`
        } else {
          // Rejected
          result.blocked = true
          result.blockReason = `Review agent: ${decision.decision} - ${decision.justification}`
        }
      } else {
        // Review failed, fall back to test-based decision
        console.warn('[YOLO] Review agent failed, using test results for decision')
        if (result.allTestsPass) {
          databaseService.updateTaskStatus(task.id, 'done')
          result.tasksCompleted = 1
        } else {
          result.blocked = true
          result.blockReason = 'Tests failed and review agent unavailable'
        }
      }
    } else {
      // No auto-approve, block for human review
      result.blocked = true
      result.blockReason = 'Task requires human review (auto-approve disabled)'
    }

    active.currentTaskId = null
    result.success = !result.blocked
  } catch (err) {
    const error = err as Error
    console.error(`[YOLO] Cycle error: ${error.message}`)
    result.blocked = true
    result.blockReason = error.message
  } finally {
    databaseService.completeCycle(cycle.id, `YOLO benchmark cycle ${cycleNumber} completed`)
    active.currentCycleId = null
    broadcastToRenderers('yolo:cycleCompleted', active.resultId, cycle.id)
  }

  return result
}

/**
 * Main benchmark execution loop
 */
export async function runBenchmarkLoop(resultId: string): Promise<void> {
  const active = activeBenchmarks.get(resultId)
  if (!active) return

  while (!active.stopRequested && !isAppShuttingDown()) {
    const result = databaseService.getYoloBenchmarkResult(resultId)
    if (!result) {
      console.error(`[YOLO] Result not found: ${resultId}`)
      break
    }

    const limitMessage = checkBenchmarkLimits(result, active.config, active.startTime)
    if (limitMessage) {
      completeBenchmark(resultId, 'limit_reached', limitMessage)
      return
    }

    if (active.isPaused) {
      await sleep(1000)
      continue
    }

    try {
      const cycleResult = await runBenchmarkCycle(active)

      if (cycleResult.success && processSuccessfulCycle(resultId, result, cycleResult)) {
        completeBenchmark(resultId, 'success', 'All tests pass')
        return
      }
      if (cycleResult.blocked) {
        // Log the block but continue — next cycle can retry
        // Only unrecoverable blocks (like worktree creation failure) should be fatal,
        // but those are better handled by the time/cycle limits
        console.warn(`[YOLO] Cycle blocked: ${cycleResult.blockReason}. Continuing to next cycle.`)
      }
    } catch (err) {
      console.error(`[YOLO] Cycle error: ${(err as Error).message}`)
    }

    await sleep(500)
  }

  if (active.stopRequested) {
    completeBenchmark(resultId, 'blocked', 'User stopped benchmark')
  }
}
