/**
 * NERV Benchmark Scenarios
 *
 * Defines test scenarios for benchmarking NERV functionality.
 * These scenarios test real workflows from project creation to task completion.
 */

import type { Project, Task, TaskType, TaskStatus, Repo, Cycle, Approval } from '../../src/shared/types'

// ============================================================================
// Scenario Types
// ============================================================================

export type ScenarioLevel = 'simple' | 'medium' | 'complex'

export interface BenchmarkScenario {
  id: string
  name: string
  description: string
  level: ScenarioLevel
  steps: BenchmarkStep[]
  expectedOutcomes: ExpectedOutcome[]
  timeout: number // milliseconds
}

export interface BenchmarkStep {
  id: string
  action: BenchmarkAction
  description: string
  params: Record<string, unknown>
  expectedDuration?: number // milliseconds, optional hint
}

export type BenchmarkAction =
  | 'create_project'
  | 'add_repo'
  | 'create_task'
  | 'start_task'
  | 'wait_for_terminal_output'
  | 'wait_for_approval'
  | 'approve_action'
  | 'deny_action'
  | 'stop_task'
  | 'check_task_status'
  | 'create_cycle'
  | 'create_worktree'
  | 'branch_session'
  | 'verify_state'

export interface ExpectedOutcome {
  type: 'task_status' | 'project_exists' | 'terminal_contains' | 'approval_count' | 'state_valid'
  description: string
  check: OutcomeCheck
}

export type OutcomeCheck =
  | { taskId: string; status: TaskStatus }
  | { projectName: string; exists: boolean }
  | { pattern: string | RegExp }
  | { count: number; comparison: 'eq' | 'gte' | 'lte' }
  | { valid: boolean }

// ============================================================================
// Benchmark Results Types
// ============================================================================

export interface BenchmarkResult {
  scenarioId: string
  scenarioName: string
  level: ScenarioLevel
  passed: boolean
  steps: StepResult[]
  outcomes: OutcomeResult[]
  metrics: BenchmarkMetrics
  logs: string[]
  errors: string[]
  startTime: number
  endTime: number
}

export interface StepResult {
  stepId: string
  action: BenchmarkAction
  success: boolean
  duration: number
  error?: string
  output?: unknown
}

export interface OutcomeResult {
  description: string
  passed: boolean
  actual?: unknown
  expected?: unknown
}

export interface BenchmarkMetrics {
  totalDuration: number
  stepDurations: Record<string, number>
  memoryUsage?: number
  tokenUsage?: {
    input: number
    output: number
  }
}

// ============================================================================
// Scenario Definitions
// ============================================================================

/**
 * Simple scenario: Create a project and add a task
 * Tests basic CRUD operations without Claude spawning
 */
export const simpleScenario: BenchmarkScenario = {
  id: 'simple-project-task',
  name: 'Simple: Create Project and Task',
  description: 'Creates a new project and adds a task without starting Claude',
  level: 'simple',
  timeout: 30000,
  steps: [
    {
      id: 'create-project',
      action: 'create_project',
      description: 'Create a new test project',
      params: {
        name: 'Benchmark Test Project',
        goal: 'Test project for benchmarking NERV functionality',
      },
      expectedDuration: 1000,
    },
    {
      id: 'add-repo',
      action: 'add_repo',
      description: 'Add a repository to the project',
      params: {
        name: 'test-repo',
        path: '/tmp/nerv-benchmark-repo',
        stack: 'Node.js',
      },
      expectedDuration: 500,
    },
    {
      id: 'create-task',
      action: 'create_task',
      description: 'Create a research task',
      params: {
        title: 'Research benchmark functionality',
        description: 'Investigate how benchmarks should work',
        taskType: 'research' as TaskType,
      },
      expectedDuration: 500,
    },
    {
      id: 'verify-state',
      action: 'verify_state',
      description: 'Verify project and task were created',
      params: {},
      expectedDuration: 100,
    },
  ],
  expectedOutcomes: [
    {
      type: 'project_exists',
      description: 'Project should exist',
      check: { projectName: 'Benchmark Test Project', exists: true },
    },
    {
      type: 'task_status',
      description: 'Task should be in todo status',
      check: { taskId: '', status: 'todo' }, // taskId filled at runtime
    },
    {
      type: 'state_valid',
      description: 'Database state should be consistent',
      check: { valid: true },
    },
  ],
}

/**
 * Medium scenario: Start a task and verify terminal output
 * Tests Claude spawning and basic terminal interaction
 */
export const mediumScenario: BenchmarkScenario = {
  id: 'medium-task-execution',
  name: 'Medium: Task Execution with Terminal',
  description: 'Creates a project, starts a task, and verifies Claude terminal output',
  level: 'medium',
  timeout: 120000,
  steps: [
    {
      id: 'create-project',
      action: 'create_project',
      description: 'Create a new test project',
      params: {
        name: 'Medium Benchmark Project',
        goal: 'Test task execution workflow',
      },
      expectedDuration: 1000,
    },
    {
      id: 'add-repo',
      action: 'add_repo',
      description: 'Add a repository to the project',
      params: {
        name: 'test-repo',
        path: '/tmp/nerv-medium-benchmark-repo',
        stack: 'Node.js',
      },
      expectedDuration: 500,
    },
    {
      id: 'create-task',
      action: 'create_task',
      description: 'Create an implementation task',
      params: {
        title: 'Create a simple function',
        description: 'Write a function that adds two numbers',
        taskType: 'implementation' as TaskType,
      },
      expectedDuration: 500,
    },
    {
      id: 'start-task',
      action: 'start_task',
      description: 'Start the task and spawn Claude',
      params: {
        prompt: 'Create a simple add function in JavaScript',
      },
      expectedDuration: 5000,
    },
    {
      id: 'wait-terminal',
      action: 'wait_for_terminal_output',
      description: 'Wait for Claude to produce output',
      params: {
        timeout: 60000,
        pattern: /claude|function|add/i,
      },
      expectedDuration: 30000,
    },
    {
      id: 'stop-task',
      action: 'stop_task',
      description: 'Stop the running task',
      params: {},
      expectedDuration: 2000,
    },
    {
      id: 'check-status',
      action: 'check_task_status',
      description: 'Verify task status after stopping',
      params: {},
      expectedDuration: 100,
    },
  ],
  expectedOutcomes: [
    {
      type: 'project_exists',
      description: 'Project should exist',
      check: { projectName: 'Medium Benchmark Project', exists: true },
    },
    {
      type: 'terminal_contains',
      description: 'Terminal should show Claude output',
      check: { pattern: /\w+/ }, // Any text output
    },
    {
      type: 'task_status',
      description: 'Task should be interrupted after stop',
      check: { taskId: '', status: 'interrupted' },
    },
  ],
}

/**
 * Complex scenario: Full workflow with permissions, worktrees, and branching
 * Tests the complete NERV workflow end-to-end
 */
export const complexScenario: BenchmarkScenario = {
  id: 'complex-full-workflow',
  name: 'Complex: Full Workflow with Permissions',
  description: 'Tests complete workflow including permissions, worktrees, and session branching',
  level: 'complex',
  timeout: 300000,
  steps: [
    {
      id: 'create-project',
      action: 'create_project',
      description: 'Create a new test project',
      params: {
        name: 'Complex Benchmark Project',
        goal: 'Full workflow test with all NERV features',
      },
      expectedDuration: 1000,
    },
    {
      id: 'add-repo',
      action: 'add_repo',
      description: 'Add a git repository to the project',
      params: {
        name: 'main-repo',
        path: '/tmp/nerv-complex-benchmark-repo',
        stack: 'Node.js',
      },
      expectedDuration: 500,
    },
    {
      id: 'create-cycle',
      action: 'create_cycle',
      description: 'Create a development cycle',
      params: {
        goal: 'Implement core functionality',
      },
      expectedDuration: 500,
    },
    {
      id: 'create-task',
      action: 'create_task',
      description: 'Create an implementation task in the cycle',
      params: {
        title: 'Implement feature with file operations',
        description: 'Create a feature that requires file read/write permissions',
        taskType: 'implementation' as TaskType,
      },
      expectedDuration: 500,
    },
    {
      id: 'create-worktree',
      action: 'create_worktree',
      description: 'Create a worktree for the task',
      params: {
        branchName: 'feature/benchmark-test',
      },
      expectedDuration: 3000,
    },
    {
      id: 'start-task',
      action: 'start_task',
      description: 'Start the task and spawn Claude',
      params: {
        prompt: 'Create a config file and read its contents',
      },
      expectedDuration: 5000,
    },
    {
      id: 'wait-approval',
      action: 'wait_for_approval',
      description: 'Wait for a permission request',
      params: {
        timeout: 60000,
        toolPattern: /Write|Read|Bash/,
      },
      expectedDuration: 30000,
    },
    {
      id: 'approve-action',
      action: 'approve_action',
      description: 'Approve the permission request',
      params: {},
      expectedDuration: 1000,
    },
    {
      id: 'wait-terminal-2',
      action: 'wait_for_terminal_output',
      description: 'Wait for continued Claude output',
      params: {
        timeout: 60000,
        pattern: /complete|done|created/i,
      },
      expectedDuration: 30000,
    },
    {
      id: 'branch-session',
      action: 'branch_session',
      description: 'Create a branch from the current session',
      params: {
        summary: 'Branching to try alternative approach',
        includeHistory: true,
      },
      expectedDuration: 2000,
    },
    {
      id: 'stop-task',
      action: 'stop_task',
      description: 'Stop the running task',
      params: {},
      expectedDuration: 2000,
    },
    {
      id: 'verify-final-state',
      action: 'verify_state',
      description: 'Verify all state is consistent',
      params: {},
      expectedDuration: 500,
    },
  ],
  expectedOutcomes: [
    {
      type: 'project_exists',
      description: 'Project should exist',
      check: { projectName: 'Complex Benchmark Project', exists: true },
    },
    {
      type: 'approval_count',
      description: 'Should have at least one approval record',
      check: { count: 1, comparison: 'gte' },
    },
    {
      type: 'terminal_contains',
      description: 'Terminal should show Claude interaction',
      check: { pattern: /\w+/ },
    },
    {
      type: 'state_valid',
      description: 'Final state should be consistent',
      check: { valid: true },
    },
  ],
}

// ============================================================================
// Scenario Registry
// ============================================================================

export const scenarios: Record<string, BenchmarkScenario> = {
  simple: simpleScenario,
  medium: mediumScenario,
  complex: complexScenario,
}

export function getScenario(name: string): BenchmarkScenario | undefined {
  return scenarios[name]
}

export function getAllScenarios(): BenchmarkScenario[] {
  return Object.values(scenarios)
}

export function getScenariosByLevel(level: ScenarioLevel): BenchmarkScenario[] {
  return Object.values(scenarios).filter((s) => s.level === level)
}

// ============================================================================
// Result Helpers
// ============================================================================

export function createEmptyResult(scenario: BenchmarkScenario): BenchmarkResult {
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    level: scenario.level,
    passed: false,
    steps: [],
    outcomes: [],
    metrics: {
      totalDuration: 0,
      stepDurations: {},
    },
    logs: [],
    errors: [],
    startTime: Date.now(),
    endTime: 0,
  }
}

export function finalizeResult(result: BenchmarkResult): BenchmarkResult {
  result.endTime = Date.now()
  result.metrics.totalDuration = result.endTime - result.startTime

  // Calculate if all steps passed
  const allStepsPassed = result.steps.every((s) => s.success)
  const allOutcomesPassed = result.outcomes.every((o) => o.passed)
  result.passed = allStepsPassed && allOutcomesPassed && result.errors.length === 0

  return result
}

export function addStepResult(
  result: BenchmarkResult,
  step: BenchmarkStep,
  success: boolean,
  duration: number,
  error?: string,
  output?: unknown
): void {
  result.steps.push({
    stepId: step.id,
    action: step.action,
    success,
    duration,
    error,
    output,
  })
  result.metrics.stepDurations[step.id] = duration
}

export function addOutcomeResult(
  result: BenchmarkResult,
  outcome: ExpectedOutcome,
  passed: boolean,
  actual?: unknown,
  expected?: unknown
): void {
  result.outcomes.push({
    description: outcome.description,
    passed,
    actual,
    expected,
  })
}

export function addLog(result: BenchmarkResult, message: string): void {
  result.logs.push(`[${new Date().toISOString()}] ${message}`)
}

export function addError(result: BenchmarkResult, error: string): void {
  result.errors.push(`[${new Date().toISOString()}] ${error}`)
}
