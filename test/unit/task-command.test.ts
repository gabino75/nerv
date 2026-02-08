/**
 * Unit tests for CLI task command (src/cli/commands/task.ts)
 *
 * Tests the --status filter for `nerv task list` per PRD Section 12
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Mock verification module to avoid side effects
vi.mock('../../src/core/verification.js', () => ({
  verifyTask: vi.fn()
}))

import { taskCommand } from '../../src/cli/commands/task.js'
import type { Task } from '../../src/shared/types.js'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    project_id: 'proj-1',
    title: 'Test task',
    description: '',
    status: 'todo',
    task_type: 'implementation',
    priority: 'medium',
    cycle_id: null,
    worktree_path: null,
    branch_name: null,
    claude_session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  } as Task
}

const sampleTasks: Task[] = [
  makeTask({ id: 'task-001', title: 'Setup DB', status: 'done' }),
  makeTask({ id: 'task-002', title: 'Build API', status: 'in_progress' }),
  makeTask({ id: 'task-003', title: 'Write tests', status: 'todo' }),
  makeTask({ id: 'task-004', title: 'Deploy', status: 'todo' }),
  makeTask({ id: 'task-005', title: 'Review PR', status: 'review' }),
]

function createMockDb(tasks: Task[] = sampleTasks) {
  return {
    getCurrentProject: vi.fn(() => ({ id: 'proj-1', name: 'Test Project' })),
    getTasksForProject: vi.fn(() => tasks),
  } as unknown as Parameters<typeof taskCommand>[1]
}

describe('task command', () => {
  let logSpy: Mock
  let errorSpy: Mock

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  describe('list --status filter', () => {
    it('should filter tasks by status when --status flag is provided', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--status', 'todo', '--json'], db)

      const output = logSpy.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed).toHaveLength(2)
      expect(parsed.every((t: Task) => t.status === 'todo')).toBe(true)
    })

    it('should return only in_progress tasks when filtered', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--status', 'in_progress', '--json'], db)

      const output = logSpy.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].title).toBe('Build API')
    })

    it('should return empty array for status with no matching tasks', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--status', 'interrupted', '--json'], db)

      const output = logSpy.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed).toHaveLength(0)
    })

    it('should return all tasks when no --status filter', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--json'], db)

      const output = logSpy.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed).toHaveLength(5)
    })

    it('should show empty message with status context when filtered to zero', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--status', 'interrupted'], db)

      const output = logSpy.mock.calls[0][0]
      expect(output).toContain('No tasks found')
      expect(output).toContain('interrupted')
    })

    it('should exit with error for invalid status value', async () => {
      const db = createMockDb()
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

      await expect(taskCommand(['list', '--status', 'invalid'], db)).rejects.toThrow('exit')

      const errorOutput = errorSpy.mock.calls[0][0]
      expect(errorOutput).toContain('Invalid status filter')
      exitSpy.mockRestore()
    })
  })

  describe('list --json', () => {
    it('should output valid JSON for all tasks', async () => {
      const db = createMockDb()
      await taskCommand(['list', '--json'], db)

      const output = logSpy.mock.calls[0][0]
      expect(() => JSON.parse(output)).not.toThrow()
    })
  })

  describe('help text', () => {
    it('should show usage with --status flag documented', async () => {
      const db = createMockDb()
      await taskCommand([], db)

      const allOutput = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(allOutput).toContain('--status')
      expect(allOutput).toContain('list')
      expect(allOutput).toContain('create')
      expect(allOutput).toContain('update')
      expect(allOutput).toContain('verify')
    })
  })
})
