/**
 * Claude session state management
 */

import type { ClaudeSession, FinishedSessionInfo, SessionFileAccess, FileAccessType } from './types'
import { SESSION_LIMITS } from '../../shared/constants'
import { databaseService } from '../database'

/**
 * Get max concurrent sessions from settings or fallback to constant (PRD Section 10)
 */
function getMaxConcurrentSessions(): number {
  try {
    const setting = databaseService.getSetting('max_concurrent_sessions')
    if (setting) {
      const value = parseInt(setting, 10)
      if (!isNaN(value) && value > 0) {
        return value
      }
    }
  } catch {
    // Database may not be initialized yet, use constant
  }
  return SESSION_LIMITS.maxConcurrentSessions
}

// Map of session ID to Claude process
export const claudeSessions: Map<string, ClaudeSession> = new Map()

// Map of session ID to final session info (for recently finished sessions)
export const finishedSessions: Map<string, FinishedSessionInfo> = new Map()

// Global file access map for conflict detection (PRD Section 10)
// Maps normalized file path -> array of session accesses
export const fileAccessMap: Map<string, SessionFileAccess[]> = new Map()

// Keep finished sessions for 1 hour
export const FINISHED_SESSION_TTL_MS = 60 * 60 * 1000

// Check if we're in mock mode
export const USE_MOCK_CLAUDE = process.env.NERV_MOCK_CLAUDE === 'true'

/**
 * Check if a new Claude session can be spawned (PRD Section 10 - Session Limits)
 * Returns { allowed: true } if session can be spawned
 * Returns { allowed: false, reason: string } if limit exceeded
 */
export function canSpawnSession(): { allowed: true } | { allowed: false; reason: string } {
  // Count active sessions (only running ones)
  const activeSessions = Array.from(claudeSessions.values()).filter(s => s.isRunning)
  const activeCount = activeSessions.length

  // Check max concurrent sessions (user-configurable per PRD Section 10)
  const maxSessions = getMaxConcurrentSessions()
  if (activeCount >= maxSessions) {
    return {
      allowed: false,
      reason: `Maximum concurrent sessions reached (${maxSessions}). Close an existing session before starting a new one.`
    }
  }

  // Check total context budget
  const totalTokens = activeSessions.reduce((sum, session) => {
    const usage = session.tokenUsage
    return sum + usage.inputTokens + usage.outputTokens
  }, 0)

  if (totalTokens >= SESSION_LIMITS.totalContextBudget) {
    return {
      allowed: false,
      reason: `Total context budget exceeded (${totalTokens.toLocaleString()}/${SESSION_LIMITS.totalContextBudget.toLocaleString()} tokens). Close or compact existing sessions.`
    }
  }

  return { allowed: true }
}

/**
 * Get current session resource usage
 */
export function getSessionResourceUsage(): {
  activeSessions: number
  maxSessions: number
  totalTokens: number
  tokenBudget: number
} {
  const activeSessions = Array.from(claudeSessions.values()).filter(s => s.isRunning)
  const totalTokens = activeSessions.reduce((sum, session) => {
    const usage = session.tokenUsage
    return sum + usage.inputTokens + usage.outputTokens
  }, 0)

  return {
    activeSessions: activeSessions.length,
    maxSessions: getMaxConcurrentSessions(),
    totalTokens,
    tokenBudget: SESSION_LIMITS.totalContextBudget
  }
}

/**
 * Normalize file path for consistent conflict detection
 */
function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

/**
 * Track file access by a session (PRD Section 10 - Conflict Detection)
 * Returns conflicting session info if another session is editing this file
 */
export function trackFileAccess(
  sessionId: string,
  filePath: string,
  accessType: FileAccessType
): { hasConflict: boolean; conflictingSession?: { sessionId: string; accessType: FileAccessType } } {
  const normalizedPath = normalizeFilePath(filePath)
  const now = Date.now()

  // Update session's active files
  const session = claudeSessions.get(sessionId)
  if (session) {
    session.activeFiles.set(normalizedPath, accessType)
  }

  // Get existing accesses for this file
  const existingAccesses = fileAccessMap.get(normalizedPath) || []

  // Check for conflicts - another session editing the same file
  for (const access of existingAccesses) {
    if (access.sessionId !== sessionId) {
      // Conflict if either session is writing/editing
      if (accessType === 'write' || accessType === 'edit' || access.accessType === 'write' || access.accessType === 'edit') {
        return {
          hasConflict: true,
          conflictingSession: {
            sessionId: access.sessionId,
            accessType: access.accessType
          }
        }
      }
    }
  }

  // Update file access map - remove stale entries from this session first
  const filteredAccesses = existingAccesses.filter(a => a.sessionId !== sessionId)
  filteredAccesses.push({
    sessionId,
    filePath: normalizedPath,
    accessType,
    timestamp: now
  })
  fileAccessMap.set(normalizedPath, filteredAccesses)

  return { hasConflict: false }
}

/**
 * Clear file access tracking for a session (called when session ends)
 */
export function clearSessionFileAccess(sessionId: string): void {
  // Remove from global map
  for (const [filePath, accesses] of fileAccessMap.entries()) {
    const filtered = accesses.filter(a => a.sessionId !== sessionId)
    if (filtered.length === 0) {
      fileAccessMap.delete(filePath)
    } else {
      fileAccessMap.set(filePath, filtered)
    }
  }
}

/**
 * Get all file conflicts for active sessions
 */
export function getActiveFileConflicts(): Array<{
  filePath: string
  sessions: Array<{ sessionId: string; accessType: FileAccessType }>
}> {
  const conflicts: Array<{
    filePath: string
    sessions: Array<{ sessionId: string; accessType: FileAccessType }>
  }> = []

  for (const [filePath, accesses] of fileAccessMap.entries()) {
    // Find files with multiple sessions where at least one is editing
    const hasEditor = accesses.some(a => a.accessType === 'write' || a.accessType === 'edit')
    if (accesses.length > 1 && hasEditor) {
      conflicts.push({
        filePath,
        sessions: accesses.map(a => ({
          sessionId: a.sessionId,
          accessType: a.accessType
        }))
      })
    }
  }

  return conflicts
}
