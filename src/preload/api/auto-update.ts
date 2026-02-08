/**
 * Auto-Update API
 *
 * Preload API for auto-update operations.
 * Implements PRD Section 22: App Auto-Update
 */

import { ipcRenderer } from 'electron'
import type {
  AutoUpdateState,
  CheckUpdateResult,
  UpdateAction
} from '../../shared/types/auto-update'

export const autoUpdate = {
  /**
   * Get the current auto-update state
   */
  getState: (): Promise<AutoUpdateState> =>
    ipcRenderer.invoke('auto-update:getState'),

  /**
   * Check for updates manually
   */
  check: (): Promise<CheckUpdateResult> =>
    ipcRenderer.invoke('auto-update:check'),

  /**
   * Download the available update
   */
  download: (): Promise<boolean> =>
    ipcRenderer.invoke('auto-update:download'),

  /**
   * Install update and restart the app
   */
  install: (): Promise<void> =>
    ipcRenderer.invoke('auto-update:install'),

  /**
   * Handle user's response to update notification
   */
  handleAction: (action: UpdateAction): Promise<void> =>
    ipcRenderer.invoke('auto-update:handleAction', action),

  /**
   * Refresh update settings (after settings change)
   */
  refreshSettings: (): Promise<void> =>
    ipcRenderer.invoke('auto-update:refreshSettings'),

  /**
   * Subscribe to auto-update state changes
   */
  onStateChange: (callback: (state: AutoUpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AutoUpdateState) => {
      callback(state)
    }
    ipcRenderer.on('auto-update:state', handler)
    return () => {
      ipcRenderer.removeListener('auto-update:state', handler)
    }
  }
}
