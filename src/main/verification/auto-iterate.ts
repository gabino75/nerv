/**
 * Auto-Iteration Orchestrator (PRD Section 16, lines 3709-3770)
 *
 * When a Claude session exits for a task with auto_iterate enabled,
 * this module checks acceptance criteria and re-spawns Claude if
 * criteria fail and iterations remain.
 */

import { databaseService } from '../database'
import { broadcastToRenderers } from '../utils'
import { spawnClaude } from '../claude/session'
import { verifyTask } from './index'
import type {
  IterationSettings,
  TaskVerificationResult,
  ClaudeSpawnConfig
} from '../../shared/types'
import { DEFAULT_ITERATION_SETTINGS } from '../../shared/types'

/** Active auto-iteration runs keyed by taskId, so we can cancel */
const activeAutoIterations = new Map<string, { cancelled: boolean }>()

/**
 * Called when a Claude session exits. If the task has auto-iteration
 * enabled and criteria exist, runs verification and decides whether
 * to re-spawn Claude.
 *
 * Returns true if an auto-iteration was triggered, false otherwise.
 */
export async function onSessionExitAutoIterate(
  taskId: string,
  exitCode: number | null,
  projectId: string,
  cwd: string,
  claudeSessionId: string | null,
  model: string
): Promise<boolean> {
  // Only consider auto-iteration for tasks that exited normally
  if (exitCode !== 0) {
    return false
  }

  const task = databaseService.getTask(taskId)
  if (!task) return false

  const settings: IterationSettings = databaseService.getIterationSettings(taskId)
  if (!settings.auto_iterate) return false

  // Check if there are any criteria to verify
  const criteria = databaseService.getCriteriaForTask(taskId)
  if (criteria.length === 0) return false

  // Create or get iteration tracking state
  const handle = { cancelled: false }
  activeAutoIterations.set(taskId, handle)

  try {
    return await runAutoIterationCheck(
      taskId, projectId, cwd, claudeSessionId, model, settings, handle
    )
  } finally {
    activeAutoIterations.delete(taskId)
  }
}

/**
 * Cancel a running auto-iteration for a task
 */
export function cancelAutoIteration(taskId: string): boolean {
  const handle = activeAutoIterations.get(taskId)
  if (handle) {
    handle.cancelled = true
    activeAutoIterations.delete(taskId)
    broadcastToRenderers('autoIterate:cancelled', taskId)
    console.log(`[NERV] Auto-iteration cancelled for task ${taskId}`)
    return true
  }
  return false
}

/**
 * Check if a task has an active auto-iteration in progress
 */
export function isAutoIterating(taskId: string): boolean {
  return activeAutoIterations.has(taskId)
}

async function runAutoIterationCheck(
  taskId: string,
  projectId: string,
  cwd: string,
  claudeSessionId: string | null,
  model: string,
  settings: IterationSettings,
  handle: { cancelled: boolean }
): Promise<boolean> {
  // Get current iteration count
  const currentIteration = databaseService.verification.getCurrentIterationNumber(taskId)

  // Check if we've hit the max
  if (currentIteration >= settings.max_iterations) {
    console.log(`[NERV] Auto-iteration: max iterations (${settings.max_iterations}) reached for task ${taskId}`)
    broadcastToRenderers('autoIterate:maxReached', taskId, settings.on_max_iterations_reached)
    return false
  }

  // Check if human approval is needed
  if (settings.require_approval_after > 0 && currentIteration >= settings.require_approval_after) {
    console.log(`[NERV] Auto-iteration: approval required after ${settings.require_approval_after} iterations for task ${taskId}`)
    broadcastToRenderers('autoIterate:approvalRequired', taskId, currentIteration)
    return false
  }

  // Run verification
  const iterationRecord = databaseService.verification.createIteration(taskId)
  const startTime = Date.now()

  broadcastToRenderers('autoIterate:verifying', taskId, iterationRecord.iteration_number)
  console.log(`[NERV] Auto-iteration ${iterationRecord.iteration_number}: verifying criteria for task ${taskId}`)

  let verificationResult: TaskVerificationResult
  try {
    verificationResult = await verifyTask(taskId, cwd)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[NERV] Auto-iteration: verification failed for task ${taskId}: ${msg}`)
    databaseService.verification.completeIteration(
      iterationRecord.id, 'failed', Date.now() - startTime, undefined, undefined
    )
    broadcastToRenderers('autoIterate:error', taskId, msg)
    return false
  }

  // If all auto-criteria passed, we're done iterating
  if (verificationResult.auto_criteria_passed) {
    databaseService.verification.completeIteration(
      iterationRecord.id, 'completed', Date.now() - startTime, undefined, verificationResult
    )
    console.log(`[NERV] Auto-iteration: all auto-criteria passed for task ${taskId}`)
    broadcastToRenderers('autoIterate:passed', taskId, verificationResult)

    if (verificationResult.manual_pending > 0) {
      broadcastToRenderers('autoIterate:manualPending', taskId, verificationResult.manual_pending)
    }
    return false // No re-spawn needed
  }

  // Criteria failed — record and decide whether to re-spawn
  databaseService.verification.completeIteration(
    iterationRecord.id, 'failed', Date.now() - startTime, undefined, verificationResult
  )

  if (handle.cancelled) return false

  // Build failure summary for the next Claude prompt
  const failureSummary = buildFailureSummary(verificationResult)

  broadcastToRenderers('autoIterate:reSpawning', taskId, {
    iteration: iterationRecord.iteration_number,
    failures: failureSummary
  })

  // Pause between iterations
  if (settings.pause_between_iterations_ms > 0) {
    await sleep(settings.pause_between_iterations_ms)
  }

  if (handle.cancelled) return false

  // Re-spawn Claude with failure context
  const prompt = buildIterationPrompt(failureSummary, iterationRecord.iteration_number, settings.max_iterations)

  const config: ClaudeSpawnConfig = {
    taskId,
    projectId,
    cwd,
    prompt,
    model,
    // Resume the same Claude session if available, so it has context
    ...(claudeSessionId ? {} : {})
  }

  console.log(`[NERV] Auto-iteration ${iterationRecord.iteration_number}: re-spawning Claude for task ${taskId}`)

  const result = spawnClaude(config)
  if (!result.success) {
    console.error(`[NERV] Auto-iteration: failed to spawn Claude: ${result.error}`)
    broadcastToRenderers('autoIterate:error', taskId, result.error ?? 'Failed to spawn Claude')
    return false
  }

  // Update task back to in_progress since we're iterating
  databaseService.updateTaskStatus(taskId, 'in_progress')

  return true
}

function buildFailureSummary(result: TaskVerificationResult): string {
  const failures = result.results.filter(r => !r.passed)
  if (failures.length === 0) return 'No specific failures detected.'

  const lines = failures.map(f => {
    const exitInfo = f.exit_code !== undefined ? ` (exit code: ${f.exit_code})` : ''
    const outputSnippet = f.output ? `\n    Output: ${f.output.slice(0, 500)}` : ''
    return `  - ${f.criterion_id}${exitInfo}${outputSnippet}`
  })

  return `${failures.length} acceptance criteria failed:\n${lines.join('\n')}`
}

function buildIterationPrompt(
  failureSummary: string,
  iterationNumber: number,
  maxIterations: number
): string {
  return [
    `[Auto-Iteration ${iterationNumber}/${maxIterations}]`,
    '',
    'The previous attempt did not pass all acceptance criteria.',
    '',
    failureSummary,
    '',
    'Please fix the failing criteria and try again.',
    'Focus on the specific failures listed above.'
  ].join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
