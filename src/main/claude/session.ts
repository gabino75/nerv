/**
 * Claude session management
 */

import { spawn, IPty } from 'node-pty'
import { TERMINAL_DEFAULTS } from '../../shared/constants'
import type { ClaudeSpawnConfig, ClaudeSpawnResult } from '../../shared/types'
import { broadcastToRenderers } from '../utils'
import { databaseService } from '../database'
import type { ClaudeSession, TokenUsage } from './types'
import { claudeSessions, finishedSessions, FINISHED_SESSION_TTL_MS, USE_MOCK_CLAUDE, canSpawnSession, clearSessionFileAccess } from './state'
import { generateSessionId, getClaudeCommand, buildClaudeArgs } from './utils'
import { processStreamOutput, streamJsonToTerminal } from './stream-parser'
import { startSessionMonitor, stopSessionMonitor, recordSessionOutput } from '../recovery'

// Spawn Claude Code for a task
export function spawnClaude(config: ClaudeSpawnConfig): ClaudeSpawnResult {
  // Check local session limits (per-instance context budget)
  const limitCheck = canSpawnSession()
  if (!limitCheck.allowed) {
    console.warn(`[NERV] Session limit reached: ${limitCheck.reason}`)
    return { success: false, error: limitCheck.reason }
  }

  // Check system-wide session limits across all instances (PRD Section 11)
  if (!databaseService.canSpawnClaudeSession()) {
    const usage = databaseService.getResourceUsage()
    const reason = `System-wide session limit reached (${usage.activeClaudeSessions}/${usage.maxClaudeSessions}). Close a session in any NERV instance before starting a new one.`
    console.warn(`[NERV] ${reason}`)
    return { success: false, error: reason }
  }

  const id = generateSessionId()
  const { command, prependArgs } = getClaudeCommand()
  const claudeArgs = buildClaudeArgs(config)
  const args = [...prependArgs, ...claudeArgs]

  console.log(`[NERV] Mock mode: ${USE_MOCK_CLAUDE}`)
  console.log(`[NERV] Spawning Claude: ${command} ${args.join(' ')}`)
  console.log(`[NERV] Working directory: ${config.cwd}`)

  let pty: IPty
  try {
    pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: TERMINAL_DEFAULTS.cols,
      rows: TERMINAL_DEFAULTS.rows,
      cwd: config.cwd,
      env: {
        ...process.env,
        ...(config.taskId ? { NERV_TASK_ID: config.taskId } : {}),
        ...(config.agentTeams ? { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } : {}),
        NERV_PROJECT_ID: config.projectId,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      } as { [key: string]: string }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[NERV] Failed to spawn Claude: ${errorMessage}`)
    return { success: false, error: `Failed to spawn Claude: ${errorMessage}` }
  }

  const session: ClaudeSession = {
    id,
    taskId: config.taskId || null,
    projectId: config.projectId,
    pty,
    sessionId: null,
    model: config.model || 'sonnet',
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0
    },
    compactionCount: 0,
    compactionsSinceClear: 0,  // PRD Section 6: "Since last /clear" counter
    lastOutputTime: Date.now(),
    jsonBuffer: '',
    isRunning: true,
    isPaused: false,
    spawnArgs: args,
    pendingSubagents: new Map(),
    activeFiles: new Map(),
    lastAssistantText: ''
  }

  claudeSessions.set(id, session)

  // Track session count system-wide (PRD Section 11)
  databaseService.incrementClaudeSessions()

  // Start hang detection monitoring (PRD Section 21 - Error Recovery)
  if (config.taskId) {
    startSessionMonitor(id, config.taskId)
  }

  pty.onData((data: string) => {
    session.lastOutputTime = Date.now()
    // Reset hang detection timer on output (PRD Section 21)
    recordSessionOutput(id)
    processStreamOutput(session, data)

    const terminalOutput = streamJsonToTerminal(data)
    if (terminalOutput) {
      broadcastToRenderers('claude:data', id, terminalOutput)
    }

    // In benchmark mode, log Claude output to console for visibility
    if (process.env.NERV_BENCHMARK_MODE === 'true' && terminalOutput) {
      const trimmed = terminalOutput.replace(/\x1b\[[0-9;]*m/g, '').trim()
      if (trimmed) {
        console.log(`[NERV] [claude:${id.slice(-8)}] ${trimmed.slice(0, 200)}`)
      }
    }

    broadcastToRenderers('claude:rawData', id, data)
  })

  pty.onExit(({ exitCode, signal }) => {
    session.isRunning = false

    // Stop hang detection monitoring (PRD Section 21)
    stopSessionMonitor(id)

    finishedSessions.set(id, {
      taskId: session.taskId,
      projectId: session.projectId,
      claudeSessionId: session.sessionId,
      model: session.model,
      tokenUsage: { ...session.tokenUsage },
      compactionCount: session.compactionCount,
      finishedAt: Date.now(),
      lastAssistantText: session.lastAssistantText
    })

    // Clean up old finished sessions
    const now = Date.now()
    for (const [oldId, info] of finishedSessions.entries()) {
      if (now - info.finishedAt > FINISHED_SESSION_TTL_MS) {
        finishedSessions.delete(oldId)
      }
    }

    claudeSessions.delete(id)

    // Clear file access tracking for this session (PRD Section 10)
    clearSessionFileAccess(id)

    // Decrement system-wide session count (PRD Section 11)
    databaseService.decrementClaudeSessions()

    // Server-side task status update: when Claude exits successfully with a
    // linked task, transition the task to 'review'. This prevents a race
    // condition where the renderer's onExit handler fires before the spawn
    // IPC response arrives (so tab.sessionId is still null and the tab
    // lookup fails). The renderer handler is kept as a redundant safeguard.
    if (session.taskId && exitCode === 0) {
      try {
        databaseService.updateTaskStatus(session.taskId, 'review')
        console.log(`[NERV] Task ${session.taskId} → review (server-side, session ${id} exited cleanly)`)
      } catch (err) {
        console.error(`[NERV] Failed to update task status server-side:`, err)
      }
    }

    console.log(`[NERV] Claude session ${id} exited with code ${exitCode}, signal ${signal}`)

    broadcastToRenderers('claude:exit', id, exitCode, signal)
  })

  return { success: true, sessionId: id }
}

// Resume a Claude session
export function resumeClaude(config: ClaudeSpawnConfig, claudeSessionId: string): ClaudeSpawnResult {
  // Check local session limits (per-instance context budget)
  const limitCheck = canSpawnSession()
  if (!limitCheck.allowed) {
    console.warn(`[NERV] Session limit reached: ${limitCheck.reason}`)
    return { success: false, error: limitCheck.reason }
  }

  // Check system-wide session limits across all instances (PRD Section 11)
  if (!databaseService.canSpawnClaudeSession()) {
    const usage = databaseService.getResourceUsage()
    const reason = `System-wide session limit reached (${usage.activeClaudeSessions}/${usage.maxClaudeSessions}). Close a session in any NERV instance before starting a new one.`
    console.warn(`[NERV] ${reason}`)
    return { success: false, error: reason }
  }

  const id = generateSessionId()
  const { command, prependArgs } = getClaudeCommand()

  const claudeArgs: string[] = [
    '--resume', claudeSessionId,
    '--output-format', 'stream-json',
    '--verbose'
  ]

  if (config.model) {
    claudeArgs.push('--model', config.model)
  }

  const args = [...prependArgs, ...claudeArgs]

  console.log(`[NERV] Resuming Claude session: ${claudeSessionId}`)

  let pty: IPty
  try {
    pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: TERMINAL_DEFAULTS.cols,
      rows: TERMINAL_DEFAULTS.rows,
      cwd: config.cwd,
      env: {
        ...process.env,
        ...(config.taskId ? { NERV_TASK_ID: config.taskId } : {}),
        ...(config.agentTeams ? { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } : {}),
        NERV_PROJECT_ID: config.projectId,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      } as { [key: string]: string }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[NERV] Failed to resume Claude session: ${errorMessage}`)
    return { success: false, error: `Failed to resume Claude: ${errorMessage}` }
  }

  const session: ClaudeSession = {
    id,
    taskId: config.taskId || null,
    projectId: config.projectId,
    pty,
    sessionId: claudeSessionId,
    model: config.model || 'sonnet',
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0
    },
    compactionCount: 0,
    lastOutputTime: Date.now(),
    jsonBuffer: '',
    isRunning: true,
    isPaused: false,
    spawnArgs: args,
    pendingSubagents: new Map(),
    activeFiles: new Map(),
    lastAssistantText: ''
  }

  claudeSessions.set(id, session)

  // Track session count system-wide (PRD Section 11)
  databaseService.incrementClaudeSessions()

  // Start hang detection monitoring (PRD Section 21 - Error Recovery)
  if (config.taskId) {
    startSessionMonitor(id, config.taskId)
  }

  pty.onData((data: string) => {
    session.lastOutputTime = Date.now()
    // Reset hang detection timer on output (PRD Section 21)
    recordSessionOutput(id)
    processStreamOutput(session, data)

    const terminalOutput = streamJsonToTerminal(data)
    if (terminalOutput) {
      broadcastToRenderers('claude:data', id, terminalOutput)
    }
  })

  pty.onExit(({ exitCode, signal }) => {
    session.isRunning = false

    // Stop hang detection monitoring (PRD Section 21)
    stopSessionMonitor(id)

    finishedSessions.set(id, {
      taskId: session.taskId,
      projectId: session.projectId,
      claudeSessionId: session.sessionId,
      model: session.model,
      tokenUsage: { ...session.tokenUsage },
      compactionCount: session.compactionCount,
      finishedAt: Date.now(),
      lastAssistantText: session.lastAssistantText
    })

    claudeSessions.delete(id)

    // Clear file access tracking for this session (PRD Section 10)
    clearSessionFileAccess(id)

    // Decrement system-wide session count (PRD Section 11)
    databaseService.decrementClaudeSessions()

    // Server-side task status update (same race condition fix as spawnClaude)
    if (session.taskId && exitCode === 0) {
      try {
        databaseService.updateTaskStatus(session.taskId, 'review')
        console.log(`[NERV] Task ${session.taskId} → review (server-side, resumed session ${id} exited cleanly)`)
      } catch (err) {
        console.error(`[NERV] Failed to update task status server-side:`, err)
      }
    }

    broadcastToRenderers('claude:exit', id, exitCode, signal)
  })

  return { success: true, sessionId: id }
}

// Send input to Claude (for interactive sessions)
export function writeToClaudeSession(sessionId: string, data: string): void {
  const session = claudeSessions.get(sessionId)
  if (session && session.isRunning) {
    session.pty.write(data)
  }
}

// Resize Claude terminal
export function resizeClaudeSession(sessionId: string, cols: number, rows: number): void {
  const session = claudeSessions.get(sessionId)
  if (session) {
    session.pty.resize(cols, rows)
  }
}

// Kill Claude session with optional signal
export function killClaudeSession(sessionId: string, signal: string = 'SIGTERM'): void {
  const session = claudeSessions.get(sessionId)
  if (session) {
    try {
      session.pty.kill(signal)
    } catch {
      // Process may already be dead
    }
    claudeSessions.delete(sessionId)
  }
}

// Kill all Claude sessions
export function killAllClaudeSessions(): void {
  claudeSessions.forEach((session) => {
    try {
      // On Windows, SIGTERM may not work, try SIGKILL directly
      const signal = process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM'
      session.pty.kill(signal)
      // Also try SIGKILL immediately for faster cleanup
      try {
        session.pty.kill('SIGKILL')
      } catch {
        // Process already dead
      }
    } catch {
      // Process may already be dead
    }
  })
  claudeSessions.clear()
}

// Check if session exists
export function hasClaudeSession(sessionId: string): boolean {
  return claudeSessions.has(sessionId)
}

// Pause a Claude session (PRD Section 10)
// Note: This is a soft pause - the session keeps running but NERV treats it as paused
// Claude Code doesn't support mid-session pause, so this primarily affects UI/coordination
export function pauseClaudeSession(sessionId: string): boolean {
  const session = claudeSessions.get(sessionId)
  if (!session || !session.isRunning) {
    return false
  }
  session.isPaused = true
  broadcastToRenderers('claude:paused', sessionId)
  console.log(`[NERV] Session ${sessionId} paused`)
  return true
}

// Resume a paused Claude session (PRD Section 10)
export function resumeClaudeSession(sessionId: string): boolean {
  const session = claudeSessions.get(sessionId)
  if (!session || !session.isPaused) {
    return false
  }
  session.isPaused = false
  broadcastToRenderers('claude:resumed', sessionId)
  console.log(`[NERV] Session ${sessionId} resumed`)
  return true
}

// Check if session is paused
export function isSessionPaused(sessionId: string): boolean {
  const session = claudeSessions.get(sessionId)
  return session?.isPaused ?? false
}

// Get all active Claude sessions (PRD Section 10 - Active Sessions panel)
export function getAllClaudeSessions(): Array<{
  sessionId: string
  taskId: string | null
  projectId: string
  claudeSessionId: string | null
  model: string
  tokenUsage: TokenUsage
  compactionCount: number
  isRunning: boolean
  isPaused: boolean
}> {
  const sessions: Array<{
    sessionId: string
    taskId: string | null
    projectId: string
    claudeSessionId: string | null
    model: string
    tokenUsage: TokenUsage
    compactionCount: number
    isRunning: boolean
    isPaused: boolean
  }> = []

  for (const [id, session] of claudeSessions.entries()) {
    sessions.push({
      sessionId: id,
      taskId: session.taskId,
      projectId: session.projectId,
      claudeSessionId: session.sessionId,
      model: session.model,
      tokenUsage: { ...session.tokenUsage },
      compactionCount: session.compactionCount,
      isRunning: session.isRunning,
      isPaused: session.isPaused
    })
  }

  return sessions
}

// Get session info (checks both active and recently finished sessions)
export function getClaudeSessionInfo(sessionId: string): {
  taskId: string
  projectId: string
  claudeSessionId: string | null
  model: string
  tokenUsage: TokenUsage
  compactionCount: number
  isRunning: boolean
  spawnArgs: string[]
} | null {
  const session = claudeSessions.get(sessionId)
  if (session) {
    return {
      taskId: session.taskId,
      projectId: session.projectId,
      claudeSessionId: session.sessionId,
      model: session.model,
      tokenUsage: session.tokenUsage,
      compactionCount: session.compactionCount,
      isRunning: session.isRunning,
      spawnArgs: session.spawnArgs
    }
  }

  const finished = finishedSessions.get(sessionId)
  if (finished) {
    return {
      taskId: finished.taskId,
      projectId: finished.projectId,
      claudeSessionId: finished.claudeSessionId,
      model: finished.model,
      tokenUsage: finished.tokenUsage,
      compactionCount: finished.compactionCount,
      isRunning: false,
      spawnArgs: []
    }
  }

  return null
}
