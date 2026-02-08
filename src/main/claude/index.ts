/**
 * Claude Code integration
 *
 * Manages Claude Code sessions for NERV tasks.
 */

// Re-export session management functions
export {
  spawnClaude,
  resumeClaude,
  writeToClaudeSession,
  resizeClaudeSession,
  killClaudeSession,
  killAllClaudeSessions,
  hasClaudeSession,
  getClaudeSessionInfo
} from './session'

// Re-export session resource management (PRD Section 10)
export { getSessionResourceUsage, canSpawnSession } from './state'

// Re-export IPC handlers
export { registerClaudeIpcHandlers } from './ipc-handlers'

// Import directly for use in cleanup function (not from re-export to avoid bundler issues)
import { killAllClaudeSessions as killSessions } from './session'

// Cleanup on app quit
export function cleanupClaudeSessions(): void {
  killSessions()
}
