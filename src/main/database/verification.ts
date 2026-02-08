/**
 * Verification Operations (PRD Section 16)
 * Handles acceptance criteria, iterations, and verification templates
 */

import type Database from 'better-sqlite3'
import type {
  AcceptanceCriterion,
  CriterionStatus,
  VerifierType,
  TaskIteration,
  VerificationTemplate,
  TaskVerificationResult,
  AcceptanceCriterionInput
} from '../../shared/types'

// Database row types (snake_case)
interface AcceptanceCriterionRow {
  id: string
  task_id: string
  description: string
  verifier: string
  command: string | null
  expected_exit_code: number | null
  expected_output: string | null
  file_path: string | null
  grep_file: string | null
  grep_pattern: string | null
  should_match: number | null
  test_command: string | null
  test_pattern: string | null
  checklist_item: string | null
  status: string
  last_check_output: string | null
  last_check_time: string | null
  created_at: string
}

interface TaskIterationRow {
  id: string
  task_id: string
  iteration_number: number
  status: string
  duration_ms: number
  files_changed: string | null
  verification_result: string | null
  created_at: string
  completed_at: string | null
}

interface VerificationTemplateRow {
  id: string
  name: string
  criteria: string
  created_at: string
}

function rowToCriterion(row: AcceptanceCriterionRow): AcceptanceCriterion {
  return {
    id: row.id,
    task_id: row.task_id,
    description: row.description,
    verifier: row.verifier as VerifierType,
    command: row.command ?? undefined,
    expected_exit_code: row.expected_exit_code ?? undefined,
    expected_output: row.expected_output ?? undefined,
    file_path: row.file_path ?? undefined,
    grep_file: row.grep_file ?? undefined,
    grep_pattern: row.grep_pattern ?? undefined,
    should_match: row.should_match !== null ? row.should_match === 1 : undefined,
    test_command: row.test_command ?? undefined,
    test_pattern: row.test_pattern ?? undefined,
    checklist_item: row.checklist_item ?? undefined,
    status: row.status as CriterionStatus,
    last_check_output: row.last_check_output ?? undefined,
    last_check_time: row.last_check_time ?? undefined,
    created_at: row.created_at
  }
}

function rowToIteration(row: TaskIterationRow): TaskIteration {
  return {
    id: row.id,
    task_id: row.task_id,
    iteration_number: row.iteration_number,
    status: row.status as TaskIteration['status'],
    duration_ms: row.duration_ms,
    files_changed: row.files_changed ? JSON.parse(row.files_changed) : [],
    verification_result: row.verification_result ? JSON.parse(row.verification_result) : undefined,
    created_at: row.created_at,
    completed_at: row.completed_at ?? undefined
  }
}

function rowToTemplate(row: VerificationTemplateRow): VerificationTemplate {
  return {
    id: row.id,
    name: row.name,
    criteria: JSON.parse(row.criteria)
  }
}

export class VerificationOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  // =====================
  // Acceptance Criteria
  // =====================

  /**
   * Get all criteria for a task
   */
  getCriteriaForTask(taskId: string): AcceptanceCriterion[] {
    const stmt = this.getDb().prepare(
      'SELECT * FROM acceptance_criteria WHERE task_id = ? ORDER BY created_at ASC'
    )
    const rows = stmt.all(taskId) as AcceptanceCriterionRow[]
    return rows.map(rowToCriterion)
  }

  /**
   * Get a single criterion by ID
   */
  getCriterion(id: string): AcceptanceCriterion | null {
    const stmt = this.getDb().prepare('SELECT * FROM acceptance_criteria WHERE id = ?')
    const row = stmt.get(id) as AcceptanceCriterionRow | undefined
    return row ? rowToCriterion(row) : null
  }

  /**
   * Create a new acceptance criterion
   */
  createCriterion(taskId: string, input: AcceptanceCriterionInput): AcceptanceCriterion {
    const id = this.generateId()
    const stmt = this.getDb().prepare(`
      INSERT INTO acceptance_criteria (
        id, task_id, description, verifier,
        command, expected_exit_code, expected_output,
        file_path, grep_file, grep_pattern, should_match,
        test_command, test_pattern, checklist_item
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      taskId,
      input.description,
      input.verifier,
      input.command ?? null,
      input.expected_exit_code ?? 0,
      input.expected_output ?? null,
      input.file_path ?? null,
      input.grep_file ?? null,
      input.grep_pattern ?? null,
      input.should_match !== undefined ? (input.should_match ? 1 : 0) : null,
      input.test_command ?? null,
      input.test_pattern ?? null,
      input.checklist_item ?? null
    )

    this.logAuditEvent(taskId, 'criterion_created', `Created criterion: ${input.description}`)
    return this.getCriterion(id)!
  }

  /**
   * Update criterion status after verification
   */
  updateCriterionStatus(
    id: string,
    status: CriterionStatus,
    output?: string
  ): void {
    const stmt = this.getDb().prepare(`
      UPDATE acceptance_criteria
      SET status = ?, last_check_output = ?, last_check_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(status, output ?? null, id)
  }

  /**
   * Delete a criterion
   */
  deleteCriterion(id: string): void {
    const criterion = this.getCriterion(id)
    if (criterion) {
      const stmt = this.getDb().prepare('DELETE FROM acceptance_criteria WHERE id = ?')
      stmt.run(id)
      this.logAuditEvent(criterion.task_id, 'criterion_deleted', `Deleted criterion: ${criterion.description}`)
    }
  }

  /**
   * Delete all criteria for a task
   */
  deleteCriteriaForTask(taskId: string): void {
    const stmt = this.getDb().prepare('DELETE FROM acceptance_criteria WHERE task_id = ?')
    stmt.run(taskId)
    this.logAuditEvent(taskId, 'criteria_cleared', 'All acceptance criteria deleted')
  }

  /**
   * Get counts by status for a task
   */
  getCriteriaCounts(taskId: string): { pending: number; pass: number; fail: number; total: number } {
    const stmt = this.getDb().prepare(`
      SELECT status, COUNT(*) as count
      FROM acceptance_criteria
      WHERE task_id = ?
      GROUP BY status
    `)
    const rows = stmt.all(taskId) as Array<{ status: string; count: number }>

    const counts = { pending: 0, pass: 0, fail: 0, total: 0 }
    for (const row of rows) {
      if (row.status === 'pending') counts.pending = row.count
      else if (row.status === 'pass') counts.pass = row.count
      else if (row.status === 'fail') counts.fail = row.count
      counts.total += row.count
    }
    return counts
  }

  // =====================
  // Task Iterations
  // =====================

  /**
   * Get all iterations for a task
   */
  getIterationsForTask(taskId: string): TaskIteration[] {
    const stmt = this.getDb().prepare(
      'SELECT * FROM task_iterations WHERE task_id = ? ORDER BY iteration_number ASC'
    )
    const rows = stmt.all(taskId) as TaskIterationRow[]
    return rows.map(rowToIteration)
  }

  /**
   * Get a single iteration by ID
   */
  getIteration(id: string): TaskIteration | null {
    const stmt = this.getDb().prepare('SELECT * FROM task_iterations WHERE id = ?')
    const row = stmt.get(id) as TaskIterationRow | undefined
    return row ? rowToIteration(row) : null
  }

  /**
   * Get the current iteration number for a task
   */
  getCurrentIterationNumber(taskId: string): number {
    const stmt = this.getDb().prepare(
      'SELECT MAX(iteration_number) as max FROM task_iterations WHERE task_id = ?'
    )
    const result = stmt.get(taskId) as { max: number | null }
    return result.max ?? 0
  }

  /**
   * Create a new iteration
   */
  createIteration(taskId: string): TaskIteration {
    const id = this.generateId()
    const iterationNumber = this.getCurrentIterationNumber(taskId) + 1

    const stmt = this.getDb().prepare(`
      INSERT INTO task_iterations (id, task_id, iteration_number, status)
      VALUES (?, ?, ?, 'running')
    `)
    stmt.run(id, taskId, iterationNumber)

    this.logAuditEvent(taskId, 'iteration_started', `Started iteration ${iterationNumber}`)
    return this.getIteration(id)!
  }

  /**
   * Complete an iteration with results
   */
  completeIteration(
    id: string,
    status: 'completed' | 'failed',
    durationMs: number,
    filesChanged?: Array<{ file_path: string; lines_added: number; lines_removed: number }>,
    verificationResult?: TaskVerificationResult
  ): void {
    const stmt = this.getDb().prepare(`
      UPDATE task_iterations
      SET status = ?, duration_ms = ?, files_changed = ?, verification_result = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(
      status,
      durationMs,
      filesChanged ? JSON.stringify(filesChanged) : null,
      verificationResult ? JSON.stringify(verificationResult) : null,
      id
    )

    const iteration = this.getIteration(id)
    if (iteration) {
      this.logAuditEvent(
        iteration.task_id,
        'iteration_completed',
        `Iteration ${iteration.iteration_number} ${status} in ${durationMs}ms`
      )
    }
  }

  /**
   * Get iteration stats for a task
   */
  getIterationStats(taskId: string): {
    totalIterations: number
    completedIterations: number
    failedIterations: number
    averageDurationMs: number
  } {
    const stmt = this.getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration
      FROM task_iterations
      WHERE task_id = ?
    `)
    const result = stmt.get(taskId) as {
      total: number
      completed: number
      failed: number
      avg_duration: number | null
    }
    return {
      totalIterations: result.total,
      completedIterations: result.completed,
      failedIterations: result.failed,
      averageDurationMs: result.avg_duration ?? 0
    }
  }

  // =====================
  // Verification Templates
  // =====================

  /**
   * Get all verification templates
   */
  getAllTemplates(): VerificationTemplate[] {
    const stmt = this.getDb().prepare('SELECT * FROM verification_templates ORDER BY name ASC')
    const rows = stmt.all() as VerificationTemplateRow[]
    return rows.map(rowToTemplate)
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): VerificationTemplate | null {
    const stmt = this.getDb().prepare('SELECT * FROM verification_templates WHERE id = ?')
    const row = stmt.get(id) as VerificationTemplateRow | undefined
    return row ? rowToTemplate(row) : null
  }

  /**
   * Get a template by name
   */
  getTemplateByName(name: string): VerificationTemplate | null {
    const stmt = this.getDb().prepare('SELECT * FROM verification_templates WHERE name = ?')
    const row = stmt.get(name) as VerificationTemplateRow | undefined
    return row ? rowToTemplate(row) : null
  }

  /**
   * Create a new template
   */
  createTemplate(name: string, criteria: AcceptanceCriterionInput[]): VerificationTemplate {
    const id = this.generateId()
    const stmt = this.getDb().prepare(`
      INSERT INTO verification_templates (id, name, criteria)
      VALUES (?, ?, ?)
    `)
    stmt.run(id, name, JSON.stringify(criteria))
    return this.getTemplate(id)!
  }

  /**
   * Delete a template
   */
  deleteTemplate(id: string): void {
    const stmt = this.getDb().prepare('DELETE FROM verification_templates WHERE id = ?')
    stmt.run(id)
  }

  /**
   * Apply a template to a task (creates criteria from template)
   */
  applyTemplateToTask(taskId: string, templateId: string): AcceptanceCriterion[] {
    const template = this.getTemplate(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const criteria: AcceptanceCriterion[] = []
    for (const criterion of template.criteria) {
      criteria.push(this.createCriterion(taskId, criterion))
    }

    this.logAuditEvent(taskId, 'template_applied', `Applied template: ${template.name}`)
    return criteria
  }

  // =====================
  // Iteration Analytics (PRD Section 16)
  // =====================

  /**
   * Get average iterations to success for a project
   */
  getAverageIterationsToSuccess(projectId: string): number {
    const stmt = this.getDb().prepare(`
      SELECT AVG(iteration_count) as avg_iterations
      FROM (
        SELECT t.id, MAX(ti.iteration_number) as iteration_count
        FROM tasks t
        JOIN task_iterations ti ON ti.task_id = t.id
        WHERE t.project_id = ?
          AND t.status = 'done'
          AND ti.status = 'completed'
        GROUP BY t.id
      )
    `)
    const result = stmt.get(projectId) as { avg_iterations: number | null }
    return result.avg_iterations ?? 0
  }

  /**
   * Get common failure patterns across a project's iterations
   */
  getCommonFailurePatterns(projectId: string): Array<{
    pattern: string
    frequency: number
    suggested_fix: string
  }> {
    // Query failed iterations and group by output patterns
    const stmt = this.getDb().prepare(`
      SELECT
        ac.description,
        ac.verifier,
        COUNT(*) as failure_count,
        ac.last_check_output
      FROM acceptance_criteria ac
      JOIN tasks t ON t.id = ac.task_id
      WHERE t.project_id = ?
        AND ac.status = 'fail'
      GROUP BY ac.description, ac.verifier
      ORDER BY failure_count DESC
      LIMIT 10
    `)
    const rows = stmt.all(projectId) as Array<{
      description: string
      verifier: string
      failure_count: number
      last_check_output: string | null
    }>

    // Map common verifier failures to suggested fixes
    const suggestedFixes: Record<string, string> = {
      'command': 'Check command output for specific error messages',
      'test_pass': 'Review failing tests and add test run before refactoring',
      'file_exists': 'Ensure file path is correct and file is created',
      'grep': 'Verify pattern matches expected content format',
      'manual': 'Clarify manual verification requirements'
    }

    return rows.map(row => ({
      pattern: `${row.description} (${row.verifier})`,
      frequency: row.failure_count,
      suggested_fix: suggestedFixes[row.verifier] ?? 'Review criterion requirements'
    }))
  }

  /**
   * Get suggested acceptance criteria based on task description
   * Uses pattern matching against successful past tasks
   */
  getSuggestedCriteria(taskDescription: string, projectId?: string): AcceptanceCriterionInput[] {
    const suggestions: AcceptanceCriterionInput[] = []
    const lowerDesc = taskDescription.toLowerCase()

    // Pattern-based suggestions
    if (lowerDesc.includes('test') || lowerDesc.includes('spec')) {
      suggestions.push({
        description: 'All tests pass',
        verifier: 'test_pass',
        test_command: 'npm test'
      })
    }

    if (lowerDesc.includes('api') || lowerDesc.includes('endpoint')) {
      suggestions.push({
        description: 'API endpoint responds correctly',
        verifier: 'command',
        command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health',
        expected_output: '200'
      })
    }

    if (lowerDesc.includes('typescript') || lowerDesc.includes('type')) {
      suggestions.push({
        description: 'TypeScript compiles without errors',
        verifier: 'command',
        command: 'npm run typecheck',
        expected_exit_code: 0
      })
    }

    if (lowerDesc.includes('lint') || lowerDesc.includes('format')) {
      suggestions.push({
        description: 'No linting errors',
        verifier: 'command',
        command: 'npm run lint',
        expected_exit_code: 0
      })
    }

    if (lowerDesc.includes('build') || lowerDesc.includes('compile')) {
      suggestions.push({
        description: 'Build succeeds',
        verifier: 'command',
        command: 'npm run build',
        expected_exit_code: 0
      })
    }

    if (lowerDesc.includes('component') || lowerDesc.includes('ui')) {
      suggestions.push({
        description: 'Component renders without errors',
        verifier: 'test_pass',
        test_command: 'npm test -- --testPathPattern=component'
      })
    }

    if (lowerDesc.includes('fix') || lowerDesc.includes('bug')) {
      suggestions.push({
        description: 'Bug reproduction test passes',
        verifier: 'test_pass',
        test_command: 'npm test'
      })
    }

    // If we have a project, look at commonly used criteria
    if (projectId) {
      const stmt = this.getDb().prepare(`
        SELECT ac.description, ac.verifier, ac.command, ac.test_command,
               ac.expected_exit_code, COUNT(*) as usage_count
        FROM acceptance_criteria ac
        JOIN tasks t ON t.id = ac.task_id
        WHERE t.project_id = ?
          AND ac.status = 'pass'
        GROUP BY ac.description, ac.verifier
        ORDER BY usage_count DESC
        LIMIT 3
      `)
      const rows = stmt.all(projectId) as Array<{
        description: string
        verifier: string
        command: string | null
        test_command: string | null
        expected_exit_code: number | null
        usage_count: number
      }>

      for (const row of rows) {
        // Avoid duplicates
        if (!suggestions.some(s => s.description === row.description)) {
          suggestions.push({
            description: row.description,
            verifier: row.verifier as AcceptanceCriterionInput['verifier'],
            command: row.command ?? undefined,
            test_command: row.test_command ?? undefined,
            expected_exit_code: row.expected_exit_code ?? undefined
          })
        }
      }
    }

    return suggestions
  }

  /**
   * Record a successful pattern for learning
   */
  recordSuccessfulPattern(taskId: string, pattern: string): void {
    const task = this.getDb().prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId) as { project_id: string } | undefined
    if (!task) return

    this.logAuditEvent(
      taskId,
      'success_pattern_recorded',
      JSON.stringify({ pattern, project_id: task.project_id })
    )
  }

  /**
   * Get full iteration analytics for a task
   */
  getIterationAnalytics(taskId: string): {
    task_id: string
    total_iterations: number
    average_iteration_duration_ms: number
    success_rate: number
    common_failure_patterns: Array<{ pattern: string; frequency: number; suggested_fix: string }>
  } {
    const stats = this.getIterationStats(taskId)
    const task = this.getDb().prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId) as { project_id: string } | undefined

    return {
      task_id: taskId,
      total_iterations: stats.totalIterations,
      average_iteration_duration_ms: stats.averageDurationMs,
      success_rate: stats.totalIterations > 0
        ? stats.completedIterations / stats.totalIterations
        : 0,
      common_failure_patterns: task
        ? this.getCommonFailurePatterns(task.project_id)
        : []
    }
  }
}
