/**
 * Task IPC Handlers
 *
 * Handles all task-related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { broadcastToRenderers } from '../utils'
import type { Task } from '../../shared/types'

export function registerTaskHandlers(): void {
  safeHandle('db:tasks:getForProject', (_event, projectId: string): Task[] => {
    return databaseService.getTasksForProject(projectId)
  })

  safeHandle('db:tasks:get', (_event, id: string): Task | undefined => {
    return databaseService.getTask(id)
  })

  safeHandle('db:tasks:create', (_event, projectId: string, title: string, description?: string, cycleId?: string): Task => {
    return databaseService.createTask(projectId, title, description, cycleId)
  })

  safeHandle('db:tasks:updateStatus', async (_event, id: string, status: Task['status']): Promise<Task | undefined> => {
    // Get task before update to check project
    const taskBefore = databaseService.getTask(id)

    // PRD Section 31: Record time_to_first_task when first task starts in a project
    if (taskBefore && status === 'in_progress') {
      // Check if this is the first task ever started in this project
      if (!databaseService.hasAnyTaskStarted(taskBefore.project_id)) {
        const project = databaseService.getProject(taskBefore.project_id)
        if (project) {
          const now = new Date().toISOString()
          databaseService.recordTimeToFirstTask(taskBefore.project_id, project.created_at, now)
        }
      }
    }

    const task = databaseService.updateTaskStatus(id, status)

    // PRD: Merge worktree branch into base branch when task is approved (done)
    if (task && status === 'done' && taskBefore?.worktree_path) {
      try {
        const { mergeWorktreeBranch, removeWorktree } = await import('../worktree.js')
        const result = await mergeWorktreeBranch(taskBefore.worktree_path)
        console.log(`[NERV] Merge ${result.merged ? 'succeeded' : 'failed'} for task ${id}${result.error ? ': ' + result.error : ''}`)

        // PRD Section 25: Auto-cleanup worktree after successful merge if configured
        if (result.merged && taskBefore.project_id) {
          const repos = databaseService.getReposForProject(taskBefore.project_id)
          const repo = repos.find(r => taskBefore.worktree_path?.startsWith(r.path.replace(/[/\\][^/\\]*$/, '')))
          if (repo?.auto_cleanup_worktrees) {
            try {
              await removeWorktree(taskBefore.worktree_path)
              console.log(`[NERV] Auto-cleaned worktree for task ${id}`)
            } catch (cleanupError) {
              console.warn(`[NERV] Auto-cleanup failed for task ${id}:`, cleanupError)
            }
          }
        }
      } catch (error) {
        console.warn(`[NERV] Merge error for task ${id}:`, error)
      }
    }

    // PRD Section 30: Broadcast notification when task is ready for review OR completed
    if (task && (status === 'review' || status === 'done')) {
      broadcastToRenderers('notification:taskCompleted', {
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.project_id
      })
    }
    return task
  })

  safeHandle('db:tasks:updateSession', (_event, id: string, sessionId: string): Task | undefined => {
    return databaseService.updateTaskSession(id, sessionId)
  })

  safeHandle('db:tasks:updateWorktree', (_event, id: string, worktreePath: string): Task | undefined => {
    return databaseService.updateTaskWorktree(id, worktreePath)
  })

  safeHandle('db:tasks:delete', (_event, id: string): void => {
    databaseService.deleteTask(id)
  })

  safeHandle('db:tasks:getInterrupted', (): Task[] => {
    return databaseService.getInterruptedTasks()
  })

  safeHandle('db:tasks:createWithType', (
    _event,
    params: { projectId: string; title: string; taskType: 'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug'; description?: string; cycleId?: string }
  ): Task => {
    return databaseService.createTaskWithType(params.projectId, params.title, params.taskType, params.description, params.cycleId)
  })

  safeHandle('db:tasks:updateDescription', (_event, id: string, description: string): Task | undefined => {
    return databaseService.updateTaskDescription(id, description)
  })
}
