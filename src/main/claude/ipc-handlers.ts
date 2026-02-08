/**
 * Claude IPC handlers
 */

import { ipcMain } from 'electron'
import type { ClaudeSpawnConfig } from '../../shared/types'
import {
  spawnClaude,
  resumeClaude,
  writeToClaudeSession,
  resizeClaudeSession,
  killClaudeSession,
  hasClaudeSession,
  getClaudeSessionInfo,
  getAllClaudeSessions,
  pauseClaudeSession,
  resumeClaudeSession,
  isSessionPaused
} from './session'
import { getActiveFileConflicts } from './state'

export function registerClaudeIpcHandlers(): void {
  ipcMain.handle('claude:spawn', (_event, config: ClaudeSpawnConfig) => {
    return spawnClaude(config)
  })

  ipcMain.handle('claude:resume', (_event, config: ClaudeSpawnConfig, claudeSessionId: string) => {
    return resumeClaude(config, claudeSessionId)
  })

  ipcMain.handle('claude:write', (_event, sessionId: string, data: string) => {
    writeToClaudeSession(sessionId, data)
  })

  ipcMain.handle('claude:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizeClaudeSession(sessionId, cols, rows)
  })

  ipcMain.handle('claude:kill', (_event, sessionId: string) => {
    killClaudeSession(sessionId)
  })

  ipcMain.handle('claude:exists', (_event, sessionId: string) => {
    return hasClaudeSession(sessionId)
  })

  ipcMain.handle('claude:getInfo', (_event, sessionId: string) => {
    return getClaudeSessionInfo(sessionId)
  })

  // PRD Section 10: Get all active sessions for Active Sessions panel
  ipcMain.handle('claude:getAllSessions', () => {
    return getAllClaudeSessions()
  })

  // PRD Section 10: Pause a session
  ipcMain.handle('claude:pause', (_event, sessionId: string) => {
    return pauseClaudeSession(sessionId)
  })

  // PRD Section 10: Resume a paused session
  ipcMain.handle('claude:unpause', (_event, sessionId: string) => {
    return resumeClaudeSession(sessionId)
  })

  // PRD Section 10: Check if session is paused
  ipcMain.handle('claude:isPaused', (_event, sessionId: string) => {
    return isSessionPaused(sessionId)
  })

  // PRD Section 10: Get active file conflicts
  ipcMain.handle('claude:getFileConflicts', () => {
    return getActiveFileConflicts()
  })
}
