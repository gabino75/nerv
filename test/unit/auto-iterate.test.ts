/**
 * Unit tests for auto-iteration orchestrator
 * src/main/verification/auto-iterate.ts (PRD Section 16, lines 3709-3770)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to create mock functions that can be referenced in vi.mock factories
const { mockVerifyTask, mockSpawnClaude, mockDatabaseService, mockBroadcast } = vi.hoisted(() => ({
  mockVerifyTask: vi.fn(),
  mockSpawnClaude: vi.fn(),
  mockBroadcast: vi.fn(),
  mockDatabaseService: {
    getTask: vi.fn(),
    getIterationSettings: vi.fn(),
    getCriteriaForTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    verification: {
      getCurrentIterationNumber: vi.fn(),
      createIteration: vi.fn(),
      completeIteration: vi.fn(),
    },
  },
}))

// Mock electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('../../src/main/database', () => ({
  databaseService: mockDatabaseService,
}))

vi.mock('../../src/main/utils', () => ({
  broadcastToRenderers: mockBroadcast,
}))

vi.mock('../../src/main/verification/index', () => ({
  verifyTask: (...args: unknown[]) => mockVerifyTask(...args),
}))

vi.mock('../../src/main/claude/session', () => ({
  spawnClaude: (...args: unknown[]) => mockSpawnClaude(...args),
}))

import {
  onSessionExitAutoIterate,
  cancelAutoIteration,
  isAutoIterating,
} from '../../src/main/verification/auto-iterate'
import { DEFAULT_ITERATION_SETTINGS } from '../../src/shared/types'

describe('Auto-Iteration Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('onSessionExitAutoIterate', () => {
    it('should return false when exit code is non-zero', async () => {
      const result = await onSessionExitAutoIterate('task-1', 1, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockDatabaseService.getTask).not.toHaveBeenCalled()
    })

    it('should return false when task does not exist', async () => {
      mockDatabaseService.getTask.mockReturnValue(null)
      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
    })

    it('should return false when auto_iterate is disabled', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: false,
      })
      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
    })

    it('should return false when no criteria exist', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([])
      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
    })

    it('should return false when max iterations reached', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        max_iterations: 3,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(3)

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockBroadcast).toHaveBeenCalledWith('autoIterate:maxReached', 'task-1', 'ask')
    })

    it('should return false when approval is required', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        max_iterations: 10,
        require_approval_after: 2,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(2)

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockBroadcast).toHaveBeenCalledWith('autoIterate:approvalRequired', 'task-1', 2)
    })

    it('should not re-spawn when all auto-criteria pass', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockResolvedValue({
        task_id: 'task-1',
        all_passed: true,
        auto_criteria_passed: true,
        manual_pending: 0,
        results: [],
        checked_at: new Date().toISOString(),
      })

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockSpawnClaude).not.toHaveBeenCalled()
      expect(mockBroadcast).toHaveBeenCalledWith(
        'autoIterate:passed',
        'task-1',
        expect.objectContaining({ auto_criteria_passed: true })
      )
    })

    it('should re-spawn Claude when criteria fail', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockResolvedValue({
        task_id: 'task-1',
        all_passed: false,
        auto_criteria_passed: false,
        manual_pending: 0,
        results: [
          { criterion_id: 'c-1', passed: false, output: 'Build failed', duration_ms: 100, checked_at: '' }
        ],
        checked_at: new Date().toISOString(),
      })

      mockSpawnClaude.mockReturnValue({ success: true, sessionId: 'session-2' })

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(true)
      expect(mockSpawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          projectId: 'proj-1',
          cwd: '/cwd',
          model: 'sonnet',
        })
      )
      expect(mockDatabaseService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress')
    })

    it('should record iteration as failed in database when criteria fail', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      const verificationResult = {
        task_id: 'task-1',
        all_passed: false,
        auto_criteria_passed: false,
        manual_pending: 0,
        results: [{ criterion_id: 'c-1', passed: false, output: 'fail', duration_ms: 50, checked_at: '' }],
        checked_at: '',
      }
      mockVerifyTask.mockResolvedValue(verificationResult)
      mockSpawnClaude.mockReturnValue({ success: true, sessionId: 'session-2' })

      await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')

      expect(mockDatabaseService.verification.completeIteration).toHaveBeenCalledWith(
        'iter-1', 'failed', expect.any(Number), undefined, verificationResult
      )
    })

    it('should record iteration as completed when criteria pass', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      const verificationResult = {
        task_id: 'task-1',
        all_passed: true,
        auto_criteria_passed: true,
        manual_pending: 0,
        results: [],
        checked_at: '',
      }
      mockVerifyTask.mockResolvedValue(verificationResult)

      await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')

      expect(mockDatabaseService.verification.completeIteration).toHaveBeenCalledWith(
        'iter-1', 'completed', expect.any(Number), undefined, verificationResult
      )
    })

    it('should broadcast manual pending when auto-criteria pass but manual remain', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockResolvedValue({
        task_id: 'task-1',
        all_passed: false,
        auto_criteria_passed: true,
        manual_pending: 2,
        results: [],
        checked_at: '',
      })

      await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')

      expect(mockBroadcast).toHaveBeenCalledWith('autoIterate:manualPending', 'task-1', 2)
      expect(mockSpawnClaude).not.toHaveBeenCalled()
    })

    it('should handle verification errors gracefully', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockRejectedValue(new Error('verification crashed'))

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockBroadcast).toHaveBeenCalledWith('autoIterate:error', 'task-1', 'verification crashed')
    })

    it('should handle spawn failure gracefully', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockResolvedValue({
        task_id: 'task-1',
        all_passed: false,
        auto_criteria_passed: false,
        manual_pending: 0,
        results: [{ criterion_id: 'c-1', passed: false, output: 'fail', duration_ms: 50, checked_at: '' }],
        checked_at: '',
      })

      mockSpawnClaude.mockReturnValue({ success: false, error: 'Session limit reached' })

      const result = await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')
      expect(result).toBe(false)
      expect(mockBroadcast).toHaveBeenCalledWith('autoIterate:error', 'task-1', 'Session limit reached')
    })

    it('should include failure details in the re-spawn prompt', async () => {
      mockDatabaseService.getTask.mockReturnValue({ id: 'task-1' })
      mockDatabaseService.getIterationSettings.mockReturnValue({
        ...DEFAULT_ITERATION_SETTINGS,
        auto_iterate: true,
        pause_between_iterations_ms: 0,
      })
      mockDatabaseService.getCriteriaForTask.mockReturnValue([{ id: 'c-1' }])
      mockDatabaseService.verification.getCurrentIterationNumber.mockReturnValue(0)
      mockDatabaseService.verification.createIteration.mockReturnValue({
        id: 'iter-1',
        iteration_number: 1,
      })

      mockVerifyTask.mockResolvedValue({
        task_id: 'task-1',
        all_passed: false,
        auto_criteria_passed: false,
        manual_pending: 0,
        results: [
          { criterion_id: 'build-check', passed: false, output: 'TS2304: Cannot find name', exit_code: 1, duration_ms: 50, checked_at: '' },
        ],
        checked_at: '',
      })

      mockSpawnClaude.mockReturnValue({ success: true, sessionId: 's-2' })

      await onSessionExitAutoIterate('task-1', 0, 'proj-1', '/cwd', null, 'sonnet')

      const spawnCall = mockSpawnClaude.mock.calls[0][0]
      expect(spawnCall.prompt).toContain('Auto-Iteration 1/5')
      expect(spawnCall.prompt).toContain('acceptance criteria failed')
      expect(spawnCall.prompt).toContain('build-check')
      expect(spawnCall.prompt).toContain('TS2304: Cannot find name')
    })
  })

  describe('cancelAutoIteration', () => {
    it('should return false when no active iteration exists', () => {
      expect(cancelAutoIteration('task-nonexistent')).toBe(false)
    })
  })

  describe('isAutoIterating', () => {
    it('should return false when no active iteration exists', () => {
      expect(isAutoIterating('task-nonexistent')).toBe(false)
    })
  })
})
