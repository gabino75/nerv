/**
 * Integration Tests: Database Service
 *
 * Cross-feature tests for database operations (PRD Section 27).
 * Tests service interactions without needing full Electron app.
 *
 * Uses an in-memory SQLite database with real migrations to test
 * cross-module behavior between projects, tasks, cycles, metrics,
 * audits, and approvals.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/database-migrations'
import { ProjectOperations } from '../../src/main/database/projects'
import { TaskOperations } from '../../src/main/database/tasks'
import { CycleOperations } from '../../src/main/database/cycles'
import { MetricsOperations } from '../../src/main/database/metrics'
import { AuditOperations } from '../../src/main/database/audits'
import { ApprovalOperations } from '../../src/main/database/approvals'
import { RepoOperations } from '../../src/main/database/repos'
import { DecisionOperations } from '../../src/main/database/decisions'
import { ReviewOperations } from '../../src/main/database/reviews'
import { FindingsOperations } from '../../src/main/database/findings'
import { UserStatementOperations } from '../../src/main/database/user-statements'
import { VerificationOperations } from '../../src/main/database/verification'
import { SuccessMetricsOperations } from '../../src/main/database/success-metrics'
import { SpecProposalOperations } from '../../src/main/database/spec-proposals'
import type { AuditIssue } from '../../src/shared/types'

let db: Database.Database
let projects: ProjectOperations
let tasks: TaskOperations
let cycles: CycleOperations
let metrics: MetricsOperations
let audits: AuditOperations
let approvals: ApprovalOperations
let repos: RepoOperations
let decisions: DecisionOperations
let reviews: ReviewOperations
let findings: FindingsOperations
let userStatements: UserStatementOperations
let verification: VerificationOperations
let successMetrics: SuccessMetricsOperations
let specProposals: SpecProposalOperations

let idCounter = 0
function generateId(): string {
  idCounter++
  return `test-${Date.now()}-${idCounter}`
}

function setupDatabase(): void {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run all migrations
  for (const migration of migrations) {
    db.exec(migration.up)
    // Track migration version (first migration creates schema_version table)
    if (migration.version > 1) {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
    }
  }

  const getDb = () => db

  // Initialize operations - metrics first since others depend on logAuditEvent
  metrics = new MetricsOperations(getDb)
  const logAuditEvent = (taskId: string | null, eventType: string, details: string | null) =>
    metrics.logAuditEvent(taskId, eventType, details)

  projects = new ProjectOperations(getDb, generateId)
  tasks = new TaskOperations(getDb, generateId, logAuditEvent)
  cycles = new CycleOperations(getDb, generateId, logAuditEvent)
  audits = new AuditOperations(getDb, generateId, logAuditEvent)
  approvals = new ApprovalOperations(getDb, logAuditEvent)
  repos = new RepoOperations(getDb, generateId)
  decisions = new DecisionOperations(getDb, generateId, logAuditEvent)
  reviews = new ReviewOperations(getDb, generateId, logAuditEvent)
  findings = new FindingsOperations(getDb, generateId, logAuditEvent)
  userStatements = new UserStatementOperations(getDb, generateId, logAuditEvent)
  verification = new VerificationOperations(getDb, generateId, logAuditEvent)
  successMetrics = new SuccessMetricsOperations(getDb)
  specProposals = new SpecProposalOperations(getDb, logAuditEvent)
}

describe('Database Integration', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  describe('Project-Task Relationship', () => {
    it('should create task under project', () => {
      const project = projects.createProject('Test Project', 'A test goal')
      expect(project).toBeDefined()
      expect(project.id).toBeTruthy()

      const task = tasks.createTask(project.id, 'Build feature', 'Implement the login form')
      expect(task).toBeDefined()
      expect(task.project_id).toBe(project.id)
      expect(task.title).toBe('Build feature')
      expect(task.description).toBe('Implement the login form')
      expect(task.status).toBe('todo')

      // Verify task appears in project's task list
      const projectTasks = tasks.getTasksForProject(project.id)
      expect(projectTasks).toHaveLength(1)
      expect(projectTasks[0].id).toBe(task.id)
    })

    it('should update task status and sync with project state', () => {
      const project = projects.createProject('Status Test Project')
      const task = tasks.createTask(project.id, 'Task A')

      // Move task to in_progress
      const updated = tasks.updateTaskStatus(task.id, 'in_progress')
      expect(updated).toBeDefined()
      expect(updated!.status).toBe('in_progress')
      expect(updated!.completed_at).toBeNull()

      // Complete the task
      const completed = tasks.updateTaskStatus(task.id, 'done')
      expect(completed).toBeDefined()
      expect(completed!.status).toBe('done')
      expect(completed!.completed_at).toBeTruthy()

      // Verify audit log captured status changes
      const auditLog = metrics.getAuditLog(task.id)
      const statusEvents = auditLog.filter(e => e.event_type === 'task_status_changed')
      expect(statusEvents.length).toBe(2)

      // Verify the statuses in the log details
      const statuses = statusEvents.map(e => JSON.parse(e.details!).status)
      expect(statuses).toContain('in_progress')
      expect(statuses).toContain('done')
    })

    it('should delete tasks when project is deleted', () => {
      const project = projects.createProject('Cascade Test')
      const task1 = tasks.createTask(project.id, 'Task 1')
      const task2 = tasks.createTask(project.id, 'Task 2')

      // Verify tasks exist
      expect(tasks.getTasksForProject(project.id)).toHaveLength(2)

      // Delete the project - should cascade to tasks
      projects.deleteProject(project.id)

      // Verify project is gone
      expect(projects.getProject(project.id)).toBeUndefined()

      // Verify tasks are cascade-deleted
      expect(tasks.getTask(task1.id)).toBeUndefined()
      expect(tasks.getTask(task2.id)).toBeUndefined()
      expect(tasks.getTasksForProject(project.id)).toHaveLength(0)
    })
  })

  describe('Cycle-Task Relationship', () => {
    it('should associate tasks with cycles', () => {
      const project = projects.createProject('Cycle Project')
      const cycle = cycles.createCycle(project.id, 0, 'First cycle goal')

      expect(cycle).toBeDefined()
      expect(cycle.project_id).toBe(project.id)
      expect(cycle.cycle_number).toBe(0)
      expect(cycle.goal).toBe('First cycle goal')
      expect(cycle.status).toBe('active')

      // Create tasks under this cycle
      const task1 = tasks.createTask(project.id, 'Cycle Task 1', undefined, cycle.id)
      const task2 = tasks.createTask(project.id, 'Cycle Task 2', undefined, cycle.id)

      expect(task1.cycle_id).toBe(cycle.id)
      expect(task2.cycle_id).toBe(cycle.id)

      // Verify cycle's task list
      const cycleTasks = cycles.getTasksForCycle(cycle.id)
      expect(cycleTasks).toHaveLength(2)
      expect(cycleTasks.map(t => t.id).sort()).toEqual([task1.id, task2.id].sort())
    })

    it('should track cycle completion based on task status', () => {
      const project = projects.createProject('Completion Tracking')
      const cycle = cycles.createCycle(project.id, 0, 'Finish all tasks')

      const task1 = tasks.createTask(project.id, 'Task A', undefined, cycle.id)
      const task2 = tasks.createTask(project.id, 'Task B', undefined, cycle.id)

      // Complete both tasks
      tasks.updateTaskStatus(task1.id, 'done')
      tasks.updateTaskStatus(task2.id, 'done')

      // Verify all tasks are done
      const cycleTasks = cycles.getTasksForCycle(cycle.id)
      const allDone = cycleTasks.every(t => t.status === 'done')
      expect(allDone).toBe(true)

      // Complete the cycle with learnings
      const completedCycle = cycles.completeCycle(cycle.id, 'Learned to test properly')
      expect(completedCycle).toBeDefined()
      expect(completedCycle!.status).toBe('completed')
      expect(completedCycle!.learnings).toBe('Learned to test properly')
      expect(completedCycle!.completed_at).toBeTruthy()

      // Verify active cycle is gone for this project
      const activeCycle = cycles.getActiveCycle(project.id)
      expect(activeCycle).toBeUndefined()

      // Verify next cycle number incremented
      const nextNumber = cycles.getNextCycleNumber(project.id)
      expect(nextNumber).toBe(1)
    })
  })

  describe('Session Metrics', () => {
    it('should record session metrics for cost tracking', () => {
      const project = projects.createProject('Metrics Project')
      const task = tasks.createTask(project.id, 'Costly Task')

      // Record initial metrics
      const sessionMetrics = metrics.updateSessionMetrics(task.id, {
        inputTokens: 5000,
        outputTokens: 2000,
        costUsd: 0.15,
        durationMs: 30000,
        numTurns: 5,
        model: 'claude-sonnet-4-5-20250929',
        sessionId: 'session-123'
      })

      expect(sessionMetrics).toBeDefined()
      expect(sessionMetrics.task_id).toBe(task.id)
      expect(sessionMetrics.input_tokens).toBe(5000)
      expect(sessionMetrics.output_tokens).toBe(2000)
      expect(sessionMetrics.cost_usd).toBe(0.15)
      expect(sessionMetrics.duration_ms).toBe(30000)
      expect(sessionMetrics.num_turns).toBe(5)
      expect(sessionMetrics.model).toBe('claude-sonnet-4-5-20250929')

      // Update existing metrics (should update in place)
      const updatedMetrics = metrics.updateSessionMetrics(task.id, {
        inputTokens: 10000,
        outputTokens: 4000,
        costUsd: 0.30,
        numTurns: 10
      })

      expect(updatedMetrics.input_tokens).toBe(10000)
      expect(updatedMetrics.output_tokens).toBe(4000)
      expect(updatedMetrics.cost_usd).toBe(0.30)
      expect(updatedMetrics.num_turns).toBe(10)

      // Verify only one metrics row exists for this task
      const retrieved = metrics.getSessionMetrics(task.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.cost_usd).toBe(0.30)
    })

    it('should aggregate metrics by project', () => {
      const project1 = projects.createProject('Project Alpha')
      const project2 = projects.createProject('Project Beta')

      const task1a = tasks.createTask(project1.id, 'P1 Task A')
      const task1b = tasks.createTask(project1.id, 'P1 Task B')
      const task2a = tasks.createTask(project2.id, 'P2 Task A')

      // Record metrics for project 1 tasks
      metrics.updateSessionMetrics(task1a.id, {
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.10,
        model: 'claude-sonnet-4-5-20250929'
      })
      metrics.updateSessionMetrics(task1b.id, {
        inputTokens: 2000,
        outputTokens: 1000,
        costUsd: 0.20,
        model: 'claude-sonnet-4-5-20250929'
      })

      // Record metrics for project 2 task
      metrics.updateSessionMetrics(task2a.id, {
        inputTokens: 3000,
        outputTokens: 1500,
        costUsd: 0.35,
        model: 'claude-opus-4-6'
      })

      // Get all metrics and verify totals
      const allMetrics = metrics.getAllSessionMetrics()
      expect(allMetrics).toHaveLength(3)

      const totalCost = allMetrics.reduce((sum, m) => sum + m.cost_usd, 0)
      expect(totalCost).toBeCloseTo(0.65, 2)

      // Get model stats - aggregated by model
      const modelStats = metrics.getModelStats()
      expect(modelStats.length).toBeGreaterThanOrEqual(1)

      const sonnetStats = modelStats.find(m => m.model === 'claude-sonnet-4-5-20250929')
      if (sonnetStats) {
        expect(sonnetStats.task_count).toBe(2)
        expect(sonnetStats.total_cost_usd).toBeCloseTo(0.30, 2)
      }

      const opusStats = modelStats.find(m => m.model === 'claude-opus-4-6')
      if (opusStats) {
        expect(opusStats.task_count).toBe(1)
        expect(opusStats.total_cost_usd).toBeCloseTo(0.35, 2)
      }
    })
  })

  describe('Audit Integration', () => {
    it('should record audit results', () => {
      const project = projects.createProject('Audit Project')
      const cycle = cycles.createCycle(project.id, 0, 'Audit cycle')

      const codeHealth = {
        testCoverage: 85,
        dryViolations: 2,
        typeErrors: 0,
        deadCodeCount: 3,
        complexFunctions: 1,
        passed: true
      }

      const planHealth = {
        specMatches: true,
        specDrift: [],
        staleTasks: [],
        blockedTasks: [],
        passed: true
      }

      const issues: AuditIssue[] = [
        {
          id: 'issue-1',
          type: 'dry_violation',
          title: 'Duplicate color constants',
          description: 'Colors duplicated across 5 files',
          severity: 'warning',
          threshold: 0,
          current: 2,
          autoFixable: true
        }
      ]

      const auditResult = audits.createAuditResult(
        project.id,
        'full',
        'warning',
        codeHealth,
        planHealth,
        issues,
        ['dry_check'],
        cycle.id
      )

      expect(auditResult).toBeDefined()
      expect(auditResult.project_id).toBe(project.id)
      expect(auditResult.cycle_id).toBe(cycle.id)
      expect(auditResult.audit_type).toBe('full')
      expect(auditResult.status).toBe('warning')
      expect(auditResult.code_health).toEqual(codeHealth)
      expect(auditResult.plan_health).toEqual(planHealth)
      expect(auditResult.issues).toHaveLength(1)
      expect(auditResult.issues[0].title).toBe('Duplicate color constants')
      expect(auditResult.failed_checks).toEqual(['dry_check'])

      // Verify retrieval methods
      const latest = audits.getLatestAuditResult(project.id)
      expect(latest).toBeDefined()
      expect(latest!.id).toBe(auditResult.id)

      const byProject = audits.getAuditResultsForProject(project.id)
      expect(byProject).toHaveLength(1)

      const byCycle = audits.getAuditResultsForCycle(cycle.id)
      expect(byCycle).toHaveLength(1)

      // Verify stats
      const stats = audits.getAuditStats(project.id)
      expect(stats.total).toBe(1)
      expect(stats.warning).toBe(1)
      expect(stats.passed).toBe(0)
      expect(stats.failed).toBe(0)
    })

    it('should create tasks from audit failures', () => {
      const project = projects.createProject('Auto-fix Project')

      const issues: AuditIssue[] = [
        {
          id: 'issue-dry',
          type: 'dry_violation',
          title: 'Duplicate color constants',
          description: 'Colors duplicated in 5 files',
          severity: 'error',
          autoFixable: true
        },
        {
          id: 'issue-dead',
          type: 'dead_code',
          title: 'Unused TerminalPanel export',
          description: 'TerminalPanel.svelte is not imported anywhere',
          severity: 'warning',
          autoFixable: true
        }
      ]

      // Record the failed audit
      audits.createAuditResult(
        project.id,
        'code_health',
        'failed',
        null,
        null,
        issues,
        ['dry_check', 'dead_code_check']
      )

      // Simulate auto-creation of refactor tasks from audit failures
      // (This is what the audit system does in production)
      for (const issue of issues.filter(i => i.autoFixable)) {
        tasks.createTaskWithType(
          project.id,
          `[Auto-fix] ${issue.title}`,
          'implementation',
          issue.description
        )
      }

      // Verify the auto-created tasks
      const projectTasks = tasks.getTasksForProject(project.id)
      expect(projectTasks).toHaveLength(2)

      const taskTitles = projectTasks.map(t => t.title)
      expect(taskTitles).toContain('[Auto-fix] Duplicate color constants')
      expect(taskTitles).toContain('[Auto-fix] Unused TerminalPanel export')

      // Verify task types
      for (const task of projectTasks) {
        expect(task.task_type).toBe('implementation')
        expect(task.status).toBe('todo')
      }
    })
  })
})

describe('Permission Integration', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should queue approval requests', () => {
    const project = projects.createProject('Permission Project')
    const task = tasks.createTask(project.id, 'Risky Task')

    // Create approval requests for dangerous operations
    const approval1 = approvals.createApproval(
      task.id,
      'Bash',
      'rm -rf node_modules',
      'Task wants to clean dependencies'
    )

    const approval2 = approvals.createApproval(
      task.id,
      'Write',
      '/etc/hosts',
      'Task wants to modify hosts file'
    )

    expect(approval1).toBeDefined()
    expect(approval1.task_id).toBe(task.id)
    expect(approval1.tool_name).toBe('Bash')
    expect(approval1.tool_input).toBe('rm -rf node_modules')
    expect(approval1.status).toBe('pending')

    expect(approval2).toBeDefined()
    expect(approval2.tool_name).toBe('Write')

    // Verify pending approvals queue
    const pending = approvals.getPendingApprovals(task.id)
    expect(pending).toHaveLength(2)
    expect(pending[0].tool_name).toBe('Bash')
    expect(pending[1].tool_name).toBe('Write')

    // Verify global pending list
    const allPending = approvals.getPendingApprovals()
    expect(allPending).toHaveLength(2)
  })

  it('should store approval decisions', () => {
    const project = projects.createProject('Decision Project')
    const task = tasks.createTask(project.id, 'Decision Task')

    const approval = approvals.createApproval(
      task.id,
      'Bash',
      'git push --force',
      'Force pushing to remote'
    )

    // Deny the approval
    const denied = approvals.resolveApproval(approval.id, 'denied', 'Force push is not allowed')
    expect(denied).toBeDefined()
    expect(denied!.status).toBe('denied')
    expect(denied!.deny_reason).toBe('Force push is not allowed')
    expect(denied!.decided_at).toBeTruthy()

    // Create and approve another
    const approval2 = approvals.createApproval(task.id, 'Bash', 'npm install')
    const approved = approvals.resolveApproval(approval2.id, 'approved')
    expect(approved).toBeDefined()
    expect(approved!.status).toBe('approved')
    expect(approved!.deny_reason).toBeNull()

    // Verify no more pending approvals
    const pending = approvals.getPendingApprovals(task.id)
    expect(pending).toHaveLength(0)

    // Verify all approvals are persisted
    const allApprovals = approvals.getAllApprovals()
    expect(allApprovals).toHaveLength(2)

    // Verify audit log captured the events
    const auditLog = metrics.getAuditLog(task.id)
    const approvalEvents = auditLog.filter(e =>
      e.event_type === 'approval_requested' || e.event_type === 'approval_resolved'
    )
    // 2 requests + 2 resolutions = 4 events
    expect(approvalEvents).toHaveLength(4)
  })

  it('should update settings from always/never rules', () => {
    // Simulate storing permission learning as settings
    // When a user says "always allow" or "never allow", it becomes a setting
    projects.setSetting('permission.bash.npm_install', 'always')
    projects.setSetting('permission.bash.rm_rf', 'never')
    projects.setSetting('permission.write.src_files', 'always')

    // Verify settings are persisted
    expect(projects.getSetting('permission.bash.npm_install')).toBe('always')
    expect(projects.getSetting('permission.bash.rm_rf')).toBe('never')
    expect(projects.getSetting('permission.write.src_files')).toBe('always')

    // Update a setting (user changes their mind)
    projects.setSetting('permission.bash.rm_rf', 'always')
    expect(projects.getSetting('permission.bash.rm_rf')).toBe('always')

    // Remove a permission setting
    projects.setSetting('permission.write.src_files', null)
    expect(projects.getSetting('permission.write.src_files')).toBeUndefined()

    // Non-existent setting returns undefined
    expect(projects.getSetting('permission.nonexistent')).toBeUndefined()
  })
})

describe('Project CRUD', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should list all projects', () => {
    expect(projects.getAllProjects()).toHaveLength(0)

    projects.createProject('Alpha')
    projects.createProject('Beta')
    projects.createProject('Gamma')

    const all = projects.getAllProjects()
    expect(all).toHaveLength(3)
    // Ordered by created_at DESC - most recent first
    const names = all.map(p => p.name)
    expect(names).toContain('Alpha')
    expect(names).toContain('Beta')
    expect(names).toContain('Gamma')
  })

  it('should update project fields', () => {
    const project = projects.createProject('Original Name', 'Original Goal')
    expect(project.name).toBe('Original Name')
    expect(project.goal).toBe('Original Goal')

    const updated = projects.updateProject(project.id, {
      name: 'Updated Name',
      goal: 'Updated Goal',
      constraints: '["no-force-push", "test-before-merge"]',
      review_mode: 'yolo'
    })

    expect(updated).toBeDefined()
    expect(updated!.name).toBe('Updated Name')
    expect(updated!.goal).toBe('Updated Goal')
    expect(updated!.constraints).toBe('["no-force-push", "test-before-merge"]')
    expect(updated!.review_mode).toBe('yolo')
  })

  it('should track current project via settings', () => {
    const p1 = projects.createProject('Project One')
    const p2 = projects.createProject('Project Two')

    // No current project set
    expect(projects.getCurrentProjectId()).toBeUndefined()

    // Set current project
    projects.setCurrentProjectId(p1.id)
    expect(projects.getCurrentProjectId()).toBe(p1.id)

    const current = projects.getCurrentProject()
    expect(current).toBeDefined()
    expect(current!.id).toBe(p1.id)

    // Switch current project
    projects.setCurrentProjectId(p2.id)
    expect(projects.getCurrentProject()!.id).toBe(p2.id)

    // Clear current project - should fallback to first project
    projects.setCurrentProjectId(null)
    expect(projects.getCurrentProjectId()).toBeUndefined()
    // getCurrentProject fallback: returns first project (most recent)
    const fallback = projects.getCurrentProject()
    expect(fallback).toBeDefined()
  })

  it('should return undefined for non-existent project', () => {
    expect(projects.getProject('non-existent-id')).toBeUndefined()
  })
})

describe('Repo Management', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should add repos to a project', () => {
    const project = projects.createProject('Repo Project')

    const repo = repos.createRepo(project.id, 'nerv', '/home/user/git/nerv', {
      stack: 'electron,svelte,typescript',
      sourceType: 'local',
      baseBranch: 'main'
    })

    expect(repo).toBeDefined()
    expect(repo.project_id).toBe(project.id)
    expect(repo.name).toBe('nerv')
    expect(repo.path).toBe('/home/user/git/nerv')
    expect(repo.stack).toBe('electron,svelte,typescript')
    expect(repo.source_type).toBe('local')
    expect(repo.base_branch).toBe('main')

    const projectRepos = repos.getReposForProject(project.id)
    expect(projectRepos).toHaveLength(1)
    expect(projectRepos[0].id).toBe(repo.id)
  })

  it('should cascade delete repos when project is deleted', () => {
    const project = projects.createProject('Cascade Repo Project')
    const repo = repos.createRepo(project.id, 'my-repo', '/tmp/my-repo')

    expect(repos.getReposForProject(project.id)).toHaveLength(1)

    projects.deleteProject(project.id)

    expect(repos.getReposForProject(project.id)).toHaveLength(0)
  })

  it('should manage documentation sources', () => {
    const project = projects.createProject('Docs Project')

    const docSource = repos.createDocumentationSource(
      project.id,
      'React Docs',
      'https://react.dev/reference/*'
    )

    expect(docSource).toBeDefined()
    expect(docSource.name).toBe('React Docs')
    expect(docSource.url_pattern).toBe('https://react.dev/reference/*')

    // Create another doc source
    repos.createDocumentationSource(project.id, 'MDN', 'https://developer.mozilla.org/*')

    const sources = repos.getDocumentationSources(project.id)
    expect(sources).toHaveLength(2)

    // Update doc source
    const updated = repos.updateDocumentationSource(docSource.id, {
      name: 'React Reference',
      urlPattern: 'https://react.dev/reference/**'
    })
    expect(updated).toBeDefined()
    expect(updated!.name).toBe('React Reference')

    // Delete doc source
    repos.deleteDocumentationSource(docSource.id)
    expect(repos.getDocumentationSources(project.id)).toHaveLength(1)
  })

  it('should manage repo context entries', () => {
    const project = projects.createProject('Context Project')
    const repo = repos.createRepo(project.id, 'my-app', '/tmp/my-app')

    const context = repos.createRepoContext({
      repo_id: repo.id,
      context_type: 'claude_md',
      file_path: '/tmp/my-app/CLAUDE.md',
      content: '# My App\n\nUse TypeScript strict mode.',
      parsed_sections: JSON.stringify({ standards: ['typescript strict'] }),
      last_scanned_at: Date.now(),
      file_hash: 'abc123'
    })

    expect(context).toBeDefined()
    expect(context.context_type).toBe('claude_md')
    expect(context.content).toContain('TypeScript strict mode')

    // Retrieve by type
    const claudeMd = repos.getRepoContextByType(repo.id, 'claude_md')
    expect(claudeMd).toBeDefined()
    expect(claudeMd!.id).toBe(context.id)

    // Update context
    const updated = repos.updateRepoContext(context.id, {
      content: '# Updated\n\nNew content.',
      file_hash: 'def456'
    })
    expect(updated).toBeDefined()
    expect(updated!.content).toBe('# Updated\n\nNew content.')
    expect(updated!.file_hash).toBe('def456')

    // Get all contexts for repo
    const allContexts = repos.getRepoContext(repo.id)
    expect(allContexts).toHaveLength(1)

    // Delete contexts for repo
    repos.deleteRepoContext(repo.id)
    expect(repos.getRepoContext(repo.id)).toHaveLength(0)
  })

  it('should manage repo skills', () => {
    const project = projects.createProject('Skills Project')
    const repo = repos.createRepo(project.id, 'my-app', '/tmp/my-app')

    const skill = repos.createRepoSkill({
      repo_id: repo.id,
      skill_name: 'test',
      skill_path: '.claude/skills/test/SKILL.md',
      description: 'Run the test suite',
      trigger_pattern: '/test',
      content: 'Run `npm test` and report results'
    })

    expect(skill).toBeDefined()
    expect(skill.skill_name).toBe('test')

    // Retrieve skill by name
    const retrieved = repos.getRepoSkill(repo.id, 'test')
    expect(retrieved).toBeDefined()
    expect(retrieved!.description).toBe('Run the test suite')

    // Upsert skill - should update existing
    const upserted = repos.upsertRepoSkill({
      repo_id: repo.id,
      skill_name: 'test',
      skill_path: '.claude/skills/test/SKILL.md',
      description: 'Run test suite v2',
      trigger_pattern: '/test',
      content: 'Run `npm test` with coverage'
    })
    expect(upserted.description).toBe('Run test suite v2')

    // Verify only one skill exists (upsert, not insert)
    expect(repos.getRepoSkills(repo.id)).toHaveLength(1)

    // Get project-level skills
    const projectSkills = repos.getProjectSkills(project.id)
    expect(projectSkills).toHaveLength(1)

    // Delete all skills for repo
    repos.deleteRepoSkills(repo.id)
    expect(repos.getRepoSkills(repo.id)).toHaveLength(0)
  })
})

describe('Decision and Branch Operations', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and retrieve decisions', () => {
    const project = projects.createProject('Decision Project')
    const cycle = cycles.createCycle(project.id, 0, 'Initial cycle')

    const decision = decisions.createDecision(
      project.id,
      'Use SQLite for persistence',
      'SQLite is embedded, no server needed',
      cycle.id,
      'PostgreSQL, IndexedDB'
    )

    expect(decision).toBeDefined()
    expect(decision.project_id).toBe(project.id)
    expect(decision.cycle_id).toBe(cycle.id)
    expect(decision.title).toBe('Use SQLite for persistence')
    expect(decision.rationale).toBe('SQLite is embedded, no server needed')
    expect(decision.alternatives).toBe('PostgreSQL, IndexedDB')

    // Retrieve by project
    const projectDecisions = decisions.getDecisionsForProject(project.id)
    expect(projectDecisions).toHaveLength(1)

    // Retrieve by cycle
    const cycleDecisions = decisions.getDecisionsForCycle(cycle.id)
    expect(cycleDecisions).toHaveLength(1)

    // Retrieve by ID
    const fetched = decisions.getDecision(decision.id)
    expect(fetched).toBeDefined()
    expect(fetched!.title).toBe('Use SQLite for persistence')
  })

  it('should update and delete decisions', () => {
    const project = projects.createProject('Update Decision Project')

    const decision = decisions.createDecision(
      project.id,
      'Original title',
      'Original rationale'
    )

    const updated = decisions.updateDecision(decision.id, {
      title: 'Revised title',
      rationale: 'Better rationale',
      alternatives: 'Option A, Option B'
    })

    expect(updated).toBeDefined()
    expect(updated!.title).toBe('Revised title')
    expect(updated!.rationale).toBe('Better rationale')
    expect(updated!.alternatives).toBe('Option A, Option B')

    // Delete
    decisions.deleteDecision(decision.id)
    expect(decisions.getDecision(decision.id)).toBeUndefined()
  })

  it('should create and manage branches', () => {
    const project = projects.createProject('Branch Project')
    const task = tasks.createTask(project.id, 'Branching Task')

    const branch = decisions.createBranch(task.id, 'session-abc')

    expect(branch).toBeDefined()
    expect(branch.parent_task_id).toBe(task.id)
    expect(branch.parent_session_id).toBe('session-abc')
    expect(branch.status).toBe('active')

    // Update branch status
    const merged = decisions.updateBranchStatus(branch.id, 'merged', 'Feature completed successfully')
    expect(merged).toBeDefined()
    expect(merged!.status).toBe('merged')
    expect(merged!.summary).toBe('Feature completed successfully')

    // Get branches for task
    const taskBranches = decisions.getBranchesForTask(task.id)
    expect(taskBranches).toHaveLength(1)
    expect(taskBranches[0].status).toBe('merged')
  })
})

describe('Review Workflow', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and approve a review', () => {
    const project = projects.createProject('Review Project')
    const task = tasks.createTask(project.id, 'Review Task')

    const review = reviews.createReview(task.id)

    expect(review).toBeDefined()
    expect(review.task_id).toBe(task.id)
    expect(review.status).toBe('pending')

    // Verify pending reviews list
    const pending = reviews.getPendingReviews()
    expect(pending).toHaveLength(1)

    // Approve the review
    const approved = reviews.approveReview(task.id, 'Looks good to merge')
    expect(approved).toBeDefined()
    expect(approved!.status).toBe('approved')
    expect(approved!.reviewer_notes).toBe('Looks good to merge')
    expect(approved!.decided_at).toBeTruthy()

    // No more pending reviews
    expect(reviews.getPendingReviews()).toHaveLength(0)
  })

  it('should reject a review', () => {
    const project = projects.createProject('Reject Review Project')
    const task = tasks.createTask(project.id, 'Needs Work Task')

    reviews.createReview(task.id)

    const rejected = reviews.rejectReview(task.id, 'Tests are failing, fix before merge')
    expect(rejected).toBeDefined()
    expect(rejected!.status).toBe('rejected')
    expect(rejected!.reviewer_notes).toBe('Tests are failing, fix before merge')

    // Cannot approve an already-rejected review
    const secondApproval = reviews.approveReview(task.id)
    expect(secondApproval).toBeUndefined()
  })

  it('should retrieve review for a task', () => {
    const project = projects.createProject('Retrieval Project')
    const task = tasks.createTask(project.id, 'Task with Review')

    // No review initially
    expect(reviews.getReviewForTask(task.id)).toBeUndefined()

    reviews.createReview(task.id)

    const review = reviews.getReviewForTask(task.id)
    expect(review).toBeDefined()
    expect(review!.task_id).toBe(task.id)
  })
})

describe('Debug Findings', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and retrieve findings', () => {
    const project = projects.createProject('Debug Project')
    const task = tasks.createTask(project.id, 'Debug Task')

    const finding = findings.createFinding(
      task.id,
      'root_cause',
      'Null pointer in handler',
      'The request handler does not check for null user',
      'if (user === null) { throw new Error("No user") }',
      'src/handler.ts',
      1
    )

    expect(finding).toBeDefined()
    expect(finding.task_id).toBe(task.id)
    expect(finding.finding_type).toBe('root_cause')
    expect(finding.title).toBe('Null pointer in handler')
    expect(finding.code_snippet).toContain('user === null')
    expect(finding.file_path).toBe('src/handler.ts')
    expect(finding.priority).toBe(1)

    // Get findings for task
    const taskFindings = findings.getFindingsForTask(task.id)
    expect(taskFindings).toHaveLength(1)

    // Get by type
    const rootCauses = findings.getFindingsByType(task.id, 'root_cause')
    expect(rootCauses).toHaveLength(1)

    const suggestedFixes = findings.getFindingsByType(task.id, 'suggested_fix')
    expect(suggestedFixes).toHaveLength(0)
  })

  it('should update and delete findings', () => {
    const project = projects.createProject('Update Findings Project')
    const task = tasks.createTask(project.id, 'Update Task')

    const finding = findings.createFinding(task.id, 'suggested_fix', 'Add null check', 'Check for null before accessing')

    const updated = findings.updateFinding(finding.id, {
      title: 'Add null guard',
      content: 'Add a guard clause at the top of the function',
      priority: 2
    })

    expect(updated).toBeDefined()
    expect(updated!.title).toBe('Add null guard')
    expect(updated!.priority).toBe(2)

    // Delete single finding
    findings.deleteFinding(finding.id)
    expect(findings.getFinding(finding.id)).toBeUndefined()
  })

  it('should count findings by type', () => {
    const project = projects.createProject('Count Findings Project')
    const task = tasks.createTask(project.id, 'Count Task')

    findings.createFinding(task.id, 'root_cause', 'Cause 1', 'Details')
    findings.createFinding(task.id, 'root_cause', 'Cause 2', 'Details')
    findings.createFinding(task.id, 'suggested_fix', 'Fix 1', 'Details')
    findings.createFinding(task.id, 'evidence', 'Evidence 1', 'Details')

    const counts = findings.getFindingCounts(task.id)
    expect(counts.root_cause).toBe(2)
    expect(counts.suggested_fix).toBe(1)
    expect(counts.evidence).toBe(1)
    expect(counts.affected_component).toBe(0)
  })

  it('should delete all findings for a task', () => {
    const project = projects.createProject('Bulk Delete Project')
    const task = tasks.createTask(project.id, 'Bulk Delete Task')

    findings.createFinding(task.id, 'root_cause', 'Cause', 'Details')
    findings.createFinding(task.id, 'suggested_fix', 'Fix', 'Details')

    expect(findings.getFindingsForTask(task.id)).toHaveLength(2)

    findings.deleteFindingsForTask(task.id)
    expect(findings.getFindingsForTask(task.id)).toHaveLength(0)
  })
})

describe('User Statements (Spec Drift)', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and retrieve user statements', () => {
    const project = projects.createProject('Spec Drift Project')

    const statement = userStatements.createStatement(
      project.id,
      'The dashboard should show real-time metrics',
      'chat'
    )

    expect(statement).toBeDefined()
    expect(statement.project_id).toBe(project.id)
    expect(statement.text).toBe('The dashboard should show real-time metrics')
    expect(statement.source).toBe('chat')
    expect(statement.addressed).toBe(false)
    expect(statement.spec_reference).toBeNull()
    expect(statement.timestamp).toBeGreaterThan(0)

    // Retrieve by project
    const all = userStatements.getStatementsForProject(project.id)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(statement.id)
  })

  it('should track addressed vs unaddressed statements', () => {
    const project = projects.createProject('Address Tracking Project')

    const s1 = userStatements.createStatement(project.id, 'Need dark mode', 'chat')
    const s2 = userStatements.createStatement(project.id, 'Need export to CSV', 'feedback')
    const s3 = userStatements.createStatement(project.id, 'Need undo', 'review')

    // All three are unaddressed
    expect(userStatements.getUnaddressedStatements(project.id)).toHaveLength(3)

    // Mark one as addressed
    userStatements.markAddressed(s1.id, 'PRD Section 12: Dark Mode')

    const addressed = userStatements.getStatement(s1.id)
    expect(addressed).toBeDefined()
    expect(addressed!.addressed).toBe(true)
    expect(addressed!.spec_reference).toBe('PRD Section 12: Dark Mode')

    // Verify counts
    expect(userStatements.getUnaddressedStatements(project.id)).toHaveLength(2)

    // Stats
    const stats = userStatements.getStatementStats(project.id)
    expect(stats.total).toBe(3)
    expect(stats.addressed).toBe(1)
    expect(stats.unaddressed).toBe(2)
  })

  it('should mark statements as unaddressed again', () => {
    const project = projects.createProject('Unaddress Project')

    const s1 = userStatements.createStatement(project.id, 'Feature request', 'chat')
    userStatements.markAddressed(s1.id, 'PRD Section 5')

    expect(userStatements.getStatement(s1.id)!.addressed).toBe(true)

    userStatements.markUnaddressed(s1.id)

    const updated = userStatements.getStatement(s1.id)
    expect(updated!.addressed).toBe(false)
    expect(updated!.spec_reference).toBeNull()
  })

  it('should delete statements individually and in bulk', () => {
    const project = projects.createProject('Delete Statements Project')

    const s1 = userStatements.createStatement(project.id, 'Statement 1', 'chat')
    userStatements.createStatement(project.id, 'Statement 2', 'chat')
    userStatements.createStatement(project.id, 'Statement 3', 'feedback')

    // Delete one
    userStatements.deleteStatement(s1.id)
    expect(userStatements.getStatementsForProject(project.id)).toHaveLength(2)

    // Delete all for project
    userStatements.deleteStatementsForProject(project.id)
    expect(userStatements.getStatementsForProject(project.id)).toHaveLength(0)
  })
})

describe('Schema Migrations', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should have all expected tables after migrations', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>

    const tableNames = tables.map(t => t.name)

    // Core tables from migration 1
    expect(tableNames).toContain('projects')
    expect(tableNames).toContain('repos')
    expect(tableNames).toContain('documentation_sources')
    expect(tableNames).toContain('cycles')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('branches')
    expect(tableNames).toContain('decisions')
    expect(tableNames).toContain('approvals')
    expect(tableNames).toContain('session_metrics')
    expect(tableNames).toContain('audit_log')
    expect(tableNames).toContain('schema_version')

    // Tables from later migrations
    expect(tableNames).toContain('yolo_benchmark_configs')
    expect(tableNames).toContain('yolo_benchmark_results')
    expect(tableNames).toContain('subagents')
    expect(tableNames).toContain('repo_context')
    expect(tableNames).toContain('repo_skills')
    expect(tableNames).toContain('settings')
    expect(tableNames).toContain('task_reviews')
    expect(tableNames).toContain('debug_findings')
    expect(tableNames).toContain('audit_results')
    expect(tableNames).toContain('nerv_instances')
    expect(tableNames).toContain('project_locks')
    expect(tableNames).toContain('resource_usage')
    expect(tableNames).toContain('acceptance_criteria')
    expect(tableNames).toContain('task_iterations')
    expect(tableNames).toContain('verification_templates')
    expect(tableNames).toContain('learnings')
    expect(tableNames).toContain('success_metrics')
    expect(tableNames).toContain('user_statements')
  })

  it('should have correct columns on tasks table', () => {
    const columns = db.prepare("PRAGMA table_info('tasks')").all() as Array<{ name: string; type: string }>
    const colNames = columns.map(c => c.name)

    expect(colNames).toContain('id')
    expect(colNames).toContain('project_id')
    expect(colNames).toContain('cycle_id')
    expect(colNames).toContain('title')
    expect(colNames).toContain('description')
    expect(colNames).toContain('task_type')
    expect(colNames).toContain('status')
    expect(colNames).toContain('worktree_path')
    expect(colNames).toContain('session_id')
    expect(colNames).toContain('created_at')
    expect(colNames).toContain('completed_at')
    // Columns added by later migrations
    expect(colNames).toContain('was_interrupted')
    expect(colNames).toContain('was_recovered')
  })

  it('should have correct columns on session_metrics table', () => {
    const columns = db.prepare("PRAGMA table_info('session_metrics')").all() as Array<{ name: string }>
    const colNames = columns.map(c => c.name)

    expect(colNames).toContain('id')
    expect(colNames).toContain('task_id')
    expect(colNames).toContain('session_id')
    expect(colNames).toContain('input_tokens')
    expect(colNames).toContain('output_tokens')
    expect(colNames).toContain('compaction_count')
    expect(colNames).toContain('model')
    // Migration 2 additions
    expect(colNames).toContain('cost_usd')
    expect(colNames).toContain('duration_ms')
    expect(colNames).toContain('num_turns')
    // Migration 19 addition
    expect(colNames).toContain('compactions_since_clear')
  })

  it('should track all migration versions', () => {
    const versions = db.prepare(
      'SELECT version FROM schema_version ORDER BY version ASC'
    ).all() as Array<{ version: number }>

    const versionNumbers = versions.map(v => v.version)
    // Migrations 2 through the last one should all be recorded
    for (let i = 2; i <= migrations.length; i++) {
      expect(versionNumbers).toContain(i)
    }
  })

  it('should enforce foreign key constraints', () => {
    // Attempting to create a task with a non-existent project should fail
    expect(() => {
      db.prepare(
        "INSERT INTO tasks (id, project_id, title) VALUES ('t1', 'nonexistent', 'Bad Task')"
      ).run()
    }).toThrow()
  })
})

describe('Audit Log Events', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should write and query audit events', () => {
    // Write events directly
    metrics.logAuditEvent(null, 'system_started', JSON.stringify({ version: '1.0.0' }))
    metrics.logAuditEvent('task-1', 'task_assigned', JSON.stringify({ assignee: 'claude' }))
    metrics.logAuditEvent('task-1', 'task_completed', null)

    // Query all events
    const allEvents = metrics.getAuditLog(undefined, 100)
    expect(allEvents.length).toBeGreaterThanOrEqual(3)

    // Query events for a specific task
    const taskEvents = metrics.getAuditLog('task-1')
    expect(taskEvents).toHaveLength(2)

    // Events have required fields
    const event = taskEvents[0]
    expect(event.event_type).toBeTruthy()
    expect(event.timestamp).toBeTruthy()
  })

  it('should respect the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      metrics.logAuditEvent(null, `event_${i}`, null)
    }

    const limited = metrics.getAuditLog(undefined, 5)
    expect(limited).toHaveLength(5)
  })
})

describe('Task Lifecycle', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should move task through full lifecycle: todo -> in_progress -> review -> done', () => {
    const project = projects.createProject('Lifecycle Project')
    const task = tasks.createTask(project.id, 'Full Lifecycle Task', 'Complete lifecycle test')

    expect(task.status).toBe('todo')
    expect(task.completed_at).toBeNull()

    // Start work
    const inProgress = tasks.updateTaskStatus(task.id, 'in_progress')
    expect(inProgress!.status).toBe('in_progress')
    expect(inProgress!.completed_at).toBeNull()

    // Send to review
    const inReview = tasks.updateTaskStatus(task.id, 'review')
    expect(inReview!.status).toBe('review')

    // Complete
    const done = tasks.updateTaskStatus(task.id, 'done')
    expect(done!.status).toBe('done')
    expect(done!.completed_at).toBeTruthy()
  })

  it('should update task session and worktree', () => {
    const project = projects.createProject('Session Project')
    const task = tasks.createTask(project.id, 'Session Task')

    tasks.updateTaskSession(task.id, 'session-xyz-123')
    const withSession = tasks.getTask(task.id)
    expect(withSession!.session_id).toBe('session-xyz-123')

    tasks.updateTaskWorktree(task.id, '/tmp/worktrees/feature-branch')
    const withWorktree = tasks.getTask(task.id)
    expect(withWorktree!.worktree_path).toBe('/tmp/worktrees/feature-branch')
  })

  it('should update task description', () => {
    const project = projects.createProject('Description Project')
    const task = tasks.createTask(project.id, 'Desc Task')

    tasks.updateTaskDescription(task.id, 'Updated description with details')
    const updated = tasks.getTask(task.id)
    expect(updated!.description).toBe('Updated description with details')
  })

  it('should delete a task', () => {
    const project = projects.createProject('Delete Task Project')
    const task = tasks.createTask(project.id, 'To Be Deleted')

    expect(tasks.getTask(task.id)).toBeDefined()

    tasks.deleteTask(task.id)
    expect(tasks.getTask(task.id)).toBeUndefined()
  })

  it('should find interrupted tasks', () => {
    const project = projects.createProject('Interrupted Project')
    const t1 = tasks.createTask(project.id, 'Running Task')
    const t2 = tasks.createTask(project.id, 'Todo Task')

    tasks.updateTaskStatus(t1.id, 'in_progress')

    const interrupted = tasks.getInterruptedTasks()
    expect(interrupted).toHaveLength(1)
    expect(interrupted[0].id).toBe(t1.id)

    // Todo tasks should not appear as interrupted
    const t2Status = tasks.getTask(t2.id)
    expect(t2Status!.status).toBe('todo')
  })

  it('should detect if any task has started in a project', () => {
    const project = projects.createProject('Started Check Project')
    tasks.createTask(project.id, 'Todo Only')

    expect(tasks.hasAnyTaskStarted(project.id)).toBe(false)

    const t2 = tasks.createTask(project.id, 'Will Start')
    tasks.updateTaskStatus(t2.id, 'in_progress')

    expect(tasks.hasAnyTaskStarted(project.id)).toBe(true)
  })
})

describe('Verification Operations', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and retrieve acceptance criteria for a task', () => {
    const project = projects.createProject('Verification Project')
    const task = tasks.createTask(project.id, 'Verified Task')

    const criterion = verification.createCriterion(task.id, {
      description: 'All tests pass',
      verifier: 'command',
      command: 'npm test',
      expected_exit_code: 0,
    })

    expect(criterion).toBeDefined()
    expect(criterion.task_id).toBe(task.id)
    expect(criterion.description).toBe('All tests pass')
    expect(criterion.verifier).toBe('command')
    expect(criterion.status).toBe('pending')

    const criteria = verification.getCriteriaForTask(task.id)
    expect(criteria).toHaveLength(1)
    expect(criteria[0].id).toBe(criterion.id)
  })

  it('should update criterion status after verification', () => {
    const project = projects.createProject('Status Update Project')
    const task = tasks.createTask(project.id, 'Status Task')

    const criterion = verification.createCriterion(task.id, {
      description: 'Build succeeds',
      verifier: 'command',
      command: 'npm run build',
      expected_exit_code: 0,
    })

    verification.updateCriterionStatus(criterion.id, 'pass', 'Build completed in 5s')

    const updated = verification.getCriterion(criterion.id)
    expect(updated!.status).toBe('pass')
    expect(updated!.last_check_output).toBe('Build completed in 5s')
    expect(updated!.last_check_time).toBeTruthy()
  })

  it('should track criteria counts by status', () => {
    const project = projects.createProject('Counts Project')
    const task = tasks.createTask(project.id, 'Counts Task')

    const c1 = verification.createCriterion(task.id, {
      description: 'Tests pass',
      verifier: 'test_pass',
      test_command: 'npm test',
    })
    const c2 = verification.createCriterion(task.id, {
      description: 'Build works',
      verifier: 'command',
      command: 'npm run build',
    })
    verification.createCriterion(task.id, {
      description: 'Lint clean',
      verifier: 'command',
      command: 'npm run lint',
    })

    verification.updateCriterionStatus(c1.id, 'pass')
    verification.updateCriterionStatus(c2.id, 'fail', 'Build error')

    const counts = verification.getCriteriaCounts(task.id)
    expect(counts.total).toBe(3)
    expect(counts.pass).toBe(1)
    expect(counts.fail).toBe(1)
    expect(counts.pending).toBe(1)
  })

  it('should create and manage task iterations', () => {
    const project = projects.createProject('Iteration Project')
    const task = tasks.createTask(project.id, 'Iteration Task')

    const iter1 = verification.createIteration(task.id)
    expect(iter1.iteration_number).toBe(1)
    expect(iter1.status).toBe('running')

    verification.completeIteration(iter1.id, 'completed', 5000)

    const iter2 = verification.createIteration(task.id)
    expect(iter2.iteration_number).toBe(2)

    const iterations = verification.getIterationsForTask(task.id)
    expect(iterations).toHaveLength(2)
    expect(iterations[0].iteration_number).toBe(1)
    expect(iterations[1].iteration_number).toBe(2)
  })

  it('should calculate iteration stats', () => {
    const project = projects.createProject('Stats Project')
    const task = tasks.createTask(project.id, 'Stats Task')

    const i1 = verification.createIteration(task.id)
    verification.completeIteration(i1.id, 'failed', 3000)

    const i2 = verification.createIteration(task.id)
    verification.completeIteration(i2.id, 'completed', 7000)

    const i3 = verification.createIteration(task.id)
    verification.completeIteration(i3.id, 'completed', 5000)

    const stats = verification.getIterationStats(task.id)
    expect(stats.totalIterations).toBe(3)
    expect(stats.completedIterations).toBe(2)
    expect(stats.failedIterations).toBe(1)
    expect(stats.averageDurationMs).toBe(5000) // (3000+7000+5000)/3
  })

  it('should create and apply verification templates', () => {
    const project = projects.createProject('Template Project')
    const task = tasks.createTask(project.id, 'Template Task')

    const template = verification.createTemplate('Standard Build', [
      { description: 'Tests pass', verifier: 'test_pass', test_command: 'npm test' },
      { description: 'Build succeeds', verifier: 'command', command: 'npm run build', expected_exit_code: 0 },
    ])

    expect(template.name).toBe('Standard Build')
    expect(template.criteria).toHaveLength(2)

    const applied = verification.applyTemplateToTask(task.id, template.id)
    expect(applied).toHaveLength(2)
    expect(applied[0].description).toBe('Tests pass')
    expect(applied[1].description).toBe('Build succeeds')

    const taskCriteria = verification.getCriteriaForTask(task.id)
    expect(taskCriteria).toHaveLength(2)
  })

  it('should delete criteria when task is deleted', () => {
    const project = projects.createProject('Cascade Delete Project')
    const task = tasks.createTask(project.id, 'Cascade Task')

    verification.createCriterion(task.id, {
      description: 'Test 1',
      verifier: 'command',
      command: 'echo test',
    })
    verification.createCriterion(task.id, {
      description: 'Test 2',
      verifier: 'command',
      command: 'echo test2',
    })

    expect(verification.getCriteriaForTask(task.id)).toHaveLength(2)

    tasks.deleteTask(task.id)

    expect(verification.getCriteriaForTask(task.id)).toHaveLength(0)
  })
})

describe('Success Metrics', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should record and retrieve a success metric', () => {
    const project = projects.createProject('Metrics Project')

    const metric = successMetrics.recordMetricSample(
      'time_to_first_task',
      120000, // 2 minutes
      300000, // 5 minute target
      project.id
    )

    expect(metric).toBeDefined()
    expect(metric.metric_type).toBe('time_to_first_task')
    expect(metric.current_value).toBe(120000)
    expect(metric.target_value).toBe(300000)
    expect(metric.sample_count).toBe(1)
    // Time < target means pass
    expect(metric.passed).toBeTruthy()
  })

  it('should update running average on subsequent samples', () => {
    const project = projects.createProject('Average Project')

    successMetrics.recordMetricSample('dangerous_command_catch', 100, 90, project.id)
    const updated = successMetrics.recordMetricSample('dangerous_command_catch', 0, 90, project.id)

    expect(updated.sample_count).toBe(2)
    expect(updated.current_value).toBe(50) // (100 + 0) / 2
  })

  it('should pass time_to_first_task when value is less than target', () => {
    const project = projects.createProject('Time Project')

    const fast = successMetrics.recordMetricSample('time_to_first_task', 60000, 300000, project.id)
    expect(fast.passed).toBeTruthy()
  })

  it('should fail time_to_first_task when value exceeds target', () => {
    const project = projects.createProject('Slow Project')

    const slow = successMetrics.recordMetricSample('time_to_first_task', 600000, 300000, project.id)
    expect(slow.passed).toBeFalsy()
  })

  it('should track dangerous command catches', () => {
    const project = projects.createProject('Command Catch Project')

    successMetrics.recordDangerousCommandCatch(project.id, true) // caught
    successMetrics.recordDangerousCommandCatch(project.id, true) // caught
    successMetrics.recordDangerousCommandCatch(project.id, false) // missed

    const metric = successMetrics.getMetric('dangerous_command_catch', project.id)
    // Running average: (100 + 100 + 0) / 3 = 66.67
    expect(metric).toBeDefined()
    expect(metric!.sample_count).toBe(3)
    expect(metric!.current_value).toBeLessThan(90) // Below 90% target
  })

  it('should track recovery success rate', () => {
    const project = projects.createProject('Recovery Rate Project')

    successMetrics.recordRecoveryAttempt(project.id, true)
    successMetrics.recordRecoveryAttempt(project.id, true)
    successMetrics.recordRecoveryAttempt(project.id, true)

    const metric = successMetrics.getMetric('recovery_success_rate', project.id)
    expect(metric).toBeDefined()
    expect(metric!.sample_count).toBe(3)
    expect(metric!.current_value).toBe(100)
    expect(metric!.passed).toBeTruthy()
  })

  it('should produce a metrics summary', () => {
    const project = projects.createProject('Summary Project')

    successMetrics.recordMetricSample('time_to_first_task', 60000, 300000, project.id)
    successMetrics.recordDangerousCommandCatch(project.id, true)

    const summary = successMetrics.getSummary(project.id)
    expect(summary.totalMetrics).toBe(2)
    expect(summary.metrics).toHaveLength(2)
  })
})

describe('Spec Proposals', () => {
  beforeEach(() => {
    idCounter = 0
    setupDatabase()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should create and retrieve pending spec proposals', () => {
    const project = projects.createProject('Spec Proposal Project')

    // Create a spec proposal via audit_log
    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project.id,
      section: 'Authentication',
      content: 'Add OAuth2 support for Google login',
    }))

    const pending = specProposals.getPendingProposals(project.id)
    expect(pending).toHaveLength(1)
    expect(pending[0].section).toBe('Authentication')
    expect(pending[0].content).toBe('Add OAuth2 support for Google login')
    expect(pending[0].status).toBe('pending')
  })

  it('should resolve spec proposals', () => {
    const project = projects.createProject('Resolve Project')

    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project.id,
      section: 'Caching',
      content: 'Add Redis caching layer',
    }))

    const pending = specProposals.getPendingProposals(project.id)
    expect(pending).toHaveLength(1)

    const resolved = specProposals.resolveProposal(pending[0].id, 'approved', 'Good idea')
    expect(resolved).toBeDefined()
    expect(resolved!.status).toBe('approved')
    expect(resolved!.resolution_notes).toBe('Good idea')

    // Should no longer appear in pending
    expect(specProposals.getPendingProposals(project.id)).toHaveLength(0)

    // But should appear in all proposals
    const all = specProposals.getAllProposals(project.id)
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('approved')
  })

  it('should reject spec proposals', () => {
    const project = projects.createProject('Reject Project')

    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project.id,
      section: 'GraphQL',
      content: 'Migrate REST to GraphQL',
    }))

    const pending = specProposals.getPendingProposals(project.id)
    const rejected = specProposals.resolveProposal(pending[0].id, 'rejected', 'Not aligned with goals')

    expect(rejected!.status).toBe('rejected')
    expect(rejected!.resolution_notes).toBe('Not aligned with goals')
  })

  it('should edit and approve spec proposals', () => {
    const project = projects.createProject('Edit Project')

    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project.id,
      section: 'Notifications',
      content: 'Add email notifications',
    }))

    const pending = specProposals.getPendingProposals(project.id)
    const edited = specProposals.resolveProposal(
      pending[0].id,
      'edited',
      'Modified scope',
      'Add email and push notifications'
    )

    expect(edited!.status).toBe('edited')
    expect(edited!.content).toBe('Add email and push notifications')
  })

  it('should filter proposals by project ID', () => {
    const project1 = projects.createProject('Project 1')
    const project2 = projects.createProject('Project 2')

    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project1.id,
      section: 'Feature A',
      content: 'For project 1',
    }))

    metrics.logAuditEvent(null, 'spec_update_proposed', JSON.stringify({
      projectId: project2.id,
      section: 'Feature B',
      content: 'For project 2',
    }))

    expect(specProposals.getPendingProposals(project1.id)).toHaveLength(1)
    expect(specProposals.getPendingProposals(project2.id)).toHaveLength(1)
    // Without filter, gets all
    expect(specProposals.getPendingProposals()).toHaveLength(2)
  })
})
