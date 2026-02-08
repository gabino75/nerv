/**
 * YOLO Benchmark types (Golden Test 2)
 */

export type YoloBenchmarkStatus = 'idle' | 'running' | 'success' | 'failed' | 'limit_reached' | 'blocked'

export interface YoloBenchmarkConfig {
  projectId: string
  model: string
  maxCycles: number
  maxCostUsd: number
  maxDurationMs: number
  autoApproveReview: boolean
  autoApproveDangerousTools: boolean
  testCommand: string | null
  specFile: string | null
}

export interface YoloBenchmarkResult {
  id: string
  configId: string
  status: YoloBenchmarkStatus
  startedAt: string
  completedAt: string | null
  cyclesCompleted: number
  tasksCompleted: number
  totalCostUsd: number
  totalDurationMs: number
  testsPassed: number
  testsFailed: number
  specCompletionPct: number
  stopReason: string | null
}

export interface YoloBenchmarkGrade {
  specCompletion: number
  testPassRate: number
  costEfficiency: number
  overallScore: number
}

export interface YoloBenchmarkComparison {
  results: YoloBenchmarkResult[]
  grades: Record<string, YoloBenchmarkGrade>
  winner: string | null
}
