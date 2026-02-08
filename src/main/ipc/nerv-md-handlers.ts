/**
 * NERV.md IPC Handlers
 *
 * Handles all NERV.md generation and management IPC messages.
 */

import { safeHandle } from './safe-handle'
import { generateNervMd, saveNervMd, getNervMdPath, estimateTokenCount, checkContentSize } from '../nerv-md'

export function registerNervMdHandlers(): void {
  safeHandle('nervMd:generate', (_event, projectId: string, currentTaskId?: string): string => {
    return generateNervMd(projectId, currentTaskId)
  })

  safeHandle('nervMd:save', (_event, projectId: string, currentTaskId?: string): string => {
    return saveNervMd(projectId, currentTaskId)
  })

  safeHandle('nervMd:getPath', (_event, projectId: string): string => {
    return getNervMdPath(projectId)
  })

  safeHandle('nervMd:estimateTokens', (_event, content: string): number => {
    return estimateTokenCount(content)
  })

  safeHandle('nervMd:checkSize', (_event, content: string): {
    tokens: number
    isWithinTarget: boolean
    isWithinMax: boolean
    warning?: string
  } => {
    return checkContentSize(content)
  })
}
