/**
 * NERV Core Database - Approval operations
 */

import type { Approval } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class ApprovalOperations {
  constructor(
    private getDb: () => Database.Database,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  getPendingApprovals(taskId?: string): Approval[] {
    if (taskId) {
      return this.getDb().prepare(
        "SELECT * FROM approvals WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC"
      ).all(taskId) as Approval[]
    }
    return this.getDb().prepare(
      "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC"
    ).all() as Approval[]
  }

  getAllApprovals(): Approval[] {
    return this.getDb().prepare('SELECT * FROM approvals ORDER BY created_at DESC').all() as Approval[]
  }

  createApproval(taskId: string, toolName: string, toolInput?: string, context?: string): Approval {
    const result = this.getDb().prepare(
      'INSERT INTO approvals (task_id, tool_name, tool_input, context) VALUES (?, ?, ?, ?)'
    ).run(taskId, toolName, toolInput || null, context || null)

    this.logAuditEvent(taskId, 'approval_requested', JSON.stringify({ toolName, toolInput }))
    return this.getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(result.lastInsertRowid) as Approval
  }

  resolveApproval(id: number, status: 'approved' | 'denied', denyReason?: string): Approval | undefined {
    const decidedAt = new Date().toISOString()
    this.getDb().prepare(
      'UPDATE approvals SET status = ?, deny_reason = ?, decided_at = ? WHERE id = ?'
    ).run(status, denyReason || null, decidedAt, id)

    const approval = this.getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval
    if (approval) {
      this.logAuditEvent(approval.task_id, 'approval_resolved', JSON.stringify({ status, denyReason }))
    }
    return approval
  }
}
