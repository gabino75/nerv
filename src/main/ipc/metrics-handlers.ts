/**
 * Metrics IPC Handlers
 *
 * Handles all session metrics and model stats IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { SessionMetrics, BudgetAlert, CostSummary } from '../../shared/types'

export function registerMetricsHandlers(): void {
  safeHandle('db:metrics:get', (_event, taskId: string): SessionMetrics | undefined => {
    return databaseService.getSessionMetrics(taskId)
  })

  safeHandle('db:metrics:update', (_event, taskId: string, metrics: {
    inputTokens?: number
    outputTokens?: number
    compactionCount?: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    model?: string
    sessionId?: string
  }): SessionMetrics => {
    return databaseService.updateSessionMetrics(taskId, metrics)
  })

  safeHandle('db:metrics:getModelStats', (): Array<{
    model: string
    task_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    total_duration_ms: number
    avg_turns: number
  }> => {
    return databaseService.getModelStats()
  })

  safeHandle('db:metrics:getAll', (): SessionMetrics[] => {
    return databaseService.getAllSessionMetrics()
  })

  safeHandle('db:metrics:getMonthlyTotal', (): { totalCost: number; taskCount: number; monthStart: string } => {
    return databaseService.getMonthlyTotalCost()
  })

  safeHandle('db:metrics:getDailyBreakdown', (): Array<{ date: string; cost: number; taskCount: number }> => {
    return databaseService.getDailyCostBreakdown()
  })

  safeHandle('db:metrics:getCostByProject', (): Array<{
    projectId: string
    projectName: string
    totalCost: number
    taskCount: number
    inputTokens: number
    outputTokens: number
  }> => {
    return databaseService.getCostByProject()
  })

  safeHandle('db:metrics:exportCostsCsv', (): string => {
    return databaseService.exportCostsCsv()
  })

  safeHandle('db:metrics:checkBudgetAlerts', (_event, monthlyBudget: number, warningThreshold?: number, criticalThreshold?: number): BudgetAlert[] => {
    return databaseService.checkBudgetAlerts(monthlyBudget, warningThreshold, criticalThreshold)
  })

  // PRD Section 14: Get recent tasks with metrics for cost dashboard
  safeHandle('db:metrics:getRecentTasks', (_event, limit?: number): Array<{
    taskId: string
    taskTitle: string
    status: string
    durationMs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    completedAt: string | null
    updatedAt: string
  }> => {
    return databaseService.getRecentTasks(limit)
  })

  // PRD Section 6: Reset compactions since last /clear
  safeHandle('db:metrics:resetCompactionsSinceClear', (_event, taskId: string): void => {
    databaseService.resetCompactionsSinceClear(taskId)
  })

  // PRD Section 14: Cost Tracking Methods
  safeHandle('db:metrics:getSessionCost', (_event, sessionId: string): CostSummary => {
    return databaseService.getSessionCost(sessionId)
  })

  safeHandle('db:metrics:getTaskCost', (_event, taskId: string): CostSummary => {
    return databaseService.getTaskCost(taskId)
  })

  safeHandle('db:metrics:getProjectCost', (_event, projectId: string, startDate: string, endDate: string): CostSummary => {
    return databaseService.getProjectCost(projectId, startDate, endDate)
  })

  safeHandle('db:metrics:getGlobalCost', (_event, startDate: string, endDate: string): CostSummary => {
    return databaseService.getGlobalCost(startDate, endDate)
  })
}
