import type { DebugFinding, DebugFindingType } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Debug findings database operations (PRD Section 3)
 * Stores structured findings from debug tasks with suggested fixes
 */
export class FindingsOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  /**
   * Get all findings for a task
   */
  getFindingsForTask(taskId: string): DebugFinding[] {
    return this.getDb().prepare(
      'SELECT * FROM debug_findings WHERE task_id = ? ORDER BY finding_type, priority ASC'
    ).all(taskId) as DebugFinding[]
  }

  /**
   * Get findings by type for a task
   */
  getFindingsByType(taskId: string, findingType: DebugFindingType): DebugFinding[] {
    return this.getDb().prepare(
      'SELECT * FROM debug_findings WHERE task_id = ? AND finding_type = ? ORDER BY priority ASC'
    ).all(taskId, findingType) as DebugFinding[]
  }

  /**
   * Get a single finding by ID
   */
  getFinding(id: string): DebugFinding | undefined {
    return this.getDb().prepare(
      'SELECT * FROM debug_findings WHERE id = ?'
    ).get(id) as DebugFinding | undefined
  }

  /**
   * Create a new finding
   */
  createFinding(
    taskId: string,
    findingType: DebugFindingType,
    title: string,
    content: string,
    codeSnippet?: string,
    filePath?: string,
    priority?: number
  ): DebugFinding {
    const id = this.generateId()
    this.getDb().prepare(
      `INSERT INTO debug_findings (id, task_id, finding_type, title, content, code_snippet, file_path, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, taskId, findingType, title, content, codeSnippet || null, filePath || null, priority || 0)

    this.logAuditEvent(taskId, 'finding_created', JSON.stringify({ findingId: id, findingType, title }))
    return this.getFinding(id)!
  }

  /**
   * Update an existing finding
   */
  updateFinding(
    id: string,
    updates: Partial<Pick<DebugFinding, 'title' | 'content' | 'code_snippet' | 'file_path' | 'priority'>>
  ): DebugFinding | undefined {
    const finding = this.getFinding(id)
    if (!finding) return undefined

    const newTitle = updates.title ?? finding.title
    const newContent = updates.content ?? finding.content
    const newCodeSnippet = updates.code_snippet ?? finding.code_snippet
    const newFilePath = updates.file_path ?? finding.file_path
    const newPriority = updates.priority ?? finding.priority

    this.getDb().prepare(
      `UPDATE debug_findings SET title = ?, content = ?, code_snippet = ?, file_path = ?, priority = ? WHERE id = ?`
    ).run(newTitle, newContent, newCodeSnippet, newFilePath, newPriority, id)

    this.logAuditEvent(finding.task_id, 'finding_updated', JSON.stringify({ findingId: id }))
    return this.getFinding(id)
  }

  /**
   * Delete a finding
   */
  deleteFinding(id: string): void {
    const finding = this.getFinding(id)
    if (finding) {
      this.logAuditEvent(finding.task_id, 'finding_deleted', JSON.stringify({ findingId: id }))
    }
    this.getDb().prepare('DELETE FROM debug_findings WHERE id = ?').run(id)
  }

  /**
   * Delete all findings for a task
   */
  deleteFindingsForTask(taskId: string): void {
    this.logAuditEvent(taskId, 'findings_cleared', null)
    this.getDb().prepare('DELETE FROM debug_findings WHERE task_id = ?').run(taskId)
  }

  /**
   * Get count of findings by type for a task
   */
  getFindingCounts(taskId: string): Record<DebugFindingType, number> {
    const rows = this.getDb().prepare(
      'SELECT finding_type, COUNT(*) as count FROM debug_findings WHERE task_id = ? GROUP BY finding_type'
    ).all(taskId) as Array<{ finding_type: DebugFindingType; count: number }>

    // PRD Section 3 report format types
    const counts: Record<DebugFindingType, number> = {
      reproduction: 0,
      root_cause: 0,
      evidence: 0,
      affected_component: 0,
      suggested_fix: 0,
      recommended_fix: 0,
      regression_test: 0
    }

    for (const row of rows) {
      counts[row.finding_type] = row.count
    }

    return counts
  }
}
