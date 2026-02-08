/**
 * Cycle IPC Handlers
 *
 * Handles all cycle-related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { planNextCycle } from '../../core/cycle-planner'
import type { Cycle, Task, CycleSuggestion } from '../../shared/types'

export function registerCycleHandlers(): void {
  safeHandle('db:cycles:getForProject', (_event, projectId: string): Cycle[] => {
    return databaseService.getCyclesForProject(projectId)
  })

  safeHandle('db:cycles:get', (_event, id: string): Cycle | undefined => {
    return databaseService.getCycle(id)
  })

  safeHandle('db:cycles:getActive', (_event, projectId: string): Cycle | undefined => {
    return databaseService.getActiveCycle(projectId)
  })

  safeHandle('db:cycles:getNextNumber', (_event, projectId: string): number => {
    return databaseService.getNextCycleNumber(projectId)
  })

  safeHandle('db:cycles:create', (_event, projectId: string, cycleNumber: number, goal?: string): Cycle => {
    return databaseService.createCycle(projectId, cycleNumber, goal)
  })

  safeHandle('db:cycles:update', (_event, id: string, updates: Partial<Pick<Cycle, 'goal' | 'learnings'>>): Cycle | undefined => {
    return databaseService.updateCycle(id, updates)
  })

  safeHandle('db:cycles:complete', (_event, id: string, learnings?: string): Cycle | undefined => {
    return databaseService.completeCycle(id, learnings)
  })

  safeHandle('db:cycles:getTasks', (_event, cycleId: string): Task[] => {
    return databaseService.getTasksForCycle(cycleId)
  })

  safeHandle('cycle:plan', async (_event, projectId: string, direction?: string): Promise<CycleSuggestion> => {
    return planNextCycle(databaseService, projectId, direction)
  })
}
