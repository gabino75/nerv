/**
 * Spec Verification & Iterations types (PRD Section 16)
 * Defines acceptance criteria and verification infrastructure for tasks
 */

/**
 * Verifier types supported for acceptance criteria
 */
export type VerifierType = 'command' | 'file_exists' | 'grep' | 'test_pass' | 'manual'

/**
 * Status of an acceptance criterion check
 */
export type CriterionStatus = 'pending' | 'pass' | 'fail'

/**
 * Acceptance criterion for a task
 * Each task can have multiple criteria that must pass before completion
 */
export interface AcceptanceCriterion {
  id: string
  task_id: string
  description: string
  verifier: VerifierType

  // For 'command' verifier
  command?: string
  expected_exit_code?: number        // Default: 0
  expected_output?: string           // Regex or substring match

  // For 'file_exists' verifier
  file_path?: string

  // For 'grep' verifier
  grep_file?: string
  grep_pattern?: string
  should_match?: boolean             // true = must match, false = must NOT match

  // For 'test_pass' verifier
  test_command?: string              // e.g., "npm test"
  test_pattern?: string              // Optional pattern to check in output

  // For 'manual' verifier
  checklist_item?: string            // Human-readable checklist item

  // Status tracking
  status: CriterionStatus
  last_check_output?: string
  last_check_time?: string           // ISO timestamp

  created_at: string
}

/**
 * Result of running a single verifier
 */
export interface VerifierResult {
  criterion_id: string
  passed: boolean
  output: string
  exit_code?: number
  duration_ms: number
  checked_at: string
}

/**
 * Result of running all criteria for a task
 */
export interface TaskVerificationResult {
  task_id: string
  all_passed: boolean
  auto_criteria_passed: boolean      // All non-manual criteria passed
  manual_pending: number             // Count of manual criteria still pending
  results: VerifierResult[]
  checked_at: string
}

/**
 * Task iteration tracking
 * Tracks each attempt Claude makes to complete a task
 */
export interface TaskIteration {
  id: string
  task_id: string
  iteration_number: number
  status: 'running' | 'completed' | 'failed'
  duration_ms: number
  files_changed: IterationFileChange[]
  verification_result?: TaskVerificationResult
  created_at: string
  completed_at?: string
}

/**
 * File change tracked in an iteration
 */
export interface IterationFileChange {
  file_path: string
  lines_added: number
  lines_removed: number
}

/**
 * Iteration settings for auto-iteration behavior
 */
export interface IterationSettings {
  // Auto-iteration
  auto_iterate: boolean               // Continue automatically on failure
  max_iterations: number              // Stop after N attempts (default: 5)

  // Between iterations
  pause_between_iterations_ms: number // Milliseconds (default: 1000)
  require_approval_after: number      // Ask human after N iterations

  // Failure handling
  on_max_iterations_reached: 'stop' | 'ask' | 'branch'

  // Verification
  run_criteria_after_each_iteration: boolean
  stop_on_first_failure: boolean      // Stop iteration on first failing criterion
}

/**
 * Default iteration settings
 */
export const DEFAULT_ITERATION_SETTINGS: IterationSettings = {
  auto_iterate: false,
  max_iterations: 5,
  pause_between_iterations_ms: 1000,
  require_approval_after: 3,
  on_max_iterations_reached: 'ask',
  run_criteria_after_each_iteration: true,
  stop_on_first_failure: false
}

/**
 * Verification template for reusable criteria patterns
 */
export interface VerificationTemplate {
  id: string
  name: string                        // e.g., "typescript-project"
  criteria: Omit<AcceptanceCriterion, 'id' | 'task_id' | 'status' | 'last_check_output' | 'last_check_time' | 'created_at'>[]
}

/**
 * Failure pattern for analytics/learning
 */
export interface FailurePattern {
  pattern: string                     // e.g., "Tests fail after refactoring"
  frequency: number
  suggested_fix: string               // e.g., "Add test run before refactoring"
}

/**
 * Iteration analytics interface
 */
export interface IterationAnalytics {
  task_id: string
  total_iterations: number
  average_iteration_duration_ms: number
  success_rate: number                // 0-1
  common_failure_patterns: FailurePattern[]
}

/**
 * Input for creating a new acceptance criterion
 */
export interface AcceptanceCriterionInput {
  description: string
  verifier: VerifierType
  command?: string
  expected_exit_code?: number
  expected_output?: string
  file_path?: string
  grep_file?: string
  grep_pattern?: string
  should_match?: boolean
  test_command?: string
  test_pattern?: string
  checklist_item?: string
}

/**
 * Input for creating criteria from a template
 */
export interface ApplyTemplateInput {
  task_id: string
  template_id: string
}
