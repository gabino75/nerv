/**
 * YOLO Benchmark lifecycle management
 */

import { databaseService } from '../database'
import { broadcastToRenderers } from '../utils'
import { runBenchmarkLoop } from './execution'
import type { YoloBenchmarkConfig, YoloBenchmarkResult, YoloBenchmarkStatus } from '../../shared/types'
import type { ActiveBenchmark } from './types'

// Map of benchmark result ID to active state
export const activeBenchmarks: Map<string, ActiveBenchmark> = new Map()

/**
 * Start a new YOLO benchmark run
 */
export function startYoloBenchmark(configId: string): YoloBenchmarkResult | null {
  const configWithId = databaseService.getYoloBenchmarkConfig(configId)
  if (!configWithId) {
    console.error(`[YOLO] Config not found: ${configId}`)
    return null
  }

  const existingRun = databaseService.getRunningYoloBenchmarks()
    .find(r => r.configId === configId)
  if (existingRun) {
    console.warn(`[YOLO] Benchmark already running for config: ${configId}`)
    return existingRun
  }

  const result = databaseService.createYoloBenchmarkResult(configId)

  const config: YoloBenchmarkConfig = {
    projectId: configWithId.projectId,
    model: configWithId.model,
    maxCycles: configWithId.maxCycles,
    maxCostUsd: configWithId.maxCostUsd,
    maxDurationMs: configWithId.maxDurationMs,
    autoApproveReview: configWithId.autoApproveReview,
    autoApproveDangerousTools: configWithId.autoApproveDangerousTools,
    testCommand: configWithId.testCommand,
    specFile: configWithId.specFile
  }

  const active: ActiveBenchmark = {
    resultId: result.id,
    configId,
    config,
    startTime: Date.now(),
    currentCycleId: null,
    currentTaskId: null,
    isPaused: false,
    stopRequested: false
  }

  activeBenchmarks.set(result.id, active)

  broadcastToRenderers('yolo:started', result.id, configId)

  console.log(`[YOLO] Benchmark started: ${result.id}`)

  runBenchmarkLoop(result.id).catch(err => {
    console.error(`[YOLO] Benchmark loop error: ${err}`)
    completeBenchmark(result.id, 'failed', `Loop error: ${err.message}`)
  })

  return result
}

/**
 * Stop a running benchmark
 */
export function stopYoloBenchmark(resultId: string, reason: string = 'User requested stop'): YoloBenchmarkResult | null {
  const active = activeBenchmarks.get(resultId)
  if (!active) {
    console.warn(`[YOLO] No active benchmark: ${resultId}`)
    return databaseService.getYoloBenchmarkResult(resultId) || null
  }

  active.stopRequested = true
  return completeBenchmark(resultId, 'blocked', reason)
}

/**
 * Pause a benchmark
 */
export function pauseYoloBenchmark(resultId: string): boolean {
  const active = activeBenchmarks.get(resultId)
  if (!active) return false
  active.isPaused = true
  broadcastToRenderers('yolo:paused', resultId)
  return true
}

/**
 * Resume a paused benchmark
 */
export function resumeYoloBenchmark(resultId: string): boolean {
  const active = activeBenchmarks.get(resultId)
  if (!active) return false
  active.isPaused = false
  broadcastToRenderers('yolo:resumed', resultId)
  return true
}

/**
 * Get active benchmark status
 */
export function getActiveBenchmarkStatus(resultId: string): {
  isActive: boolean
  isPaused: boolean
  elapsedMs: number
  currentCycleId: string | null
  currentTaskId: string | null
} | null {
  const active = activeBenchmarks.get(resultId)
  if (!active) return null

  return {
    isActive: !active.stopRequested,
    isPaused: active.isPaused,
    elapsedMs: Date.now() - active.startTime,
    currentCycleId: active.currentCycleId,
    currentTaskId: active.currentTaskId
  }
}

/**
 * Complete a benchmark run
 * Validates that benchmarks with 0% spec completion cannot be marked as "success"
 */
export function completeBenchmark(
  resultId: string,
  status: YoloBenchmarkStatus,
  stopReason: string | null
): YoloBenchmarkResult | null {
  const active = activeBenchmarks.get(resultId)
  const currentResult = databaseService.getYoloBenchmarkResult(resultId)

  const MIN_SPEC_COMPLETION_FOR_SUCCESS = 10
  let finalStatus = status
  let finalReason = stopReason

  if (currentResult) {
    const specPct = currentResult.specCompletionPct || 0
    const tasksCompleted = currentResult.tasksCompleted || 0

    if (status === 'success' && specPct < MIN_SPEC_COMPLETION_FOR_SUCCESS) {
      console.warn(`[YOLO] Downgrading benchmark status from 'success' to 'failed': ` +
        `spec completion ${specPct}% < ${MIN_SPEC_COMPLETION_FOR_SUCCESS}% minimum`)
      finalStatus = 'failed'
      finalReason = `Spec completion too low: ${specPct.toFixed(1)}% (minimum ${MIN_SPEC_COMPLETION_FOR_SUCCESS}%)`
    }

    if (status === 'limit_reached' && specPct < MIN_SPEC_COMPLETION_FOR_SUCCESS && tasksCompleted === 0) {
      console.warn(`[YOLO] Downgrading benchmark status from 'limit_reached' to 'failed': ` +
        `no meaningful work done (spec=${specPct}%, tasks=${tasksCompleted})`)
      finalStatus = 'failed'
      finalReason = `${stopReason} - No meaningful work completed (${specPct.toFixed(1)}% spec completion)`
    }
  }

  const result = databaseService.completeYoloBenchmark(resultId, finalStatus, finalReason)

  if (active && result) {
    const totalDurationMs = Date.now() - active.startTime
    databaseService.updateYoloBenchmarkResult(resultId, { totalDurationMs })
  }

  activeBenchmarks.delete(resultId)

  broadcastToRenderers('yolo:completed', resultId, finalStatus, finalReason)

  console.log(`[YOLO] Benchmark completed: ${resultId} - ${finalStatus} - ${finalReason}`)

  return databaseService.getYoloBenchmarkResult(resultId) || null
}

/**
 * Check if a task is running in a YOLO benchmark with auto-approve dangerous tools enabled
 */
export function shouldAutoApproveDangerousTools(taskId: string): boolean {
  for (const active of activeBenchmarks.values()) {
    if (active.currentTaskId === taskId && active.config.autoApproveDangerousTools) {
      return true
    }
  }
  return false
}

/**
 * Cleanup any active benchmarks on app quit
 */
export function cleanupYoloBenchmarks(): void {
  for (const [resultId, active] of activeBenchmarks) {
    try {
      active.stopRequested = true
      completeBenchmark(resultId, 'blocked', 'Application shutdown')
    } catch (err) {
      console.error(`[YOLO] Failed to complete benchmark ${resultId} during cleanup:`, err)
    }
  }
  activeBenchmarks.clear()
}
