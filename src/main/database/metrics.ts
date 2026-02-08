import type { SessionMetrics, AuditLogEntry, BudgetAlert, CostSummary, ModelCost, CostDataPoint } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Session metrics and audit log database operations
 */
export class MetricsOperations {
  constructor(private getDb: () => Database.Database) {}

  // =====================
  // Session Metrics
  // =====================

  getSessionMetrics(taskId: string): SessionMetrics | undefined {
    return this.getDb().prepare(
      'SELECT * FROM session_metrics WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(taskId) as SessionMetrics | undefined
  }

  getModelStats(): Array<{
    model: string
    task_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    total_duration_ms: number
    avg_turns: number
  }> {
    return this.getDb().prepare(`
      SELECT
        model,
        COUNT(*) as task_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost_usd,
        SUM(duration_ms) as total_duration_ms,
        AVG(num_turns) as avg_turns
      FROM session_metrics
      WHERE model IS NOT NULL
      GROUP BY model
      ORDER BY task_count DESC
    `).all() as Array<{
      model: string
      task_count: number
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      total_duration_ms: number
      avg_turns: number
    }>
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
      compactionsSinceClear?: number  // PRD Section 6: "Since last /clear" counter
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
      'INSERT INTO session_metrics (task_id, session_id, input_tokens, output_tokens, compaction_count, compactions_since_clear, model, cost_usd, duration_ms, num_turns) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      taskId,
      metrics.sessionId || null,
      metrics.inputTokens || 0,
      metrics.outputTokens || 0,
      metrics.compactionCount || 0,
      metrics.compactionsSinceClear || 0,
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
      compactionsSinceClear: 'compactions_since_clear',  // PRD Section 6
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

  /**
   * Reset compactions_since_clear counter (PRD Section 6: called after /clear)
   */
  resetCompactionsSinceClear(taskId: string): void {
    this.getDb().prepare(
      'UPDATE session_metrics SET compactions_since_clear = 0, updated_at = ? WHERE task_id = ?'
    ).run(new Date().toISOString(), taskId)
  }

  // =====================
  // Audit Log
  // =====================

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

  // =====================
  // Monthly Cost Tracking
  // =====================

  /**
   * Get total cost for the current month
   */
  getMonthlyTotalCost(): { totalCost: number; taskCount: number; monthStart: string } {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const result = this.getDb().prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(*) as task_count
      FROM session_metrics
      WHERE updated_at >= ?
    `).get(monthStart) as { total_cost: number; task_count: number }

    return {
      totalCost: result.total_cost,
      taskCount: result.task_count,
      monthStart
    }
  }

  /**
   * Get cost breakdown by day for the current month
   */
  getDailyCostBreakdown(): Array<{ date: string; cost: number; taskCount: number }> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    return this.getDb().prepare(`
      SELECT
        date(updated_at) as date,
        COALESCE(SUM(cost_usd), 0) as cost,
        COUNT(*) as taskCount
      FROM session_metrics
      WHERE updated_at >= ?
      GROUP BY date(updated_at)
      ORDER BY date ASC
    `).all(monthStart) as Array<{ date: string; cost: number; taskCount: number }>
  }

  /**
   * Get cost breakdown by project for the current month
   */
  getCostByProject(): Array<{
    projectId: string
    projectName: string
    totalCost: number
    taskCount: number
    inputTokens: number
    outputTokens: number
  }> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    return this.getDb().prepare(`
      SELECT
        p.id as projectId,
        p.name as projectName,
        COALESCE(SUM(sm.cost_usd), 0) as totalCost,
        COUNT(DISTINCT t.id) as taskCount,
        COALESCE(SUM(sm.input_tokens), 0) as inputTokens,
        COALESCE(SUM(sm.output_tokens), 0) as outputTokens
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      LEFT JOIN session_metrics sm ON sm.task_id = t.id AND sm.updated_at >= ?
      GROUP BY p.id, p.name
      HAVING totalCost > 0 OR taskCount > 0
      ORDER BY totalCost DESC
    `).all(monthStart) as Array<{
      projectId: string
      projectName: string
      totalCost: number
      taskCount: number
      inputTokens: number
      outputTokens: number
    }>
  }

  /**
   * Export all cost data to CSV format
   */
  exportCostsCsv(): string {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const rows = this.getDb().prepare(`
      SELECT
        p.name as project_name,
        t.title as task_title,
        sm.model,
        sm.input_tokens,
        sm.output_tokens,
        sm.cost_usd,
        sm.duration_ms,
        sm.num_turns,
        sm.updated_at
      FROM session_metrics sm
      LEFT JOIN tasks t ON sm.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE sm.updated_at >= ?
      ORDER BY sm.updated_at DESC
    `).all(monthStart) as Array<{
      project_name: string | null
      task_title: string | null
      model: string | null
      input_tokens: number
      output_tokens: number
      cost_usd: number
      duration_ms: number
      num_turns: number
      updated_at: string
    }>

    const headers = ['Date', 'Project', 'Task', 'Model', 'Input Tokens', 'Output Tokens', 'Cost (USD)', 'Duration (ms)', 'Turns']
    const csvRows = [headers.join(',')]

    for (const row of rows) {
      const csvRow = [
        row.updated_at,
        `"${(row.project_name || 'Unknown').replace(/"/g, '""')}"`,
        `"${(row.task_title || 'Unknown').replace(/"/g, '""')}"`,
        row.model || 'Unknown',
        row.input_tokens,
        row.output_tokens,
        row.cost_usd.toFixed(4),
        row.duration_ms,
        row.num_turns
      ]
      csvRows.push(csvRow.join(','))
    }

    return csvRows.join('\n')
  }

  /**
   * Get recent tasks with their session metrics (PRD Section 14)
   * Returns recent tasks sorted by completion time for the cost dashboard
   */
  getRecentTasks(limit: number = 10): Array<{
    taskId: string
    taskTitle: string
    status: string
    durationMs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    completedAt: string | null
    updatedAt: string
  }> {
    return this.getDb().prepare(`
      SELECT
        t.id as taskId,
        t.title as taskTitle,
        t.status,
        COALESCE(sm.duration_ms, 0) as durationMs,
        COALESCE(sm.input_tokens, 0) as inputTokens,
        COALESCE(sm.output_tokens, 0) as outputTokens,
        COALESCE(sm.cost_usd, 0) as costUsd,
        t.completed_at as completedAt,
        sm.updated_at as updatedAt
      FROM tasks t
      LEFT JOIN session_metrics sm ON sm.task_id = t.id
      WHERE sm.id IS NOT NULL
      ORDER BY COALESCE(t.completed_at, sm.updated_at) DESC
      LIMIT ?
    `).all(limit) as Array<{
      taskId: string
      taskTitle: string
      status: string
      durationMs: number
      inputTokens: number
      outputTokens: number
      costUsd: number
      completedAt: string | null
      updatedAt: string
    }>
  }

  // =====================
  // PRD Section 14: Cost Tracking Methods
  // =====================

  /**
   * Get cost summary for a specific session (PRD Section 14)
   */
  getSessionCost(sessionId: string): CostSummary {
    const metrics = this.getDb().prepare(`
      SELECT
        model,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM session_metrics
      WHERE session_id = ?
      GROUP BY model
    `).all(sessionId) as Array<{
      model: string | null
      input_tokens: number
      output_tokens: number
      cost_usd: number
    }>

    return this.buildCostSummary(metrics)
  }

  /**
   * Get cost summary for a specific task (PRD Section 14)
   */
  getTaskCost(taskId: string): CostSummary {
    const metrics = this.getDb().prepare(`
      SELECT
        model,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM session_metrics
      WHERE task_id = ?
      GROUP BY model
    `).all(taskId) as Array<{
      model: string | null
      input_tokens: number
      output_tokens: number
      cost_usd: number
    }>

    return this.buildCostSummary(metrics)
  }

  /**
   * Get cost summary for a project within a date range (PRD Section 14)
   */
  getProjectCost(projectId: string, startDate: string, endDate: string): CostSummary {
    const metrics = this.getDb().prepare(`
      SELECT
        sm.model,
        COALESCE(SUM(sm.input_tokens), 0) as input_tokens,
        COALESCE(SUM(sm.output_tokens), 0) as output_tokens,
        COALESCE(SUM(sm.cost_usd), 0) as cost_usd
      FROM session_metrics sm
      INNER JOIN tasks t ON sm.task_id = t.id
      WHERE t.project_id = ?
        AND sm.updated_at >= ?
        AND sm.updated_at <= ?
      GROUP BY sm.model
    `).all(projectId, startDate, endDate) as Array<{
      model: string | null
      input_tokens: number
      output_tokens: number
      cost_usd: number
    }>

    // Get time series data for the date range
    const timeSeries = this.getDb().prepare(`
      SELECT
        date(sm.updated_at) as timestamp,
        COALESCE(SUM(sm.cost_usd), 0) as cost,
        COALESCE(SUM(sm.input_tokens + sm.output_tokens), 0) as tokens
      FROM session_metrics sm
      INNER JOIN tasks t ON sm.task_id = t.id
      WHERE t.project_id = ?
        AND sm.updated_at >= ?
        AND sm.updated_at <= ?
      GROUP BY date(sm.updated_at)
      ORDER BY timestamp ASC
    `).all(projectId, startDate, endDate) as CostDataPoint[]

    const summary = this.buildCostSummary(metrics)
    summary.timeSeries = timeSeries
    return summary
  }

  /**
   * Get global cost summary across all projects for a date range (PRD Section 14)
   */
  getGlobalCost(startDate: string, endDate: string): CostSummary {
    const metrics = this.getDb().prepare(`
      SELECT
        model,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM session_metrics
      WHERE updated_at >= ?
        AND updated_at <= ?
      GROUP BY model
    `).all(startDate, endDate) as Array<{
      model: string | null
      input_tokens: number
      output_tokens: number
      cost_usd: number
    }>

    // Get time series data for the date range
    const timeSeries = this.getDb().prepare(`
      SELECT
        date(updated_at) as timestamp,
        COALESCE(SUM(cost_usd), 0) as cost,
        COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
      FROM session_metrics
      WHERE updated_at >= ?
        AND updated_at <= ?
      GROUP BY date(updated_at)
      ORDER BY timestamp ASC
    `).all(startDate, endDate) as CostDataPoint[]

    const summary = this.buildCostSummary(metrics)
    summary.timeSeries = timeSeries
    return summary
  }

  /**
   * Build a CostSummary from raw metrics data
   */
  private buildCostSummary(metrics: Array<{
    model: string | null
    input_tokens: number
    output_tokens: number
    cost_usd: number
  }>): CostSummary {
    const byModel = new Map<string, ModelCost>()
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCost = 0

    for (const row of metrics) {
      const modelName = row.model || 'unknown'
      totalInputTokens += row.input_tokens
      totalOutputTokens += row.output_tokens
      totalCost += row.cost_usd

      const existing = byModel.get(modelName)
      if (existing) {
        existing.inputTokens += row.input_tokens
        existing.outputTokens += row.output_tokens
        existing.cost += row.cost_usd
        existing.taskCount += 1
      } else {
        byModel.set(modelName, {
          model: modelName,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cacheReadTokens: 0, // Not tracked separately yet
          cacheWriteTokens: 0, // Not tracked separately yet
          cost: row.cost_usd,
          taskCount: 1
        })
      }
    }

    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: 0, // Not tracked separately yet
      cacheWriteTokens: 0, // Not tracked separately yet
      totalCost,
      byModel,
      timeSeries: [] // Populated by specific methods that need it
    }
  }

  /**
   * Check for budget alerts (PRD Section 14)
   * Returns array of alerts when spending thresholds are crossed
   */
  checkBudgetAlerts(monthlyBudget: number, warningThreshold = 0.8, criticalThreshold = 0.95): BudgetAlert[] {
    const alerts: BudgetAlert[] = []
    const { totalCost, monthStart } = this.getMonthlyTotalCost()

    // Skip if no budget set
    if (monthlyBudget <= 0) return alerts

    const percentUsed = totalCost / monthlyBudget

    // Calculate days remaining in month and daily spend rate
    const now = new Date()
    const monthStartDate = new Date(monthStart)
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStartDate.getTime()) / (1000 * 60 * 60 * 24)))
    const dailyRate = totalCost / daysElapsed

    // Calculate days until budget exceeded
    const remainingBudget = monthlyBudget - totalCost
    const daysUntilExceeded = dailyRate > 0 ? Math.ceil(remainingBudget / dailyRate) : null

    if (percentUsed >= criticalThreshold) {
      alerts.push({
        type: 'critical',
        scope: 'monthly',
        message: `You've used ${Math.round(percentUsed * 100)}% of your monthly budget ($${totalCost.toFixed(2)} / $${monthlyBudget.toFixed(2)}).`,
        currentSpend: totalCost,
        budgetLimit: monthlyBudget,
        daysUntilExceeded: daysUntilExceeded !== null && daysUntilExceeded > 0 ? daysUntilExceeded : null
      })
    } else if (percentUsed >= warningThreshold) {
      alerts.push({
        type: 'warning',
        scope: 'monthly',
        message: `You've used ${Math.round(percentUsed * 100)}% of your monthly budget ($${totalCost.toFixed(2)} / $${monthlyBudget.toFixed(2)}).`,
        currentSpend: totalCost,
        budgetLimit: monthlyBudget,
        daysUntilExceeded: daysUntilExceeded !== null && daysUntilExceeded > 0 ? daysUntilExceeded : null
      })
    }

    return alerts
  }
}
