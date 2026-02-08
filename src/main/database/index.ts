/**
 * NERV Database Service
 *
 * This module provides a unified database service that composes domain-specific
 * operations. The service is split into modules for maintainability:
 *
 * - core.ts: Base database initialization and utilities
 * - projects.ts: Project and settings operations
 * - tasks.ts: Task operations
 * - cycles.ts: Cycle operations
 * - approvals.ts: Approval operations
 * - metrics.ts: Session metrics and audit log
 * - repos.ts: Repository, documentation sources, and context
 * - decisions.ts: Decision and branch operations
 * - yolo.ts: YOLO benchmark config and results
 * - subagents.ts: Subagent tracking
 * - instances.ts: Multi-instance coordination (PRD Section 11)
 */

import { DatabaseCore } from './core'
import { ProjectOperations } from './projects'
import { TaskOperations } from './tasks'
import { CycleOperations } from './cycles'
import { ApprovalOperations } from './approvals'
import { MetricsOperations } from './metrics'
import { RepoOperations } from './repos'
import { DecisionOperations } from './decisions'
import { YoloOperations } from './yolo'
import { SubagentOperations } from './subagents'
import { ReviewOperations } from './reviews'
import { FindingsOperations } from './findings'
import { AuditOperations } from './audits'
import { InstanceOperations } from './instances'
import { VerificationOperations } from './verification'
import { SuccessMetricsOperations } from './success-metrics'
import { UserStatementOperations } from './user-statements'
import { SpecProposalOperations } from './spec-proposals'

// Re-export types for backwards compatibility
export type {
  Project,
  Repo,
  DocumentationSource,
  Cycle,
  Task,
  Branch,
  Decision,
  Approval,
  SessionMetrics,
  AuditLogEntry,
  YoloBenchmarkConfig,
  YoloBenchmarkResult,
  YoloBenchmarkStatus,
  Subagent,
  SubagentStatus,
  RepoContext,
  RepoSkill,
  RepoContextType,
  TaskReview,
  TaskReviewStatus,
  DebugFinding,
  DebugFindingType,
  AuditResult,
  AuditType,
  AuditStatus,
  CodeHealthCheck,
  PlanHealthCheck,
  AuditIssue,
  AuditIssueType,
  AuditIssueSeverity,
  InstanceInfo,
  LockAcquisitionResult,
  ResourceLimits,
  AcceptanceCriterion,
  CriterionStatus,
  VerifierType,
  TaskIteration,
  VerificationTemplate,
  TaskVerificationResult,
  AcceptanceCriterionInput,
  SuccessMetrics,
  SuccessMetricType,
  UserStatement,
  UserStatementSource,
  SpecProposal,
  SpecProposalStatus,
  SpecDriftReport,
  SpecDriftItem,
  SpecDriftContradiction,
  CostSummary,
  ModelCost,
  CostDataPoint
} from '../../shared/types'

/**
 * Unified Database Service that composes all domain operations.
 * Maintains backwards compatibility with the original monolithic service.
 */
class DatabaseService extends DatabaseCore {
  private _projects!: ProjectOperations
  private _tasks!: TaskOperations
  private _cycles!: CycleOperations
  private _approvals!: ApprovalOperations
  private _metrics!: MetricsOperations
  private _repos!: RepoOperations
  private _decisions!: DecisionOperations
  private _yolo!: YoloOperations
  private _subagents!: SubagentOperations
  private _reviews!: ReviewOperations
  private _findings!: FindingsOperations
  private _audits!: AuditOperations
  private _instances!: InstanceOperations
  private _verification!: VerificationOperations
  private _successMetrics!: SuccessMetricsOperations
  private _userStatements!: UserStatementOperations
  private _specProposals!: SpecProposalOperations

  initialize(): void {
    super.initialize()
    this.initializeOperations()
  }

  private initializeOperations(): void {
    const getDb = () => this.ensureDb()
    const generateId = () => this.generateId()
    const logAuditEvent = (taskId: string | null, eventType: string, details: string | null) =>
      this._metrics.logAuditEvent(taskId, eventType, details)

    // Initialize metrics first since other modules depend on logAuditEvent
    this._metrics = new MetricsOperations(getDb)

    this._projects = new ProjectOperations(getDb, generateId)
    this._tasks = new TaskOperations(getDb, generateId, logAuditEvent)
    this._cycles = new CycleOperations(getDb, generateId, logAuditEvent)
    this._approvals = new ApprovalOperations(getDb, logAuditEvent)
    this._repos = new RepoOperations(getDb, generateId)
    this._decisions = new DecisionOperations(getDb, generateId, logAuditEvent)
    this._yolo = new YoloOperations(getDb, generateId)
    this._subagents = new SubagentOperations(getDb, generateId, logAuditEvent)
    this._reviews = new ReviewOperations(getDb, generateId, logAuditEvent)
    this._findings = new FindingsOperations(getDb, generateId, logAuditEvent)
    this._audits = new AuditOperations(getDb, generateId, logAuditEvent)
    this._instances = new InstanceOperations(getDb)
    this._verification = new VerificationOperations(getDb, generateId, logAuditEvent)
    this._successMetrics = new SuccessMetricsOperations(getDb)
    this._userStatements = new UserStatementOperations(getDb, generateId, logAuditEvent)
    this._specProposals = new SpecProposalOperations(getDb, logAuditEvent)
  }

  // =====================
  // Project Operations
  // =====================
  getAllProjects = () => this._projects.getAllProjects()
  getProject = (id: string) => this._projects.getProject(id)
  createProject = (name: string, goal?: string) => this._projects.createProject(name, goal)
  updateProject = (...args: Parameters<ProjectOperations['updateProject']>) => this._projects.updateProject(...args)
  deleteProject = (id: string) => this._projects.deleteProject(id)
  getSetting = (key: string) => this._projects.getSetting(key)
  setSetting = (key: string, value: string | null) => this._projects.setSetting(key, value)
  getCurrentProjectId = () => this._projects.getCurrentProjectId()
  setCurrentProjectId = (projectId: string | null) => this._projects.setCurrentProjectId(projectId)
  getCurrentProject = () => this._projects.getCurrentProject()

  // =====================
  // Task Operations
  // =====================
  getTasksForProject = (projectId: string) => this._tasks.getTasksForProject(projectId)
  getTask = (id: string) => this._tasks.getTask(id)
  createTask = (...args: Parameters<TaskOperations['createTask']>) => this._tasks.createTask(...args)
  createTaskWithType = (...args: Parameters<TaskOperations['createTaskWithType']>) => this._tasks.createTaskWithType(...args)
  updateTaskStatus = (...args: Parameters<TaskOperations['updateTaskStatus']>) => this._tasks.updateTaskStatus(...args)
  updateTaskSession = (id: string, sessionId: string) => this._tasks.updateTaskSession(id, sessionId)
  updateTaskWorktree = (id: string, worktreePath: string) => this._tasks.updateTaskWorktree(id, worktreePath)
  updateTaskDescription = (id: string, description: string) => this._tasks.updateTaskDescription(id, description)
  deleteTask = (id: string) => this._tasks.deleteTask(id)
  getInterruptedTasks = () => this._tasks.getInterruptedTasks()
  hasAnyTaskStarted = (projectId: string) => this._tasks.hasAnyTaskStarted(projectId)

  // =====================
  // Cycle Operations
  // =====================
  getCyclesForProject = (projectId: string) => this._cycles.getCyclesForProject(projectId)
  getCycle = (id: string) => this._cycles.getCycle(id)
  getActiveCycle = (projectId: string) => this._cycles.getActiveCycle(projectId)
  getNextCycleNumber = (projectId: string) => this._cycles.getNextCycleNumber(projectId)
  createCycle = (...args: Parameters<CycleOperations['createCycle']>) => this._cycles.createCycle(...args)
  updateCycle = (...args: Parameters<CycleOperations['updateCycle']>) => this._cycles.updateCycle(...args)
  completeCycle = (id: string, learnings?: string) => this._cycles.completeCycle(id, learnings)
  getTasksForCycle = (cycleId: string) => this._cycles.getTasksForCycle(cycleId)

  // =====================
  // Approval Operations
  // =====================
  getPendingApprovals = (taskId?: string) => this._approvals.getPendingApprovals(taskId)
  getAllApprovals = () => this._approvals.getAllApprovals()
  createApproval = (...args: Parameters<ApprovalOperations['createApproval']>) => this._approvals.createApproval(...args)
  resolveApproval = (...args: Parameters<ApprovalOperations['resolveApproval']>) => this._approvals.resolveApproval(...args)

  // =====================
  // Metrics & Audit
  // =====================
  getSessionMetrics = (taskId: string) => this._metrics.getSessionMetrics(taskId)
  getModelStats = () => this._metrics.getModelStats()
  getAllSessionMetrics = () => this._metrics.getAllSessionMetrics()
  updateSessionMetrics = (...args: Parameters<MetricsOperations['updateSessionMetrics']>) => this._metrics.updateSessionMetrics(...args)
  logAuditEvent = (...args: Parameters<MetricsOperations['logAuditEvent']>) => this._metrics.logAuditEvent(...args)
  getAuditLog = (taskId?: string, limit?: number) => this._metrics.getAuditLog(taskId, limit)
  getMonthlyTotalCost = () => this._metrics.getMonthlyTotalCost()
  getDailyCostBreakdown = () => this._metrics.getDailyCostBreakdown()
  getCostByProject = () => this._metrics.getCostByProject()
  exportCostsCsv = () => this._metrics.exportCostsCsv()
  checkBudgetAlerts = (...args: Parameters<MetricsOperations['checkBudgetAlerts']>) => this._metrics.checkBudgetAlerts(...args)
  getRecentTasks = (limit?: number) => this._metrics.getRecentTasks(limit)
  resetCompactionsSinceClear = (taskId: string) => this._metrics.resetCompactionsSinceClear(taskId)
  // PRD Section 14: Cost Tracking Methods
  getSessionCost = (sessionId: string) => this._metrics.getSessionCost(sessionId)
  getTaskCost = (taskId: string) => this._metrics.getTaskCost(taskId)
  getProjectCost = (projectId: string, startDate: string, endDate: string) => this._metrics.getProjectCost(projectId, startDate, endDate)
  getGlobalCost = (startDate: string, endDate: string) => this._metrics.getGlobalCost(startDate, endDate)

  // =====================
  // Repo Operations
  // =====================
  getReposForProject = (projectId: string) => this._repos.getReposForProject(projectId)
  createRepo = (...args: Parameters<RepoOperations['createRepo']>) => this._repos.createRepo(...args)
  getDocumentationSources = (projectId: string) => this._repos.getDocumentationSources(projectId)
  createDocumentationSource = (...args: Parameters<RepoOperations['createDocumentationSource']>) => this._repos.createDocumentationSource(...args)
  updateDocumentationSource = (...args: Parameters<RepoOperations['updateDocumentationSource']>) => this._repos.updateDocumentationSource(...args)
  deleteDocumentationSource = (id: string) => this._repos.deleteDocumentationSource(id)
  getRepoContext = (repoId: string) => this._repos.getRepoContext(repoId)
  getRepoContextByType = (...args: Parameters<RepoOperations['getRepoContextByType']>) => this._repos.getRepoContextByType(...args)
  createRepoContext = (...args: Parameters<RepoOperations['createRepoContext']>) => this._repos.createRepoContext(...args)
  updateRepoContext = (...args: Parameters<RepoOperations['updateRepoContext']>) => this._repos.updateRepoContext(...args)
  deleteRepoContext = (repoId: string) => this._repos.deleteRepoContext(repoId)
  getRepoSkills = (repoId: string) => this._repos.getRepoSkills(repoId)
  getRepoSkill = (repoId: string, skillName: string) => this._repos.getRepoSkill(repoId, skillName)
  createRepoSkill = (...args: Parameters<RepoOperations['createRepoSkill']>) => this._repos.createRepoSkill(...args)
  upsertRepoSkill = (...args: Parameters<RepoOperations['upsertRepoSkill']>) => this._repos.upsertRepoSkill(...args)
  deleteRepoSkills = (repoId: string) => this._repos.deleteRepoSkills(repoId)
  getProjectSkills = (projectId: string) => this._repos.getProjectSkills(projectId)
  getProjectClaudeMdContexts = (projectId: string) => this._repos.getProjectClaudeMdContexts(projectId)

  // =====================
  // Decision & Branch Operations
  // =====================
  getDecisionsForProject = (projectId: string) => this._decisions.getDecisionsForProject(projectId)
  getDecisionsForCycle = (cycleId: string) => this._decisions.getDecisionsForCycle(cycleId)
  getDecision = (id: string) => this._decisions.getDecision(id)
  createDecision = (...args: Parameters<DecisionOperations['createDecision']>) => this._decisions.createDecision(...args)
  updateDecision = (...args: Parameters<DecisionOperations['updateDecision']>) => this._decisions.updateDecision(...args)
  deleteDecision = (id: string) => this._decisions.deleteDecision(id)
  getBranchesForTask = (taskId: string) => this._decisions.getBranchesForTask(taskId)
  createBranch = (parentTaskId: string, parentSessionId?: string) => this._decisions.createBranch(parentTaskId, parentSessionId)
  updateBranchStatus = (...args: Parameters<DecisionOperations['updateBranchStatus']>) => this._decisions.updateBranchStatus(...args)

  // =====================
  // YOLO Benchmark Operations
  // =====================
  getYoloBenchmarkConfig = (id: string) => this._yolo.getYoloBenchmarkConfig(id)
  getYoloBenchmarkConfigsForProject = (projectId: string) => this._yolo.getYoloBenchmarkConfigsForProject(projectId)
  createYoloBenchmarkConfig = (...args: Parameters<YoloOperations['createYoloBenchmarkConfig']>) => this._yolo.createYoloBenchmarkConfig(...args)
  updateYoloBenchmarkConfig = (...args: Parameters<YoloOperations['updateYoloBenchmarkConfig']>) => this._yolo.updateYoloBenchmarkConfig(...args)
  deleteYoloBenchmarkConfig = (id: string) => this._yolo.deleteYoloBenchmarkConfig(id)
  getYoloBenchmarkResult = (id: string) => this._yolo.getYoloBenchmarkResult(id)
  getYoloBenchmarkResultsForConfig = (configId: string) => this._yolo.getYoloBenchmarkResultsForConfig(configId)
  getRunningYoloBenchmarks = () => this._yolo.getRunningYoloBenchmarks()
  createYoloBenchmarkResult = (configId: string) => this._yolo.createYoloBenchmarkResult(configId)
  updateYoloBenchmarkResult = (...args: Parameters<YoloOperations['updateYoloBenchmarkResult']>) => this._yolo.updateYoloBenchmarkResult(...args)
  completeYoloBenchmark = (...args: Parameters<YoloOperations['completeYoloBenchmark']>) => this._yolo.completeYoloBenchmark(...args)

  // =====================
  // Subagent Operations
  // =====================
  getSubagent = (id: string) => this._subagents.getSubagent(id)
  getSubagentsForSession = (parentSessionId: string) => this._subagents.getSubagentsForSession(parentSessionId)
  getSubagentsForTask = (taskId: string) => this._subagents.getSubagentsForTask(taskId)
  getActiveSubagents = (taskId?: string) => this._subagents.getActiveSubagents(taskId)
  createSubagent = (...args: Parameters<SubagentOperations['createSubagent']>) => this._subagents.createSubagent(...args)
  updateSubagentMetrics = (...args: Parameters<SubagentOperations['updateSubagentMetrics']>) => this._subagents.updateSubagentMetrics(...args)
  completeSubagent = (...args: Parameters<SubagentOperations['completeSubagent']>) => this._subagents.completeSubagent(...args)
  getSubagentUsageForTask = (taskId: string) => this._subagents.getSubagentUsageForTask(taskId)

  // =====================
  // Review Operations
  // =====================
  getReviewForTask = (taskId: string) => this._reviews.getReviewForTask(taskId)
  getPendingReviews = () => this._reviews.getPendingReviews()
  createReview = (taskId: string) => this._reviews.createReview(taskId)
  approveReview = (taskId: string, notes?: string) => this._reviews.approveReview(taskId, notes)
  rejectReview = (taskId: string, notes: string) => this._reviews.rejectReview(taskId, notes)

  // =====================
  // Debug Findings Operations
  // =====================
  getFindingsForTask = (taskId: string) => this._findings.getFindingsForTask(taskId)
  getFindingsByType = (...args: Parameters<FindingsOperations['getFindingsByType']>) => this._findings.getFindingsByType(...args)
  getFinding = (id: string) => this._findings.getFinding(id)
  createFinding = (...args: Parameters<FindingsOperations['createFinding']>) => this._findings.createFinding(...args)
  updateFinding = (...args: Parameters<FindingsOperations['updateFinding']>) => this._findings.updateFinding(...args)
  deleteFinding = (id: string) => this._findings.deleteFinding(id)
  deleteFindingsForTask = (taskId: string) => this._findings.deleteFindingsForTask(taskId)
  getFindingCounts = (taskId: string) => this._findings.getFindingCounts(taskId)

  // =====================
  // Audit Operations (PRD Section 5)
  // =====================
  getAuditResultsForProject = (...args: Parameters<AuditOperations['getAuditResultsForProject']>) => this._audits.getAuditResultsForProject(...args)
  getAuditResultsForCycle = (cycleId: string) => this._audits.getAuditResultsForCycle(cycleId)
  getAuditResult = (id: string) => this._audits.getAuditResult(id)
  getLatestAuditResult = (projectId: string) => this._audits.getLatestAuditResult(projectId)
  createAuditResult = (...args: Parameters<AuditOperations['createAuditResult']>) => this._audits.createAuditResult(...args)
  shouldRunAudit = (...args: Parameters<AuditOperations['shouldRunAudit']>) => this._audits.shouldRunAudit(...args)
  getAuditStats = (projectId: string) => this._audits.getAuditStats(projectId)
  deleteAuditResultsForProject = (projectId: string) => this._audits.deleteAuditResultsForProject(projectId)

  // =====================
  // Instance Operations (PRD Section 11)
  // =====================
  getInstanceId = () => this._instances.getInstanceId()
  registerInstance = () => this._instances.registerInstance()
  unregisterInstance = () => this._instances.unregisterInstance()
  acquireProjectLock = (projectId: string) => this._instances.acquireProjectLock(projectId)
  releaseProjectLock = (projectId: string) => this._instances.releaseProjectLock(projectId)
  isProjectLocked = (projectId: string) => this._instances.isProjectLocked(projectId)
  getLockHolder = (projectId: string) => this._instances.getLockHolder(projectId)
  getRunningInstances = () => this._instances.getRunningInstances()
  cleanupStaleInstances = () => this._instances.cleanupStaleInstances()
  canSpawnClaudeSession = () => this._instances.canSpawnClaudeSession()
  incrementClaudeSessions = () => this._instances.incrementClaudeSessions()
  decrementClaudeSessions = () => this._instances.decrementClaudeSessions()
  getResourceUsage = () => this._instances.getResourceUsage()
  forceAcquireProjectLock = (projectId: string) => this._instances.forceAcquireProjectLock(projectId)

  // =====================
  // Verification Operations (PRD Section 16)
  // =====================
  getCriteriaForTask = (taskId: string) => this._verification.getCriteriaForTask(taskId)
  getCriterion = (id: string) => this._verification.getCriterion(id)
  createCriterion = (...args: Parameters<VerificationOperations['createCriterion']>) => this._verification.createCriterion(...args)
  updateCriterionStatus = (...args: Parameters<VerificationOperations['updateCriterionStatus']>) => this._verification.updateCriterionStatus(...args)
  deleteCriterion = (id: string) => this._verification.deleteCriterion(id)
  deleteCriteriaForTask = (taskId: string) => this._verification.deleteCriteriaForTask(taskId)
  getCriteriaCounts = (taskId: string) => this._verification.getCriteriaCounts(taskId)
  getIterationsForTask = (taskId: string) => this._verification.getIterationsForTask(taskId)
  getIteration = (id: string) => this._verification.getIteration(id)
  getCurrentIterationNumber = (taskId: string) => this._verification.getCurrentIterationNumber(taskId)
  createIteration = (taskId: string) => this._verification.createIteration(taskId)
  completeIteration = (...args: Parameters<VerificationOperations['completeIteration']>) => this._verification.completeIteration(...args)
  getIterationStats = (taskId: string) => this._verification.getIterationStats(taskId)
  getAllTemplates = () => this._verification.getAllTemplates()
  getTemplate = (id: string) => this._verification.getTemplate(id)
  getTemplateByName = (name: string) => this._verification.getTemplateByName(name)
  createTemplate = (...args: Parameters<VerificationOperations['createTemplate']>) => this._verification.createTemplate(...args)
  deleteTemplate = (id: string) => this._verification.deleteTemplate(id)
  applyTemplateToTask = (...args: Parameters<VerificationOperations['applyTemplateToTask']>) => this._verification.applyTemplateToTask(...args)

  // =====================
  // Success Metrics Operations (PRD Section 31)
  // =====================
  getSuccessMetrics = (projectId?: string | null) => this._successMetrics.getMetrics(projectId || null)
  getSuccessMetric = (metricType: SuccessMetricType, projectId?: string | null) => this._successMetrics.getMetric(metricType, projectId || null)
  recordSuccessMetricSample = (...args: Parameters<SuccessMetricsOperations['recordMetricSample']>) => this._successMetrics.recordMetricSample(...args)
  recordTimeToFirstTask = (...args: Parameters<SuccessMetricsOperations['recordTimeToFirstTask']>) => this._successMetrics.recordTimeToFirstTask(...args)
  recordDangerousCommandCatch = (...args: Parameters<SuccessMetricsOperations['recordDangerousCommandCatch']>) => this._successMetrics.recordDangerousCommandCatch(...args)
  recordRecoveryAttempt = (...args: Parameters<SuccessMetricsOperations['recordRecoveryAttempt']>) => this._successMetrics.recordRecoveryAttempt(...args)
  recordBenchmarkResultSimple = (...args: Parameters<SuccessMetricsOperations['recordBenchmarkResultSimple']>) => this._successMetrics.recordBenchmarkResultSimple(...args)
  recordBenchmarkResultMedium = (...args: Parameters<SuccessMetricsOperations['recordBenchmarkResultMedium']>) => this._successMetrics.recordBenchmarkResultMedium(...args)
  getSuccessMetricsSummary = (projectId?: string | null) => this._successMetrics.getSummary(projectId || null)
  calculateDangerousCommandCatchRate = (projectId?: string | null) => this._successMetrics.calculateDangerousCommandCatchRate(projectId || null)
  calculateRecoverySuccessRate = (projectId?: string | null) => this._successMetrics.calculateRecoverySuccessRate(projectId || null)

  // =====================
  // User Statement Operations (PRD Section 2 - Spec Drift Detection)
  // =====================
  getUserStatementsForProject = (projectId: string) => this._userStatements.getStatementsForProject(projectId)
  getUnaddressedUserStatements = (projectId: string) => this._userStatements.getUnaddressedStatements(projectId)
  getUserStatement = (id: string) => this._userStatements.getStatement(id)
  createUserStatement = (projectId: string, text: string, source: UserStatementSource) => this._userStatements.createStatement(projectId, text, source)
  markUserStatementAddressed = (id: string, specReference: string) => this._userStatements.markAddressed(id, specReference)
  markUserStatementUnaddressed = (id: string) => this._userStatements.markUnaddressed(id)
  deleteUserStatement = (id: string) => this._userStatements.deleteStatement(id)
  deleteUserStatementsForProject = (projectId: string) => this._userStatements.deleteStatementsForProject(projectId)
  getUserStatementStats = (projectId: string) => this._userStatements.getStatementStats(projectId)

  // =====================
  // Spec Proposal Operations (PRD Section 5, lines 896-924)
  // =====================
  getPendingSpecProposals = (projectId?: string) => this._specProposals.getPendingProposals(projectId)
  getAllSpecProposals = (projectId?: string) => this._specProposals.getAllProposals(projectId)
  resolveSpecProposal = (...args: Parameters<SpecProposalOperations['resolveProposal']>) => this._specProposals.resolveProposal(...args)
}

// Export singleton instance
export const databaseService = new DatabaseService()
