/**
 * Branch IPC Handlers
 *
 * Handles all session branching related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { Branch } from '../../shared/types'

export function registerBranchHandlers(): void {
  safeHandle('db:branches:getForTask', (_event, taskId: string): Branch[] => {
    return databaseService.getBranchesForTask(taskId)
  })

  safeHandle('db:branches:create', (_event, parentTaskId: string, parentSessionId?: string): Branch => {
    return databaseService.createBranch(parentTaskId, parentSessionId)
  })

  safeHandle('db:branches:updateStatus', (_event, id: string, status: Branch['status'], summary?: string): Branch | undefined => {
    return databaseService.updateBranchStatus(id, status, summary)
  })
}
