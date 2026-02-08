/**
 * Decision IPC Handlers
 *
 * Handles all decision (ADR) related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { Decision } from '../../shared/types'

export function registerDecisionHandlers(): void {
  safeHandle('db:decisions:getForProject', (_event, projectId: string): Decision[] => {
    return databaseService.getDecisionsForProject(projectId)
  })

  safeHandle('db:decisions:getForCycle', (_event, cycleId: string): Decision[] => {
    return databaseService.getDecisionsForCycle(cycleId)
  })

  safeHandle('db:decisions:get', (_event, id: string): Decision | undefined => {
    return databaseService.getDecision(id)
  })

  safeHandle('db:decisions:create', (_event, params: { projectId: string; title: string; rationale?: string; cycleId?: string; alternatives?: string }): Decision => {
    return databaseService.createDecision(params.projectId, params.title, params.rationale, params.cycleId, params.alternatives)
  })

  safeHandle('db:decisions:update', (_event, id: string, updates: Partial<Pick<Decision, 'title' | 'rationale' | 'alternatives'>>): Decision | undefined => {
    return databaseService.updateDecision(id, updates)
  })

  safeHandle('db:decisions:delete', (_event, id: string): void => {
    databaseService.deleteDecision(id)
  })
}
