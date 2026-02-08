/**
 * YOLO Benchmark internal types
 */

import type { YoloBenchmarkConfig } from '../../shared/types'

export interface ActiveBenchmark {
  resultId: string
  configId: string
  config: YoloBenchmarkConfig
  startTime: number
  currentCycleId: string | null
  currentTaskId: string | null
  isPaused: boolean
  stopRequested: boolean
}

export interface CycleResult {
  success: boolean
  blocked: boolean
  blockReason?: string
  tasksCompleted: number
  costUsd: number
  testsPassed: number
  testsFailed: number
  allTestsPass: boolean
  specCompletionPct: number
}

export interface ClaudeCompletionResult {
  blocked: boolean
  blockReason?: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface TestResult {
  passed: number
  failed: number
  /** Captured test output when failures occur (for debug task creation) */
  failureOutput?: string
}
