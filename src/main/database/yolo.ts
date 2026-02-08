import type { YoloBenchmarkConfig, YoloBenchmarkResult, YoloBenchmarkStatus } from '../../shared/types'
import type Database from 'better-sqlite3'

// Database row types (snake_case from SQLite)
interface YoloBenchmarkConfigRow {
  id: string
  project_id: string
  model: string
  max_cycles: number
  max_cost_usd: number
  max_duration_ms: number
  auto_approve_review: number
  auto_approve_dangerous_tools: number
  test_command: string | null
  spec_file: string | null
  created_at: string
}

interface YoloBenchmarkResultRow {
  id: string
  config_id: string
  status: string
  started_at: string | null
  completed_at: string | null
  cycles_completed: number
  tasks_completed: number
  total_cost_usd: number
  total_duration_ms: number
  tests_passed: number
  tests_failed: number
  spec_completion_pct: number
  stop_reason: string | null
}

/**
 * YOLO Benchmark database operations
 */
export class YoloOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string
  ) {}

  private toYoloBenchmarkConfig(row: YoloBenchmarkConfigRow): YoloBenchmarkConfig {
    return {
      projectId: row.project_id,
      model: row.model,
      maxCycles: row.max_cycles,
      maxCostUsd: row.max_cost_usd,
      maxDurationMs: row.max_duration_ms,
      autoApproveReview: row.auto_approve_review === 1,
      autoApproveDangerousTools: row.auto_approve_dangerous_tools === 1,
      testCommand: row.test_command,
      specFile: row.spec_file
    }
  }

  private toYoloBenchmarkResult(row: YoloBenchmarkResultRow): YoloBenchmarkResult {
    return {
      id: row.id,
      configId: row.config_id,
      status: row.status as YoloBenchmarkStatus,
      startedAt: row.started_at || '',
      completedAt: row.completed_at,
      cyclesCompleted: row.cycles_completed,
      tasksCompleted: row.tasks_completed,
      totalCostUsd: row.total_cost_usd,
      totalDurationMs: row.total_duration_ms,
      testsPassed: row.tests_passed,
      testsFailed: row.tests_failed,
      specCompletionPct: row.spec_completion_pct,
      stopReason: row.stop_reason
    }
  }

  // =====================
  // YOLO Benchmark Configs
  // =====================

  getYoloBenchmarkConfig(id: string): (YoloBenchmarkConfig & { id: string }) | undefined {
    const row = this.getDb().prepare('SELECT * FROM yolo_benchmark_configs WHERE id = ?').get(id)
    if (!row) return undefined
    return { id, ...this.toYoloBenchmarkConfig(row as YoloBenchmarkConfigRow) }
  }

  getYoloBenchmarkConfigsForProject(projectId: string): Array<YoloBenchmarkConfig & { id: string }> {
    const rows = this.getDb().prepare('SELECT * FROM yolo_benchmark_configs WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    return rows.map((row) => {
      const r = row as YoloBenchmarkConfigRow
      return { id: r.id, ...this.toYoloBenchmarkConfig(r) }
    })
  }

  createYoloBenchmarkConfig(config: YoloBenchmarkConfig): YoloBenchmarkConfig & { id: string } {
    const id = this.generateId()
    this.getDb().prepare(`
      INSERT INTO yolo_benchmark_configs (
        id, project_id, model, max_cycles, max_cost_usd, max_duration_ms,
        auto_approve_review, auto_approve_dangerous_tools, test_command, spec_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      config.projectId,
      config.model,
      config.maxCycles,
      config.maxCostUsd,
      config.maxDurationMs,
      config.autoApproveReview ? 1 : 0,
      config.autoApproveDangerousTools ? 1 : 0,
      config.testCommand,
      config.specFile
    )
    return this.getYoloBenchmarkConfig(id)!
  }

  updateYoloBenchmarkConfig(
    id: string,
    updates: Partial<Omit<YoloBenchmarkConfig, 'projectId'>>
  ): (YoloBenchmarkConfig & { id: string }) | undefined {
    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (updates.model !== undefined) {
      sets.push('model = ?')
      values.push(updates.model)
    }
    if (updates.maxCycles !== undefined) {
      sets.push('max_cycles = ?')
      values.push(updates.maxCycles)
    }
    if (updates.maxCostUsd !== undefined) {
      sets.push('max_cost_usd = ?')
      values.push(updates.maxCostUsd)
    }
    if (updates.maxDurationMs !== undefined) {
      sets.push('max_duration_ms = ?')
      values.push(updates.maxDurationMs)
    }
    if (updates.autoApproveReview !== undefined) {
      sets.push('auto_approve_review = ?')
      values.push(updates.autoApproveReview ? 1 : 0)
    }
    if (updates.autoApproveDangerousTools !== undefined) {
      sets.push('auto_approve_dangerous_tools = ?')
      values.push(updates.autoApproveDangerousTools ? 1 : 0)
    }
    if (updates.testCommand !== undefined) {
      sets.push('test_command = ?')
      values.push(updates.testCommand)
    }
    if (updates.specFile !== undefined) {
      sets.push('spec_file = ?')
      values.push(updates.specFile)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE yolo_benchmark_configs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getYoloBenchmarkConfig(id)
  }

  deleteYoloBenchmarkConfig(id: string): void {
    this.getDb().prepare('DELETE FROM yolo_benchmark_configs WHERE id = ?').run(id)
  }

  // =====================
  // YOLO Benchmark Results
  // =====================

  getYoloBenchmarkResult(id: string): YoloBenchmarkResult | undefined {
    const row = this.getDb().prepare('SELECT * FROM yolo_benchmark_results WHERE id = ?').get(id)
    if (!row) return undefined
    return this.toYoloBenchmarkResult(row as YoloBenchmarkResultRow)
  }

  getYoloBenchmarkResultsForConfig(configId: string): YoloBenchmarkResult[] {
    const rows = this.getDb().prepare('SELECT * FROM yolo_benchmark_results WHERE config_id = ? ORDER BY started_at DESC').all(configId)
    return rows.map((row) => this.toYoloBenchmarkResult(row as YoloBenchmarkResultRow))
  }

  getRunningYoloBenchmarks(): YoloBenchmarkResult[] {
    const rows = this.getDb().prepare("SELECT * FROM yolo_benchmark_results WHERE status = 'running'").all()
    return rows.map((row) => this.toYoloBenchmarkResult(row as YoloBenchmarkResultRow))
  }

  createYoloBenchmarkResult(configId: string): YoloBenchmarkResult {
    const id = this.generateId()
    const startedAt = new Date().toISOString()
    this.getDb().prepare(`
      INSERT INTO yolo_benchmark_results (id, config_id, status, started_at)
      VALUES (?, ?, 'running', ?)
    `).run(id, configId, startedAt)
    return this.getYoloBenchmarkResult(id)!
  }

  updateYoloBenchmarkResult(
    id: string,
    updates: Partial<Omit<YoloBenchmarkResult, 'id' | 'configId' | 'startedAt'>>
  ): YoloBenchmarkResult | undefined {
    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (updates.status !== undefined) {
      sets.push('status = ?')
      values.push(updates.status)
    }
    if (updates.completedAt !== undefined) {
      sets.push('completed_at = ?')
      values.push(updates.completedAt)
    }
    if (updates.cyclesCompleted !== undefined) {
      sets.push('cycles_completed = ?')
      values.push(updates.cyclesCompleted)
    }
    if (updates.tasksCompleted !== undefined) {
      sets.push('tasks_completed = ?')
      values.push(updates.tasksCompleted)
    }
    if (updates.totalCostUsd !== undefined) {
      sets.push('total_cost_usd = ?')
      values.push(updates.totalCostUsd)
    }
    if (updates.totalDurationMs !== undefined) {
      sets.push('total_duration_ms = ?')
      values.push(updates.totalDurationMs)
    }
    if (updates.testsPassed !== undefined) {
      sets.push('tests_passed = ?')
      values.push(updates.testsPassed)
    }
    if (updates.testsFailed !== undefined) {
      sets.push('tests_failed = ?')
      values.push(updates.testsFailed)
    }
    if (updates.specCompletionPct !== undefined) {
      sets.push('spec_completion_pct = ?')
      values.push(updates.specCompletionPct)
    }
    if (updates.stopReason !== undefined) {
      sets.push('stop_reason = ?')
      values.push(updates.stopReason)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE yolo_benchmark_results SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getYoloBenchmarkResult(id)
  }

  completeYoloBenchmark(
    id: string,
    status: YoloBenchmarkStatus,
    stopReason: string | null
  ): YoloBenchmarkResult | undefined {
    const completedAt = new Date().toISOString()
    this.getDb().prepare(`
      UPDATE yolo_benchmark_results
      SET status = ?, completed_at = ?, stop_reason = ?
      WHERE id = ?
    `).run(status, completedAt, stopReason, id)
    return this.getYoloBenchmarkResult(id)
  }
}
