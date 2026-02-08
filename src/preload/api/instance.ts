/**
 * Instance Preload API (PRD Section 11 - Multi-Instance Support)
 *
 * Provides renderer access to multi-instance coordination features.
 */

import { ipcRenderer } from 'electron'
import type { InstanceInfo, LockAcquisitionResult, ResourceLimits } from '../../shared/types'

export const instance = {
  /** Get the unique instance ID for this NERV process */
  getId: (): Promise<string> => ipcRenderer.invoke('instance:getId'),

  /** Acquire exclusive lock on a project */
  acquireProjectLock: (projectId: string): Promise<LockAcquisitionResult> =>
    ipcRenderer.invoke('instance:acquireProjectLock', projectId),

  /** Release lock when switching projects or closing */
  releaseProjectLock: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('instance:releaseProjectLock', projectId),

  /** Check if project is open in another instance */
  isProjectLocked: (projectId: string): Promise<boolean> =>
    ipcRenderer.invoke('instance:isProjectLocked', projectId),

  /** Get information about the instance holding a lock */
  getLockHolder: (projectId: string): Promise<InstanceInfo | null> =>
    ipcRenderer.invoke('instance:getLockHolder', projectId),

  /** Get all running NERV instances */
  getRunningInstances: (): Promise<InstanceInfo[]> =>
    ipcRenderer.invoke('instance:getRunningInstances'),

  /** Force acquire lock (for "Force Open" option) */
  forceAcquireProjectLock: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('instance:forceAcquireProjectLock', projectId),

  /** Get current resource usage */
  getResourceUsage: (): Promise<ResourceLimits> =>
    ipcRenderer.invoke('instance:getResourceUsage'),

  /** Check if we can spawn a new Claude session */
  canSpawnClaudeSession: (): Promise<boolean> =>
    ipcRenderer.invoke('instance:canSpawnClaudeSession'),

  /** Focus another NERV instance by process ID (PRD Section 11) */
  focusInstance: (processId: number): Promise<boolean> =>
    ipcRenderer.invoke('instance:focusInstance', processId)
}
