/**
 * Dialog IPC Handlers
 *
 * Handles all Electron dialog related IPC messages.
 */

import { safeHandle } from './safe-handle'

export function registerDialogHandlers(): void {
  safeHandle('dialog:selectDirectory', async (): Promise<string | null> => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] || null)
  })
}
