import { ipcMain, Notification } from 'electron'
import { broadcastToRenderers } from './utils'
import { databaseService } from './database'
import { existsSync } from 'fs'
import type { IntegrityIssue, IntegrityReport, DatabaseHealth, LoopResult } from '../shared/types'
import { LOOP_DETECTION, SESSION_RECOVERY } from '../shared/constants'

// Re-export types for backwards compatibility
export type { IntegrityIssue, IntegrityReport }

// Session monitoring state
interface SessionMonitor {
  sessionId: string
  taskId: string
  lastOutputTime: number
  actionHistory: string[]
  hasNotifiedHang: boolean
  hangCheckInterval?: ReturnType<typeof setInterval>
}

// Active session monitors
const sessionMonitors: Map<string, SessionMonitor> = new Map()

// Approval waiting monitor state
interface ApprovalMonitor {
  approvalId: number
  taskId: string
  toolName: string
  createdAt: number
  hasNotifiedWaiting: boolean
}

// Track pending approvals for timeout notification
const pendingApprovalMonitors: Map<number, ApprovalMonitor> = new Map()
let approvalCheckInterval: ReturnType<typeof setInterval> | null = null

// Hash an action for loop detection (simple string hash)
function hashAction(action: string): string {
  // Create a simple hash of the action string
  let hash = 0
  for (let i = 0; i < action.length; i++) {
    const char = action.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

// Detect loops in action history
function detectLoop(history: string[]): LoopResult | null {
  if (history.length < 4) return null

  const recent = history.slice(-10)

  // Detect exact repetition (same action 3+ times)
  const counts = new Map<string, number>()
  for (const action of recent) {
    counts.set(action, (counts.get(action) || 0) + 1)
    if (counts.get(action)! >= LOOP_DETECTION.repeatThreshold) {
      return { type: 'repetition', count: counts.get(action)! }
    }
  }

  // Detect A-B-A-B oscillation
  if (recent.length >= 4) {
    const last4 = recent.slice(-4)
    if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
      return { type: 'oscillation', pattern: [last4[0], last4[1]] }
    }
  }

  return null
}

// Check database health (WAL mode, schema version, integrity)
// Returns null when db is unavailable (e.g., in test mocks)
function checkDatabaseHealth(): DatabaseHealth | null {
  const health: DatabaseHealth = {
    walMode: false,
    schemaVersion: 0,
    foreignKeys: false,
    integrityOk: false,
    orphanedWorktrees: 0
  }

  try {
    const db = databaseService.getRawDb()
    if (!db) return null

    // Check WAL mode
    const journalMode = db.pragma('journal_mode') as Array<{ journal_mode: string }>
    health.walMode = journalMode[0]?.journal_mode === 'wal'
    if (!health.walMode) {
      console.warn('[NERV Recovery] Database not in WAL mode, re-enabling')
      db.pragma('journal_mode = WAL')
    }

    // Check foreign keys
    const fkResult = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>
    health.foreignKeys = fkResult[0]?.foreign_keys === 1
    if (!health.foreignKeys) {
      console.warn('[NERV Recovery] Foreign keys not enabled, re-enabling')
      db.pragma('foreign_keys = ON')
    }

    // Check schema version
    try {
      const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null } | undefined
      health.schemaVersion = versionRow?.v || 0
    } catch {
      // schema_version table might not exist
      health.schemaVersion = 0
    }

    // Run quick integrity check
    const integrityResult = db.pragma('quick_check') as Array<{ quick_check: string }>
    health.integrityOk = integrityResult[0]?.quick_check === 'ok'
    if (!health.integrityOk) {
      console.error('[NERV Recovery] Database integrity check failed:', integrityResult)
    }

    // Check for orphaned worktree references
    const tasksWithWorktrees = db.prepare(
      "SELECT worktree_path FROM tasks WHERE worktree_path IS NOT NULL AND status IN ('in_progress', 'todo')"
    ).all() as Array<{ worktree_path: string }>

    for (const row of tasksWithWorktrees) {
      if (!existsSync(row.worktree_path)) {
        health.orphanedWorktrees++
      }
    }
  } catch (error) {
    console.error('[NERV Recovery] Error checking database health:', error)
    return null
  }

  return health
}

// Run startup integrity checks
export function runStartupIntegrityChecks(): IntegrityReport {
  const issues: IntegrityIssue[] = []

  // In test mode, skip recovery dialog — interrupted tasks from previous tests are expected
  if (process.env.NERV_TEST_MODE === 'true' || process.env.NERV_TEST_MODE === '1') {
    return {
      issues: [],
      hasInterruptedTasks: false,
      timestamp: Date.now()
    }
  }

  // 1. Check database health (returns null if db unavailable)
  const databaseHealth = checkDatabaseHealth()

  if (databaseHealth) {
    if (!databaseHealth.integrityOk) {
      issues.push({
        level: 'error',
        message: 'Database integrity check failed. The database may be corrupted.',
        actions: []
      })
    }

    if (!databaseHealth.walMode) {
      issues.push({
        level: 'warning',
        message: 'Database WAL mode was not active (re-enabled)',
        actions: []
      })
    }

    if (databaseHealth.orphanedWorktrees > 0) {
      issues.push({
        level: 'warning',
        message: `Found ${databaseHealth.orphanedWorktrees} task(s) referencing non-existent worktrees`,
        actions: []
      })
    }
  }

  try {
    // 2. Check for interrupted tasks (status = 'in_progress' but no running process)
    const interruptedTasks = databaseService.getInterruptedTasks()

    for (const task of interruptedTasks) {
      const worktreeExists = task.worktree_path ? existsSync(task.worktree_path) : false
      const canResume = worktreeExists && task.session_id !== null

      issues.push({
        level: 'warning',
        message: `Task "${task.title}" was interrupted`,
        task,
        worktreeExists,
        canResume,
        actions: canResume
          ? ['resume', 'start_fresh', 'abandon']
          : worktreeExists
            ? ['start_fresh', 'abandon']
            : ['mark_interrupted', 'abandon']
      })
    }

    return {
      issues,
      hasInterruptedTasks: interruptedTasks.length > 0,
      databaseHealth: databaseHealth || undefined,
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[NERV Recovery] Error running integrity checks:', error)
    return {
      issues: [{
        level: 'error',
        message: 'Failed to check for interrupted tasks',
        actions: []
      }],
      hasInterruptedTasks: false,
      databaseHealth: databaseHealth || undefined,
      timestamp: Date.now()
    }
  }
}

// Mark task as interrupted (for graceful shutdown)
export function markTaskInterrupted(taskId: string): void {
  try {
    const task = databaseService.getTask(taskId)
    if (task && task.status === 'in_progress') {
      databaseService.updateTaskStatus(taskId, 'interrupted')
      databaseService.logAuditEvent(taskId, 'task_interrupted', JSON.stringify({
        reason: 'graceful_shutdown',
        timestamp: new Date().toISOString()
      }))
    }
  } catch (error) {
    console.error(`[NERV Recovery] Failed to mark task ${taskId} as interrupted:`, error)
  }
}

// Abandon a task (mark as interrupted and clean up)
export function abandonTask(taskId: string): void {
  try {
    databaseService.updateTaskStatus(taskId, 'interrupted')
    databaseService.logAuditEvent(taskId, 'task_abandoned', JSON.stringify({
      timestamp: new Date().toISOString()
    }))
  } catch (error) {
    console.error(`[NERV Recovery] Failed to abandon task ${taskId}:`, error)
  }
}

// Start monitoring a Claude session for hangs and loops
export function startSessionMonitor(sessionId: string, taskId: string): void {
  const monitor: SessionMonitor = {
    sessionId,
    taskId,
    lastOutputTime: Date.now(),
    actionHistory: [],
    hasNotifiedHang: false
  }

  // Set up periodic hang check
  monitor.hangCheckInterval = setInterval(() => {
    checkForHang(sessionId)
  }, SESSION_RECOVERY.hangCheckIntervalMs)

  sessionMonitors.set(sessionId, monitor)
  console.log(`[NERV Recovery] Started monitoring session ${sessionId}`)
}

// Stop monitoring a session
export function stopSessionMonitor(sessionId: string): void {
  const monitor = sessionMonitors.get(sessionId)
  if (monitor) {
    if (monitor.hangCheckInterval) {
      clearInterval(monitor.hangCheckInterval)
    }
    sessionMonitors.delete(sessionId)
    console.log(`[NERV Recovery] Stopped monitoring session ${sessionId}`)
  }
}

// Update last output time for a session
export function recordSessionOutput(sessionId: string): void {
  const monitor = sessionMonitors.get(sessionId)
  if (monitor) {
    monitor.lastOutputTime = Date.now()
    monitor.hasNotifiedHang = false // Reset hang notification on new output
  }
}

// Record an action for loop detection
export function recordSessionAction(sessionId: string, action: string): void {
  const monitor = sessionMonitors.get(sessionId)
  if (monitor) {
    const hashedAction = hashAction(action)
    monitor.actionHistory.push(hashedAction)

    // Keep history bounded
    if (monitor.actionHistory.length > LOOP_DETECTION.historySize) {
      monitor.actionHistory.shift()
    }

    // Check for loops
    const loopResult = detectLoop(monitor.actionHistory)
    if (loopResult) {
      notifyLoopDetected(sessionId, monitor.taskId, loopResult)
    }
  }
}

// Check if a session appears to be hung
function checkForHang(sessionId: string): void {
  const monitor = sessionMonitors.get(sessionId)
  if (!monitor) return

  const silentDuration = Date.now() - monitor.lastOutputTime

  if (silentDuration > SESSION_RECOVERY.hangThresholdMs && !monitor.hasNotifiedHang) {
    monitor.hasNotifiedHang = true
    notifyHangDetected(sessionId, monitor.taskId, silentDuration)
  }
}

// Notify renderer of hang detection
function notifyHangDetected(sessionId: string, taskId: string, silentDuration: number): void {
  console.log(`[NERV Recovery] Hang detected for session ${sessionId} (silent for ${Math.round(silentDuration / 1000 / 60)} minutes)`)

  // Send to renderer
  broadcastToRenderers('recovery:hangDetected', sessionId, taskId, silentDuration)

  // Show system notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'NERV: Claude may be stuck',
      body: `No output for ${Math.round(silentDuration / 1000 / 60)}+ minutes`,
      urgency: 'critical'
    })
    notification.show()
  }

  // Log to audit
  databaseService.logAuditEvent(taskId, 'hang_detected', JSON.stringify({
    sessionId,
    silentDuration,
    timestamp: new Date().toISOString()
  }))
}

// Notify renderer of loop detection
function notifyLoopDetected(sessionId: string, taskId: string, loopResult: LoopResult): void {
  console.log(`[NERV Recovery] Loop detected for session ${sessionId}:`, loopResult)

  // Send to renderer
  broadcastToRenderers('recovery:loopDetected', sessionId, taskId, loopResult)

  // Show system notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'NERV: Possible loop detected',
      body: loopResult.type === 'repetition'
        ? `Claude has repeated similar actions ${loopResult.count} times`
        : 'Claude appears to be oscillating between actions',
      urgency: 'normal'
    })
    notification.show()
  }

  // Log to audit
  databaseService.logAuditEvent(taskId, 'loop_detected', JSON.stringify({
    sessionId,
    loopResult,
    timestamp: new Date().toISOString()
  }))
}

// Send compaction notification (PRD Section 6: includes both session total and since-clear counts)
export function notifyCompaction(sessionId: string, taskId: string, compactionCount: number, compactionsSinceClear: number): void {
  // Send to renderer with both counts
  broadcastToRenderers('recovery:compactionNotice', sessionId, taskId, compactionCount, compactionsSinceClear)

  // Show system notification for first compaction
  if (compactionCount === 1 && Notification.isSupported()) {
    const notification = new Notification({
      title: 'NERV: Context Compacted',
      body: 'Claude Code automatically compacted the context window',
      urgency: 'low'
    })
    notification.show()
  }

  // Log to audit
  databaseService.logAuditEvent(taskId, 'context_compacted', JSON.stringify({
    sessionId,
    compactionCount,
    compactionsSinceClear,
    timestamp: new Date().toISOString()
  }))
}

// Get all active in-progress tasks (for graceful shutdown)
export function getActiveTaskIds(): string[] {
  return Array.from(sessionMonitors.values()).map(m => m.taskId)
}

// Clean up all monitors
export function cleanupAllMonitors(): void {
  sessionMonitors.forEach((monitor) => {
    if (monitor.hangCheckInterval) {
      clearInterval(monitor.hangCheckInterval)
    }
  })
  sessionMonitors.clear()
  stopApprovalMonitor()
}

// Start monitoring pending approvals for timeout (PRD Section 30: notify after 5+ min waiting)
export function startApprovalMonitor(): void {
  if (approvalCheckInterval) return // Already running

  approvalCheckInterval = setInterval(() => {
    checkForApprovalTimeouts()
  }, SESSION_RECOVERY.approvalCheckIntervalMs)

  console.log('[NERV Recovery] Started approval timeout monitor')
}

// Stop approval monitoring
export function stopApprovalMonitor(): void {
  if (approvalCheckInterval) {
    clearInterval(approvalCheckInterval)
    approvalCheckInterval = null
  }
  pendingApprovalMonitors.clear()
}

// Track a new pending approval
export function trackPendingApproval(approvalId: number, taskId: string, toolName: string): void {
  pendingApprovalMonitors.set(approvalId, {
    approvalId,
    taskId,
    toolName,
    createdAt: Date.now(),
    hasNotifiedWaiting: false
  })

  // Start the monitor if not already running
  if (!approvalCheckInterval) {
    startApprovalMonitor()
  }
}

// Stop tracking an approval (when resolved)
export function untrackApproval(approvalId: number): void {
  pendingApprovalMonitors.delete(approvalId)

  // Stop monitor if no more pending approvals
  if (pendingApprovalMonitors.size === 0 && approvalCheckInterval) {
    stopApprovalMonitor()
  }
}

// Check for approvals that have been waiting too long
function checkForApprovalTimeouts(): void {
  const now = Date.now()

  pendingApprovalMonitors.forEach((monitor) => {
    const waitingDuration = now - monitor.createdAt

    if (waitingDuration > SESSION_RECOVERY.approvalWaitThresholdMs && !monitor.hasNotifiedWaiting) {
      monitor.hasNotifiedWaiting = true
      notifyApprovalWaiting(monitor.approvalId, monitor.taskId, monitor.toolName, waitingDuration)
    }
  })
}

// Notify renderer of approval waiting too long (PRD Section 30)
function notifyApprovalWaiting(approvalId: number, taskId: string, toolName: string, waitingDuration: number): void {
  const minutes = Math.round(waitingDuration / 1000 / 60)
  console.log(`[NERV Recovery] Approval waiting too long: ${toolName} (${minutes}+ minutes)`)

  // Send to renderer
  broadcastToRenderers('recovery:approvalWaiting', approvalId, taskId, toolName, waitingDuration)

  // Show system notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'NERV: Claude is still waiting',
      body: `Approval needed for "${toolName}" (waiting ${minutes}+ min)`,
      urgency: 'critical'
    })
    notification.show()
  }

  // Log to audit
  databaseService.logAuditEvent(taskId, 'approval_waiting', JSON.stringify({
    approvalId,
    toolName,
    waitingDuration,
    timestamp: new Date().toISOString()
  }))
}

// Register IPC handlers for recovery operations
export function registerRecoveryIpcHandlers(): void {
  // Run startup integrity checks
  ipcMain.handle('recovery:checkIntegrity', () => {
    return runStartupIntegrityChecks()
  })

  // Abandon a task
  ipcMain.handle('recovery:abandonTask', (_event, taskId: string) => {
    abandonTask(taskId)
  })

  // Mark task as interrupted
  ipcMain.handle('recovery:markInterrupted', (_event, taskId: string) => {
    markTaskInterrupted(taskId)
  })

  // Start monitoring a session
  ipcMain.handle('recovery:startMonitor', (_event, sessionId: string, taskId: string) => {
    startSessionMonitor(sessionId, taskId)
  })

  // Stop monitoring a session
  ipcMain.handle('recovery:stopMonitor', (_event, sessionId: string) => {
    stopSessionMonitor(sessionId)
  })

  // Record output (reset hang timer)
  ipcMain.handle('recovery:recordOutput', (_event, sessionId: string) => {
    recordSessionOutput(sessionId)
  })

  // Record action (for loop detection)
  ipcMain.handle('recovery:recordAction', (_event, sessionId: string, action: string) => {
    recordSessionAction(sessionId, action)
  })

  // Manually trigger compaction notification (PRD Section 6)
  ipcMain.handle('recovery:notifyCompaction', (_event, sessionId: string, taskId: string, count: number, sinceClear: number) => {
    notifyCompaction(sessionId, taskId, count, sinceClear)
  })
}
