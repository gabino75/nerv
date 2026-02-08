/**
 * Recovery and integrity types
 */

import type { Task } from './database'

export interface IntegrityIssue {
  level: 'warning' | 'error'
  message: string
  task?: Task
  worktreeExists?: boolean
  canResume?: boolean
  actions: ('resume' | 'start_fresh' | 'abandon' | 'mark_interrupted')[]
}

export interface IntegrityReport {
  issues: IntegrityIssue[]
  hasInterruptedTasks: boolean
  /** Database health status from startup checks */
  databaseHealth?: DatabaseHealth
  timestamp: number
}

/**
 * Database health check results (PRD: State Corruption Prevention)
 */
export interface DatabaseHealth {
  /** Whether WAL mode is active */
  walMode: boolean
  /** Current schema version */
  schemaVersion: number
  /** Whether foreign keys are enabled */
  foreignKeys: boolean
  /** Result of integrity_check pragma */
  integrityOk: boolean
  /** Number of orphaned worktree references */
  orphanedWorktrees: number
}

export interface LoopResult {
  type: 'repetition' | 'oscillation'
  count?: number
  pattern?: string[]
}
