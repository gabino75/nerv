/**
 * Subagent IPC Handlers
 *
 * Handles all subagent tracking related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'

export function registerSubagentHandlers(): void {
  safeHandle('db:subagents:get', (_event, id: string) => {
    return databaseService.getSubagent(id)
  })

  safeHandle('db:subagents:getForSession', (_event, parentSessionId: string) => {
    return databaseService.getSubagentsForSession(parentSessionId)
  })

  safeHandle('db:subagents:getForTask', (_event, taskId: string) => {
    return databaseService.getSubagentsForTask(taskId)
  })

  safeHandle('db:subagents:getActive', (_event, taskId?: string) => {
    return databaseService.getActiveSubagents(taskId)
  })

  safeHandle('db:subagents:create', (_event, parentSessionId: string, taskId: string, agentType: string) => {
    return databaseService.createSubagent(parentSessionId, taskId, agentType)
  })

  safeHandle('db:subagents:updateMetrics', (_event, id: string, updates: { inputTokens?: number; outputTokens?: number; costUsd?: number }) => {
    return databaseService.updateSubagentMetrics(id, updates)
  })

  safeHandle('db:subagents:complete', (_event, id: string, status: 'completed' | 'failed', metrics?: { inputTokens: number; outputTokens: number; costUsd: number }) => {
    return databaseService.completeSubagent(id, status, metrics)
  })

  safeHandle('db:subagents:getUsage', (_event, taskId: string) => {
    return databaseService.getSubagentUsageForTask(taskId)
  })
}
