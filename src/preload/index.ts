/**
 * Preload script - exposes API to renderer via context bridge
 *
 * This file re-exports from the modular api structure for backwards compatibility.
 * The actual API definitions are split across files in ./api/ directory:
 *
 * - api/database.ts: Database API (projects, tasks, cycles, etc.)
 * - api/terminal.ts: Terminal API
 * - api/claude.ts: Claude Code session API
 * - api/nerv-md.ts: NERV.md and CLAUDE.md API
 * - api/hooks.ts: Permission hooks API
 * - api/recovery.ts: Recovery and monitoring API
 * - api/branching.ts: Session branching API
 * - api/worktree.ts: Git worktree API
 * - api/yolo.ts: YOLO benchmark API
 * - api/misc.ts: Miscellaneous APIs (versions, export/import, etc.)
 */

import { contextBridge } from 'electron'
import { api } from './api'

// Expose API to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[NERV] Failed to expose API to renderer:', error)
    throw new Error(`Failed to initialize NERV API: ${error instanceof Error ? error.message : String(error)}`)
  }
} else {
  // @ts-expect-error - for non-isolated context
  window.api = api
}

// Re-export API type
export type { NervAPI } from './api'

// Re-export types for use in renderer
export type {
  Project,
  Task,
  Approval,
  Cycle,
  SessionMetrics,
  Repo,
  Decision,
  Branch,
  AuditLogEntry,
  DocumentationSource,
  ClaudeMdSection,
  ClaudeMdSuggestions,
  ClaudeSpawnConfig,
  ClaudeSpawnResult,
  ClaudeTokenUsage,
  ClaudeSessionInfo,
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
  YoloBenchmarkConfig,
  YoloBenchmarkResult,
  YoloBenchmarkStatus,
  YoloBenchmarkGrade,
  Subagent,
  SubagentStatus,
  SubagentUsage,
  TaskReview,
  TaskReviewStatus,
  DebugFinding,
  DebugFindingType,
  BuiltInSkill,
} from '../shared/types'

// Re-export settings types (PRD Section 13)
export type {
  NervSettings,
  PartialNervSettings,
  SettingsSource,
  ResolvedSetting,
  GlobalConfig,
  ProjectConfig,
  RepoSettings,
  TaskSettings,
  OrganizationSettings,
  OrgSyncStatus,
  SettingsService
} from '../shared/types/settings'
