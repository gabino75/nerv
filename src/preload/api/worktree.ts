/**
 * Worktree API for git worktree management
 */

import { ipcRenderer } from 'electron'
import type { WorktreeInfo, TaskWorktreeResult, WorktreeStatus, ProjectWorktrees } from '../../shared/types'

export const worktree = {
  create: (repoPath: string, taskId: string, baseBranch?: string): Promise<TaskWorktreeResult> =>
    ipcRenderer.invoke('worktree:create', repoPath, taskId, baseBranch),
  createForTask: (taskId: string, projectId: string): Promise<TaskWorktreeResult[]> =>
    ipcRenderer.invoke('worktree:createForTask', taskId, projectId),
  remove: (worktreePath: string): Promise<void> =>
    ipcRenderer.invoke('worktree:remove', worktreePath),
  merge: (worktreePath: string): Promise<{ merged: boolean; error?: string }> =>
    ipcRenderer.invoke('worktree:merge', worktreePath),
  cleanup: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke('worktree:cleanup', repoPath),
  list: (repoPath: string): Promise<WorktreeInfo[]> =>
    ipcRenderer.invoke('worktree:list', repoPath),
  listForProject: (projectId: string): Promise<ProjectWorktrees[]> =>
    ipcRenderer.invoke('worktree:listForProject', projectId),
  getStatus: (worktreePath: string): Promise<WorktreeStatus> =>
    ipcRenderer.invoke('worktree:getStatus', worktreePath),
  isGitRepo: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('worktree:isGitRepo', path),
  getMainBranch: (repoPath: string): Promise<string> =>
    ipcRenderer.invoke('worktree:getMainBranch', repoPath),

  // Auto-fetch repos on project open (PRD Section 25)
  autoFetchProject: (projectId: string): Promise<{ fetched: string[]; errors: string[] }> =>
    ipcRenderer.invoke('worktree:autoFetchProject', projectId),

  // Fetch a single repository
  fetch: (repoPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('worktree:fetch', repoPath),

  // Event listeners
  onCreated: (callback: (result: TaskWorktreeResult | TaskWorktreeResult[]) => void): void => {
    ipcRenderer.on('worktree:created', (_event, result) => callback(result))
  },
  onRemoved: (callback: (data: { path: string }) => void): void => {
    ipcRenderer.on('worktree:removed', (_event, data) => callback(data))
  },
  onCleaned: (callback: (data: { repoPath: string; cleaned: string[] }) => void): void => {
    ipcRenderer.on('worktree:cleaned', (_event, data) => callback(data))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('worktree:created')
    ipcRenderer.removeAllListeners('worktree:removed')
    ipcRenderer.removeAllListeners('worktree:cleaned')
  }
}
