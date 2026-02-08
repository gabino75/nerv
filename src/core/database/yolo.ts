/**
 * NERV Core Database - YOLO benchmark operations
 */

import type { YoloBenchmarkConfig, YoloBenchmarkResult, YoloBenchmarkStatus } from '../../shared/types.js'
import type Database from 'better-sqlite3'

type YoloBenchmarkConfigRow = {
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

type YoloBenchmarkResultRow = {
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

  getYoloBenchmarkConfig(id: string): (YoloBenchmarkConfig & { id: string }) | undefined {
    const row = this.getDb().prepare('SELECT * FROM yolo_benchmark_configs WHERE id = ?').get(id) as YoloBenchmarkConfigRow | undefined
    if (!row) return undefined
    return { id, ...this.toYoloBenchmarkConfig(row) }
  }

  getYoloBenchmarkConfigsForProject(projectId: string): Array<YoloBenchmarkConfig & { id: string }> {
    const rows = this.getDb().prepare('SELECT * FROM yolo_benchmark_configs WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as YoloBenchmarkConfigRow[]
    return rows.map((row) => ({ id: row.id, ...this.toYoloBenchmarkConfig(row) }))
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

  getYoloBenchmarkResult(id: string): YoloBenchmarkResult | undefined {
    const row = this.getDb().prepare('SELECT * FROM yolo_benchmark_results WHERE id = ?').get(id) as YoloBenchmarkResultRow | undefined
    if (!row) return undefined
    return this.toYoloBenchmarkResult(row)
  }

  getRunningYoloBenchmarks(): YoloBenchmarkResult[] {
    const rows = this.getDb().prepare("SELECT * FROM yolo_benchmark_results WHERE status = 'running'").all() as YoloBenchmarkResultRow[]
    return rows.map((row) => this.toYoloBenchmarkResult(row))
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
}
