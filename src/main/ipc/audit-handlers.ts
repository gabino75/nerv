/**
 * Audit IPC Handlers
 *
 * Handles all audit log related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'

export function registerAuditHandlers(): void {
  safeHandle('db:audit:log', (_event, taskId: string | null, eventType: string, details: string | null): void => {
    databaseService.logAuditEvent(taskId, eventType, details)
  })

  safeHandle('db:audit:get', (_event, taskId?: string, limit?: number) => {
    return databaseService.getAuditLog(taskId, limit)
  })
}
