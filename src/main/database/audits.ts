import type {
  AuditResult,
  AuditType,
  AuditStatus,
  CodeHealthCheck,
  PlanHealthCheck,
  AuditIssue
} from '../../shared/types'
import type Database from 'better-sqlite3'

interface AuditResultRow {
  id: string
  project_id: string
  cycle_id: string | null
  audit_type: AuditType
  status: AuditStatus
  code_health: string | null
  plan_health: string | null
  issues: string
  failed_checks: string
  created_at: string
}

/**
 * Audit database operations (PRD Section 5)
 * Stores audit results from code and plan health checks
 */
export class AuditOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  /**
   * Parse a database row into an AuditResult object
   */
  private parseRow(row: AuditResultRow): AuditResult {
    return {
      id: row.id,
      project_id: row.project_id,
      cycle_id: row.cycle_id,
      audit_type: row.audit_type,
      status: row.status,
      code_health: row.code_health ? JSON.parse(row.code_health) : null,
      plan_health: row.plan_health ? JSON.parse(row.plan_health) : null,
      issues: JSON.parse(row.issues),
      failed_checks: JSON.parse(row.failed_checks),
      created_at: row.created_at
    }
  }

  /**
   * Get all audit results for a project
   */
  getAuditResultsForProject(projectId: string, limit?: number): AuditResult[] {
    const sql = limit
      ? 'SELECT * FROM audit_results WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM audit_results WHERE project_id = ? ORDER BY created_at DESC'
    const params = limit ? [projectId, limit] : [projectId]
    const rows = this.getDb().prepare(sql).all(...params) as AuditResultRow[]
    return rows.map(row => this.parseRow(row))
  }

  /**
   * Get audit results for a specific cycle
   */
  getAuditResultsForCycle(cycleId: string): AuditResult[] {
    const rows = this.getDb().prepare(
      'SELECT * FROM audit_results WHERE cycle_id = ? ORDER BY created_at DESC'
    ).all(cycleId) as AuditResultRow[]
    return rows.map(row => this.parseRow(row))
  }

  /**
   * Get a single audit result by ID
   */
  getAuditResult(id: string): AuditResult | undefined {
    const row = this.getDb().prepare(
      'SELECT * FROM audit_results WHERE id = ?'
    ).get(id) as AuditResultRow | undefined
    return row ? this.parseRow(row) : undefined
  }

  /**
   * Get the latest audit result for a project
   */
  getLatestAuditResult(projectId: string): AuditResult | undefined {
    const row = this.getDb().prepare(
      'SELECT * FROM audit_results WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId) as AuditResultRow | undefined
    return row ? this.parseRow(row) : undefined
  }

  /**
   * Create a new audit result
   */
  createAuditResult(
    projectId: string,
    auditType: AuditType,
    status: AuditStatus,
    codeHealth: CodeHealthCheck | null,
    planHealth: PlanHealthCheck | null,
    issues: AuditIssue[],
    failedChecks: string[],
    cycleId?: string
  ): AuditResult {
    const id = this.generateId()
    this.getDb().prepare(
      `INSERT INTO audit_results (id, project_id, cycle_id, audit_type, status, code_health, plan_health, issues, failed_checks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      projectId,
      cycleId || null,
      auditType,
      status,
      codeHealth ? JSON.stringify(codeHealth) : null,
      planHealth ? JSON.stringify(planHealth) : null,
      JSON.stringify(issues),
      JSON.stringify(failedChecks)
    )

    this.logAuditEvent(null, 'audit_completed', JSON.stringify({
      auditId: id,
      projectId,
      cycleId,
      auditType,
      status,
      issueCount: issues.length,
      failedCheckCount: failedChecks.length
    }))

    return this.getAuditResult(id)!
  }

  /**
   * Check if an audit is due based on cycle frequency
   * Returns true if no audits exist or last audit was more than N cycles ago
   */
  shouldRunAudit(projectId: string, currentCycleNumber: number, cycleFrequency: number): boolean {
    if (cycleFrequency <= 0) return false

    const latestAudit = this.getLatestAuditResult(projectId)
    if (!latestAudit) return true

    // Get the cycle number of the last audit
    if (!latestAudit.cycle_id) return true

    const lastAuditCycle = this.getDb().prepare(
      'SELECT cycle_number FROM cycles WHERE id = ?'
    ).get(latestAudit.cycle_id) as { cycle_number: number } | undefined

    if (!lastAuditCycle) return true

    return (currentCycleNumber - lastAuditCycle.cycle_number) >= cycleFrequency
  }

  /**
   * Get audit statistics for a project
   */
  getAuditStats(projectId: string): { total: number; passed: number; failed: number; warning: number } {
    const rows = this.getDb().prepare(
      'SELECT status, COUNT(*) as count FROM audit_results WHERE project_id = ? GROUP BY status'
    ).all(projectId) as Array<{ status: AuditStatus; count: number }>

    const stats = { total: 0, passed: 0, failed: 0, warning: 0 }
    for (const row of rows) {
      stats[row.status] = row.count
      stats.total += row.count
    }
    return stats
  }

  /**
   * Delete all audit results for a project
   */
  deleteAuditResultsForProject(projectId: string): void {
    this.logAuditEvent(null, 'audits_cleared', JSON.stringify({ projectId }))
    this.getDb().prepare('DELETE FROM audit_results WHERE project_id = ?').run(projectId)
  }
}
