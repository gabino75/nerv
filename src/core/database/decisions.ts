/**
 * NERV Core Database - Decision and branch operations
 */

import type { Decision, Branch } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class DecisionOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  // =====================
  // Decisions
  // =====================

  getDecisionsForProject(projectId: string): Decision[] {
    return this.getDb().prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Decision[]
  }

  createDecision(projectId: string, title: string, rationale?: string, cycleId?: string, alternatives?: string): Decision {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO decisions (id, project_id, cycle_id, title, rationale, alternatives) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, cycleId || null, title, rationale || null, alternatives || null)

    this.logAuditEvent(null, 'decision_created', JSON.stringify({ id, projectId, title }))
    return this.getDb().prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Decision
  }

  // =====================
  // Branches
  // =====================

  getBranchesForTask(taskId: string): Branch[] {
    return this.getDb().prepare('SELECT * FROM branches WHERE parent_task_id = ?').all(taskId) as Branch[]
  }

  createBranch(parentTaskId: string, parentSessionId?: string): Branch {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO branches (id, parent_task_id, parent_session_id) VALUES (?, ?, ?)'
    ).run(id, parentTaskId, parentSessionId || null)
    return this.getDb().prepare('SELECT * FROM branches WHERE id = ?').get(id) as Branch
  }

  updateBranchStatus(id: string, status: Branch['status'], summary?: string): Branch | undefined {
    this.getDb().prepare('UPDATE branches SET status = ?, summary = ? WHERE id = ?').run(status, summary || null, id)
    return this.getDb().prepare('SELECT * FROM branches WHERE id = ?').get(id) as Branch
  }
}
