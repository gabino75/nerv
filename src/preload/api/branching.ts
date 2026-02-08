/**
 * Branching API for session branching and context management
 */

import { ipcRenderer } from 'electron'
import type { Branch, BranchContext, BranchSummary, BranchCreateResult } from '../../shared/types'

export const branching = {
  create: (
    taskId: string,
    parentSessionId: string | null,
    context: BranchContext
  ): Promise<BranchCreateResult> => ipcRenderer.invoke('branching:create', taskId, parentSessionId, context),
  merge: (branchId: string, summary: string): Promise<Branch | undefined> =>
    ipcRenderer.invoke('branching:merge', branchId, summary),
  discard: (branchId: string, reason?: string): Promise<Branch | undefined> =>
    ipcRenderer.invoke('branching:discard', branchId, reason),
  getForTask: (taskId: string): Promise<Branch[]> =>
    ipcRenderer.invoke('branching:getForTask', taskId),
  getActive: (taskId: string): Promise<Branch | undefined> =>
    ipcRenderer.invoke('branching:getActive', taskId),
  generateClearContext: (taskId: string, summary: BranchSummary): Promise<string> =>
    ipcRenderer.invoke('branching:generateClearContext', taskId, summary),
  appendLearnings: (taskId: string, learnings: string): Promise<void> =>
    ipcRenderer.invoke('branching:appendLearnings', taskId, learnings),

  // Event listeners
  onBranchCreated: (callback: (branch: Branch) => void): void => {
    ipcRenderer.on('branching:created', (_event, branch) => callback(branch))
  },
  onBranchMerged: (callback: (branch: Branch) => void): void => {
    ipcRenderer.on('branching:merged', (_event, branch) => callback(branch))
  },
  onBranchDiscarded: (callback: (branch: Branch) => void): void => {
    ipcRenderer.on('branching:discarded', (_event, branch) => callback(branch))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('branching:created')
    ipcRenderer.removeAllListeners('branching:merged')
    ipcRenderer.removeAllListeners('branching:discarded')
  }
}
