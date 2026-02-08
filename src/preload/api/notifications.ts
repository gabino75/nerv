/**
 * Notifications API for system-wide notifications
 */

import { ipcRenderer } from 'electron'

export interface ApprovalNotification {
  approvalId: number
  taskId: string
  toolName: string
}

export interface TaskCompletedNotification {
  taskId: string
  taskTitle: string
  projectId: string
}

export const notifications = {
  // Event listeners for notifications
  onApprovalNeeded: (callback: (data: ApprovalNotification) => void): void => {
    ipcRenderer.on('notification:approvalNeeded', (_event, data: ApprovalNotification) =>
      callback(data)
    )
  },
  onTaskCompleted: (callback: (data: TaskCompletedNotification) => void): void => {
    ipcRenderer.on('notification:taskCompleted', (_event, data: TaskCompletedNotification) =>
      callback(data)
    )
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('notification:approvalNeeded')
    ipcRenderer.removeAllListeners('notification:taskCompleted')
  }
}
