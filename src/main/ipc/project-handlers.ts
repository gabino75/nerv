/**
 * Project IPC Handlers
 *
 * Handles all project-related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { Project } from '../../shared/types'

export function registerProjectHandlers(): void {
  safeHandle('db:projects:getAll', (): Project[] => {
    return databaseService.getAllProjects()
  })

  safeHandle('db:projects:get', (_event, id: string): Project | undefined => {
    return databaseService.getProject(id)
  })

  safeHandle('db:projects:create', (_event, name: string, goal?: string): Project => {
    return databaseService.createProject(name, goal)
  })

  safeHandle('db:projects:update', (_event, id: string, updates: Partial<Pick<Project, 'name' | 'goal' | 'custom_agents' | 'review_mode'>>): Project | undefined => {
    return databaseService.updateProject(id, updates)
  })

  safeHandle('db:projects:delete', (_event, id: string): void => {
    databaseService.deleteProject(id)
  })
}
