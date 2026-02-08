/**
 * Benchmark output types (PRD Section 26)
 */

export type BenchmarkOutcome = 'success' | 'partial' | 'failed'

export interface BenchmarkConfig {
  reviewMode: 'normal' | 'yolo'
  maxCycles: number
  auditFrequency: number
  model: string
  specFile: string
}

export interface BenchmarkSummary {
  benchmarkId: string
  timestamp: number
  nervVersion: string
  specFile: string
  model: string
  config: BenchmarkConfig
  outcome: BenchmarkOutcome
  duration: {
    totalMs: number
    perCycle: number[]
    perTask: Record<string, number>
  }
  tokens: {
    total: number
    input: number
    output: number
    cached: number
    perTask: Record<string, number>
    perCycle: number[]
  }
  cost: {
    totalUsd: number
    perTask: Record<string, number>
    perCycle: number[]
  }
  tasks: {
    total: number
    completed: number
    failed: number
    byStatus: Record<string, number>
  }
  cycles: {
    total: number
    auditsRun: number
    auditsPassed: number
  }
  workflow: {
    worktreesCreated: number
    worktreesMerged: number
    worktreesDiscarded: number
    branchesCreated: number
    parallelTasksRun: number
  }
  issues: {
    loopsDetected: number
    compactions: number
    toolErrors: number
    toolRetries: number
    permissionTimeouts: number
    stuckDetections: number
  }
  spec: {
    totalItems: number
    itemsPassed: number
    itemsFailed: number
    completionPercent: number
  }
  tests: {
    total: number
    passed: number
    failed: number
    skipped: number
  }
  scores: BenchmarkScores | null
}

/**
 * Two-dimension benchmark scoring per PRD Section 27.
 * Dimension 1: NERV Ops (deterministic from summary.json)
 * Dimension 2: Code Quality (Claude-graded)
 */
export interface BenchmarkScores {
  nervOps: NervOpsScore
  codeQuality: {
    implementation: BenchmarkScoreDetail
    functionality: BenchmarkScoreDetail
    ux: BenchmarkScoreDetail
  }
  progression: BenchmarkProgression | null
  combined: {
    nervOpsScore: number
    codeQualityScore: number
    overallScore: number
  }
  overall: BenchmarkOverallScore
}

export interface BenchmarkProgression {
  narrative: string
  cycleHighlights: string[]
  hiccups: string[]
  reviewAgentFindings: string[]
}

export interface BenchmarkScoreDetail {
  score: number
  strengths: string[]
  weaknesses: string[]
  evidence: string
}

export interface BenchmarkOverallScore {
  score: number
  adjustment: number
  adjustmentReason: string
  summary: string
  recommendations: string[]
}

export interface BenchmarkStreamEntry {
  type: 'system' | 'assistant' | 'user' | 'result'
  timestamp: number
  session_id?: string
  message?: {
    content?: Array<{
      type: string
      text?: string
      tool_use_id?: string
      id?: string
      name?: string
      input?: unknown
    }>
  }
  result?: {
    cost_usd?: number
    duration_ms?: number
    num_turns?: number
  }
}

export interface BenchmarkToolEntry {
  timestamp: number
  tool: string
  input: unknown
  output: string
  durationMs: number
  success: boolean
  exitCode?: number
  error?: string
  retryOf?: string
}

export interface BenchmarkSubagentEntry {
  event: 'spawn' | 'progress' | 'complete'
  timestamp: number
  subagentId: string
  type?: string
  parentTaskId?: string
  prompt?: string
  model?: string
  tokensUsed?: number
  tokensTotal?: number
  costUsd?: number
  durationMs?: number
  result?: string
  success?: boolean
}

export interface BenchmarkTimelineEntry {
  timestamp: number
  event: string
  [key: string]: unknown
}

export interface BenchmarkPermissionRequest {
  timestamp: number
  tool: string
  command?: string
  taskId: string
  input?: unknown
}

export interface BenchmarkPermissionDecision {
  timestamp: number
  decision: 'allow_once' | 'allow_always' | 'deny'
  pattern?: string
  taskId: string
}

export interface BenchmarkVisualTest {
  screenshots: string[]
  interactionLog: string
  readmeAccuracy: string
  uxAssessment: string
}

export interface BenchmarkHistoryEntry {
  benchmarkId: string
  nervVersion: string
  spec: string
  outcome: BenchmarkOutcome
  scores: {
    nervOps: number
    codeQuality: number
    overall: number
  } | null
  duration: number
  cost: number
}

// ============================================================================
// Claude-Assisted Cycle Planning Types
// ============================================================================

export interface CycleSuggestion {
  goal: string
  tasks: Array<{ title: string; description: string; type: string }>
  rationale: string
}

// ============================================================================
// User Scenario Spec Types (UI Benchmark)
// ============================================================================

export interface UserScenario {
  projectIdea: string
  userProfile: {
    strong: string[]
    moderate: string[]
    weak: string[]
    neverUsed: string[]
  }
  techPreferences: string[]
  roughMilestones: string[]
  midProjectEvents: MidProjectEvent[]
  qualityBar: string[]
}

export interface MidProjectEvent {
  afterCycle: number
  type: 'scope_creep' | 'mind_change' | 'user_says'
  content: string
}

// ============================================================================
// UI Benchmark Phase Result Types
// ============================================================================

export interface UIBenchmarkPhaseResult {
  phase: 'setup' | 'build' | 'grade'
  durationMs: number
  success: boolean
  error?: string
}

export interface UIBenchmarkSetupResult extends UIBenchmarkPhaseResult {
  phase: 'setup'
  projectId: string
  cycleId: string
  taskIds: string[]
}

export interface UIBenchmarkBuildResult extends UIBenchmarkPhaseResult {
  phase: 'build'
  cyclesCompleted: number
  tasksCompleted: number
  tasksFailed: number
  totalCostUsd: number
}

export interface UIBenchmarkGradeResult extends UIBenchmarkPhaseResult {
  phase: 'grade'
  planningScore: number
  codeScore: number
  nervOpsScore: number
  overallScore: number
}

export interface UIBenchmarkResult {
  specFile: string
  setup: UIBenchmarkSetupResult
  build: UIBenchmarkBuildResult
  grade: UIBenchmarkGradeResult
  totalDurationMs: number
  videoPath?: string
  eventLogPath?: string
}

export interface UIBenchmarkEventLog {
  t: number
  event: string
  region?: string
  label?: string
  action?: string
  factor?: number
}

// ============================================================================
// Spec Parser Types
// ============================================================================

export interface ParsedSubtask {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  parallelGroup: string
}

export interface ParsedCycle {
  cycleNumber: number
  title: string
  description: string
  subtasks: ParsedSubtask[]
}

export interface ParsedSpec {
  title: string
  rawContent: string
  cycles: ParsedCycle[]
  totalAcceptanceCriteria: number
}

// ============================================================================
// NERV Ops Scoring Types
// ============================================================================

export interface NervOpsBreakdown {
  worktreeUsage: { score: number; max: number; details: string }
  parallelism: { score: number; max: number; details: string }
  cycleManagement: { score: number; max: number; details: string }
  reviewProcess: { score: number; max: number; details: string }
  errorHandling: { score: number; max: number; details: string }
  costEfficiency: { score: number; max: number; details: string }
}

export interface NervOpsScore {
  score: number
  breakdown: NervOpsBreakdown
}

// ============================================================================
// Review Decision Types (CLI-compatible)
// ============================================================================

export interface ReviewDecision {
  decision: 'approve' | 'needs_changes' | 'reject'
  justification: string
  concerns: string[]
  suggestions: string[]
  confidence: number
  autoMerge: boolean
}

// ============================================================================
// Benchmark Pipeline Types
// ============================================================================

export interface BenchmarkPipelineConfig {
  specFile: string
  workspaceDir: string
  model: string
  maxConcurrent: number
  maxCostUsd: number
  dangerouslySkipPermissions: boolean
  maxTurnsPerTask: number
}

export interface BenchmarkTaskResult {
  taskId: string
  subtask: ParsedSubtask
  cycleNumber: number
  worktreePath: string
  branchName: string
  exitCode: number
  durationMs: number
  costUsd: number
  tokens: { input: number; output: number; cached: number }
  reviewDecision: ReviewDecision | null
  merged: boolean
  testsPassed: number
  testsFailed: number
}

export interface BenchmarkCycleResult {
  cycleNumber: number
  title: string
  tasks: BenchmarkTaskResult[]
  durationMs: number
  costUsd: number
  specCompletionPercent: number
}

export interface BenchmarkPipelineResult {
  config: BenchmarkPipelineConfig
  spec: ParsedSpec
  cycles: BenchmarkCycleResult[]
  totalDurationMs: number
  totalCostUsd: number
  worktreesCreated: number
  worktreesMerged: number
  parallelTasksRun: number
  reviewsRun: number
  outcome: BenchmarkOutcome
}
