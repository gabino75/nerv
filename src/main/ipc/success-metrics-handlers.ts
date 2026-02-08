/**
 * Success Metrics IPC Handlers (PRD Section 31)
 *
 * Handles all success metrics IPC messages for tracking KPIs:
 * - Time to first task start
 * - Context re-explanation
 * - Dangerous command catches
 * - Recovery success rate
 * - Benchmark pass rates
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { SuccessMetrics, SuccessMetricType } from '../../shared/types'

export function registerSuccessMetricsHandlers(): void {
  // Get all success metrics for a project (or global)
  safeHandle('db:successMetrics:getAll', (_event, projectId?: string): SuccessMetrics[] => {
    return databaseService.getSuccessMetrics(projectId || null)
  })

  // Get a specific metric
  safeHandle('db:successMetrics:get', (_event, metricType: SuccessMetricType, projectId?: string): SuccessMetrics | undefined => {
    return databaseService.getSuccessMetric(metricType, projectId || null)
  })

  // Get summary of all metrics
  safeHandle('db:successMetrics:getSummary', (_event, projectId?: string): {
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
  } => {
    return databaseService.getSuccessMetricsSummary(projectId || null)
  })

  // Record time to first task
  safeHandle('db:successMetrics:recordTimeToFirstTask', (_event, projectId: string, projectCreatedAt: string, firstTaskStartedAt: string): void => {
    databaseService.recordTimeToFirstTask(projectId, projectCreatedAt, firstTaskStartedAt)
  })

  // Record dangerous command catch
  safeHandle('db:successMetrics:recordDangerousCommandCatch', (_event, projectId: string | null, caught: boolean): void => {
    databaseService.recordDangerousCommandCatch(projectId, caught)
  })

  // Record recovery attempt
  safeHandle('db:successMetrics:recordRecoveryAttempt', (_event, projectId: string, recovered: boolean): void => {
    databaseService.recordRecoveryAttempt(projectId, recovered)
  })

  // Record benchmark result for simple spec
  safeHandle('db:successMetrics:recordBenchmarkSimple', (_event, passed: boolean): void => {
    databaseService.recordBenchmarkResultSimple(passed)
  })

  // Record benchmark result for medium spec
  safeHandle('db:successMetrics:recordBenchmarkMedium', (_event, passed: boolean): void => {
    databaseService.recordBenchmarkResultMedium(passed)
  })

  // Calculate dangerous command catch rate from approvals
  safeHandle('db:successMetrics:calculateDangerousCommandRate', (_event, projectId?: string): {
    total: number
    caught: number
    percentage: number
  } => {
    return databaseService.calculateDangerousCommandCatchRate(projectId || null)
  })

  // Calculate recovery success rate from tasks
  safeHandle('db:successMetrics:calculateRecoveryRate', (_event, projectId?: string): {
    total: number
    recovered: number
    percentage: number
  } => {
    return databaseService.calculateRecoverySuccessRate(projectId || null)
  })
}
