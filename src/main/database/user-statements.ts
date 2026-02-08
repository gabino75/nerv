import type { UserStatement, UserStatementSource } from '../../shared/types'
import type Database from 'better-sqlite3'

interface UserStatementRow {
  id: string
  project_id: string
  timestamp: number
  text: string
  source: UserStatementSource
  addressed: number // SQLite stores as 0 or 1
  spec_reference: string | null
  created_at: string
}

/**
 * User statement database operations (PRD Section 2)
 * Tracks user statements for spec drift detection
 */
export class UserStatementOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  /**
   * Parse a database row into a UserStatement object
   */
  private parseRow(row: UserStatementRow): UserStatement {
    return {
      id: row.id,
      project_id: row.project_id,
      timestamp: row.timestamp,
      text: row.text,
      source: row.source,
      addressed: row.addressed === 1,
      spec_reference: row.spec_reference,
      created_at: row.created_at
    }
  }

  /**
   * Get all user statements for a project
   */
  getStatementsForProject(projectId: string): UserStatement[] {
    const rows = this.getDb().prepare(
      'SELECT * FROM user_statements WHERE project_id = ? ORDER BY timestamp DESC'
    ).all(projectId) as UserStatementRow[]
    return rows.map(row => this.parseRow(row))
  }

  /**
   * Get unaddressed user statements for a project (for spec drift detection)
   */
  getUnaddressedStatements(projectId: string): UserStatement[] {
    const rows = this.getDb().prepare(
      'SELECT * FROM user_statements WHERE project_id = ? AND addressed = 0 ORDER BY timestamp DESC'
    ).all(projectId) as UserStatementRow[]
    return rows.map(row => this.parseRow(row))
  }

  /**
   * Get a single user statement by ID
   */
  getStatement(id: string): UserStatement | undefined {
    const row = this.getDb().prepare(
      'SELECT * FROM user_statements WHERE id = ?'
    ).get(id) as UserStatementRow | undefined
    return row ? this.parseRow(row) : undefined
  }

  /**
   * Create a new user statement
   */
  createStatement(
    projectId: string,
    text: string,
    source: UserStatementSource
  ): UserStatement {
    const id = this.generateId()
    const timestamp = Date.now()
    this.getDb().prepare(
      `INSERT INTO user_statements (id, project_id, timestamp, text, source, addressed, spec_reference)
       VALUES (?, ?, ?, ?, ?, 0, NULL)`
    ).run(id, projectId, timestamp, text, source)

    this.logAuditEvent(null, 'user_statement_recorded', JSON.stringify({
      statementId: id,
      projectId,
      source,
      textPreview: text.slice(0, 100)
    }))

    return this.getStatement(id)!
  }

  /**
   * Mark a statement as addressed (linked to spec)
   */
  markAddressed(id: string, specReference: string): void {
    this.getDb().prepare(
      'UPDATE user_statements SET addressed = 1, spec_reference = ? WHERE id = ?'
    ).run(specReference, id)

    this.logAuditEvent(null, 'user_statement_addressed', JSON.stringify({
      statementId: id,
      specReference
    }))
  }

  /**
   * Mark a statement as unaddressed (removed from spec)
   */
  markUnaddressed(id: string): void {
    this.getDb().prepare(
      'UPDATE user_statements SET addressed = 0, spec_reference = NULL WHERE id = ?'
    ).run(id)
  }

  /**
   * Delete a user statement
   */
  deleteStatement(id: string): void {
    this.getDb().prepare('DELETE FROM user_statements WHERE id = ?').run(id)
  }

  /**
   * Delete all user statements for a project
   */
  deleteStatementsForProject(projectId: string): void {
    this.logAuditEvent(null, 'user_statements_cleared', JSON.stringify({ projectId }))
    this.getDb().prepare('DELETE FROM user_statements WHERE project_id = ?').run(projectId)
  }

  /**
   * Get statistics for spec drift detection
   */
  getStatementStats(projectId: string): { total: number; addressed: number; unaddressed: number } {
    const rows = this.getDb().prepare(
      'SELECT addressed, COUNT(*) as count FROM user_statements WHERE project_id = ? GROUP BY addressed'
    ).all(projectId) as Array<{ addressed: number; count: number }>

    const stats = { total: 0, addressed: 0, unaddressed: 0 }
    for (const row of rows) {
      if (row.addressed === 1) {
        stats.addressed = row.count
      } else {
        stats.unaddressed = row.count
      }
      stats.total += row.count
    }
    return stats
  }
}
