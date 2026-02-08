/**
 * Debug Findings IPC Handlers
 *
 * Handles all debug finding-related IPC messages for the suggested fixes feature (PRD Section 3).
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { DebugFinding, DebugFindingType } from '../../shared/types'

export function registerFindingsHandlers(): void {
  safeHandle('db:findings:getForTask', (_event, taskId: string): DebugFinding[] => {
    return databaseService.getFindingsForTask(taskId)
  })

  safeHandle('db:findings:getByType', (_event, taskId: string, findingType: DebugFindingType): DebugFinding[] => {
    return databaseService.getFindingsByType(taskId, findingType)
  })

  safeHandle('db:findings:get', (_event, id: string): DebugFinding | undefined => {
    return databaseService.getFinding(id)
  })

  safeHandle('db:findings:create', (
    _event,
    params: {
      taskId: string
      findingType: DebugFindingType
      title: string
      content: string
      codeSnippet?: string
      filePath?: string
      priority?: number
    }
  ): DebugFinding => {
    return databaseService.createFinding(
      params.taskId,
      params.findingType,
      params.title,
      params.content,
      params.codeSnippet,
      params.filePath,
      params.priority
    )
  })

  safeHandle('db:findings:update', (
    _event,
    id: string,
    updates: Partial<Pick<DebugFinding, 'title' | 'content' | 'code_snippet' | 'file_path' | 'priority'>>
  ): DebugFinding | undefined => {
    return databaseService.updateFinding(id, updates)
  })

  safeHandle('db:findings:delete', (_event, id: string): void => {
    databaseService.deleteFinding(id)
  })

  safeHandle('db:findings:deleteForTask', (_event, taskId: string): void => {
    databaseService.deleteFindingsForTask(taskId)
  })

  safeHandle('db:findings:getCounts', (_event, taskId: string): Record<DebugFindingType, number> => {
    return databaseService.getFindingCounts(taskId)
  })
}
