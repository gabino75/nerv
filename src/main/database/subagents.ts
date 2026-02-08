import type { Subagent, SubagentStatus } from '../../shared/types'
import type Database from 'better-sqlite3'

// Database row type (snake_case from SQLite)
interface SubagentRow {
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

/**
 * Subagent database operations
 */
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

  getSubagent(id: string): Subagent | undefined {
    const row = this.getDb().prepare('SELECT * FROM subagents WHERE id = ?').get(id)
    if (!row) return undefined
    return this.toSubagent(row as SubagentRow)
  }

  getSubagentsForSession(parentSessionId: string): Subagent[] {
    const rows = this.getDb().prepare('SELECT * FROM subagents WHERE parent_session_id = ? ORDER BY started_at DESC').all(parentSessionId)
    return rows.map((row) => this.toSubagent(row as SubagentRow))
  }

  getSubagentsForTask(taskId: string): Subagent[] {
    const rows = this.getDb().prepare('SELECT * FROM subagents WHERE task_id = ? ORDER BY started_at DESC').all(taskId)
    return rows.map((row) => this.toSubagent(row as SubagentRow))
  }

  getActiveSubagents(taskId?: string): Subagent[] {
    if (taskId) {
      const rows = this.getDb().prepare("SELECT * FROM subagents WHERE task_id = ? AND status = 'running' ORDER BY started_at DESC").all(taskId)
      return rows.map((row) => this.toSubagent(row as SubagentRow))
    }
    const rows = this.getDb().prepare("SELECT * FROM subagents WHERE status = 'running' ORDER BY started_at DESC").all()
    return rows.map((row) => this.toSubagent(row as SubagentRow))
  }

  createSubagent(parentSessionId: string, taskId: string, agentType: string): Subagent {
    const id = this.generateId()
    this.getDb().prepare(`
      INSERT INTO subagents (id, parent_session_id, task_id, agent_type)
      VALUES (?, ?, ?, ?)
    `).run(id, parentSessionId, taskId, agentType)

    this.logAuditEvent(taskId, 'subagent_spawned', JSON.stringify({ id, parentSessionId, agentType }))
    return this.getSubagent(id)!
  }

  updateSubagentMetrics(
    id: string,
    updates: {
      inputTokens?: number
      outputTokens?: number
      costUsd?: number
    }
  ): Subagent | undefined {
    const sets: string[] = []
    const values: number[] = []

    if (updates.inputTokens !== undefined) {
      sets.push('input_tokens = ?')
      values.push(updates.inputTokens)
    }
    if (updates.outputTokens !== undefined) {
      sets.push('output_tokens = ?')
      values.push(updates.outputTokens)
    }
    if (updates.costUsd !== undefined) {
      sets.push('cost_usd = ?')
      values.push(updates.costUsd)
    }

    if (sets.length > 0) {
      this.getDb().prepare(`UPDATE subagents SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }

    return this.getSubagent(id)
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

    const subagent = this.getSubagent(id)
    if (subagent) {
      this.logAuditEvent(subagent.taskId, 'subagent_completed', JSON.stringify({ id, status }))
    }
    return subagent
  }

  getSubagentUsageForTask(taskId: string): {
    activeCount: number
    totalSpawned: number
    totalCostUsd: number
    totalInputTokens: number
    totalOutputTokens: number
  } {
    const result = this.getDb().prepare(`
      SELECT
        COUNT(*) as total_spawned,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as active_count,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM subagents WHERE task_id = ?
    `).get(taskId) as {
      total_spawned: number
      active_count: number
      total_cost_usd: number
      total_input_tokens: number
      total_output_tokens: number
    }

    return {
      activeCount: result.active_count,
      totalSpawned: result.total_spawned,
      totalCostUsd: result.total_cost_usd,
      totalInputTokens: result.total_input_tokens,
      totalOutputTokens: result.total_output_tokens
    }
  }
}
