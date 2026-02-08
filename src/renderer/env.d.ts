/// <reference types="svelte" />
/// <reference types="vite/client" />

// Import all types from shared types
import type {
  Project,
  Task,
  TaskType,
  TaskStatus,
  Approval,
  ApprovalStatus,
  Cycle,
  CycleStatus,
  SessionMetrics,
  Repo,
  Decision,
  Branch,
  BranchStatus,
  AuditLogEntry,
  DocumentationSource,
  ClaudeMdSection,
  ClaudeMdSuggestions,
  ClaudeSpawnConfig,
  ClaudeSpawnResult,
  ClaudeTokenUsage,
  ClaudeSessionInfo,
  ClaudeResult,
  ActiveClaudeSession,
  NervMdSizeCheck,
  PermissionConfig,
  HookConfig,
  IntegrityIssue,
  IntegrityReport,
  LoopResult,
  BranchContext,
  BranchSummary,
  BranchCreateResult,
  WorktreeInfo,
  TaskWorktreeResult,
  WorktreeStatus,
  ProjectWorktrees,
  ProjectExport,
  ProjectImport,
} from '../shared/types'

// Re-export for global usage in components
export type {
  Project,
  Task,
  TaskType,
  TaskStatus,
  Approval,
  ApprovalStatus,
  Cycle,
  CycleStatus,
  SessionMetrics,
  Repo,
  Decision,
  Branch,
  BranchStatus,
  AuditLogEntry,
  DocumentationSource,
  ClaudeMdSection,
  ClaudeMdSuggestions,
  ClaudeSpawnConfig,
  ClaudeSpawnResult,
  ClaudeTokenUsage,
  ClaudeSessionInfo,
  ClaudeResult,
  ActiveClaudeSession,
  NervMdSizeCheck,
  PermissionConfig,
  HookConfig,
  IntegrityIssue,
  IntegrityReport,
  LoopResult,
  BranchContext,
  BranchSummary,
  BranchCreateResult,
  WorktreeInfo,
  TaskWorktreeResult,
  WorktreeStatus,
  ProjectWorktrees,
  ProjectExport,
  ProjectImport,
}

// Database API types
interface DatabaseAPI {
  projects: {
    getAll: () => Promise<Project[]>
    get: (id: string) => Promise<Project | undefined>
    create: (name: string, goal?: string) => Promise<Project>
    update: (id: string, updates: Partial<Pick<Project, 'name' | 'goal'>>) => Promise<Project | undefined>
    delete: (id: string) => Promise<void>
  }
  tasks: {
    getForProject: (projectId: string) => Promise<Task[]>
    get: (id: string) => Promise<Task | undefined>
    create: (projectId: string, title: string, description?: string, cycleId?: string) => Promise<Task>
    updateStatus: (id: string, status: TaskStatus) => Promise<Task | undefined>
    updateSession: (id: string, sessionId: string) => Promise<Task | undefined>
    updateWorktree: (id: string, worktreePath: string) => Promise<Task | undefined>
    delete: (id: string) => Promise<void>
    getInterrupted: () => Promise<Task[]>
  }
  approvals: {
    getPending: (taskId?: string) => Promise<Approval[]>
    getAll: () => Promise<Approval[]>
    create: (taskId: string, toolName: string, toolInput?: string, context?: string) => Promise<Approval>
    resolve: (id: number, status: 'approved' | 'denied', denyReason?: string) => Promise<Approval | undefined>
  }
  cycles: {
    getForProject: (projectId: string) => Promise<Cycle[]>
    get: (id: string) => Promise<Cycle | undefined>
    getActive: (projectId: string) => Promise<Cycle | undefined>
    getNextNumber: (projectId: string) => Promise<number>
    create: (projectId: string, cycleNumber: number, goal?: string) => Promise<Cycle>
    update: (id: string, updates: Partial<Pick<Cycle, 'goal' | 'learnings'>>) => Promise<Cycle | undefined>
    complete: (id: string, learnings?: string) => Promise<Cycle | undefined>
    getTasks: (cycleId: string) => Promise<Task[]>
  }
  metrics: {
    get: (taskId: string) => Promise<SessionMetrics | undefined>
    update: (taskId: string, metrics: {
      inputTokens?: number
      outputTokens?: number
      compactionCount?: number
      model?: string
      sessionId?: string
    }) => Promise<SessionMetrics>
    getModelStats: () => Promise<Array<{
      model: string
      task_count: number
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      total_duration_ms: number
      avg_turns: number
    }>>
    getAll: () => Promise<SessionMetrics[]>
    // PRD Section 6: Reset compactions since last /clear
    resetCompactionsSinceClear: (taskId: string) => Promise<void>
  }
  repos: {
    getForProject: (projectId: string) => Promise<Repo[]>
    create: (projectId: string, name: string, path: string, stack?: string) => Promise<Repo>
  }
  decisions: {
    getForProject: (projectId: string) => Promise<Decision[]>
    getForCycle: (cycleId: string) => Promise<Decision[]>
    get: (id: string) => Promise<Decision | undefined>
    create: (projectId: string, title: string, rationale?: string, cycleId?: string, alternatives?: string) => Promise<Decision>
    update: (id: string, updates: Partial<Pick<Decision, 'title' | 'rationale' | 'alternatives'>>) => Promise<Decision | undefined>
    delete: (id: string) => Promise<void>
  }
  branches: {
    getForTask: (taskId: string) => Promise<Branch[]>
    create: (parentTaskId: string, parentSessionId?: string) => Promise<Branch>
    updateStatus: (id: string, status: BranchStatus, summary?: string) => Promise<Branch | undefined>
  }
  audit: {
    log: (taskId: string | null, eventType: string, details: string | null) => Promise<void>
    get: (taskId?: string, limit?: number) => Promise<AuditLogEntry[]>
  }
  docSources: {
    getForProject: (projectId: string) => Promise<DocumentationSource[]>
    create: (projectId: string, name: string, urlPattern: string) => Promise<DocumentationSource>
    update: (id: string, updates: { name?: string; urlPattern?: string }) => Promise<DocumentationSource | undefined>
    delete: (id: string) => Promise<void>
  }
}

// Extended Tasks API types
interface TasksExtendedAPI {
  createWithType: (
    projectId: string,
    title: string,
    taskType: TaskType,
    description?: string,
    cycleId?: string
  ) => Promise<Task>
  updateDescription: (id: string, description: string) => Promise<Task | undefined>
}

// Terminal API types
interface TerminalAPI {
  create: (cwd?: string) => Promise<string>
  write: (terminalId: string, data: string) => Promise<void>
  resize: (terminalId: string, cols: number, rows: number) => Promise<void>
  kill: (terminalId: string) => Promise<void>
  exists: (terminalId: string) => Promise<boolean>
  onData: (callback: (terminalId: string, data: string) => void) => void
  onExit: (callback: (terminalId: string, exitCode: number) => void) => void
  removeAllListeners: () => void
}

// Claude Code API types (PRD Sections 6, 10)
interface ClaudeAPI {
  spawn: (config: ClaudeSpawnConfig) => Promise<ClaudeSpawnResult>
  resume: (config: ClaudeSpawnConfig, claudeSessionId: string) => Promise<ClaudeSpawnResult>
  write: (sessionId: string, data: string) => Promise<void>
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>
  kill: (sessionId: string) => Promise<void>
  exists: (sessionId: string) => Promise<boolean>
  getInfo: (sessionId: string) => Promise<ClaudeSessionInfo | null>
  // PRD Section 10: Multi-session management
  getAllSessions: () => Promise<ActiveClaudeSession[]>
  pause: (sessionId: string) => Promise<boolean>
  unpause: (sessionId: string) => Promise<boolean>
  isPaused: (sessionId: string) => Promise<boolean>
  getFileConflicts: () => Promise<Array<{
    filePath: string
    sessions: Array<{ sessionId: string; accessType: string }>
  }>>
  // Event listeners
  onData: (callback: (sessionId: string, data: string) => void) => void
  onRawData: (callback: (sessionId: string, data: string) => void) => void
  onSessionId: (callback: (sessionId: string, claudeSessionId: string) => void) => void
  // PRD Section 6: includes compactionsSinceClear
  onTokenUsage: (callback: (sessionId: string, usage: ClaudeTokenUsage, compactionCount: number, compactionsSinceClear: number) => void) => void
  onCompaction: (callback: (sessionId: string, count: number) => void) => void
  onResult: (callback: (sessionId: string, result: ClaudeResult) => void) => void
  onExit: (callback: (sessionId: string, exitCode: number, signal?: number) => void) => void
  // PRD Section 10: Subagent events
  onSubagentSpawn: (callback: (sessionId: string, subagent: unknown) => void) => void
  onSubagentComplete: (callback: (sessionId: string, subagent: unknown) => void) => void
  // PRD Section 10: Pause/resume events
  onPaused: (callback: (sessionId: string) => void) => void
  onResumed: (callback: (sessionId: string) => void) => void
  // PRD Section 10: File conflict event
  onFileConflict: (callback: (conflict: {
    sessionId: string
    filePath: string
    conflictingSessionId: string
    accessType: string
  }) => void) => void
  removeAllListeners: () => void
}

// NERV.md API types
interface NervMdAPI {
  generate: (projectId: string, currentTaskId?: string) => Promise<string>
  save: (projectId: string, currentTaskId?: string) => Promise<string>
  getPath: (projectId: string) => Promise<string>
  estimateTokens: (content: string) => Promise<number>
  checkSize: (content: string) => Promise<NervMdSizeCheck>
}

// Hooks API types
interface HooksAPI {
  ensureBinary: () => Promise<string>
  generateConfig: (projectId: string, taskId: string, permissions?: PermissionConfig) => Promise<HookConfig>
  writeProjectConfig: (
    projectPath: string,
    projectId: string,
    taskId: string,
    permissions?: PermissionConfig
  ) => Promise<string>
  loadPermissions: () => Promise<PermissionConfig>
  savePermissions: (permissions: PermissionConfig) => Promise<void>
  addAllowRule: (pattern: string) => Promise<void>
  addDenyRule: (pattern: string) => Promise<void>
  removeAllowRule: (pattern: string) => Promise<void>
  removeDenyRule: (pattern: string) => Promise<void>
  generatePatterns: (toolName: string, toolInput: Record<string, unknown>) => Promise<string[]>
  getDefaultPermissions: () => Promise<PermissionConfig>
}

// Recovery API types
interface RecoveryAPI {
  checkIntegrity: () => Promise<IntegrityReport>
  abandonTask: (taskId: string) => Promise<void>
  markInterrupted: (taskId: string) => Promise<void>
  startMonitor: (sessionId: string, taskId: string) => Promise<void>
  stopMonitor: (sessionId: string) => Promise<void>
  recordOutput: (sessionId: string) => Promise<void>
  recordAction: (sessionId: string, action: string) => Promise<void>
  notifyCompaction: (sessionId: string, taskId: string, count: number, sinceClear: number) => Promise<void>
  onHangDetected: (callback: (sessionId: string, taskId: string, silentDuration: number) => void) => void
  onLoopDetected: (callback: (sessionId: string, taskId: string, loopResult: LoopResult) => void) => void
  onCompactionNotice: (callback: (sessionId: string, taskId: string, count: number, sinceClear: number) => void) => void
  removeAllListeners: () => void
}

// Branching API types
interface BranchingAPI {
  create: (taskId: string, parentSessionId: string | null, context: BranchContext) => Promise<BranchCreateResult>
  merge: (branchId: string, summary: string) => Promise<Branch | undefined>
  discard: (branchId: string) => Promise<Branch | undefined>
  getForTask: (taskId: string) => Promise<Branch[]>
  getActive: (taskId: string) => Promise<Branch | undefined>
  generateClearContext: (taskId: string, summary: BranchSummary) => Promise<string>
  appendLearnings: (taskId: string, learnings: string) => Promise<void>
  onBranchCreated: (callback: (branch: Branch) => void) => void
  onBranchMerged: (callback: (branch: Branch) => void) => void
  onBranchDiscarded: (callback: (branch: Branch) => void) => void
  removeAllListeners: () => void
}

// CLAUDE.md API types
interface ClaudeMdAPI {
  getPath: (projectId: string) => Promise<string>
  exists: (projectId: string) => Promise<boolean>
  read: (projectId: string) => Promise<string | null>
  save: (projectId: string, content: string) => Promise<string>
  initialize: (projectId: string) => Promise<string>
  parse: (content: string) => Promise<ClaudeMdSection[]>
  updateSection: (projectId: string, sectionName: string, newContent: string) => Promise<string>
  appendNote: (projectId: string, note: string) => Promise<void>
  getSuggestions: (projectId: string) => Promise<ClaudeMdSuggestions>
}

// Worktree API types
interface WorktreeAPI {
  create: (repoPath: string, taskId: string, baseBranch?: string) => Promise<TaskWorktreeResult>
  createForTask: (taskId: string, projectId: string) => Promise<TaskWorktreeResult[]>
  remove: (worktreePath: string) => Promise<void>
  cleanup: (repoPath: string) => Promise<string[]>
  list: (repoPath: string) => Promise<WorktreeInfo[]>
  listForProject: (projectId: string) => Promise<ProjectWorktrees[]>
  getStatus: (worktreePath: string) => Promise<WorktreeStatus>
  isGitRepo: (path: string) => Promise<boolean>
  getMainBranch: (repoPath: string) => Promise<string>
  onCreated: (callback: (result: TaskWorktreeResult | TaskWorktreeResult[]) => void) => void
  onRemoved: (callback: (data: { path: string }) => void) => void
  onCleaned: (callback: (data: { repoPath: string; cleaned: string[] }) => void) => void
  removeAllListeners: () => void
}

// Export/Import API types
interface ProjectIOAPI {
  export: (projectId: string) => Promise<ProjectExport | null>
  import: (data: ProjectImport) => Promise<Project>
}

// MCP Configuration API types
interface McpAPI {
  generateConfig: (projectId: string, allowedDomains: string[]) => Promise<string>
  getConfigPath: (projectId: string) => Promise<string | null>
  deleteConfig: (projectId: string) => Promise<void>
  readConfig: (projectId: string) => Promise<unknown>
  updateDomains: (projectId: string, allowedDomains: string[]) => Promise<string | null>
  generateFromDocSources: (projectId: string, taskId?: string) => Promise<string | null>
}

// Extend Window interface
declare global {
  interface Window {
    api: {
      versions: {
        node: () => string
        chrome: () => string
        electron: () => string
      }
      db: DatabaseAPI
      tasksExtended: TasksExtendedAPI
      terminal: TerminalAPI
      claude: ClaudeAPI
      nervMd: NervMdAPI
      claudeMd: ClaudeMdAPI
      hooks: HooksAPI
      recovery: RecoveryAPI
      branching: BranchingAPI
      worktree: WorktreeAPI
      projectIO: ProjectIOAPI
      mcp: McpAPI
    }
  }
}

export {}
