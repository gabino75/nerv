/**
 * Claude Code API exposed to renderer
 */

import { ipcRenderer } from 'electron'
import type { ClaudeSpawnConfig, ClaudeSpawnResult, ClaudeTokenUsage, ClaudeSessionInfo, ActiveClaudeSession } from '../../shared/types'

export const claude = {
  spawn: (config: ClaudeSpawnConfig): Promise<ClaudeSpawnResult> => ipcRenderer.invoke('claude:spawn', config),
  resume: (config: ClaudeSpawnConfig, claudeSessionId: string): Promise<ClaudeSpawnResult> =>
    ipcRenderer.invoke('claude:resume', config, claudeSessionId),
  write: (sessionId: string, data: string): Promise<void> => ipcRenderer.invoke('claude:write', sessionId, data),
  resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('claude:resize', sessionId, cols, rows),
  kill: (sessionId: string): Promise<void> => ipcRenderer.invoke('claude:kill', sessionId),
  exists: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('claude:exists', sessionId),
  getInfo: (sessionId: string): Promise<ClaudeSessionInfo | null> => ipcRenderer.invoke('claude:getInfo', sessionId),
  // PRD Section 10: Get all active sessions for Active Sessions panel
  getAllSessions: (): Promise<ActiveClaudeSession[]> => ipcRenderer.invoke('claude:getAllSessions'),
  // PRD Section 10: Pause/resume session
  pause: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('claude:pause', sessionId),
  unpause: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('claude:unpause', sessionId),
  isPaused: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('claude:isPaused', sessionId),
  // PRD Section 10: File conflict detection
  getFileConflicts: (): Promise<Array<{
    filePath: string
    sessions: Array<{ sessionId: string; accessType: string }>
  }>> => ipcRenderer.invoke('claude:getFileConflicts'),

  // Event listeners
  onData: (callback: (sessionId: string, data: string) => void): void => {
    ipcRenderer.on('claude:data', (_event, sessionId, data) => callback(sessionId, data))
  },
  onRawData: (callback: (sessionId: string, data: string) => void): void => {
    ipcRenderer.on('claude:rawData', (_event, sessionId, data) => callback(sessionId, data))
  },
  onSessionId: (callback: (sessionId: string, claudeSessionId: string) => void): void => {
    ipcRenderer.on('claude:sessionId', (_event, sessionId, claudeSessionId) => callback(sessionId, claudeSessionId))
  },
  onTokenUsage: (callback: (sessionId: string, usage: ClaudeTokenUsage, compactionCount: number, compactionsSinceClear: number) => void): void => {
    ipcRenderer.on('claude:tokenUsage', (_event, sessionId, usage, compactionCount, compactionsSinceClear) =>
      callback(sessionId, usage, compactionCount, compactionsSinceClear)
    )
  },
  onCompaction: (callback: (sessionId: string, count: number) => void): void => {
    ipcRenderer.on('claude:compaction', (_event, sessionId, count) => callback(sessionId, count))
  },
  onResult: (
    callback: (sessionId: string, result: { cost_usd?: number; duration_ms?: number; num_turns?: number }) => void
  ): void => {
    ipcRenderer.on('claude:result', (_event, sessionId, result) => callback(sessionId, result))
  },
  onExit: (callback: (sessionId: string, exitCode: number, signal?: number) => void): void => {
    ipcRenderer.on('claude:exit', (_event, sessionId, exitCode, signal) => callback(sessionId, exitCode, signal))
  },
  onSubagentSpawn: (callback: (sessionId: string, subagent: unknown) => void): void => {
    ipcRenderer.on('claude:subagentSpawn', (_event, sessionId, subagent) => callback(sessionId, subagent))
  },
  onSubagentComplete: (callback: (sessionId: string, subagent: unknown) => void): void => {
    ipcRenderer.on('claude:subagentComplete', (_event, sessionId, subagent) => callback(sessionId, subagent))
  },
  // PRD Section 10: Pause/resume events
  onPaused: (callback: (sessionId: string) => void): void => {
    ipcRenderer.on('claude:paused', (_event, sessionId) => callback(sessionId))
  },
  onResumed: (callback: (sessionId: string) => void): void => {
    ipcRenderer.on('claude:resumed', (_event, sessionId) => callback(sessionId))
  },
  // PRD Section 10: File conflict event
  onFileConflict: (callback: (conflict: {
    sessionId: string
    filePath: string
    conflictingSessionId: string
    accessType: string
  }) => void): void => {
    ipcRenderer.on('claude:fileConflict', (_event, conflict) => callback(conflict))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('claude:data')
    ipcRenderer.removeAllListeners('claude:rawData')
    ipcRenderer.removeAllListeners('claude:sessionId')
    ipcRenderer.removeAllListeners('claude:tokenUsage')
    ipcRenderer.removeAllListeners('claude:compaction')
    ipcRenderer.removeAllListeners('claude:result')
    ipcRenderer.removeAllListeners('claude:exit')
    ipcRenderer.removeAllListeners('claude:subagentSpawn')
    ipcRenderer.removeAllListeners('claude:subagentComplete')
    ipcRenderer.removeAllListeners('claude:paused')
    ipcRenderer.removeAllListeners('claude:resumed')
    ipcRenderer.removeAllListeners('claude:fileConflict')
  }
}
