/**
 * Audit System (PRD Section 5)
 *
 * Runs code health and plan health checks, auto-creates refactor tasks on failure
 */

import { ipcMain } from 'electron'
import { databaseService } from '../database'
import { broadcastToRenderers } from '../utils'
import { setOnCycleCompleteCallback } from '../database/cycles'
import { AUDIT_CYCLE_FREQUENCY, AUDIT_THRESHOLDS, generateId } from '../../shared/constants'
import { analyzeRepoHealth, mergeHealthChecks } from './code-health'
import type {
  AuditResult,
  AuditType,
  AuditStatus,
  CodeHealthCheck,
  PlanHealthCheck,
  AuditIssue,
  AuditIssueType,
  AuditIssueSeverity,
  Task,
  Cycle,
  SpecDriftReport,
  SpecDriftItem,
  SpecDriftContradiction
} from '../../shared/types'

/**
 * Run a full audit for a project
 */
export function runAudit(
  projectId: string,
  cycleId?: string,
  auditType: AuditType = 'full'
): AuditResult {
  console.log(`[Audit] Starting ${auditType} audit for project ${projectId}`)

  const issues: AuditIssue[] = []
  const failedChecks: string[] = []

  // Run code health checks
  let codeHealth: CodeHealthCheck | null = null
  if (auditType === 'code_health' || auditType === 'full') {
    codeHealth = runCodeHealthChecks(projectId)
    if (!codeHealth.passed) {
      failedChecks.push('code_health')
      issues.push(...buildCodeHealthIssues(codeHealth))
    }
  }

  // Run plan health checks
  let planHealth: PlanHealthCheck | null = null
  if (auditType === 'plan_health' || auditType === 'full') {
    planHealth = runPlanHealthChecks(projectId, cycleId)
    if (!planHealth.passed) {
      failedChecks.push('plan_health')
      issues.push(...buildPlanHealthIssues(planHealth))
    }
  }

  // Determine overall status
  let status: AuditStatus = 'passed'
  if (failedChecks.length > 0) {
    const hasErrors = issues.some(i => i.severity === 'error')
    status = hasErrors ? 'failed' : 'warning'
  }

  // Create audit result record
  const result = databaseService.createAuditResult(
    projectId,
    auditType,
    status,
    codeHealth,
    planHealth,
    issues,
    failedChecks,
    cycleId
  )

  // Broadcast result to UI
  broadcastToRenderers('audit:completed', result)

  console.log(`[Audit] Completed with status: ${status}, ${issues.length} issues found`)
  return result
}

/**
 * Run code health checks (coverage, DRY, types, dead code, complexity)
 *
 * Performs static analysis on each repo's source files:
 * - Type safety: counts 'any' type usage in .ts/.tsx files
 * - Complexity: counts functions exceeding line threshold
 * - Dead code: counts exported symbols not imported elsewhere
 * - Test coverage: reads coverage reports or estimates from file ratios
 * - DRY violations: detects duplicate code blocks across files
 */
function runCodeHealthChecks(projectId: string): CodeHealthCheck {
  const repos = databaseService.getReposForProject(projectId)

  if (repos.length === 0) {
    return {
      testCoverage: 0,
      dryViolations: 0,
      typeErrors: 0,
      deadCodeCount: 0,
      complexFunctions: 0,
      passed: false
    }
  }

  const checks = repos.map(repo => analyzeRepoHealth(repo.path))
  return mergeHealthChecks(checks)
}

/**
 * Run plan health checks (spec drift, stale tasks, blocked tasks)
 */
function runPlanHealthChecks(projectId: string, cycleId?: string): PlanHealthCheck {
  const check: PlanHealthCheck = {
    specMatches: true,
    specDrift: [],
    staleTasks: [],
    blockedTasks: [],
    passed: true
  }

  // Get all tasks for the project
  const tasks = databaseService.getTasksForProject(projectId)
  const now = new Date()
  const staleThresholdMs = AUDIT_THRESHOLDS.staleTaskDays * 24 * 60 * 60 * 1000

  // Check for stale tasks (todo/in_progress for too long)
  for (const task of tasks) {
    if (task.status === 'todo' || task.status === 'in_progress') {
      const createdAt = new Date(task.created_at)
      if (now.getTime() - createdAt.getTime() > staleThresholdMs) {
        check.staleTasks.push(task.id)
      }
    }

    // Check for interrupted tasks (blocked)
    if (task.status === 'interrupted') {
      check.blockedTasks.push(task.id)
    }
  }

  // Check for spec drift - compare cycle goals with completed tasks
  if (cycleId) {
    const cycle = databaseService.getCycle(cycleId)
    if (cycle?.goal) {
      const cycleTasks = databaseService.getTasksForCycle(cycleId)
      const completedTasks = cycleTasks.filter(t => t.status === 'done')

      // Simple spec drift detection: if cycle has goal but no completed tasks
      if (completedTasks.length === 0 && cycleTasks.length > 0) {
        check.specDrift.push(`Cycle ${cycle.cycle_number} has ${cycleTasks.length} tasks but none completed`)
        check.specMatches = false
      }
    }
  }

  // Check for unaddressed user statements (PRD Section 2 - Spec Drift Detection)
  // These are things the user said that aren't reflected in the spec
  const unaddressedStatements = databaseService.getUnaddressedUserStatements(projectId)
  for (const statement of unaddressedStatements) {
    const sourceLabel = statement.source === 'chat' ? 'conversation' :
                        statement.source === 'feedback' ? 'feedback' : 'review'
    check.specDrift.push(`User mentioned in ${sourceLabel}: "${statement.text.slice(0, 100)}${statement.text.length > 100 ? '...' : ''}"`)
    check.specMatches = false
  }

  // Set passed status
  check.passed =
    check.specMatches &&
    check.staleTasks.length === 0 &&
    check.blockedTasks.length === 0

  return check
}

/**
 * Build audit issues from code health check results
 */
function buildCodeHealthIssues(check: CodeHealthCheck): AuditIssue[] {
  const issues: AuditIssue[] = []

  if (check.testCoverage < AUDIT_THRESHOLDS.testCoverage) {
    issues.push({
      id: generateId('issue'),
      type: 'low_coverage',
      title: 'Low test coverage',
      description: `Test coverage is ${check.testCoverage}%, below the threshold of ${AUDIT_THRESHOLDS.testCoverage}%`,
      severity: 'error',
      threshold: AUDIT_THRESHOLDS.testCoverage,
      current: check.testCoverage,
      autoFixable: false
    })
  }

  if (check.dryViolations > AUDIT_THRESHOLDS.dryViolationLimit) {
    issues.push({
      id: generateId('issue'),
      type: 'dry_violation',
      title: 'DRY violations detected',
      description: `Found ${check.dryViolations} code duplication instances, exceeds limit of ${AUDIT_THRESHOLDS.dryViolationLimit}`,
      severity: 'warning',
      threshold: AUDIT_THRESHOLDS.dryViolationLimit,
      current: check.dryViolations,
      autoFixable: true
    })
  }

  if (check.typeErrors > AUDIT_THRESHOLDS.typeErrorLimit) {
    issues.push({
      id: generateId('issue'),
      type: 'type_safety',
      title: 'Type safety issues',
      description: `Found ${check.typeErrors} type errors or 'any' types`,
      severity: 'error',
      threshold: AUDIT_THRESHOLDS.typeErrorLimit,
      current: check.typeErrors,
      autoFixable: false
    })
  }

  if (check.deadCodeCount > AUDIT_THRESHOLDS.deadCodeLimit) {
    issues.push({
      id: generateId('issue'),
      type: 'dead_code',
      title: 'Dead code detected',
      description: `Found ${check.deadCodeCount} unused exports/dead code paths`,
      severity: 'warning',
      threshold: AUDIT_THRESHOLDS.deadCodeLimit,
      current: check.deadCodeCount,
      autoFixable: true
    })
  }

  if (check.complexFunctions > 0) {
    issues.push({
      id: generateId('issue'),
      type: 'complexity',
      title: 'Complex functions detected',
      description: `Found ${check.complexFunctions} functions exceeding ${AUDIT_THRESHOLDS.complexityThreshold} lines`,
      severity: 'warning',
      threshold: AUDIT_THRESHOLDS.complexityThreshold,
      current: check.complexFunctions,
      autoFixable: false
    })
  }

  return issues
}

/**
 * Build audit issues from plan health check results
 */
function buildPlanHealthIssues(check: PlanHealthCheck): AuditIssue[] {
  const issues: AuditIssue[] = []

  for (const drift of check.specDrift) {
    issues.push({
      id: generateId('issue'),
      type: 'spec_drift',
      title: 'Spec drift detected',
      description: drift,
      severity: 'warning',
      autoFixable: false
    })
  }

  for (const taskId of check.staleTasks) {
    const task = databaseService.getTask(taskId)
    issues.push({
      id: generateId('issue'),
      type: 'stale_task',
      title: 'Stale task',
      description: `Task "${task?.title || taskId}" has been pending for more than ${AUDIT_THRESHOLDS.staleTaskDays} days`,
      severity: 'warning',
      autoFixable: false
    })
  }

  for (const taskId of check.blockedTasks) {
    const task = databaseService.getTask(taskId)
    issues.push({
      id: generateId('issue'),
      type: 'blocked_task',
      title: 'Blocked task',
      description: `Task "${task?.title || taskId}" is interrupted and needs attention`,
      severity: 'error',
      autoFixable: false
    })
  }

  return issues
}

/**
 * Create a debug task for an audit issue (PRD Section 3: Debug & Research Workflow)
 *
 * Audit failures create debug tasks that produce research reports.
 * The fix is created as a separate task after the debug investigation.
 */
export function createRefactorTaskForIssue(
  projectId: string,
  cycleId: string | undefined,
  issue: AuditIssue
): Task {
  const description = `## Debug Investigation: Audit Failure

### Issue
${issue.title}

### Type
${issue.type}

### Severity
${issue.severity}

### Details
${issue.description}

${issue.threshold !== undefined && issue.current !== undefined ? `### Metrics
- **Threshold**: ${issue.threshold}
- **Current**: ${issue.current}
` : ''}

### Investigation Goals
- Analyze the root cause of this audit failure
- Identify affected code paths and components
- Document suggested fixes (do NOT modify code)
- Propose prevention strategies

### Expected Output
A research report with:
1. Root cause analysis
2. Affected components
3. Suggested code fixes (as descriptions/snippets)
4. Prevention recommendations

### Context
This debug task was auto-created by the Audit System (PRD Section 3 & 5).
A separate fix task will be created after investigation.`

  const task = databaseService.createTaskWithType(
    projectId,
    `Debug: ${issue.title}`,
    'debug',
    description,
    cycleId || undefined
  )

  databaseService.logAuditEvent(null, 'audit_debug_task_created', JSON.stringify({
    taskId: task.id,
    issueType: issue.type,
    issueSeverity: issue.severity
  }))

  broadcastToRenderers('audit:debugTaskCreated', task.id, issue.type)
  console.log(`[Audit] Created debug task ${task.id} for issue: ${issue.title}`)

  return task
}

/**
 * Check if an audit should be triggered based on cycle completion
 */
export function shouldTriggerAuditOnCycleComplete(projectId: string, cycleNumber: number): boolean {
  // Get configured frequency from settings, or use default
  const frequencySetting = databaseService.getSetting('audit_cycle_frequency')
  const frequency = frequencySetting ? parseInt(frequencySetting, 10) : AUDIT_CYCLE_FREQUENCY

  if (frequency <= 0) return false

  // Check if current cycle number is divisible by frequency
  return cycleNumber > 0 && cycleNumber % frequency === 0
}

/**
 * Trigger audit on cycle completion if due
 */
export function onCycleComplete(cycle: Cycle): void {
  if (!shouldTriggerAuditOnCycleComplete(cycle.project_id, cycle.cycle_number)) {
    return
  }

  console.log(`[Audit] Triggering audit after cycle ${cycle.cycle_number} completion`)

  // Run the audit
  const result = runAudit(cycle.project_id, cycle.id, 'full')

  // If audit failed, create refactor tasks for error-severity issues
  if (result.status === 'failed') {
    const errorIssues = result.issues.filter(i => i.severity === 'error')
    for (const issue of errorIssues) {
      createRefactorTaskForIssue(cycle.project_id, cycle.id, issue)
    }
  }
}

/**
 * Run spec drift detection for a project (PRD Section 5)
 *
 * Checks three dimensions of drift:
 * 1. User statements not reflected in spec (unaddressed)
 * 2. Spec proposals without corresponding tasks/code
 * 3. Contradictions between user statements and spec proposals
 */
export function runSpecDriftDetection(projectId: string): SpecDriftReport {
  console.log(`[Audit] Running spec drift detection for project ${projectId}`)

  const timestamp = new Date().toISOString()
  const unaddressedStatements: SpecDriftItem[] = []
  const specItemsWithoutCode: SpecDriftItem[] = []
  const contradictions: SpecDriftContradiction[] = []

  // 1. Check for unaddressed user statements
  const statements = databaseService.getUnaddressedUserStatements(projectId)
  for (const stmt of statements) {
    const sourceLabel = stmt.source === 'chat' ? 'conversation' :
                        stmt.source === 'feedback' ? 'feedback' : 'review'
    unaddressedStatements.push({
      id: stmt.id,
      text: stmt.text,
      source: sourceLabel,
      severity: 'warning'
    })
  }

  // 2. Check for pending spec proposals (spec items not yet addressed)
  const pendingProposals = databaseService.getPendingSpecProposals(projectId)
  for (const proposal of pendingProposals) {
    specItemsWithoutCode.push({
      id: String(proposal.id),
      text: `[${proposal.section}] ${proposal.content.slice(0, 200)}${proposal.content.length > 200 ? '...' : ''}`,
      source: 'spec_proposal',
      severity: 'warning'
    })
  }

  // 3. Check for approved spec proposals without corresponding tasks
  const allProposals = databaseService.getAllSpecProposals(projectId)
  const approvedProposals = allProposals.filter(p => p.status === 'approved' || p.status === 'edited')
  const tasks = databaseService.getTasksForProject(projectId)

  for (const proposal of approvedProposals) {
    // Check if any task references this spec section
    const hasRelatedTask = tasks.some(t =>
      t.description?.toLowerCase().includes(proposal.section.toLowerCase()) ||
      t.title.toLowerCase().includes(proposal.section.toLowerCase())
    )

    if (!hasRelatedTask) {
      specItemsWithoutCode.push({
        id: `approved-${proposal.id}`,
        text: `Approved spec "${proposal.section}" has no corresponding task`,
        source: 'approved_proposal',
        severity: 'info'
      })
    }
  }

  // 4. Check for contradictions: addressed statements whose spec_reference
  //    might have been later rejected as a proposal
  const allStatements = databaseService.getUserStatementsForProject(projectId)
  const addressedStatements = allStatements.filter(s => s.addressed && s.spec_reference)
  const rejectedProposals = allProposals.filter(p => p.status === 'rejected')

  for (const stmt of addressedStatements) {
    for (const rejected of rejectedProposals) {
      // Detect if a rejected proposal's section matches an addressed statement's reference
      if (stmt.spec_reference && rejected.section.toLowerCase() === stmt.spec_reference.toLowerCase()) {
        contradictions.push({
          statementId: stmt.id,
          statementText: stmt.text.slice(0, 200),
          specSection: rejected.section,
          specContent: rejected.content.slice(0, 200),
          description: `User statement references spec section "${rejected.section}" but a proposal for that section was rejected`
        })
      }
    }
  }

  // Calculate drift score (0 = no drift, 1 = major drift)
  const totalIssues = unaddressedStatements.length +
    specItemsWithoutCode.length +
    contradictions.length
  // Normalize: 10+ issues = score 1.0
  const driftScore = Math.min(1.0, totalIssues / 10)
  const hasDrift = totalIssues > 0

  const report: SpecDriftReport = {
    project_id: projectId,
    timestamp,
    unaddressedStatements,
    specItemsWithoutCode,
    contradictions,
    pendingProposals: pendingProposals.length,
    driftScore,
    hasDrift
  }

  // Log the result
  databaseService.logAuditEvent(null, 'spec_drift_detection', JSON.stringify({
    projectId,
    unaddressedCount: unaddressedStatements.length,
    specWithoutCodeCount: specItemsWithoutCode.length,
    contradictionCount: contradictions.length,
    driftScore,
    hasDrift
  }))

  // Broadcast to UI
  broadcastToRenderers('audit:specDriftCompleted', report)

  console.log(`[Audit] Spec drift detection complete: score=${driftScore.toFixed(2)}, issues=${totalIssues}`)
  return report
}

/**
 * Initialize the audit system by registering the cycle completion hook
 */
export function initializeAuditSystem(): void {
  setOnCycleCompleteCallback(onCycleComplete)
  console.log('[Audit] Audit system initialized')
}

/**
 * Register IPC handlers for audit operations
 */
export function registerAuditIpcHandlers(): void {
  // Run audit on demand
  ipcMain.handle('audit:run', (_event, projectId: string, cycleId?: string, auditType?: AuditType) => {
    return runAudit(projectId, cycleId, auditType || 'full')
  })

  // Get audit results for a project
  ipcMain.handle('audit:getResultsForProject', (_event, projectId: string, limit?: number) => {
    return databaseService.getAuditResultsForProject(projectId, limit)
  })

  // Get audit results for a cycle
  ipcMain.handle('audit:getResultsForCycle', (_event, cycleId: string) => {
    return databaseService.getAuditResultsForCycle(cycleId)
  })

  // Get a single audit result
  ipcMain.handle('audit:getResult', (_event, id: string) => {
    return databaseService.getAuditResult(id)
  })

  // Get latest audit result for a project
  ipcMain.handle('audit:getLatestResult', (_event, projectId: string) => {
    return databaseService.getLatestAuditResult(projectId)
  })

  // Get audit statistics for a project
  ipcMain.handle('audit:getStats', (_event, projectId: string) => {
    return databaseService.getAuditStats(projectId)
  })

  // Check if audit should run
  ipcMain.handle('audit:shouldRun', (_event, projectId: string, cycleNumber: number, frequency?: number) => {
    return databaseService.shouldRunAudit(projectId, cycleNumber, frequency || AUDIT_CYCLE_FREQUENCY)
  })

  // Create refactor task for an issue
  ipcMain.handle('audit:createRefactorTask', (_event, projectId: string, cycleId: string | undefined, issue: AuditIssue) => {
    return createRefactorTaskForIssue(projectId, cycleId, issue)
  })

  // Run spec drift detection (PRD Section 5)
  ipcMain.handle('audit:run-spec-drift', (_event, projectId: string) => {
    return runSpecDriftDetection(projectId)
  })

  // Get/set audit settings
  ipcMain.handle('audit:getCycleFrequency', () => {
    const setting = databaseService.getSetting('audit_cycle_frequency')
    return setting ? parseInt(setting, 10) : AUDIT_CYCLE_FREQUENCY
  })

  ipcMain.handle('audit:setCycleFrequency', (_event, frequency: number) => {
    databaseService.setSetting('audit_cycle_frequency', String(frequency))
  })

  console.log('[Audit] IPC handlers registered')
}
