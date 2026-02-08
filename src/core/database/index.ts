/**
 * NERV Core Database Service
 *
 * Platform-agnostic database operations for NERV.
 * This module can be used by both the CLI and Electron app.
 *
 * The database path is configurable to allow different contexts:
 * - CLI: Uses ~/.nerv/state.db directly
 * - Electron: Uses app.getPath('home') + '/.nerv/state.db'
 * - Tests: Uses in-memory or temp database
 */

import { DatabaseCore, DatabaseServiceConfig } from './core.js'
import { ProjectOperations } from './projects.js'
import { TaskOperations } from './tasks.js'
import { ApprovalOperations } from './approvals.js'
import { CycleOperations } from './cycles.js'
import { MetricsOperations } from './metrics.js'
import { RepoOperations } from './repos.js'
import { DecisionOperations } from './decisions.js'
import { YoloOperations } from './yolo.js'
import { SubagentOperations } from './subagents.js'
import { LearningsOperations } from './learnings.js'
import { VerificationOperations } from './verification.js'

// Re-export config type
export type { DatabaseServiceConfig } from './core.js'

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
  Learning,
  LearningCategory,
  LearningSource,
  AcceptanceCriterion,
  VerifierType,
  CriterionStatus,
  AcceptanceCriterionInput
} from '../../shared/types.js'

/**
 * Unified Database Service that composes all domain operations.
 * Maintains backwards compatibility with the original monolithic service.
 */
export class DatabaseService extends DatabaseCore {
  private _projects!: ProjectOperations
  private _tasks!: TaskOperations
  private _approvals!: ApprovalOperations
  private _cycles!: CycleOperations
  private _metrics!: MetricsOperations
  private _repos!: RepoOperations
  private _decisions!: DecisionOperations
  private _yolo!: YoloOperations
  private _subagents!: SubagentOperations
  private _learnings!: LearningsOperations
  private _verification!: VerificationOperations

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
    this._approvals = new ApprovalOperations(getDb, logAuditEvent)
    this._cycles = new CycleOperations(getDb, generateId, logAuditEvent)
    this._repos = new RepoOperations(getDb, generateId)
    this._decisions = new DecisionOperations(getDb, generateId, logAuditEvent)
    this._yolo = new YoloOperations(getDb, generateId)
    this._subagents = new SubagentOperations(getDb, generateId, logAuditEvent)
    this._learnings = new LearningsOperations(getDb, generateId, logAuditEvent)
    this._verification = new VerificationOperations(getDb, generateId, logAuditEvent)
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
  getIterationSettings = (id: string) => this._tasks.getIterationSettings(id)
  updateIterationSettings = (...args: Parameters<TaskOperations['updateIterationSettings']>) => this._tasks.updateIterationSettings(...args)

  // =====================
  // Approval Operations
  // =====================
  getPendingApprovals = (taskId?: string) => this._approvals.getPendingApprovals(taskId)
  getAllApprovals = () => this._approvals.getAllApprovals()
  createApproval = (...args: Parameters<ApprovalOperations['createApproval']>) => this._approvals.createApproval(...args)
  resolveApproval = (...args: Parameters<ApprovalOperations['resolveApproval']>) => this._approvals.resolveApproval(...args)

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
  // Metrics & Audit
  // =====================
  getSessionMetrics = (taskId: string) => this._metrics.getSessionMetrics(taskId)
  getAllSessionMetrics = () => this._metrics.getAllSessionMetrics()
  updateSessionMetrics = (...args: Parameters<MetricsOperations['updateSessionMetrics']>) => this._metrics.updateSessionMetrics(...args)
  logAuditEvent = (...args: Parameters<MetricsOperations['logAuditEvent']>) => this._metrics.logAuditEvent(...args)
  getAuditLog = (taskId?: string, limit?: number) => this._metrics.getAuditLog(taskId, limit)

  // =====================
  // Repo Operations
  // =====================
  getReposForProject = (projectId: string) => this._repos.getReposForProject(projectId)
  createRepo = (...args: Parameters<RepoOperations['createRepo']>) => this._repos.createRepo(...args)
  getDocumentationSources = (projectId: string) => this._repos.getDocumentationSources(projectId)
  createDocumentationSource = (...args: Parameters<RepoOperations['createDocumentationSource']>) => this._repos.createDocumentationSource(...args)
  getRepoContextForRepo = (repoId: string) => this._repos.getRepoContextForRepo(repoId)
  getRepoContextByType = (...args: Parameters<RepoOperations['getRepoContextByType']>) => this._repos.getRepoContextByType(...args)
  upsertRepoContext = (...args: Parameters<RepoOperations['upsertRepoContext']>) => this._repos.upsertRepoContext(...args)
  getRepoSkills = (repoId: string) => this._repos.getRepoSkills(repoId)
  upsertRepoSkill = (...args: Parameters<RepoOperations['upsertRepoSkill']>) => this._repos.upsertRepoSkill(...args)

  // =====================
  // Decision & Branch Operations
  // =====================
  getDecisionsForProject = (projectId: string) => this._decisions.getDecisionsForProject(projectId)
  createDecision = (...args: Parameters<DecisionOperations['createDecision']>) => this._decisions.createDecision(...args)
  getBranchesForTask = (taskId: string) => this._decisions.getBranchesForTask(taskId)
  createBranch = (parentTaskId: string, parentSessionId?: string) => this._decisions.createBranch(parentTaskId, parentSessionId)
  updateBranchStatus = (...args: Parameters<DecisionOperations['updateBranchStatus']>) => this._decisions.updateBranchStatus(...args)

  // =====================
  // YOLO Benchmark Operations
  // =====================
  getYoloBenchmarkConfig = (id: string) => this._yolo.getYoloBenchmarkConfig(id)
  getYoloBenchmarkConfigsForProject = (projectId: string) => this._yolo.getYoloBenchmarkConfigsForProject(projectId)
  createYoloBenchmarkConfig = (...args: Parameters<YoloOperations['createYoloBenchmarkConfig']>) => this._yolo.createYoloBenchmarkConfig(...args)
  getYoloBenchmarkResult = (id: string) => this._yolo.getYoloBenchmarkResult(id)
  getRunningYoloBenchmarks = () => this._yolo.getRunningYoloBenchmarks()
  createYoloBenchmarkResult = (configId: string) => this._yolo.createYoloBenchmarkResult(configId)
  updateYoloBenchmarkResult = (...args: Parameters<YoloOperations['updateYoloBenchmarkResult']>) => this._yolo.updateYoloBenchmarkResult(...args)

  // =====================
  // Subagent Operations
  // =====================
  getSubagentsForTask = (taskId: string) => this._subagents.getSubagentsForTask(taskId)
  getActiveSubagents = (taskId?: string) => this._subagents.getActiveSubagents(taskId)
  createSubagent = (...args: Parameters<SubagentOperations['createSubagent']>) => this._subagents.createSubagent(...args)
  completeSubagent = (...args: Parameters<SubagentOperations['completeSubagent']>) => this._subagents.completeSubagent(...args)

  // =====================
  // Learning Operations
  // =====================
  getLearningsForProject = (projectId: string) => this._learnings.getLearningsForProject(projectId)
  getLearningsByCategory = (...args: Parameters<LearningsOperations['getLearningsByCategory']>) => this._learnings.getLearningsByCategory(...args)
  createLearning = (...args: Parameters<LearningsOperations['createLearning']>) => this._learnings.createLearning(...args)
  deleteLearning = (id: string) => this._learnings.deleteLearning(id)
  exportLearnings = (projectId: string) => this._learnings.exportLearnings(projectId)

  // =====================
  // Verification Operations
  // =====================
  getCriteriaForTask = (taskId: string) => this._verification.getCriteriaForTask(taskId)
  getCriterion = (id: string) => this._verification.getCriterion(id)
  createCriterion = (...args: Parameters<VerificationOperations['createCriterion']>) => this._verification.createCriterion(...args)
  updateCriterionStatus = (...args: Parameters<VerificationOperations['updateCriterionStatus']>) => this._verification.updateCriterionStatus(...args)
  getCriteriaCounts = (taskId: string) => this._verification.getCriteriaCounts(taskId)
}

/**
 * Create a new DatabaseService instance with the given configuration.
 */
export function createDatabaseService(config: DatabaseServiceConfig = {}): DatabaseService {
  return new DatabaseService(config)
}
