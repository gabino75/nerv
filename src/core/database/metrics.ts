/**
 * NERV Core Database - Session metrics and audit log operations
 */

import type { SessionMetrics, AuditLogEntry } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class MetricsOperations {
  constructor(private getDb: () => Database.Database) {}

  getSessionMetrics(taskId: string): SessionMetrics | undefined {
    return this.getDb().prepare(
      'SELECT * FROM session_metrics WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(taskId) as SessionMetrics | undefined
  }

  getAllSessionMetrics(): SessionMetrics[] {
    return this.getDb().prepare('SELECT * FROM session_metrics ORDER BY updated_at DESC').all() as SessionMetrics[]
  }

  updateSessionMetrics(
    taskId: string,
    metrics: {
      inputTokens?: number
      outputTokens?: number
      compactionCount?: number
      model?: string
      sessionId?: string
      costUsd?: number
      durationMs?: number
      numTurns?: number
    }
  ): SessionMetrics {
    const existing = this.getSessionMetrics(taskId)
    const updatedAt = new Date().toISOString()

    if (existing) {
      const { sets, values } = this.buildMetricsUpdate(metrics, updatedAt)
      values.push(existing.id)
      this.getDb().prepare(`UPDATE session_metrics SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      return this.getDb().prepare('SELECT * FROM session_metrics WHERE id = ?').get(existing.id) as SessionMetrics
    }

    const result = this.getDb().prepare(
      'INSERT INTO session_metrics (task_id, session_id, input_tokens, output_tokens, compaction_count, model, cost_usd, duration_ms, num_turns) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      taskId,
      metrics.sessionId || null,
      metrics.inputTokens || 0,
      metrics.outputTokens || 0,
      metrics.compactionCount || 0,
      metrics.model || null,
      metrics.costUsd || 0,
      metrics.durationMs || 0,
      metrics.numTurns || 0
    )
    return this.getDb().prepare('SELECT * FROM session_metrics WHERE id = ?').get(result.lastInsertRowid) as SessionMetrics
  }

  private buildMetricsUpdate(
    metrics: Record<string, number | string | undefined>,
    updatedAt: string
  ): { sets: string[]; values: (string | number | null)[] } {
    const fieldMap: Record<string, string> = {
      inputTokens: 'input_tokens',
      outputTokens: 'output_tokens',
      compactionCount: 'compaction_count',
      model: 'model',
      sessionId: 'session_id',
      costUsd: 'cost_usd',
      durationMs: 'duration_ms',
      numTurns: 'num_turns'
    }

    const sets: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [updatedAt]

    for (const [key, column] of Object.entries(fieldMap)) {
      if (metrics[key] !== undefined) {
        sets.push(`${column} = ?`)
        values.push(metrics[key] as string | number)
      }
    }

    return { sets, values }
  }

  logAuditEvent(taskId: string | null, eventType: string, details: string | null): void {
    this.getDb().prepare(
      'INSERT INTO audit_log (task_id, event_type, details) VALUES (?, ?, ?)'
    ).run(taskId, eventType, details)
  }

  getAuditLog(taskId?: string, limit: number = 100): AuditLogEntry[] {
    if (taskId) {
      return this.getDb().prepare(
        'SELECT * FROM audit_log WHERE task_id = ? ORDER BY timestamp DESC LIMIT ?'
      ).all(taskId, limit) as AuditLogEntry[]
    }
    return this.getDb().prepare(
      'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as AuditLogEntry[]
  }
}
