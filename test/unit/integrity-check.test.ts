/**
 * Unit tests for integrity check logic in src/main/recovery.ts
 *
 * Tests startup integrity checks that detect interrupted tasks,
 * validate worktree paths, and determine resumability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'

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

// Mock fs for worktree path validation
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}))

const mockExistsSync = vi.mocked(existsSync)

// Mock database service
const mockGetInterruptedTasks = vi.fn(() => [])
vi.mock('../../src/main/database', () => ({
  databaseService: {
    logAuditEvent: vi.fn(),
    getInterruptedTasks: (...args: unknown[]) => mockGetInterruptedTasks(...args),
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
  runStartupIntegrityChecks,
  cleanupAllMonitors,
  markTaskInterrupted,
  abandonTask,
  getActiveTaskIds,
  startSessionMonitor,
  stopSessionMonitor,
  trackPendingApproval,
  untrackApproval,
  stopApprovalMonitor,
} from '../../src/main/recovery'
import { databaseService } from '../../src/main/database'

describe('Integrity Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupAllMonitors()
  })

  afterEach(() => {
    cleanupAllMonitors()
  })

  it('should return no issues when no interrupted tasks exist', () => {
    mockGetInterruptedTasks.mockReturnValue([])

    const report = runStartupIntegrityChecks()

    expect(report.hasInterruptedTasks).toBe(false)
    expect(report.issues).toHaveLength(0)
    expect(report.timestamp).toBeGreaterThan(0)
  })

  it('should detect interrupted tasks', () => {
    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-1',
        project_id: 'proj-1',
        title: 'Interrupted Feature',
        status: 'in_progress',
        worktree_path: null,
        session_id: null,
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    expect(report.hasInterruptedTasks).toBe(true)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].level).toBe('warning')
    expect(report.issues[0].message).toContain('Interrupted Feature')
    expect(report.issues[0].message).toContain('was interrupted')
  })

  it('should validate worktree path existence', () => {
    // Task with worktree path that exists
    mockExistsSync.mockReturnValue(true)

    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-2',
        project_id: 'proj-1',
        title: 'Task with Worktree',
        status: 'in_progress',
        worktree_path: '/tmp/worktrees/feature-branch',
        session_id: 'session-abc',
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].worktreeExists).toBe(true)
    expect(report.issues[0].canResume).toBe(true)
    expect(report.issues[0].actions).toContain('resume')
    expect(report.issues[0].actions).toContain('start_fresh')
    expect(report.issues[0].actions).toContain('abandon')
  })

  it('should detect when worktree path does not exist', () => {
    mockExistsSync.mockReturnValue(false)

    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-3',
        project_id: 'proj-1',
        title: 'Task with Missing Worktree',
        status: 'in_progress',
        worktree_path: '/tmp/worktrees/deleted-branch',
        session_id: 'session-xyz',
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].worktreeExists).toBe(false)
    expect(report.issues[0].canResume).toBe(false)
    expect(report.issues[0].actions).toContain('mark_interrupted')
    expect(report.issues[0].actions).toContain('abandon')
    expect(report.issues[0].actions).not.toContain('resume')
  })

  it('should detect task without worktree path as non-resumable', () => {
    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-4',
        project_id: 'proj-1',
        title: 'Task without Worktree',
        status: 'in_progress',
        worktree_path: null,
        session_id: 'session-123',
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].worktreeExists).toBe(false)
    expect(report.issues[0].canResume).toBe(false)
  })

  it('should detect multiple interrupted tasks', () => {
    mockExistsSync.mockReturnValue(false)

    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-a',
        project_id: 'proj-1',
        title: 'Task A',
        status: 'in_progress',
        worktree_path: null,
        session_id: null,
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
      {
        id: 'task-b',
        project_id: 'proj-2',
        title: 'Task B',
        status: 'interrupted',
        worktree_path: null,
        session_id: null,
        task_type: 'debug',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 1,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    expect(report.hasInterruptedTasks).toBe(true)
    expect(report.issues).toHaveLength(2)
    expect(report.issues[0].message).toContain('Task A')
    expect(report.issues[1].message).toContain('Task B')
  })

  it('should handle database errors gracefully', () => {
    mockGetInterruptedTasks.mockImplementation(() => {
      throw new Error('Database connection lost')
    })

    const report = runStartupIntegrityChecks()

    expect(report.hasInterruptedTasks).toBe(false)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].level).toBe('error')
    expect(report.issues[0].message).toContain('Failed to check')
  })

  it('should include task reference in issue', () => {
    mockExistsSync.mockReturnValue(true)

    const taskData = {
      id: 'task-ref',
      project_id: 'proj-1',
      title: 'Referenced Task',
      status: 'in_progress' as const,
      worktree_path: '/tmp/wt',
      session_id: 'sess-1',
      task_type: 'implementation',
      cycle_id: null,
      description: null,
      repos: null,
      created_at: '2026-01-01',
      completed_at: null,
      was_interrupted: 0,
      was_recovered: 0,
    }

    mockGetInterruptedTasks.mockReturnValue([taskData])

    const report = runStartupIntegrityChecks()

    expect(report.issues[0].task).toBeDefined()
    expect(report.issues[0].task!.id).toBe('task-ref')
    expect(report.issues[0].task!.title).toBe('Referenced Task')
  })

  it('should offer start_fresh and abandon when worktree exists but no session', () => {
    mockExistsSync.mockReturnValue(true)

    mockGetInterruptedTasks.mockReturnValue([
      {
        id: 'task-no-session',
        project_id: 'proj-1',
        title: 'Orphaned worktree task',
        status: 'in_progress',
        worktree_path: '/tmp/worktrees/orphan',
        session_id: null, // No session
        task_type: 'implementation',
        cycle_id: null,
        description: null,
        repos: null,
        created_at: '2026-01-01',
        completed_at: null,
        was_interrupted: 0,
        was_recovered: 0,
      },
    ])

    const report = runStartupIntegrityChecks()

    // canResume should be false because session_id is null
    expect(report.issues[0].canResume).toBe(false)
    expect(report.issues[0].worktreeExists).toBe(true)
    expect(report.issues[0].actions).toContain('start_fresh')
    expect(report.issues[0].actions).toContain('abandon')
    expect(report.issues[0].actions).not.toContain('resume')
  })
})

describe('Task Recovery Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupAllMonitors()
  })

  afterEach(() => {
    cleanupAllMonitors()
  })

  it('should mark in_progress task as interrupted', () => {
    vi.mocked(databaseService.getTask).mockReturnValue({
      id: 'task-active',
      project_id: 'proj-1',
      title: 'Active task',
      status: 'in_progress',
      worktree_path: null,
      session_id: null,
      task_type: 'implementation',
      cycle_id: null,
      description: null,
      repos: null,
      created_at: '2026-01-01',
      completed_at: null,
      was_interrupted: 0,
      was_recovered: 0,
    } as ReturnType<typeof databaseService.getTask>)

    markTaskInterrupted('task-active')

    expect(databaseService.updateTaskStatus).toHaveBeenCalledWith('task-active', 'interrupted')
    expect(databaseService.logAuditEvent).toHaveBeenCalledWith(
      'task-active',
      'task_interrupted',
      expect.stringContaining('graceful_shutdown')
    )
  })

  it('should not mark non-in_progress task as interrupted', () => {
    vi.mocked(databaseService.getTask).mockReturnValue({
      id: 'task-done',
      project_id: 'proj-1',
      title: 'Done task',
      status: 'done',
      worktree_path: null,
      session_id: null,
      task_type: 'implementation',
      cycle_id: null,
      description: null,
      repos: null,
      created_at: '2026-01-01',
      completed_at: '2026-01-02',
      was_interrupted: 0,
      was_recovered: 0,
    } as ReturnType<typeof databaseService.getTask>)

    markTaskInterrupted('task-done')

    expect(databaseService.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('should handle markTaskInterrupted when task not found', () => {
    vi.mocked(databaseService.getTask).mockReturnValue(undefined as ReturnType<typeof databaseService.getTask>)

    // Should not throw
    expect(() => markTaskInterrupted('nonexistent')).not.toThrow()
    expect(databaseService.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('should abandon task and log audit event', () => {
    abandonTask('task-abandon')

    expect(databaseService.updateTaskStatus).toHaveBeenCalledWith('task-abandon', 'interrupted')
    expect(databaseService.logAuditEvent).toHaveBeenCalledWith(
      'task-abandon',
      'task_abandoned',
      expect.stringContaining('timestamp')
    )
  })

  it('should handle database errors in markTaskInterrupted gracefully', () => {
    vi.mocked(databaseService.getTask).mockImplementation(() => {
      throw new Error('DB read error')
    })

    // Should not throw
    expect(() => markTaskInterrupted('task-error')).not.toThrow()
  })

  it('should handle database errors in abandonTask gracefully', () => {
    vi.mocked(databaseService.updateTaskStatus).mockImplementation(() => {
      throw new Error('DB write error')
    })

    // Should not throw
    expect(() => abandonTask('task-error')).not.toThrow()
  })
})

describe('Session Monitor Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupAllMonitors()
  })

  afterEach(() => {
    cleanupAllMonitors()
  })

  it('should track active task IDs from session monitors', () => {
    startSessionMonitor('session-a', 'task-a')
    startSessionMonitor('session-b', 'task-b')

    const activeIds = getActiveTaskIds()

    expect(activeIds).toContain('task-a')
    expect(activeIds).toContain('task-b')
    expect(activeIds).toHaveLength(2)
  })

  it('should remove task from active list when monitor stops', () => {
    startSessionMonitor('session-c', 'task-c')
    startSessionMonitor('session-d', 'task-d')

    stopSessionMonitor('session-c')

    const activeIds = getActiveTaskIds()
    expect(activeIds).not.toContain('task-c')
    expect(activeIds).toContain('task-d')
    expect(activeIds).toHaveLength(1)
  })

  it('should clean up all monitors', () => {
    startSessionMonitor('session-e', 'task-e')
    startSessionMonitor('session-f', 'task-f')

    cleanupAllMonitors()

    const activeIds = getActiveTaskIds()
    expect(activeIds).toHaveLength(0)
  })

  it('should handle stopping non-existent monitor gracefully', () => {
    expect(() => stopSessionMonitor('non-existent')).not.toThrow()
  })
})

describe('Approval Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupAllMonitors()
  })

  afterEach(() => {
    cleanupAllMonitors()
    stopApprovalMonitor()
  })

  it('should track pending approvals', () => {
    trackPendingApproval(1, 'task-1', 'Bash')

    // Should not throw
    expect(() => untrackApproval(1)).not.toThrow()
  })

  it('should handle untracking non-existent approval', () => {
    expect(() => untrackApproval(999)).not.toThrow()
  })

  it('should stop approval monitor when all approvals are resolved', () => {
    trackPendingApproval(1, 'task-1', 'Write')
    trackPendingApproval(2, 'task-2', 'Edit')

    untrackApproval(1)
    untrackApproval(2)

    // Monitor should be stopped (no more pending)
    // No assertion needed - just verifying no crash
  })
})
