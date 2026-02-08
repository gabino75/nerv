/**
 * IPC Handler utilities
 *
 * Provides a safe wrapper for IPC handlers with consistent error handling.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'

/**
 * Wrapper for IPC handlers that ensures consistent error handling.
 * Catches synchronous errors and logs them before re-throwing.
 */
export function safeHandle<T extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: T) => R
): void {
  ipcMain.handle(channel, (event, ...args: T) => {
    try {
      return handler(event, ...args)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[NERV] IPC handler error on '${channel}':`, errorMessage)
      throw error
    }
  })
}
