/**
 * Database entity types
 */

/**
 * Review mode for task completion (PRD Review Modes section)
 * - 'normal': Human reviews code changes before merge (default)
 * - 'yolo': AI reviews and auto-merges if tests pass
 */
export type ReviewMode = 'normal' | 'yolo'

export interface Project {
  id: string
  name: string
  goal: string | null
  constraints: string | null // JSON array of project constraints (PRD Section 17)
  custom_agents: string | null // JSON string of CustomAgentsConfig
  review_mode: ReviewMode // PRD Review Modes section
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  cycle_id: string | null
  title: string
  description: string | null
  task_type: TaskType
  status: TaskStatus
  repos: string | null
  worktree_path: string | null
  session_id: string | null
  created_at: string
  completed_at: string | null
}

export type TaskType = 'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug'
export type TaskStatus = 'todo' | 'in_progress' | 'interrupted' | 'review' | 'done'

export interface Approval {
  id: number
  task_id: string
  tool_name: string
  tool_input: string | null
  context: string | null
  status: ApprovalStatus
  deny_reason: string | null
  created_at: string
  decided_at: string | null
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface Cycle {
  id: string
  project_id: string
  cycle_number: number
  goal: string | null
  status: CycleStatus
  learnings: string | null
  completed_at: string | null
}

export type CycleStatus = 'active' | 'completed'

export interface SessionMetrics {
  id: number
  task_id: string
  session_id: string | null
  input_tokens: number
  output_tokens: number
  compaction_count: number
  compactions_since_clear: number  // PRD Section 6: "Since last /clear" counter
  cache_read_tokens: number
  cache_creation_tokens: number
  model: string | null
  cost_usd: number
  duration_ms: number
  num_turns: number
  updated_at: string
}

export type RepoSourceType = 'local' | 'remote'

export interface Repo {
  id: string
  project_id: string
  name: string
  path: string
  stack: string | null
  source_type: RepoSourceType  // PRD Section 25: 'local' or 'remote'
  base_branch: string | null  // PRD Section 25: branch to base features from
  fetch_before_worktree: boolean  // PRD Section 25: fetch latest before creating worktrees
  auto_fetch_on_open: boolean  // PRD Section 25: auto-fetch on project open
}

export interface Decision {
  id: string
  project_id: string
  cycle_id: string | null
  title: string
  rationale: string | null
  alternatives: string | null
  created_at: string
}

export interface Branch {
  id: string
  parent_session_id: string | null
  parent_task_id: string
  status: BranchStatus
  summary: string | null
  created_at: string
}

export type BranchStatus = 'active' | 'merged' | 'discarded'

export interface AuditLogEntry {
  id: number
  timestamp: string
  task_id: string | null
  event_type: string
  details: string | null
}

/**
 * Spec Update Proposal (PRD Section 5, lines 896-924)
 * When Claude calls update_spec() via MCP, proposals are queued for human review
 */
export interface SpecProposal {
  id: number
  timestamp: string
  project_id: string
  section: string
  content: string
  status: SpecProposalStatus
  resolved_at: string | null
  resolution_notes: string | null
}

export type SpecProposalStatus = 'pending' | 'approved' | 'edited' | 'rejected'

export interface DocumentationSource {
  id: string
  project_id: string
  name: string
  url_pattern: string
  created_at: string
}

export interface TaskReview {
  id: string
  task_id: string
  status: TaskReviewStatus
  reviewer_notes: string | null
  created_at: string
  decided_at: string | null
}

export type TaskReviewStatus = 'pending' | 'approved' | 'rejected'

/**
 * Review context for Normal mode human review (PRD Review Modes section)
 * Shows diff, test results, and Claude's summary for informed review
 */
export interface ReviewContext {
  gitDiff: string
  gitDiffStats: string
  testResults: string | null
  testsPass: boolean | null
  claudeSummary: string | null
  error?: string
}

/**
 * Debug findings for debug tasks (PRD Section 3)
 * Stores structured findings with suggested fixes without code changes
 */
export interface DebugFinding {
  id: string
  task_id: string
  finding_type: DebugFindingType
  title: string
  content: string
  code_snippet: string | null
  file_path: string | null
  priority: number
  created_at: string
}

/**
 * Debug finding types matching PRD Section 3 report format:
 * - reproduction: Steps to reproduce the issue
 * - root_cause: What is causing the issue
 * - evidence: Logs, traces, stack traces gathered
 * - affected_component: Files/modules affected (impact assessment)
 * - suggested_fix: Options with trade-offs
 * - recommended_fix: Which fix to implement and why
 * - regression_test: What regression test to add
 */
export type DebugFindingType =
  | 'reproduction'
  | 'root_cause'
  | 'evidence'
  | 'affected_component'
  | 'suggested_fix'
  | 'recommended_fix'
  | 'regression_test'

/**
 * Audit System types (PRD Section 5)
 * Tracks code and plan health checks with auto-refactor task creation
 */

export interface AuditResult {
  id: string
  project_id: string
  cycle_id: string | null
  audit_type: AuditType
  status: AuditStatus
  code_health: CodeHealthCheck | null
  plan_health: PlanHealthCheck | null
  issues: AuditIssue[]
  failed_checks: string[]
  created_at: string
}

export type AuditType = 'code_health' | 'plan_health' | 'full'
export type AuditStatus = 'passed' | 'failed' | 'warning'

export interface CodeHealthCheck {
  testCoverage: number        // 0-100%
  dryViolations: number       // count
  typeErrors: number          // count of 'any' types
  deadCodeCount: number       // count of unused exports
  complexFunctions: number    // count of functions > 50 lines
  passed: boolean
}

export interface PlanHealthCheck {
  specMatches: boolean
  specDrift: string[]         // list of drift items
  staleTasks: string[]        // task IDs
  blockedTasks: string[]      // task IDs
  passed: boolean
}

export interface AuditIssue {
  id: string
  type: AuditIssueType
  title: string
  description: string
  severity: AuditIssueSeverity
  threshold?: number
  current?: number
  autoFixable: boolean
}

export type AuditIssueType =
  | 'low_coverage'
  | 'dry_violation'
  | 'type_safety'
  | 'dead_code'
  | 'complexity'
  | 'spec_drift'
  | 'stale_task'
  | 'blocked_task'

export type AuditIssueSeverity = 'error' | 'warning' | 'info'

/**
 * Spec Drift Report (PRD Section 5 - Spec Drift Detection)
 * Produced by audit:run-spec-drift to compare user statements, spec items, and code
 */
export interface SpecDriftReport {
  project_id: string
  timestamp: string
  /** User statements not reflected in spec */
  unaddressedStatements: SpecDriftItem[]
  /** Spec items with no corresponding code/tasks */
  specItemsWithoutCode: SpecDriftItem[]
  /** Spec items that contradict user statements */
  contradictions: SpecDriftContradiction[]
  /** Pending spec proposals that need review */
  pendingProposals: number
  /** Overall drift score: 0 (no drift) to 1 (major drift) */
  driftScore: number
  /** Whether the report indicates actionable drift */
  hasDrift: boolean
}

export interface SpecDriftItem {
  id: string
  text: string
  source: string
  severity: AuditIssueSeverity
}

export interface SpecDriftContradiction {
  statementId: string
  statementText: string
  specSection: string
  specContent: string
  description: string
}

/**
 * Learning type for project-wide knowledge (PRD Section 11: nerv learn)
 */
export interface Learning {
  id: string
  project_id: string
  content: string
  category: LearningCategory | null
  source: LearningSource | null
  created_at: string
}

export type LearningCategory = 'technical' | 'process' | 'domain' | 'architecture' | 'other'
export type LearningSource = 'manual' | 'cycle_completion' | 'debug_task' | 'review'

/**
 * Success Metrics (PRD Section 31)
 * Tracks key performance indicators for NERV
 */
export interface SuccessMetrics {
  id: number
  project_id: string | null
  metric_type: SuccessMetricType
  target_value: number
  current_value: number
  passed: boolean
  sample_count: number
  last_updated: string
}

export type SuccessMetricType =
  | 'time_to_first_task'      // < 5 minutes from "New Project" (in ms)
  | 'context_reexplanation'   // Zero (count of re-explanations)
  | 'dangerous_command_catch' // > 90% routed to approval queue (percentage)
  | 'recovery_success_rate'   // > 95% of interrupted tasks recoverable (percentage)
  | 'benchmark_pass_simple'   // > 95% pass rate for simple specs (percentage)
  | 'benchmark_pass_medium'   // > 80% pass rate for medium specs (percentage)

/**
 * Success metric target thresholds per PRD Section 31
 */
export const SUCCESS_METRIC_TARGETS: Record<SuccessMetricType, number> = {
  time_to_first_task: 5 * 60 * 1000,  // 5 minutes in ms
  context_reexplanation: 0,            // Zero
  dangerous_command_catch: 90,         // > 90%
  recovery_success_rate: 95,           // > 95%
  benchmark_pass_simple: 95,           // > 95%
  benchmark_pass_medium: 80            // > 80%
}

/**
 * User Statement for Spec Drift Detection (PRD Section 2)
 * Tracks user statements and compares against spec to detect drift
 */
export interface UserStatement {
  id: string
  project_id: string
  timestamp: number                    // Unix timestamp (milliseconds)
  text: string                         // What user said
  source: UserStatementSource          // Where this came from
  addressed: boolean                   // Is this reflected in the spec?
  spec_reference: string | null        // Link to spec item if addressed
  created_at: string
}

export type UserStatementSource = 'chat' | 'feedback' | 'review'

/**
 * Cost Tracking types (PRD Section 14)
 * Comprehensive cost and usage tracking for Claude API spending
 */

/**
 * Cost summary at any granularity level
 */
export interface CostSummary {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCost: number
  byModel: Map<string, ModelCost>
  timeSeries: CostDataPoint[]
}

/**
 * Cost breakdown by model
 */
export interface ModelCost {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  taskCount: number
}

/**
 * Time-series data point for cost charts
 */
export interface CostDataPoint {
  timestamp: string
  cost: number
  inputTokens: number
  outputTokens: number
}

/**
 * Budget alert notification (PRD Section 14)
 */
export interface BudgetAlert {
  type: 'warning' | 'critical'
  scope: 'task' | 'project' | 'monthly'
  message: string
  currentSpend: number
  budgetLimit: number
  /** Days until budget exceeded at current pace (null if under budget) */
  daysUntilExceeded: number | null
}

/**
 * Cost tracker interface (PRD Section 14)
 */
export interface CostTracker {
  /** Track usage from stream-json output */
  trackUsage(event: unknown): void
  /** Get costs at session level */
  getSessionCost(sessionId: string): CostSummary
  /** Get costs at task level */
  getTaskCost(taskId: string): CostSummary
  /** Get costs at project level for a date range */
  getProjectCost(projectId: string, startDate: string, endDate: string): CostSummary
  /** Get global costs for a date range */
  getGlobalCost(startDate: string, endDate: string): CostSummary
  /** Check for budget alerts */
  checkBudgetAlerts(): BudgetAlert[]
}
