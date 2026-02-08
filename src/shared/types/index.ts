/**
 * Shared type definitions for NERV
 * Single source of truth - imported by main, preload, and renderer
 *
 * Types are organized into modules:
 * - database.ts: Database entity types
 * - claude.ts: Claude Code integration types
 * - ui.ts: UI state types
 * - claude-md.ts: CLAUDE.md and NERV.md types
 * - hooks.ts: Permission and hook types
 * - recovery.ts: Recovery and integrity types
 * - branching.ts: Branching types
 * - worktree.ts: Worktree types
 * - export-import.ts: Export/Import types
 * - yolo.ts: YOLO benchmark types
 * - subagents.ts: Subagent tracking types
 * - agents.ts: Custom agent definitions
 * - benchmark.ts: Benchmark output types
 * - repo-context.ts: Repository context scanning types
 * - settings.ts: Settings hierarchy types (PRD Section 12)
 */

// Database entity types
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
  RepoSourceType,
  Decision,
  Branch,
  BranchStatus,
  AuditLogEntry,
  DocumentationSource,
  TaskReview,
  TaskReviewStatus,
  ReviewContext,
  DebugFinding,
  DebugFindingType,
  ReviewMode,
  SpecProposal,
  SpecProposalStatus,
  SpecDriftReport,
  SpecDriftItem,
  SpecDriftContradiction,
  Learning,
  LearningCategory,
  LearningSource
} from './database'

// Claude Code types
export type {
  ClaudeSpawnConfig,
  ClaudeTokenUsage,
  ClaudeSessionInfo,
  ClaudeResult,
  ClaudeSpawnResult,
  ClaudeTab,
  ActiveClaudeSession
} from './claude'

// UI state types
export type { AppState, DeepPartial } from './ui'

// CLAUDE.md types
export type {
  ClaudeMdSection,
  ClaudeMdSuggestions,
  NervMdSizeCheck
} from './claude-md'

// Hook types
export type { PermissionConfig, HookConfig } from './hooks'

// Recovery types
export type {
  IntegrityIssue,
  IntegrityReport,
  DatabaseHealth,
  LoopResult
} from './recovery'

// Branching types
export type {
  BranchContext,
  BranchSummary,
  BranchCreateResult
} from './branching'

// Worktree types
export type {
  WorktreeInfo,
  TaskWorktreeResult,
  WorktreeStatus,
  ProjectWorktrees
} from './worktree'

// Export/Import types
export type { ProjectExport, ProjectImport } from './export-import'

// YOLO benchmark types
export type {
  YoloBenchmarkStatus,
  YoloBenchmarkConfig,
  YoloBenchmarkResult,
  YoloBenchmarkGrade,
  YoloBenchmarkComparison
} from './yolo'

// Subagent types
export type {
  SubagentStatus,
  Subagent,
  SubagentSpawnEvent,
  SubagentCompleteEvent,
  SubagentUsage
} from './subagents'

// Custom agent types and built-in skills
export type { CustomAgentDefinition, CustomAgentsConfig, BuiltInSkill, SkillDefinition, MarketplaceSkill } from './agents'

// Benchmark output types
export type {
  BenchmarkOutcome,
  BenchmarkConfig,
  BenchmarkSummary,
  BenchmarkScores,
  BenchmarkProgression,
  BenchmarkScoreDetail,
  BenchmarkOverallScore,
  BenchmarkStreamEntry,
  BenchmarkToolEntry,
  BenchmarkSubagentEntry,
  BenchmarkTimelineEntry,
  BenchmarkPermissionRequest,
  BenchmarkPermissionDecision,
  BenchmarkVisualTest,
  BenchmarkHistoryEntry,
  ParsedSpec,
  ParsedCycle,
  ParsedSubtask,
  NervOpsScore,
  NervOpsBreakdown,
  ReviewDecision,
  BenchmarkPipelineConfig,
  BenchmarkPipelineResult,
  BenchmarkTaskResult,
  BenchmarkCycleResult,
  CycleSuggestion,
  UserScenario,
  MidProjectEvent,
  UIBenchmarkPhaseResult,
  UIBenchmarkSetupResult,
  UIBenchmarkBuildResult,
  UIBenchmarkGradeResult,
  UIBenchmarkResult,
  UIBenchmarkEventLog
} from './benchmark'

// Repository context types
export type {
  RepoContextType,
  RepoContext,
  RepoSkill,
  ParsedClaudeMd,
  RepoScanResult
} from './repo-context'

// Settings types (PRD Section 12)
export type {
  NervSettings,
  PartialNervSettings,
  SettingsSource,
  ResolvedSetting,
  SettingsEnvMapping,
  GlobalConfig,
  ProjectConfig,
  SettingsService
} from './settings'

// Terminal profile types (PRD Section 21)
export type {
  TerminalProfile,
  BuiltInProfileId,
  TerminalProfilesConfig,
  TerminalCreateResult
} from './terminal'

// Auto-update types (PRD Section 22)
export type {
  UpdateChannel,
  UpdateSettings,
  OrgUpdatePolicy,
  UpdateStatus,
  UpdateInfo,
  AutoUpdateState,
  DownloadProgress,
  CheckUpdateResult,
  UpdateAction
} from './auto-update'

// Multi-instance types (PRD Section 11)
export type {
  InstanceInfo,
  ProjectLock,
  LockAcquisitionResult,
  LockedProjectAction,
  LockedProjectDialogState,
  ResourceLimits,
  SharedGlobalState,
  InstanceManager
} from './instance'

// Spec Verification types (PRD Section 16)
export type {
  VerifierType,
  CriterionStatus,
  AcceptanceCriterion,
  VerifierResult,
  TaskVerificationResult,
  TaskIteration,
  IterationFileChange,
  IterationSettings,
  VerificationTemplate,
  FailurePattern,
  IterationAnalytics,
  AcceptanceCriterionInput,
  ApplyTemplateInput
} from './verification'

export { DEFAULT_ITERATION_SETTINGS } from './verification'

// Crash Reporter types (PRD Section 24 Phase 8)
export type { CrashReport } from './crash-reporter'
