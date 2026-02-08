/**
 * Instance IPC Handlers (PRD Section 11 - Multi-Instance Support)
 *
 * Handles IPC messages for multi-instance coordination including:
 * - Project lock acquisition and release
 * - Lock status checking
 * - Resource usage tracking
 */

import { BrowserWindow } from 'electron'
import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { InstanceInfo, LockAcquisitionResult, ResourceLimits } from '../../shared/types'

export function registerInstanceHandlers(): void {
  // Get the unique instance ID for this NERV process
  safeHandle('instance:getId', (): string => {
    return databaseService.getInstanceId()
  })

  // Acquire exclusive lock on a project
  safeHandle('instance:acquireProjectLock', (_event, projectId: string): LockAcquisitionResult => {
    return databaseService.acquireProjectLock(projectId)
  })

  // Release lock when switching projects or closing
  safeHandle('instance:releaseProjectLock', (_event, projectId: string): void => {
    databaseService.releaseProjectLock(projectId)
  })

  // Check if project is open in another instance
  safeHandle('instance:isProjectLocked', (_event, projectId: string): boolean => {
    return databaseService.isProjectLocked(projectId)
  })

  // Get information about the instance holding a lock
  safeHandle('instance:getLockHolder', (_event, projectId: string): InstanceInfo | null => {
    return databaseService.getLockHolder(projectId)
  })

  // Get all running NERV instances
  safeHandle('instance:getRunningInstances', (): InstanceInfo[] => {
    return databaseService.getRunningInstances()
  })

  // Force acquire lock (for "Force Open" option)
  safeHandle('instance:forceAcquireProjectLock', (_event, projectId: string): void => {
    databaseService.forceAcquireProjectLock(projectId)
  })

  // Get current resource usage
  safeHandle('instance:getResourceUsage', (): ResourceLimits => {
    return databaseService.getResourceUsage()
  })

  // Check if we can spawn a new Claude session
  safeHandle('instance:canSpawnClaudeSession', (): boolean => {
    return databaseService.canSpawnClaudeSession()
  })

  // Focus another NERV instance by process ID (PRD Section 11 - Focus Other Instance)
  safeHandle('instance:focusInstance', (_event, processId: number): boolean => {
    // On Windows, we can use BrowserWindow.getAllWindows() to find windows,
    // but those are only for this process. To focus another process's window,
    // we need to use native APIs. For cross-platform support, we'll try
    // to find a window in this process first (for testing), then fall back
    // to using Electron's remote focusing capabilities.

    // Check if this is our own process (for testing scenarios)
    if (processId === process.pid) {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        const win = windows[0]
        if (win.isMinimized()) win.restore()
        win.focus()
        return true
      }
    }

    // For other processes, we can't directly focus their windows from Electron.
    // The best we can do is return false to indicate the focus attempt.
    // A more complete implementation would use platform-specific APIs:
    // - Windows: use node-ffi to call SetForegroundWindow
    // - macOS: use AppleScript or NSRunningApplication
    // - Linux: use wmctrl or xdotool

    // For now, return false to indicate we couldn't focus externally
    // The UI should show a message to the user to manually switch
    return false
  })
}
