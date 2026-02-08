/**
 * Database API exposed to renderer
 */

import { ipcRenderer } from 'electron'
import type {
  Project,
  Task,
  Approval,
  Cycle,
  SessionMetrics,
  Repo,
  RepoSourceType,
  Decision,
  Branch,
  AuditLogEntry,
  DocumentationSource,
  TaskReview,
  ReviewContext,
  DebugFinding,
  DebugFindingType,
  AcceptanceCriterion,
  AcceptanceCriterionInput,
  CriterionStatus,
  TaskIteration,
  TaskVerificationResult,
  VerificationTemplate,
  IterationSettings,
  SuccessMetrics,
  SuccessMetricType,
  UserStatement,
  UserStatementSource,
  BudgetAlert,
  SpecProposal,
  SpecProposalStatus,
  CostSummary,
  CycleSuggestion
} from '../../shared/types'
import type {
  NervSettings,
  ResolvedSetting,
  RepoSettings,
  TaskSettings
} from '../../shared/types/settings'

export const db = {
  // Projects
  projects: {
    getAll: (): Promise<Project[]> => ipcRenderer.invoke('db:projects:getAll'),
    get: (id: string): Promise<Project | undefined> => ipcRenderer.invoke('db:projects:get', id),
    create: (name: string, goal?: string): Promise<Project> => ipcRenderer.invoke('db:projects:create', name, goal),
    update: (id: string, updates: Partial<Pick<Project, 'name' | 'goal' | 'custom_agents' | 'review_mode'>>): Promise<Project | undefined> =>
      ipcRenderer.invoke('db:projects:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('db:projects:delete', id)
  },

  // Tasks
  tasks: {
    getForProject: (projectId: string): Promise<Task[]> => ipcRenderer.invoke('db:tasks:getForProject', projectId),
    get: (id: string): Promise<Task | undefined> => ipcRenderer.invoke('db:tasks:get', id),
    create: (projectId: string, title: string, description?: string, cycleId?: string): Promise<Task> =>
      ipcRenderer.invoke('db:tasks:create', projectId, title, description, cycleId),
    updateStatus: (id: string, status: Task['status']): Promise<Task | undefined> =>
      ipcRenderer.invoke('db:tasks:updateStatus', id, status),
    updateSession: (id: string, sessionId: string): Promise<Task | undefined> =>
      ipcRenderer.invoke('db:tasks:updateSession', id, sessionId),
    updateWorktree: (id: string, worktreePath: string): Promise<Task | undefined> =>
      ipcRenderer.invoke('db:tasks:updateWorktree', id, worktreePath),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('db:tasks:delete', id),
    getInterrupted: (): Promise<Task[]> => ipcRenderer.invoke('db:tasks:getInterrupted'),
    getIterationSettings: (id: string): Promise<IterationSettings> =>
      ipcRenderer.invoke('db:tasks:getIterationSettings', id),
    updateIterationSettings: (id: string, settings: IterationSettings): Promise<Task | undefined> =>
      ipcRenderer.invoke('db:tasks:updateIterationSettings', id, settings)
  },

  // Approvals
  approvals: {
    getPending: (taskId?: string): Promise<Approval[]> => ipcRenderer.invoke('db:approvals:getPending', taskId),
    getAll: (): Promise<Approval[]> => ipcRenderer.invoke('db:approvals:getAll'),
    create: (taskId: string, toolName: string, toolInput?: string, context?: string): Promise<Approval> =>
      ipcRenderer.invoke('db:approvals:create', taskId, toolName, toolInput, context),
    resolve: (id: number, status: 'approved' | 'denied', denyReason?: string): Promise<Approval | undefined> =>
      ipcRenderer.invoke('db:approvals:resolve', id, status, denyReason)
  },

  // Cycles
  cycles: {
    getForProject: (projectId: string): Promise<Cycle[]> => ipcRenderer.invoke('db:cycles:getForProject', projectId),
    get: (id: string): Promise<Cycle | undefined> => ipcRenderer.invoke('db:cycles:get', id),
    getActive: (projectId: string): Promise<Cycle | undefined> => ipcRenderer.invoke('db:cycles:getActive', projectId),
    getNextNumber: (projectId: string): Promise<number> => ipcRenderer.invoke('db:cycles:getNextNumber', projectId),
    create: (projectId: string, cycleNumber: number, goal?: string): Promise<Cycle> =>
      ipcRenderer.invoke('db:cycles:create', projectId, cycleNumber, goal),
    update: (id: string, updates: Partial<Pick<Cycle, 'goal' | 'learnings'>>): Promise<Cycle | undefined> =>
      ipcRenderer.invoke('db:cycles:update', id, updates),
    complete: (id: string, learnings?: string): Promise<Cycle | undefined> =>
      ipcRenderer.invoke('db:cycles:complete', id, learnings),
    getTasks: (cycleId: string): Promise<Task[]> => ipcRenderer.invoke('db:cycles:getTasks', cycleId),
    plan: (projectId: string, direction?: string): Promise<CycleSuggestion> =>
      ipcRenderer.invoke('cycle:plan', projectId, direction)
  },

  // Session Metrics
  metrics: {
    get: (taskId: string): Promise<SessionMetrics | undefined> => ipcRenderer.invoke('db:metrics:get', taskId),
    update: (taskId: string, metrics: {
      inputTokens?: number
      outputTokens?: number
      compactionCount?: number
      model?: string
      sessionId?: string
    }): Promise<SessionMetrics> => ipcRenderer.invoke('db:metrics:update', taskId, metrics),
    getModelStats: (): Promise<Array<{
      model: string
      task_count: number
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      total_duration_ms: number
      avg_turns: number
    }>> => ipcRenderer.invoke('db:metrics:getModelStats'),
    getAll: (): Promise<SessionMetrics[]> => ipcRenderer.invoke('db:metrics:getAll'),
    getMonthlyTotal: (): Promise<{ totalCost: number; taskCount: number; monthStart: string }> =>
      ipcRenderer.invoke('db:metrics:getMonthlyTotal'),
    getDailyBreakdown: (): Promise<Array<{ date: string; cost: number; taskCount: number }>> =>
      ipcRenderer.invoke('db:metrics:getDailyBreakdown'),
    getCostByProject: (): Promise<Array<{
      projectId: string
      projectName: string
      totalCost: number
      taskCount: number
      inputTokens: number
      outputTokens: number
    }>> => ipcRenderer.invoke('db:metrics:getCostByProject'),
    exportCostsCsv: (): Promise<string> =>
      ipcRenderer.invoke('db:metrics:exportCostsCsv'),
    checkBudgetAlerts: (monthlyBudget: number, warningThreshold?: number, criticalThreshold?: number, dailyBudget?: number): Promise<BudgetAlert[]> =>
      ipcRenderer.invoke('db:metrics:checkBudgetAlerts', monthlyBudget, warningThreshold, criticalThreshold, dailyBudget),
    // PRD Section 6: Reset compactions since last /clear
    resetCompactionsSinceClear: (taskId: string): Promise<void> =>
      ipcRenderer.invoke('db:metrics:resetCompactionsSinceClear', taskId),
    // PRD Section 14: Get recent tasks with metrics for cost dashboard
    getRecentTasks: (limit?: number): Promise<Array<{
      taskId: string
      taskTitle: string
      status: string
      durationMs: number
      inputTokens: number
      outputTokens: number
      costUsd: number
      completedAt: string | null
      updatedAt: string
    }>> => ipcRenderer.invoke('db:metrics:getRecentTasks', limit),
    // PRD Section 14: Cost Tracking Methods
    getSessionCost: (sessionId: string): Promise<CostSummary> =>
      ipcRenderer.invoke('db:metrics:getSessionCost', sessionId),
    getTaskCost: (taskId: string): Promise<CostSummary> =>
      ipcRenderer.invoke('db:metrics:getTaskCost', taskId),
    getProjectCost: (projectId: string, startDate: string, endDate: string): Promise<CostSummary> =>
      ipcRenderer.invoke('db:metrics:getProjectCost', projectId, startDate, endDate),
    getGlobalCost: (startDate: string, endDate: string): Promise<CostSummary> =>
      ipcRenderer.invoke('db:metrics:getGlobalCost', startDate, endDate)
  },

  // Repos
  repos: {
    getForProject: (projectId: string): Promise<Repo[]> => ipcRenderer.invoke('db:repos:getForProject', projectId),
    create: (
      projectId: string,
      name: string,
      path: string,
      options?: {
        stack?: string
        sourceType?: RepoSourceType
        baseBranch?: string
        fetchBeforeWorktree?: boolean
        autoFetchOnOpen?: boolean
      }
    ): Promise<Repo> => ipcRenderer.invoke('db:repos:create', projectId, name, path, options),

    // Repository Context (PRD Section 25)
    rescan: (repoId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:repos:rescan', repoId),
    getContext: (repoId: string): Promise<Array<{
      id: string
      repo_id: string
      context_type: string
      file_path: string
      content: string
      parsed_sections: string | null
      last_scanned_at: number
      file_hash: string
    }>> =>
      ipcRenderer.invoke('db:repos:getContext', repoId),
    getSkills: (repoId: string): Promise<Array<{
      id: string
      repo_id: string
      skill_name: string
      skill_path: string
      description: string | null
      trigger_pattern: string | null
      content: string
    }>> =>
      ipcRenderer.invoke('db:repos:getSkills', repoId),
    getProjectSkills: (projectId: string): Promise<Array<{
      id: string
      repo_id: string
      skill_name: string
      skill_path: string
      description: string | null
      trigger_pattern: string | null
      content: string
    }>> =>
      ipcRenderer.invoke('db:repos:getProjectSkills', projectId),
    getProjectClaudeMdContexts: (projectId: string): Promise<Array<{
      id: string
      repo_id: string
      context_type: string
      file_path: string
      content: string
      parsed_sections: string | null
      last_scanned_at: number
      file_hash: string
    }>> =>
      ipcRenderer.invoke('db:repos:getProjectClaudeMdContexts', projectId)
  },

  // Decisions
  decisions: {
    getForProject: (projectId: string): Promise<Decision[]> => ipcRenderer.invoke('db:decisions:getForProject', projectId),
    getForCycle: (cycleId: string): Promise<Decision[]> => ipcRenderer.invoke('db:decisions:getForCycle', cycleId),
    get: (id: string): Promise<Decision | undefined> => ipcRenderer.invoke('db:decisions:get', id),
    create: (projectId: string, title: string, rationale?: string, cycleId?: string, alternatives?: string): Promise<Decision> =>
      ipcRenderer.invoke('db:decisions:create', { projectId, title, rationale, cycleId, alternatives }),
    update: (id: string, updates: Partial<Pick<Decision, 'title' | 'rationale' | 'alternatives'>>): Promise<Decision | undefined> =>
      ipcRenderer.invoke('db:decisions:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('db:decisions:delete', id)
  },

  // Branches
  branches: {
    getForTask: (taskId: string): Promise<Branch[]> => ipcRenderer.invoke('db:branches:getForTask', taskId),
    create: (parentTaskId: string, parentSessionId?: string): Promise<Branch> =>
      ipcRenderer.invoke('db:branches:create', parentTaskId, parentSessionId),
    updateStatus: (id: string, status: Branch['status'], summary?: string): Promise<Branch | undefined> =>
      ipcRenderer.invoke('db:branches:updateStatus', id, status, summary)
  },

  // Audit Log
  audit: {
    log: (taskId: string | null, eventType: string, details: string | null): Promise<void> =>
      ipcRenderer.invoke('db:audit:log', taskId, eventType, details),
    get: (taskId?: string, limit?: number): Promise<AuditLogEntry[]> =>
      ipcRenderer.invoke('db:audit:get', taskId, limit)
  },

  // Documentation Sources
  docSources: {
    getForProject: (projectId: string): Promise<DocumentationSource[]> =>
      ipcRenderer.invoke('db:docSources:getForProject', projectId),
    create: (projectId: string, name: string, urlPattern: string): Promise<DocumentationSource> =>
      ipcRenderer.invoke('db:docSources:create', projectId, name, urlPattern),
    update: (id: string, updates: { name?: string; urlPattern?: string }): Promise<DocumentationSource | undefined> =>
      ipcRenderer.invoke('db:docSources:update', id, updates),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('db:docSources:delete', id)
  },

  // Settings
  settings: {
    get: (key: string): Promise<string | undefined> =>
      ipcRenderer.invoke('db:settings:get', key),
    set: (key: string, value: string | null): Promise<void> =>
      ipcRenderer.invoke('db:settings:set', key, value),
    getCurrentProjectId: (): Promise<string | undefined> =>
      ipcRenderer.invoke('db:settings:getCurrentProjectId'),
    setCurrentProjectId: (projectId: string | null): Promise<void> =>
      ipcRenderer.invoke('db:settings:setCurrentProjectId', projectId),
    getCurrentProject: (): Promise<Project | undefined> =>
      ipcRenderer.invoke('db:settings:getCurrentProject')
  }
}

/**
 * Settings Hierarchy API (PRD Section 13)
 *
 * Provides proper resolution: Task → Environment → Project → Organization → Global → Default
 * Each setting includes source tracking so UI can display where the value came from.
 */
export const settingsHierarchy = {
  // Get a setting value (resolved from hierarchy)
  get: <K extends keyof NervSettings>(key: K): Promise<NervSettings[K]> =>
    ipcRenderer.invoke('settings:get', key),

  // Get a setting with source information
  getWithSource: <K extends keyof NervSettings>(
    key: K
  ): Promise<ResolvedSetting<NervSettings[K]>> =>
    ipcRenderer.invoke('settings:getWithSource', key),

  // Get all settings (resolved)
  getAll: (): Promise<NervSettings> => ipcRenderer.invoke('settings:getAll'),

  // Get all settings with sources
  getAllWithSources: (): Promise<
    Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>>
  > => ipcRenderer.invoke('settings:getAllWithSources'),

  // Set a setting at the global level (~/.nerv/config.json)
  setGlobal: <K extends keyof NervSettings>(
    key: K,
    value: NervSettings[K]
  ): Promise<void> => ipcRenderer.invoke('settings:setGlobal', key, value),

  // Set a setting at the project level (.nerv/config.json)
  setProject: <K extends keyof NervSettings>(
    key: K,
    value: NervSettings[K]
  ): Promise<void> => ipcRenderer.invoke('settings:setProject', key, value),

  // Remove a setting from global config (revert to default)
  unsetGlobal: <K extends keyof NervSettings>(key: K): Promise<void> =>
    ipcRenderer.invoke('settings:unsetGlobal', key),

  // Remove a setting from project config (revert to global/default)
  unsetProject: <K extends keyof NervSettings>(key: K): Promise<void> =>
    ipcRenderer.invoke('settings:unsetProject', key),

  // PRD Section 13: Repo-level settings
  getRepoSettings: (repoPath: string): Promise<RepoSettings | null> =>
    ipcRenderer.invoke('settings:getRepoSettings', repoPath),

  setRepoSettings: (repoPath: string, settings: RepoSettings): Promise<void> =>
    ipcRenderer.invoke('settings:setRepoSettings', repoPath, settings),

  // PRD Section 13: Task-level settings (in-memory, highest priority)
  getTaskSettings: (): Promise<TaskSettings | null> =>
    ipcRenderer.invoke('settings:getTaskSettings'),

  setTaskSettings: (settings: TaskSettings | null): Promise<void> =>
    ipcRenderer.invoke('settings:setTaskSettings', settings),

  // Get active environment variable overrides
  getActiveEnvOverrides: (): Promise<
    Array<{ key: keyof NervSettings; envVar: string; value: unknown }>
  > => ipcRenderer.invoke('settings:getActiveEnvOverrides'),

  // Reload settings from disk
  reload: (): Promise<void> => ipcRenderer.invoke('settings:reload')
}

// Extended Tasks API
export const tasksExtended = {
  createWithType: (
    projectId: string,
    title: string,
    taskType: 'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug',
    description?: string,
    cycleId?: string
  ): Promise<Task> => ipcRenderer.invoke('db:tasks:createWithType', { projectId, title, taskType, description, cycleId }),

  updateDescription: (id: string, description: string): Promise<Task | undefined> =>
    ipcRenderer.invoke('db:tasks:updateDescription', id, description)
}

// Task Reviews API (for review gate before merge)
export const reviews = {
  getForTask: (taskId: string): Promise<TaskReview | undefined> =>
    ipcRenderer.invoke('db:reviews:getForTask', taskId),
  getPending: (): Promise<TaskReview[]> =>
    ipcRenderer.invoke('db:reviews:getPending'),
  create: (taskId: string): Promise<TaskReview> =>
    ipcRenderer.invoke('db:reviews:create', taskId),
  approve: (taskId: string, notes?: string): Promise<TaskReview | undefined> =>
    ipcRenderer.invoke('db:reviews:approve', taskId, notes),
  reject: (taskId: string, notes: string): Promise<TaskReview | undefined> =>
    ipcRenderer.invoke('db:reviews:reject', taskId, notes),
  /** Get review context (diff, test results, summary) for Normal mode review (PRD Review Modes section) */
  getContext: (taskId: string): Promise<ReviewContext> =>
    ipcRenderer.invoke('db:reviews:getContext', taskId)
}

// Debug Findings API (for suggested fixes without code changes)
export const findings = {
  getForTask: (taskId: string): Promise<DebugFinding[]> =>
    ipcRenderer.invoke('db:findings:getForTask', taskId),
  getByType: (taskId: string, findingType: DebugFindingType): Promise<DebugFinding[]> =>
    ipcRenderer.invoke('db:findings:getByType', taskId, findingType),
  get: (id: string): Promise<DebugFinding | undefined> =>
    ipcRenderer.invoke('db:findings:get', id),
  create: (params: {
    taskId: string
    findingType: DebugFindingType
    title: string
    content: string
    codeSnippet?: string
    filePath?: string
    priority?: number
  }): Promise<DebugFinding> =>
    ipcRenderer.invoke('db:findings:create', params),
  update: (id: string, updates: Partial<Pick<DebugFinding, 'title' | 'content' | 'code_snippet' | 'file_path' | 'priority'>>): Promise<DebugFinding | undefined> =>
    ipcRenderer.invoke('db:findings:update', id, updates),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('db:findings:delete', id),
  deleteForTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('db:findings:deleteForTask', taskId),
  getCounts: (taskId: string): Promise<Record<DebugFindingType, number>> =>
    ipcRenderer.invoke('db:findings:getCounts', taskId)
}

// Verification API (PRD Section 16 - Spec Verification & Iterations)
export const verification = {
  // Acceptance Criteria
  criteria: {
    getForTask: (taskId: string): Promise<AcceptanceCriterion[]> =>
      ipcRenderer.invoke('db:verification:getCriteria', taskId),
    get: (id: string): Promise<AcceptanceCriterion | null> =>
      ipcRenderer.invoke('db:verification:getCriterion', id),
    create: (taskId: string, input: AcceptanceCriterionInput): Promise<AcceptanceCriterion> =>
      ipcRenderer.invoke('db:verification:createCriterion', taskId, input),
    updateStatus: (id: string, status: CriterionStatus, output?: string): Promise<void> =>
      ipcRenderer.invoke('db:verification:updateCriterionStatus', id, status, output),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('db:verification:deleteCriterion', id),
    deleteForTask: (taskId: string): Promise<void> =>
      ipcRenderer.invoke('db:verification:deleteCriteriaForTask', taskId),
    getCounts: (taskId: string): Promise<{ pending: number; pass: number; fail: number; total: number }> =>
      ipcRenderer.invoke('db:verification:getCriteriaCounts', taskId)
  },

  // Task Iterations
  iterations: {
    getForTask: (taskId: string): Promise<TaskIteration[]> =>
      ipcRenderer.invoke('db:verification:getIterations', taskId),
    get: (id: string): Promise<TaskIteration | null> =>
      ipcRenderer.invoke('db:verification:getIteration', id),
    getCurrentNumber: (taskId: string): Promise<number> =>
      ipcRenderer.invoke('db:verification:getCurrentIterationNumber', taskId),
    create: (taskId: string): Promise<TaskIteration> =>
      ipcRenderer.invoke('db:verification:createIteration', taskId),
    complete: (
      id: string,
      status: 'completed' | 'failed',
      durationMs: number,
      filesChanged?: Array<{ file_path: string; lines_added: number; lines_removed: number }>,
      verificationResult?: TaskVerificationResult
    ): Promise<void> =>
      ipcRenderer.invoke('db:verification:completeIteration', id, status, durationMs, filesChanged, verificationResult),
    getStats: (taskId: string): Promise<{
      totalIterations: number
      completedIterations: number
      failedIterations: number
      averageDurationMs: number
    }> =>
      ipcRenderer.invoke('db:verification:getIterationStats', taskId)
  },

  // Verification Templates
  templates: {
    getAll: (): Promise<VerificationTemplate[]> =>
      ipcRenderer.invoke('db:verification:getAllTemplates'),
    get: (id: string): Promise<VerificationTemplate | null> =>
      ipcRenderer.invoke('db:verification:getTemplate', id),
    getByName: (name: string): Promise<VerificationTemplate | null> =>
      ipcRenderer.invoke('db:verification:getTemplateByName', name),
    create: (name: string, criteria: AcceptanceCriterionInput[]): Promise<VerificationTemplate> =>
      ipcRenderer.invoke('db:verification:createTemplate', name, criteria),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('db:verification:deleteTemplate', id),
    applyToTask: (taskId: string, templateId: string): Promise<AcceptanceCriterion[]> =>
      ipcRenderer.invoke('db:verification:applyTemplate', taskId, templateId)
  },

  // Verification Execution
  runTask: (taskId: string, workingDir: string): Promise<TaskVerificationResult> =>
    ipcRenderer.invoke('verification:runTask', taskId, workingDir),
  markManual: (criterionId: string, passed: boolean, notes?: string): Promise<AcceptanceCriterion | null> =>
    ipcRenderer.invoke('verification:markManual', criterionId, passed, notes),
  getSummary: (taskId: string): Promise<{
    total: number
    passed: number
    failed: number
    pending: number
    manualPending: number
    allAutoPassed: boolean
    allPassed: boolean
  }> =>
    ipcRenderer.invoke('verification:getSummary', taskId),

  // Iteration Analytics (PRD Section 16)
  analytics: {
    getAverageIterationsToSuccess: (projectId: string): Promise<number> =>
      ipcRenderer.invoke('db:verification:getAverageIterationsToSuccess', projectId),
    getCommonFailurePatterns: (projectId: string): Promise<Array<{
      pattern: string
      frequency: number
      suggested_fix: string
    }>> =>
      ipcRenderer.invoke('db:verification:getCommonFailurePatterns', projectId),
    getSuggestedCriteria: (taskDescription: string, projectId?: string): Promise<AcceptanceCriterionInput[]> =>
      ipcRenderer.invoke('db:verification:getSuggestedCriteria', taskDescription, projectId),
    recordSuccessfulPattern: (taskId: string, pattern: string): Promise<void> =>
      ipcRenderer.invoke('db:verification:recordSuccessfulPattern', taskId, pattern),
    getIterationAnalytics: (taskId: string): Promise<{
      task_id: string
      total_iterations: number
      average_iteration_duration_ms: number
      success_rate: number
      common_failure_patterns: Array<{ pattern: string; frequency: number; suggested_fix: string }>
    }> =>
      ipcRenderer.invoke('db:verification:getIterationAnalytics', taskId)
  }
}

// Success Metrics API (PRD Section 31 - Key Performance Indicators)
export const successMetrics = {
  // Get all metrics for a project (or global if no projectId)
  getAll: (projectId?: string): Promise<SuccessMetrics[]> =>
    ipcRenderer.invoke('db:successMetrics:getAll', projectId),

  // Get a specific metric
  get: (metricType: SuccessMetricType, projectId?: string): Promise<SuccessMetrics | undefined> =>
    ipcRenderer.invoke('db:successMetrics:get', metricType, projectId),

  // Get summary with pass/fail status
  getSummary: (projectId?: string): Promise<{
    metrics: Array<{
      type: SuccessMetricType
      target: number
      current: number
      passed: boolean
      sampleCount: number
      description: string
    }>
    overallPassRate: number
    totalMetrics: number
    passingMetrics: number
  }> =>
    ipcRenderer.invoke('db:successMetrics:getSummary', projectId),

  // Record time to first task
  recordTimeToFirstTask: (projectId: string, projectCreatedAt: string, firstTaskStartedAt: string): Promise<void> =>
    ipcRenderer.invoke('db:successMetrics:recordTimeToFirstTask', projectId, projectCreatedAt, firstTaskStartedAt),

  // Record dangerous command catch
  recordDangerousCommandCatch: (projectId: string | null, caught: boolean): Promise<void> =>
    ipcRenderer.invoke('db:successMetrics:recordDangerousCommandCatch', projectId, caught),

  // Record recovery attempt
  recordRecoveryAttempt: (projectId: string, recovered: boolean): Promise<void> =>
    ipcRenderer.invoke('db:successMetrics:recordRecoveryAttempt', projectId, recovered),

  // Record benchmark results
  recordBenchmarkSimple: (passed: boolean): Promise<void> =>
    ipcRenderer.invoke('db:successMetrics:recordBenchmarkSimple', passed),
  recordBenchmarkMedium: (passed: boolean): Promise<void> =>
    ipcRenderer.invoke('db:successMetrics:recordBenchmarkMedium', passed),

  // Calculate rates from existing data
  calculateDangerousCommandRate: (projectId?: string): Promise<{
    total: number
    caught: number
    percentage: number
  }> =>
    ipcRenderer.invoke('db:successMetrics:calculateDangerousCommandRate', projectId),

  calculateRecoveryRate: (projectId?: string): Promise<{
    total: number
    recovered: number
    percentage: number
  }> =>
    ipcRenderer.invoke('db:successMetrics:calculateRecoveryRate', projectId)
}

/**
 * User Statements API (PRD Section 2 - Spec Drift Detection)
 */
export const userStatements = {
  // Get all user statements for a project
  getForProject: (projectId: string): Promise<UserStatement[]> =>
    ipcRenderer.invoke('db:userStatements:getForProject', projectId),

  // Get unaddressed user statements (for spec drift detection)
  getUnaddressed: (projectId: string): Promise<UserStatement[]> =>
    ipcRenderer.invoke('db:userStatements:getUnaddressed', projectId),

  // Get a single statement
  get: (id: string): Promise<UserStatement | undefined> =>
    ipcRenderer.invoke('db:userStatements:get', id),

  // Create a new user statement
  create: (projectId: string, text: string, source: UserStatementSource): Promise<UserStatement> =>
    ipcRenderer.invoke('db:userStatements:create', projectId, text, source),

  // Mark as addressed (linked to spec)
  markAddressed: (id: string, specReference: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:userStatements:markAddressed', id, specReference),

  // Mark as unaddressed
  markUnaddressed: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:userStatements:markUnaddressed', id),

  // Delete a statement
  delete: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:userStatements:delete', id),

  // Get statistics
  getStats: (projectId: string): Promise<{
    total: number
    addressed: number
    unaddressed: number
  }> =>
    ipcRenderer.invoke('db:userStatements:getStats', projectId)
}

/**
 * Spec Proposals API (PRD Section 5, lines 896-924)
 *
 * When Claude calls update_spec() via MCP, proposals are queued for human review.
 * Users can approve, edit & approve, or reject proposed spec updates.
 */
export const specProposals = {
  // Get pending spec proposals for a project
  getPending: (projectId?: string): Promise<SpecProposal[]> =>
    ipcRenderer.invoke('spec-proposals:getPending', projectId),

  // Get all spec proposals (including resolved) for a project
  getAll: (projectId?: string): Promise<SpecProposal[]> =>
    ipcRenderer.invoke('spec-proposals:getAll', projectId),

  // Resolve a spec proposal
  resolve: (
    id: number,
    status: SpecProposalStatus,
    notes?: string,
    editedContent?: string
  ): Promise<SpecProposal | undefined> =>
    ipcRenderer.invoke('spec-proposals:resolve', id, status, notes, editedContent)
}
