/**
 * Recovery API for error recovery and session monitoring
 */

import { ipcRenderer } from 'electron'
import type { IntegrityReport, LoopResult } from '../../shared/types'

export const recovery = {
  checkIntegrity: (): Promise<IntegrityReport> => ipcRenderer.invoke('recovery:checkIntegrity'),
  abandonTask: (taskId: string): Promise<void> => ipcRenderer.invoke('recovery:abandonTask', taskId),
  markInterrupted: (taskId: string): Promise<void> => ipcRenderer.invoke('recovery:markInterrupted', taskId),
  startMonitor: (sessionId: string, taskId: string): Promise<void> =>
    ipcRenderer.invoke('recovery:startMonitor', sessionId, taskId),
  stopMonitor: (sessionId: string): Promise<void> => ipcRenderer.invoke('recovery:stopMonitor', sessionId),
  recordOutput: (sessionId: string): Promise<void> => ipcRenderer.invoke('recovery:recordOutput', sessionId),
  recordAction: (sessionId: string, action: string): Promise<void> =>
    ipcRenderer.invoke('recovery:recordAction', sessionId, action),
  notifyCompaction: (sessionId: string, taskId: string, count: number, sinceClear: number): Promise<void> =>
    ipcRenderer.invoke('recovery:notifyCompaction', sessionId, taskId, count, sinceClear),

  // Event listeners
  onHangDetected: (callback: (sessionId: string, taskId: string, silentDuration: number) => void): void => {
    ipcRenderer.on('recovery:hangDetected', (_event, sessionId, taskId, silentDuration) =>
      callback(sessionId, taskId, silentDuration)
    )
  },
  onLoopDetected: (callback: (sessionId: string, taskId: string, loopResult: LoopResult) => void): void => {
    ipcRenderer.on('recovery:loopDetected', (_event, sessionId, taskId, loopResult) =>
      callback(sessionId, taskId, loopResult)
    )
  },
  onCompactionNotice: (callback: (sessionId: string, taskId: string, count: number, sinceClear: number) => void): void => {
    ipcRenderer.on('recovery:compactionNotice', (_event, sessionId, taskId, count, sinceClear) =>
      callback(sessionId, taskId, count, sinceClear)
    )
  },
  // PRD Section 30: Notify if approval pending for 5+ minutes
  onApprovalWaiting: (callback: (approvalId: number, taskId: string, toolName: string, waitingDuration: number) => void): void => {
    ipcRenderer.on('recovery:approvalWaiting', (_event, approvalId, taskId, toolName, waitingDuration) =>
      callback(approvalId, taskId, toolName, waitingDuration)
    )
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('recovery:hangDetected')
    ipcRenderer.removeAllListeners('recovery:loopDetected')
    ipcRenderer.removeAllListeners('recovery:compactionNotice')
    ipcRenderer.removeAllListeners('recovery:approvalWaiting')
  }
}
