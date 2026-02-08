/**
 * Verification Operations (PRD Section 16)
 * Handles acceptance criteria and task verification for the CLI
 */

import type Database from 'better-sqlite3'
import type {
  AcceptanceCriterion,
  CriterionStatus,
  VerifierType,
  AcceptanceCriterionInput
} from '../../shared/types.js'

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
}
