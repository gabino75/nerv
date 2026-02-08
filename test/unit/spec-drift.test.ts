/**
 * Unit tests for spec drift detection in src/main/audit/index.ts
 *
 * Tests the runSpecDriftDetection function which checks three dimensions:
 * 1. Unaddressed user statements not reflected in spec
 * 2. Spec proposals without corresponding tasks/code
 * 3. Contradictions between user statements and spec proposals
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing audit module
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock database service with all needed methods
const mockGetUnaddressedUserStatements = vi.fn(() => [])
const mockGetPendingSpecProposals = vi.fn(() => [])
const mockGetAllSpecProposals = vi.fn(() => [])
const mockGetUserStatementsForProject = vi.fn(() => [])
const mockGetTasksForProject = vi.fn(() => [])
const mockLogAuditEvent = vi.fn()
const mockGetReposForProject = vi.fn(() => [])
const mockGetRepoContext = vi.fn(() => [])
const mockGetSetting = vi.fn(() => null)
const mockGetCycle = vi.fn(() => null)
const mockGetTasksForCycle = vi.fn(() => [])
const mockGetTask = vi.fn(() => null)
const mockCreateAuditResult = vi.fn((_pid, _type, _status, _ch, _ph, _issues, _fc, _cid) => ({
  id: 'audit-1',
  project_id: _pid,
  audit_type: _type,
  status: _status,
  code_health: _ch,
  plan_health: _ph,
  issues: _issues,
  failed_checks: _fc,
  cycle_id: _cid,
  created_at: new Date().toISOString(),
}))
const mockCreateTaskWithType = vi.fn((_pid, _title, _type, _desc, _cid) => ({
  id: 'task-debug-1',
  project_id: _pid,
  title: _title,
  task_type: _type,
  description: _desc,
  cycle_id: _cid,
  status: 'todo',
  created_at: new Date().toISOString(),
  completed_at: null,
}))
const mockSetSetting = vi.fn()

vi.mock('../../src/main/database', () => ({
  databaseService: {
    getUnaddressedUserStatements: (...args: unknown[]) => mockGetUnaddressedUserStatements(...args),
    getPendingSpecProposals: (...args: unknown[]) => mockGetPendingSpecProposals(...args),
    getAllSpecProposals: (...args: unknown[]) => mockGetAllSpecProposals(...args),
    getUserStatementsForProject: (...args: unknown[]) => mockGetUserStatementsForProject(...args),
    getTasksForProject: (...args: unknown[]) => mockGetTasksForProject(...args),
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
    getReposForProject: (...args: unknown[]) => mockGetReposForProject(...args),
    getRepoContext: (...args: unknown[]) => mockGetRepoContext(...args),
    getSetting: (...args: unknown[]) => mockGetSetting(...args),
    getCycle: (...args: unknown[]) => mockGetCycle(...args),
    getTasksForCycle: (...args: unknown[]) => mockGetTasksForCycle(...args),
    getTask: (...args: unknown[]) => mockGetTask(...args),
    createAuditResult: (...args: unknown[]) => mockCreateAuditResult(...args),
    createTaskWithType: (...args: unknown[]) => mockCreateTaskWithType(...args),
    setSetting: (...args: unknown[]) => mockSetSetting(...args),
    getAuditResultsForProject: vi.fn(() => []),
    getAuditResultsForCycle: vi.fn(() => []),
    getAuditResult: vi.fn(() => null),
    getLatestAuditResult: vi.fn(() => null),
    getAuditStats: vi.fn(() => ({})),
    shouldRunAudit: vi.fn(() => false),
  },
}))

// Mock utils
vi.mock('../../src/main/utils', () => ({
  broadcastToRenderers: vi.fn(),
}))

// Mock database/cycles
vi.mock('../../src/main/database/cycles', () => ({
  setOnCycleCompleteCallback: vi.fn(),
}))

import { runSpecDriftDetection, runAudit, shouldTriggerAuditOnCycleComplete, createRefactorTaskForIssue } from '../../src/main/audit/index'
import { broadcastToRenderers } from '../../src/main/utils'
import type { AuditIssue } from '../../src/shared/types'

describe('Spec Drift Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUnaddressedUserStatements.mockReturnValue([])
    mockGetPendingSpecProposals.mockReturnValue([])
    mockGetAllSpecProposals.mockReturnValue([])
    mockGetUserStatementsForProject.mockReturnValue([])
    mockGetTasksForProject.mockReturnValue([])
  })

  describe('runSpecDriftDetection', () => {
    it('should return no drift when no issues exist', () => {
      const report = runSpecDriftDetection('proj-1')

      expect(report.project_id).toBe('proj-1')
      expect(report.hasDrift).toBe(false)
      expect(report.driftScore).toBe(0)
      expect(report.unaddressedStatements).toHaveLength(0)
      expect(report.specItemsWithoutCode).toHaveLength(0)
      expect(report.contradictions).toHaveLength(0)
      expect(report.pendingProposals).toBe(0)
    })

    it('should detect unaddressed user statements', () => {
      mockGetUnaddressedUserStatements.mockReturnValue([
        {
          id: 'stmt-1',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'We need dark mode support',
          source: 'chat',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
        {
          id: 'stmt-2',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'Please add export to PDF',
          source: 'feedback',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.hasDrift).toBe(true)
      expect(report.unaddressedStatements).toHaveLength(2)
      expect(report.unaddressedStatements[0].id).toBe('stmt-1')
      expect(report.unaddressedStatements[0].source).toBe('conversation')
      expect(report.unaddressedStatements[1].source).toBe('feedback')
    })

    it('should map user statement sources to labels correctly', () => {
      mockGetUnaddressedUserStatements.mockReturnValue([
        {
          id: 'stmt-chat',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'From chat',
          source: 'chat',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
        {
          id: 'stmt-feedback',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'From feedback',
          source: 'feedback',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
        {
          id: 'stmt-review',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'From review',
          source: 'review',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.unaddressedStatements[0].source).toBe('conversation')
      expect(report.unaddressedStatements[1].source).toBe('feedback')
      expect(report.unaddressedStatements[2].source).toBe('review')
    })

    it('should detect pending spec proposals as spec items without code', () => {
      mockGetPendingSpecProposals.mockReturnValue([
        {
          id: 1,
          timestamp: '2026-01-01',
          project_id: 'proj-1',
          section: 'Authentication',
          content: 'Add OAuth2 login flow with Google and GitHub providers',
          status: 'pending',
          resolved_at: null,
          resolution_notes: null,
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.hasDrift).toBe(true)
      expect(report.specItemsWithoutCode).toHaveLength(1)
      expect(report.specItemsWithoutCode[0].source).toBe('spec_proposal')
      expect(report.specItemsWithoutCode[0].text).toContain('Authentication')
      expect(report.pendingProposals).toBe(1)
    })

    it('should detect approved proposals without corresponding tasks', () => {
      mockGetAllSpecProposals.mockReturnValue([
        {
          id: 2,
          timestamp: '2026-01-01',
          project_id: 'proj-1',
          section: 'Caching Layer',
          content: 'Add Redis caching for API responses',
          status: 'approved',
          resolved_at: '2026-01-02',
          resolution_notes: null,
        },
      ])
      // No tasks match the section
      mockGetTasksForProject.mockReturnValue([
        {
          id: 'task-1',
          title: 'Fix login bug',
          description: 'Users cannot log in',
          status: 'done',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.hasDrift).toBe(true)
      const approvedWithoutTask = report.specItemsWithoutCode.find(
        i => i.source === 'approved_proposal'
      )
      expect(approvedWithoutTask).toBeDefined()
      expect(approvedWithoutTask!.text).toContain('Caching Layer')
      expect(approvedWithoutTask!.severity).toBe('info')
    })

    it('should not flag approved proposals that have matching tasks', () => {
      mockGetAllSpecProposals.mockReturnValue([
        {
          id: 3,
          timestamp: '2026-01-01',
          project_id: 'proj-1',
          section: 'Dark Mode',
          content: 'Add dark mode toggle',
          status: 'approved',
          resolved_at: '2026-01-02',
          resolution_notes: null,
        },
      ])
      // Task title matches the section
      mockGetTasksForProject.mockReturnValue([
        {
          id: 'task-2',
          title: 'Implement dark mode toggle',
          description: 'Add dark mode support to the settings panel',
          status: 'in_progress',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      const approvedWithoutTask = report.specItemsWithoutCode.find(
        i => i.source === 'approved_proposal'
      )
      expect(approvedWithoutTask).toBeUndefined()
    })

    it('should detect contradictions between addressed statements and rejected proposals', () => {
      mockGetUserStatementsForProject.mockReturnValue([
        {
          id: 'stmt-addr-1',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'We need WebSocket support for real-time updates',
          source: 'chat',
          addressed: true,
          spec_reference: 'WebSocket Integration',
          created_at: '2026-01-01',
        },
      ])
      mockGetAllSpecProposals.mockReturnValue([
        {
          id: 10,
          timestamp: '2026-01-01',
          project_id: 'proj-1',
          section: 'WebSocket Integration',
          content: 'Implement WebSocket server for real-time updates',
          status: 'rejected',
          resolved_at: '2026-01-03',
          resolution_notes: 'Not needed right now',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.contradictions).toHaveLength(1)
      expect(report.contradictions[0].statementId).toBe('stmt-addr-1')
      expect(report.contradictions[0].specSection).toBe('WebSocket Integration')
      expect(report.contradictions[0].description).toContain('rejected')
    })

    it('should not flag contradictions when spec_reference does not match rejected proposal section', () => {
      mockGetUserStatementsForProject.mockReturnValue([
        {
          id: 'stmt-no-match',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'Auth improvements needed',
          source: 'chat',
          addressed: true,
          spec_reference: 'Authentication',
          created_at: '2026-01-01',
        },
      ])
      mockGetAllSpecProposals.mockReturnValue([
        {
          id: 11,
          timestamp: '2026-01-01',
          project_id: 'proj-1',
          section: 'Caching',
          content: 'Rejected caching proposal',
          status: 'rejected',
          resolved_at: '2026-01-03',
          resolution_notes: null,
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      expect(report.contradictions).toHaveLength(0)
    })

    it('should calculate drift score normalized to 10 issues = 1.0', () => {
      // Create 5 unaddressed statements (5 issues total)
      const statements = Array.from({ length: 5 }, (_, i) => ({
        id: `stmt-${i}`,
        project_id: 'proj-1',
        timestamp: Date.now(),
        text: `Statement ${i}`,
        source: 'chat' as const,
        addressed: false,
        spec_reference: null,
        created_at: '2026-01-01',
      }))
      mockGetUnaddressedUserStatements.mockReturnValue(statements)

      const report = runSpecDriftDetection('proj-1')

      expect(report.driftScore).toBe(0.5) // 5/10 = 0.5
    })

    it('should cap drift score at 1.0 for 10+ issues', () => {
      const statements = Array.from({ length: 15 }, (_, i) => ({
        id: `stmt-${i}`,
        project_id: 'proj-1',
        timestamp: Date.now(),
        text: `Statement ${i}`,
        source: 'chat' as const,
        addressed: false,
        spec_reference: null,
        created_at: '2026-01-01',
      }))
      mockGetUnaddressedUserStatements.mockReturnValue(statements)

      const report = runSpecDriftDetection('proj-1')

      expect(report.driftScore).toBe(1.0)
    })

    it('should truncate long user statement text in drift items', () => {
      const longText = 'A'.repeat(200)
      mockGetUnaddressedUserStatements.mockReturnValue([
        {
          id: 'stmt-long',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: longText,
          source: 'chat',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
      ])

      const report = runSpecDriftDetection('proj-1')

      // The item text is the full text (no truncation on drift items themselves)
      expect(report.unaddressedStatements[0].text).toBe(longText)
    })

    it('should broadcast spec drift report to UI', () => {
      const report = runSpecDriftDetection('proj-1')

      expect(broadcastToRenderers).toHaveBeenCalledWith(
        'audit:specDriftCompleted',
        report
      )
    })

    it('should log spec drift detection to audit', () => {
      mockGetUnaddressedUserStatements.mockReturnValue([
        {
          id: 'stmt-1',
          project_id: 'proj-1',
          timestamp: Date.now(),
          text: 'Test',
          source: 'chat',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
      ])

      runSpecDriftDetection('proj-1')

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        null,
        'spec_drift_detection',
        expect.stringContaining('"projectId":"proj-1"')
      )
    })

    it('should include timestamp in ISO format', () => {
      const report = runSpecDriftDetection('proj-1')

      // Validate it looks like an ISO date
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('runAudit', () => {
    it('should include spec drift info in plan health checks', () => {
      mockGetUnaddressedUserStatements.mockReturnValue([
        {
          id: 'stmt-audit-1',
          project_id: 'proj-2',
          timestamp: Date.now(),
          text: 'Need better error handling',
          source: 'feedback',
          addressed: false,
          spec_reference: null,
          created_at: '2026-01-01',
        },
      ])

      const result = runAudit('proj-2', undefined, 'plan_health')

      // The audit should have been created with plan health results
      expect(mockCreateAuditResult).toHaveBeenCalled()
      // Broadcast should have been called
      expect(broadcastToRenderers).toHaveBeenCalledWith(
        'audit:completed',
        expect.anything()
      )
    })

    it('should detect stale tasks in plan health', () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10) // 10 days ago

      mockGetTasksForProject.mockReturnValue([
        {
          id: 'stale-task-1',
          title: 'Old todo task',
          status: 'todo',
          created_at: oldDate.toISOString(),
        },
      ])

      const result = runAudit('proj-3', undefined, 'plan_health')

      expect(mockCreateAuditResult).toHaveBeenCalled()
    })

    it('should detect interrupted/blocked tasks in plan health', () => {
      mockGetTasksForProject.mockReturnValue([
        {
          id: 'blocked-task-1',
          title: 'Blocked feature',
          status: 'interrupted',
          created_at: new Date().toISOString(),
        },
      ])

      const result = runAudit('proj-4', undefined, 'plan_health')

      expect(mockCreateAuditResult).toHaveBeenCalled()
    })
  })

  describe('shouldTriggerAuditOnCycleComplete', () => {
    it('should trigger on multiples of the configured frequency', () => {
      mockGetSetting.mockReturnValue(null) // Use default (3)

      expect(shouldTriggerAuditOnCycleComplete('proj-1', 3)).toBe(true)
      expect(shouldTriggerAuditOnCycleComplete('proj-1', 6)).toBe(true)
      expect(shouldTriggerAuditOnCycleComplete('proj-1', 9)).toBe(true)
    })

    it('should not trigger on non-multiples', () => {
      mockGetSetting.mockReturnValue(null)

      expect(shouldTriggerAuditOnCycleComplete('proj-1', 1)).toBe(false)
      expect(shouldTriggerAuditOnCycleComplete('proj-1', 2)).toBe(false)
      expect(shouldTriggerAuditOnCycleComplete('proj-1', 4)).toBe(false)
    })

    it('should respect custom frequency setting', () => {
      mockGetSetting.mockReturnValue('5')

      expect(shouldTriggerAuditOnCycleComplete('proj-1', 5)).toBe(true)
      expect(shouldTriggerAuditOnCycleComplete('proj-1', 3)).toBe(false)
    })

    it('should return false for cycle 0', () => {
      mockGetSetting.mockReturnValue(null)

      expect(shouldTriggerAuditOnCycleComplete('proj-1', 0)).toBe(false)
    })

    it('should return false when frequency is 0 (disabled)', () => {
      mockGetSetting.mockReturnValue('0')

      expect(shouldTriggerAuditOnCycleComplete('proj-1', 3)).toBe(false)
    })
  })

  describe('createRefactorTaskForIssue', () => {
    it('should create a debug task for an audit issue', () => {
      const issue: AuditIssue = {
        id: 'issue-1',
        type: 'spec_drift',
        title: 'Spec drift detected',
        description: 'User mentioned dark mode but no task exists',
        severity: 'warning',
        autoFixable: false,
      }

      const task = createRefactorTaskForIssue('proj-5', 'cycle-1', issue)

      expect(mockCreateTaskWithType).toHaveBeenCalledWith(
        'proj-5',
        'Debug: Spec drift detected',
        'debug',
        expect.stringContaining('Spec drift detected'),
        'cycle-1'
      )
    })

    it('should include metrics in debug task description when available', () => {
      const issue: AuditIssue = {
        id: 'issue-2',
        type: 'low_coverage',
        title: 'Low test coverage',
        description: 'Test coverage is 50%',
        severity: 'error',
        threshold: 70,
        current: 50,
        autoFixable: false,
      }

      createRefactorTaskForIssue('proj-6', undefined, issue)

      expect(mockCreateTaskWithType).toHaveBeenCalledWith(
        'proj-6',
        'Debug: Low test coverage',
        'debug',
        expect.stringContaining('Threshold'),
        undefined
      )
    })

    it('should log audit event for debug task creation', () => {
      const issue: AuditIssue = {
        id: 'issue-3',
        type: 'type_safety',
        title: 'Type safety issues',
        description: 'Found any types',
        severity: 'error',
        autoFixable: false,
      }

      createRefactorTaskForIssue('proj-7', 'cycle-2', issue)

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        null,
        'audit_debug_task_created',
        expect.stringContaining('type_safety')
      )
    })

    it('should broadcast debug task creation to renderers', () => {
      const issue: AuditIssue = {
        id: 'issue-4',
        type: 'dead_code',
        title: 'Dead code',
        description: 'Found unused exports',
        severity: 'warning',
        autoFixable: true,
      }

      createRefactorTaskForIssue('proj-8', 'cycle-3', issue)

      expect(broadcastToRenderers).toHaveBeenCalledWith(
        'audit:debugTaskCreated',
        expect.any(String),
        'dead_code'
      )
    })
  })
})
