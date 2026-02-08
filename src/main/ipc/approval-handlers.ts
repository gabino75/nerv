/**
 * Approval IPC Handlers
 *
 * Handles all approval-related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { broadcastToRenderers } from '../utils'
import { shouldAutoApproveDangerousTools } from '../yolo-benchmark/lifecycle'
import { trackPendingApproval, untrackApproval } from '../recovery'
import type { Approval } from '../../shared/types'

export function registerApprovalHandlers(): void {
  safeHandle('db:approvals:getPending', (_event, taskId?: string): Approval[] => {
    return databaseService.getPendingApprovals(taskId)
  })

  safeHandle('db:approvals:getAll', (): Approval[] => {
    return databaseService.getAllApprovals()
  })

  safeHandle('db:approvals:create', (_event, taskId: string, toolName: string, toolInput?: string, context?: string): Approval => {
    const approval = databaseService.createApproval(taskId, toolName, toolInput, context)

    // Check if YOLO mode should auto-approve this dangerous tool
    if (shouldAutoApproveDangerousTools(taskId)) {
      console.log(`[YOLO] Auto-approving dangerous tool: ${toolName} for task ${taskId}`)
      const resolved = databaseService.resolveApproval(approval.id, 'approved')
      if (resolved) {
        broadcastToRenderers('notification:approvalAutoApproved', {
          approvalId: approval.id,
          taskId,
          toolName
        })
        return resolved
      }
    }

    // Broadcast notification for permission needed (manual approval)
    // PRD Section 30: "Approval required for `rm -rf ./build`" - include command details
    broadcastToRenderers('notification:approvalNeeded', {
      approvalId: approval.id,
      taskId,
      toolName,
      toolInput: toolInput || undefined
    })

    // Start tracking for timeout notification (PRD Section 30: notify after 5+ min waiting)
    trackPendingApproval(approval.id, taskId, toolName)

    return approval
  })

  safeHandle('db:approvals:resolve', (_event, id: number, status: 'approved' | 'denied', denyReason?: string): Approval | undefined => {
    // Stop tracking approval timeout (PRD Section 30)
    untrackApproval(id)
    return databaseService.resolveApproval(id, status, denyReason)
  })
}
