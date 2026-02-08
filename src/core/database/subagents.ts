/**
 * NERV Core Database - Subagent tracking operations
 */

import type { Subagent, SubagentStatus } from '../../shared/types.js'
import type Database from 'better-sqlite3'

type SubagentRow = {
  id: string
  parent_session_id: string
  task_id: string
  agent_type: string
  status: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  started_at: string
  completed_at: string | null
}

export class SubagentOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  private toSubagent(row: SubagentRow): Subagent {
    return {
      id: row.id,
      parentSessionId: row.parent_session_id,
      taskId: row.task_id,
      agentType: row.agent_type,
      status: row.status as SubagentStatus,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd,
      startedAt: row.started_at,
      completedAt: row.completed_at
    }
  }

  getSubagentsForTask(taskId: string): Subagent[] {
    const rows = this.getDb().prepare('SELECT * FROM subagents WHERE task_id = ? ORDER BY started_at DESC').all(taskId) as SubagentRow[]
    return rows.map((row) => this.toSubagent(row))
  }

  getActiveSubagents(taskId?: string): Subagent[] {
    if (taskId) {
      const rows = this.getDb().prepare("SELECT * FROM subagents WHERE task_id = ? AND status = 'running' ORDER BY started_at DESC").all(taskId) as SubagentRow[]
      return rows.map((row) => this.toSubagent(row))
    }
    const rows = this.getDb().prepare("SELECT * FROM subagents WHERE status = 'running' ORDER BY started_at DESC").all() as SubagentRow[]
    return rows.map((row) => this.toSubagent(row))
  }

  createSubagent(parentSessionId: string, taskId: string, agentType: string): Subagent {
    const id = this.generateId()
    this.getDb().prepare(`
      INSERT INTO subagents (id, parent_session_id, task_id, agent_type)
      VALUES (?, ?, ?, ?)
    `).run(id, parentSessionId, taskId, agentType)

    this.logAuditEvent(taskId, 'subagent_spawned', JSON.stringify({ id, parentSessionId, agentType }))
    const row = this.getDb().prepare('SELECT * FROM subagents WHERE id = ?').get(id) as SubagentRow
    return this.toSubagent(row)
  }

  completeSubagent(id: string, status: SubagentStatus, metrics?: { inputTokens: number; outputTokens: number; costUsd: number }): Subagent | undefined {
    const completedAt = new Date().toISOString()

    if (metrics) {
      this.getDb().prepare(`
        UPDATE subagents
        SET status = ?, completed_at = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?
        WHERE id = ?
      `).run(status, completedAt, metrics.inputTokens, metrics.outputTokens, metrics.costUsd, id)
    } else {
      this.getDb().prepare(`
        UPDATE subagents SET status = ?, completed_at = ? WHERE id = ?
      `).run(status, completedAt, id)
    }

    const row = this.getDb().prepare('SELECT * FROM subagents WHERE id = ?').get(id) as SubagentRow | undefined
    if (!row) return undefined
    const subagent = this.toSubagent(row)
    this.logAuditEvent(subagent.taskId, 'subagent_completed', JSON.stringify({ id, status }))
    return subagent
  }
}
