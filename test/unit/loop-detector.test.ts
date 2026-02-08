/**
 * Unit tests for loop detection logic in src/main/recovery.ts
 *
 * Tests the loop detection behavior through the exported session
 * monitoring API (hashAction and detectLoop are module-private).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron before importing recovery module
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  Notification: {
    isSupported: vi.fn(() => false),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock database service
vi.mock('../../src/main/database', () => ({
  databaseService: {
    logAuditEvent: vi.fn(),
    getInterruptedTasks: vi.fn(() => []),
    getTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    getRawDb: vi.fn(() => null),
  },
}))

// Mock utils
vi.mock('../../src/main/utils', () => ({
  broadcastToRenderers: vi.fn(),
}))

import {
  startSessionMonitor,
  stopSessionMonitor,
  recordSessionAction,
  recordSessionOutput,
  cleanupAllMonitors,
} from '../../src/main/recovery'
import { broadcastToRenderers } from '../../src/main/utils'
import { databaseService } from '../../src/main/database'

describe('Loop Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupAllMonitors()
  })

  afterEach(() => {
    cleanupAllMonitors()
  })

  it('should detect exact repetition (3+ identical actions)', () => {
    startSessionMonitor('session-1', 'task-1')

    // Record the same action 4 times (need at least 4 history items + 3 repeats)
    recordSessionAction('session-1', 'Read file.ts')
    recordSessionAction('session-1', 'Read file.ts')
    recordSessionAction('session-1', 'Read file.ts')
    // detectLoop needs at least 4 items in history
    recordSessionAction('session-1', 'other action')
    recordSessionAction('session-1', 'Read file.ts')
    recordSessionAction('session-1', 'Read file.ts')
    recordSessionAction('session-1', 'Read file.ts')

    // Should have detected the loop and notified
    expect(broadcastToRenderers).toHaveBeenCalledWith(
      'recovery:loopDetected',
      'session-1',
      'task-1',
      expect.objectContaining({ type: 'repetition' })
    )

    // Should have logged to audit
    expect(databaseService.logAuditEvent).toHaveBeenCalledWith(
      'task-1',
      'loop_detected',
      expect.any(String)
    )
  })

  it('should detect A-B-A-B oscillation pattern', () => {
    startSessionMonitor('session-2', 'task-2')

    // Build up enough history (need >= 4 items for detectLoop to run)
    recordSessionAction('session-2', 'Edit src/main.ts')
    recordSessionAction('session-2', 'Read src/main.ts')
    recordSessionAction('session-2', 'Edit src/main.ts')
    recordSessionAction('session-2', 'Read src/main.ts')

    // Should detect the oscillation
    expect(broadcastToRenderers).toHaveBeenCalledWith(
      'recovery:loopDetected',
      'session-2',
      'task-2',
      expect.objectContaining({ type: 'oscillation' })
    )
  })

  it('should not trigger false positives with varied actions', () => {
    startSessionMonitor('session-3', 'task-3')

    // Record varied, non-repeating actions
    recordSessionAction('session-3', 'Read file1.ts')
    recordSessionAction('session-3', 'Edit file2.ts')
    recordSessionAction('session-3', 'Bash npm test')
    recordSessionAction('session-3', 'Read file3.ts')
    recordSessionAction('session-3', 'Write output.json')
    recordSessionAction('session-3', 'Edit file4.ts')
    recordSessionAction('session-3', 'Bash git commit')

    // Should not have detected any loop
    expect(broadcastToRenderers).not.toHaveBeenCalledWith(
      'recovery:loopDetected',
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it('should bound action history to historySize (20)', () => {
    startSessionMonitor('session-4', 'task-4')

    // Record more than 20 unique actions
    for (let i = 0; i < 25; i++) {
      recordSessionAction('session-4', `unique-action-${i}`)
    }

    // Should not crash and should not detect loops with unique actions
    expect(broadcastToRenderers).not.toHaveBeenCalledWith(
      'recovery:loopDetected',
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it('should normalize actions via hashing (same content = same hash)', () => {
    startSessionMonitor('session-5', 'task-5')

    // Fill enough history for detection
    recordSessionAction('session-5', 'filler action 1')
    // Same string repeated should eventually trigger detection
    const repeatedAction = 'Read src/components/App.svelte'
    recordSessionAction('session-5', repeatedAction)
    recordSessionAction('session-5', repeatedAction)
    recordSessionAction('session-5', repeatedAction)

    expect(broadcastToRenderers).toHaveBeenCalledWith(
      'recovery:loopDetected',
      'session-5',
      'task-5',
      expect.objectContaining({ type: 'repetition', count: 3 })
    )
  })

  it('should not detect loops for non-monitored sessions', () => {
    // Don't start a monitor - actions should be silently ignored
    recordSessionAction('non-existent-session', 'action 1')
    recordSessionAction('non-existent-session', 'action 1')
    recordSessionAction('non-existent-session', 'action 1')
    recordSessionAction('non-existent-session', 'action 1')

    expect(broadcastToRenderers).not.toHaveBeenCalled()
  })

  it('should stop monitoring when stopSessionMonitor is called', () => {
    startSessionMonitor('session-6', 'task-6')
    stopSessionMonitor('session-6')

    // Actions after stopping should be ignored
    recordSessionAction('session-6', 'action 1')
    recordSessionAction('session-6', 'action 1')
    recordSessionAction('session-6', 'action 1')
    recordSessionAction('session-6', 'action 1')

    expect(broadcastToRenderers).not.toHaveBeenCalledWith(
      'recovery:loopDetected',
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it('should track output timestamps for hang detection', () => {
    startSessionMonitor('session-7', 'task-7')

    // Recording output should not trigger any loop detection
    recordSessionOutput('session-7')
    recordSessionOutput('session-7')
    recordSessionOutput('session-7')

    expect(broadcastToRenderers).not.toHaveBeenCalledWith(
      'recovery:loopDetected',
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })
})
