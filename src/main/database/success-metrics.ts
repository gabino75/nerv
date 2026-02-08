import type { SuccessMetrics, SuccessMetricType, SUCCESS_METRIC_TARGETS } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Success Metrics database operations (PRD Section 31)
 *
 * Tracks 6 key performance indicators:
 * 1. Time to first task start (< 5 minutes from "New Project")
 * 2. Context re-explanation (zero - NERV.md handles it)
 * 3. Dangerous command catches (> 90% routed to approval queue)
 * 4. Recovery success rate (> 95% of interrupted tasks recoverable)
 * 5. Benchmark pass rate - simple (> 95%)
 * 6. Benchmark pass rate - medium (> 80%)
 */
export class SuccessMetricsOperations {
  constructor(private getDb: () => Database.Database) {}

  /**
   * Get all success metrics for a project (or global if projectId is null)
   */
  getMetrics(projectId: string | null = null): SuccessMetrics[] {
    if (projectId) {
      return this.getDb().prepare(
        'SELECT * FROM success_metrics WHERE project_id = ? ORDER BY metric_type'
      ).all(projectId) as SuccessMetrics[]
    }
    return this.getDb().prepare(
      'SELECT * FROM success_metrics WHERE project_id IS NULL ORDER BY metric_type'
    ).all() as SuccessMetrics[]
  }

  /**
   * Get a specific metric
   */
  getMetric(metricType: SuccessMetricType, projectId: string | null = null): SuccessMetrics | undefined {
    if (projectId) {
      return this.getDb().prepare(
        'SELECT * FROM success_metrics WHERE metric_type = ? AND project_id = ?'
      ).get(metricType, projectId) as SuccessMetrics | undefined
    }
    return this.getDb().prepare(
      'SELECT * FROM success_metrics WHERE metric_type = ? AND project_id IS NULL'
    ).get(metricType) as SuccessMetrics | undefined
  }

  /**
   * Record a new data point for a metric (updates running average)
   */
  recordMetricSample(
    metricType: SuccessMetricType,
    value: number,
    target: number,
    projectId: string | null = null
  ): SuccessMetrics {
    const existing = this.getMetric(metricType, projectId)
    const now = new Date().toISOString()

    if (existing) {
      // Update running average: new_avg = old_avg + (new_value - old_avg) / (n + 1)
      const newSampleCount = existing.sample_count + 1
      const newValue = existing.current_value + (value - existing.current_value) / newSampleCount
      const passed = this.checkPassed(metricType, newValue, target)

      this.getDb().prepare(`
        UPDATE success_metrics
        SET current_value = ?, passed = ?, sample_count = ?, last_updated = ?
        WHERE id = ?
      `).run(newValue, passed ? 1 : 0, newSampleCount, now, existing.id)

      return this.getDb().prepare('SELECT * FROM success_metrics WHERE id = ?').get(existing.id) as SuccessMetrics
    }

    // Insert new metric
    const passed = this.checkPassed(metricType, value, target)
    const result = this.getDb().prepare(`
      INSERT INTO success_metrics (project_id, metric_type, target_value, current_value, passed, sample_count, last_updated)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(projectId, metricType, target, value, passed ? 1 : 0, now)

    return this.getDb().prepare('SELECT * FROM success_metrics WHERE id = ?').get(result.lastInsertRowid) as SuccessMetrics
  }

  /**
   * Check if metric passes based on type and target
   * Different metrics have different pass conditions (e.g., < for time, > for percentages)
   */
  private checkPassed(metricType: SuccessMetricType, value: number, target: number): boolean {
    switch (metricType) {
      case 'time_to_first_task':
        // Pass if time is LESS than target
        return value < target
      case 'context_reexplanation':
        // Pass if count is EQUAL to zero
        return value === target
      case 'dangerous_command_catch':
      case 'recovery_success_rate':
      case 'benchmark_pass_simple':
      case 'benchmark_pass_medium':
        // Pass if percentage is GREATER than or equal to target
        return value >= target
      default:
        return value >= target
    }
  }

  // =====================
  // Convenience Methods for Recording Specific Metrics
  // =====================

  /**
   * Record time from project creation to first task start
   */
  recordTimeToFirstTask(projectId: string, projectCreatedAt: string, firstTaskStartedAt: string): void {
    const created = new Date(projectCreatedAt).getTime()
    const started = new Date(firstTaskStartedAt).getTime()
    const durationMs = started - created

    // PRD target: < 5 minutes (300,000 ms)
    this.recordMetricSample('time_to_first_task', durationMs, 5 * 60 * 1000, projectId)
  }

  /**
   * Record whether a dangerous command was caught by approval queue
   * Called when a dangerous tool is either caught (true) or slipped through (false)
   */
  recordDangerousCommandCatch(projectId: string | null, caught: boolean): void {
    // Convert to percentage: 100 if caught, 0 if not
    const value = caught ? 100 : 0
    // PRD target: > 90%
    this.recordMetricSample('dangerous_command_catch', value, 90, projectId)
  }

  /**
   * Record whether an interrupted task was successfully recovered
   */
  recordRecoveryAttempt(projectId: string, recovered: boolean): void {
    // Convert to percentage: 100 if recovered, 0 if not
    const value = recovered ? 100 : 0
    // PRD target: > 95%
    this.recordMetricSample('recovery_success_rate', value, 95, projectId)
  }

  /**
   * Record benchmark pass/fail for a simple spec
   */
  recordBenchmarkResultSimple(passed: boolean): void {
    const value = passed ? 100 : 0
    // PRD target: > 95%
    this.recordMetricSample('benchmark_pass_simple', value, 95, null)
  }

  /**
   * Record benchmark pass/fail for a medium spec
   */
  recordBenchmarkResultMedium(passed: boolean): void {
    const value = passed ? 100 : 0
    // PRD target: > 80%
    this.recordMetricSample('benchmark_pass_medium', value, 80, null)
  }

  // =====================
  // Summary & Reporting
  // =====================

  /**
   * Get a summary of all success metrics with pass/fail status
   */
  getSummary(projectId: string | null = null): {
    metrics: Array<{
      type: SuccessMetricType
      target: number
      current: number
      passed: boolean
      sampleCount: number
      description: string
    }>
    overallPassRate: number
    totalMetrics: number
    passingMetrics: number
  } {
    const metrics = this.getMetrics(projectId)

    const metricDescriptions: Record<SuccessMetricType, string> = {
      time_to_first_task: 'Time to first task start (< 5 min)',
      context_reexplanation: 'Context re-explanations (zero)',
      dangerous_command_catch: 'Dangerous commands caught (> 90%)',
      recovery_success_rate: 'Recovery success rate (> 95%)',
      benchmark_pass_simple: 'Benchmark pass rate - Simple (> 95%)',
      benchmark_pass_medium: 'Benchmark pass rate - Medium (> 80%)'
    }

    const result = metrics.map(m => ({
      type: m.metric_type as SuccessMetricType,
      target: m.target_value,
      current: m.current_value,
      passed: m.passed === 1 || Boolean(m.passed),
      sampleCount: m.sample_count,
      description: metricDescriptions[m.metric_type as SuccessMetricType] || m.metric_type
    }))

    const passingMetrics = result.filter(m => m.passed).length
    const totalMetrics = result.length

    return {
      metrics: result,
      overallPassRate: totalMetrics > 0 ? (passingMetrics / totalMetrics) * 100 : 0,
      totalMetrics,
      passingMetrics
    }
  }

  /**
   * Calculate dangerous command catch rate from approvals table
   */
  calculateDangerousCommandCatchRate(projectId: string | null = null): {
    total: number
    caught: number
    percentage: number
  } {
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('approved', 'denied') THEN 1 ELSE 0 END) as caught
      FROM approvals
      WHERE is_dangerous = 1
    `
    const params: string[] = []

    if (projectId) {
      query += ' AND task_id IN (SELECT id FROM tasks WHERE project_id = ?)'
      params.push(projectId)
    }

    const result = this.getDb().prepare(query).get(...params) as { total: number; caught: number }
    const total = result.total || 0
    const caught = result.caught || 0

    return {
      total,
      caught,
      percentage: total > 0 ? (caught / total) * 100 : 100
    }
  }

  /**
   * Calculate recovery success rate from tasks table
   */
  calculateRecoverySuccessRate(projectId: string | null = null): {
    total: number
    recovered: number
    percentage: number
  } {
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN was_recovered = 1 THEN 1 ELSE 0 END) as recovered
      FROM tasks
      WHERE was_interrupted = 1
    `
    const params: string[] = []

    if (projectId) {
      query += ' AND project_id = ?'
      params.push(projectId)
    }

    const result = this.getDb().prepare(query).get(...params) as { total: number; recovered: number }
    const total = result.total || 0
    const recovered = result.recovered || 0

    return {
      total,
      recovered,
      percentage: total > 0 ? (recovered / total) * 100 : 100
    }
  }
}
