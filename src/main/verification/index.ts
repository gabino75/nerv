/**
 * Verification service (PRD Section 16)
 * Orchestrates task verification and iteration tracking
 */

import { databaseService } from '../database'
import { runVerifier } from './verifiers'
import type {
  AcceptanceCriterion,
  TaskVerificationResult,
  VerifierResult,
  AcceptanceCriterionInput
} from '../../shared/types'

export { runVerifier } from './verifiers'

/**
 * Verify all criteria for a task
 */
export async function verifyTask(
  taskId: string,
  worktreePath?: string
): Promise<TaskVerificationResult> {
  const criteria = databaseService.getCriteriaForTask(taskId)

  if (criteria.length === 0) {
    return {
      task_id: taskId,
      all_passed: true, // No criteria means auto-pass
      auto_criteria_passed: true,
      manual_pending: 0,
      results: [],
      checked_at: new Date().toISOString()
    }
  }

  // Get task to determine working directory
  const task = databaseService.getTask(taskId)
  const cwd = worktreePath ?? task?.worktree_path ?? process.cwd()

  const results: VerifierResult[] = []
  let manualPending = 0
  let autoPassed = true

  for (const criterion of criteria) {
    const result = await runVerifier(criterion, cwd)
    results.push(result)

    // Update criterion status in database
    const status = criterion.verifier === 'manual'
      ? 'pending'
      : result.passed ? 'pass' : 'fail'
    databaseService.updateCriterionStatus(criterion.id, status, result.output)

    if (criterion.verifier === 'manual') {
      // Check if manual criterion was already marked as pass
      const currentCriterion = databaseService.getCriterion(criterion.id)
      if (currentCriterion?.status !== 'pass') {
        manualPending++
      }
    } else if (!result.passed) {
      autoPassed = false
    }
  }

  // Check if all manual criteria have been verified
  const updatedCriteria = databaseService.getCriteriaForTask(taskId)
  const manualCriteria = updatedCriteria.filter(c => c.verifier === 'manual')
  const manualPassed = manualCriteria.every(c => c.status === 'pass')

  const allPassed = autoPassed && manualPassed

  return {
    task_id: taskId,
    all_passed: allPassed,
    auto_criteria_passed: autoPassed,
    manual_pending: manualPending,
    results,
    checked_at: new Date().toISOString()
  }
}

/**
 * Mark a manual criterion as verified (pass or fail)
 */
export function verifyManualCriterion(
  criterionId: string,
  passed: boolean,
  notes?: string
): void {
  const criterion = databaseService.getCriterion(criterionId)
  if (!criterion) {
    throw new Error(`Criterion not found: ${criterionId}`)
  }

  if (criterion.verifier !== 'manual') {
    throw new Error(`Criterion ${criterionId} is not a manual verifier`)
  }

  const status = passed ? 'pass' : 'fail'
  const output = notes ?? (passed ? 'Manually verified as passed' : 'Manually verified as failed')
  databaseService.updateCriterionStatus(criterionId, status, output)
}

/**
 * Add acceptance criteria to a task
 */
export function addCriterion(
  taskId: string,
  input: AcceptanceCriterionInput
): AcceptanceCriterion {
  return databaseService.createCriterion(taskId, input)
}

/**
 * Add multiple acceptance criteria to a task
 */
export function addCriteria(
  taskId: string,
  inputs: AcceptanceCriterionInput[]
): AcceptanceCriterion[] {
  return inputs.map(input => databaseService.createCriterion(taskId, input))
}

/**
 * Get verification summary for a task
 */
export function getVerificationSummary(taskId: string): {
  hasCriteria: boolean
  counts: { pending: number; pass: number; fail: number; total: number }
  allPassed: boolean
  autoPassed: boolean
  manualPending: number
} {
  const criteria = databaseService.getCriteriaForTask(taskId)
  const counts = databaseService.getCriteriaCounts(taskId)

  if (criteria.length === 0) {
    return {
      hasCriteria: false,
      counts: { pending: 0, pass: 0, fail: 0, total: 0 },
      allPassed: true,
      autoPassed: true,
      manualPending: 0
    }
  }

  const manualCriteria = criteria.filter(c => c.verifier === 'manual')
  const autoCriteria = criteria.filter(c => c.verifier !== 'manual')

  const autoPassed = autoCriteria.every(c => c.status === 'pass')
  const manualPending = manualCriteria.filter(c => c.status === 'pending').length
  const allPassed = counts.fail === 0 && counts.pending === 0

  return {
    hasCriteria: true,
    counts,
    allPassed,
    autoPassed,
    manualPending
  }
}

/**
 * Built-in verification templates for common project types
 */
export const BUILTIN_TEMPLATES = {
  'typescript-project': [
    {
      description: 'TypeScript compiles',
      verifier: 'command' as const,
      command: 'npm run typecheck',
      expected_exit_code: 0
    },
    {
      description: 'Build succeeds',
      verifier: 'command' as const,
      command: 'npm run build',
      expected_exit_code: 0
    },
    {
      description: 'Tests pass',
      verifier: 'test_pass' as const,
      test_command: 'npm test'
    },
    {
      description: 'No linting errors',
      verifier: 'command' as const,
      command: 'npm run lint',
      expected_exit_code: 0
    }
  ],
  'python-project': [
    {
      description: 'Python types check',
      verifier: 'command' as const,
      command: 'mypy .',
      expected_exit_code: 0
    },
    {
      description: 'Tests pass',
      verifier: 'test_pass' as const,
      test_command: 'pytest'
    },
    {
      description: 'Linting passes',
      verifier: 'command' as const,
      command: 'ruff check .',
      expected_exit_code: 0
    }
  ],
  'basic': [
    {
      description: 'Build succeeds',
      verifier: 'command' as const,
      command: 'npm run build',
      expected_exit_code: 0
    },
    {
      description: 'Tests pass',
      verifier: 'test_pass' as const,
      test_command: 'npm test'
    }
  ]
}

/**
 * Initialize built-in templates in database if not present
 */
export function initializeBuiltinTemplates(): void {
  for (const [name, criteria] of Object.entries(BUILTIN_TEMPLATES)) {
    const existing = databaseService.getTemplateByName(name)
    if (!existing) {
      databaseService.createTemplate(name, criteria)
    }
  }
}
