/**
 * Settings types for NERV
 *
 * Implements PRD Section 12: Settings Hierarchy
 * Priority (highest to lowest): Environment > Project > Global > Defaults
 */

/**
 * All available NERV settings keys
 */
export interface NervSettings {
  // Claude Model Configuration
  default_model: 'sonnet' | 'opus' | 'haiku'
  default_max_tokens: number // PRD Section 13: GlobalSettings.defaultMaxTokens (context window limit)
  max_turns: number

  // Budget & Costs
  monthly_budget_usd: number
  daily_budget_usd: number // PRD Section 20: org costLimits.perDayMax
  budget_warning_threshold: number
  budget_critical_threshold: number

  // Audit Configuration
  audit_cycle_frequency: number
  audit_test_coverage_threshold: number
  audit_dry_violation_limit: number
  audit_type_error_limit: number
  audit_dead_code_limit: number
  audit_complexity_threshold: number
  audit_enable_code_health: boolean
  audit_enable_plan_health: boolean

  // YOLO Mode
  yolo_max_cycles: number
  yolo_max_cost_usd: number
  yolo_max_duration_ms: number
  yolo_auto_approve_review: boolean
  yolo_auto_approve_dangerous_tools: boolean

  // Terminal
  terminal_cols: number
  terminal_rows: number
  terminal_font_size: number // PRD Section 13: GlobalSettings.terminalFontSize

  // UI Preferences (PRD Section 13: GlobalSettings)
  theme: 'light' | 'dark' | 'system'
  show_token_usage: boolean
  preferred_layout_mode: 'tabs' | 'split-horizontal' | 'split-vertical' | 'grid'

  // Session Management (PRD Section 13: GlobalSettings)
  max_concurrent_sessions: number
  auto_save_interval: number // milliseconds

  // Budget (PRD Section 13: GlobalSettings)
  per_task_budget_default: number // Default per-task budget in USD

  // Logging
  log_level: 'debug' | 'info' | 'warn' | 'error'
  output_format: 'text' | 'json'

  // Paths (can be overridden per-project)
  project_path: string | null
  config_path: string | null

  // Organization Configuration (PRD Section 20)
  org_name: string | null
  org_config_source_type: 'git' | 'local' | null
  org_config_url: string | null
  org_config_branch: string | null
  org_config_auth_method: 'ssh' | 'token' | 'none' | null
  org_auto_sync_enabled: boolean
  org_auto_sync_interval_minutes: number
  org_auto_sync_on_app_start: boolean
  org_auto_sync_on_project_open: boolean
  org_cache_path: string | null

  // Auto-Update Configuration (PRD Section 22)
  updates_auto_check: boolean
  updates_auto_download: boolean
  updates_auto_install: boolean
  updates_check_interval: number
  updates_channel: 'stable' | 'beta' | 'alpha'
  updates_allow_downgrade: boolean
  updates_feed_url: string | null
  updates_skip_version: string | null
}

/**
 * Partial settings for config files
 */
export type PartialNervSettings = Partial<NervSettings>

/**
 * Settings source for tracking where a value came from
 * Priority (highest to lowest): task > environment > repo > project > organization > global > default
 */
export type SettingsSource = 'default' | 'global' | 'organization' | 'project' | 'repo' | 'environment' | 'task'

/**
 * A resolved setting value with its source
 */
export interface ResolvedSetting<T> {
  value: T
  source: SettingsSource
}

/**
 * Environment variable mappings
 */
export interface SettingsEnvMapping {
  key: keyof NervSettings
  envVar: string
  type: 'string' | 'number' | 'boolean'
}

/**
 * Permission rules structure (PRD Section 13: GlobalSettings.defaultPermissions)
 * Used at global and project levels to define default permission behavior
 */
export interface PermissionRules {
  allow?: string[]   // e.g., ["Read", "Grep", "Glob", "Bash(npm test:*)"]
  deny?: string[]    // e.g., ["Bash(rm -rf /)", "Bash(sudo:*)"]
  requireApproval?: string[]  // e.g., ["Bash(rm:*)", "Write(~/.ssh/*)"]
}

/**
 * Global config file structure (~/.nerv/config.json)
 */
export interface GlobalConfig extends PartialNervSettings {
  // Version for future migrations
  config_version?: number

  // Default permission rules (PRD Section 13: GlobalSettings.defaultPermissions)
  defaultPermissions?: PermissionRules

  // Custom terminal profiles (PRD Section 10: Custom Terminal Profiles)
  // User-defined profiles that appear in the [+] dropdown under "─ Custom ─"
  terminalProfiles?: Array<{
    id: string
    name: string
    shell: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    icon?: string
  }>
}

/**
 * Project config file structure (.nerv/config.json or nerv.config.json)
 * PRD Section 13: ProjectSettings
 */
export interface ProjectConfig extends PartialNervSettings {
  // Version for future migrations
  config_version?: number
  // Project-specific overrides
  project_name?: string

  // Tool restrictions for this project (PRD Section 13: ProjectSettings)
  allowedTools?: string[]
  deniedTools?: string[]

  // Permission overrides for this project (PRD Section 13: ProjectSettings)
  defaultPermissions?: PermissionRules
  requireApprovalFor?: string[] // e.g., ["Bash:rm", "Bash:sudo"] — legacy shorthand for defaultPermissions.requireApproval
}

/**
 * Repo-level settings (PRD Section 13)
 * Stored in ~/.nerv/projects/{name}/repos/{repo}/settings.json
 */
export interface RepoSettings {
  // Build/Test commands for this repo
  buildCommand?: string // e.g., "npm run build"
  testCommand?: string // e.g., "npm test"
  lintCommand?: string // e.g., "npm run lint"

  // Tool restrictions for this repo
  allowedTools?: string[]
  deniedTools?: string[]

  // Paths to exclude from Claude operations
  excludePaths?: string[] // e.g., ["node_modules", "dist"]
}

/**
 * Task-level settings (PRD Section 13)
 * In-memory during task execution, highest priority
 */
export interface TaskSettings {
  // One-time model override
  model?: 'sonnet' | 'opus' | 'haiku'

  // Additional tools allowed for this task only
  additionalAllowedTools?: string[]

  // Permission bypasses (only in YOLO mode)
  bypassPermissions?: string[]
}

/**
 * Organization config source (git or local)
 */
export interface OrgConfigSource {
  type: 'git' | 'local'
  url?: string // Git URL or local path
  branch?: string // Git branch (only for git type)
  authMethod?: 'ssh' | 'token' | 'none' // Auth method (only for git type)
  path?: string // Local path (only for local type)
}

/**
 * Organization auto-sync settings
 */
export interface OrgAutoSyncSettings {
  enabled: boolean
  intervalMinutes: number
  onAppStart: boolean
  onProjectOpen: boolean
}

/**
 * Organization configuration in ~/.nerv/config.json
 */
export interface OrganizationConfig {
  name: string
  configSource: OrgConfigSource
  autoSync: OrgAutoSyncSettings
  localCache: string // Path to local cache directory
}

/**
 * Organization settings from the org config repository
 * Loaded from org-config/settings.json
 */
export interface OrganizationSettings {
  name: string

  // Default overrides (applied between Global and Project)
  defaults?: {
    model?: string
    maxTokens?: number
    reviewMode?: 'normal' | 'yolo'
    auditFrequency?: number
  }

  // Permissions (merged with user's, org rules take precedence)
  permissions?: {
    alwaysDeny?: string[]
    alwaysRequireApproval?: string[]
    alwaysAllow?: string[]
  }

  // Compliance settings
  compliance?: {
    requireAuditLog?: boolean
    sensitivePatterns?: string[]
    approvedModels?: string[]
  }

  // Cost controls
  costLimits?: {
    perTaskMax?: number
    perDayMax?: number
    perMonthMax?: number
    alertThreshold?: number
  }

  // Terminal profiles (inherited by all users in org)
  terminalProfiles?: Array<{
    id: string
    name: string
    shell: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    icon?: string
  }>

  // Auto-update policy (PRD Section 22)
  updates?: {
    /** Force all users to a specific channel */
    enforceChannel?: 'stable' | 'beta' | 'alpha'
    /** Block versions older than this */
    minimumVersion?: string
    /** Force auto-install on quit */
    autoInstall?: boolean
    /** Block specific versions (security issues) */
    blockVersions?: string[]
    /** Custom feed URL for internal mirror */
    feedUrl?: string
  }
}

/**
 * Organization sync status
 */
export interface OrgSyncStatus {
  configured: boolean
  lastSyncTime: string | null
  lastSyncSuccess: boolean
  lastSyncError: string | null
  localCachePath: string | null
  configSource: OrgConfigSource | null
}

/**
 * Terminal profile configuration (PRD Section 21)
 */
export interface TerminalProfile {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  icon?: string
}

/**
 * Settings service interface
 */
export interface SettingsService {
  /**
   * Get a setting value (resolved from hierarchy)
   */
  get<K extends keyof NervSettings>(key: K): NervSettings[K]

  /**
   * Get a setting with source information
   */
  getWithSource<K extends keyof NervSettings>(key: K): ResolvedSetting<NervSettings[K]>

  /**
   * Set a setting at the global level
   */
  setGlobal<K extends keyof NervSettings>(key: K, value: NervSettings[K]): void

  /**
   * Set a setting at the project level
   */
  setProject<K extends keyof NervSettings>(key: K, value: NervSettings[K]): void

  /**
   * Set repo-level settings for the current repo (PRD Section 13)
   */
  setRepoSettings(repoPath: string, settings: RepoSettings): void

  /**
   * Get repo-level settings (PRD Section 13)
   */
  getRepoSettings(repoPath: string): RepoSettings | null

  /**
   * Set task-level overrides (in-memory, highest priority) (PRD Section 13)
   */
  setTaskSettings(settings: TaskSettings | null): void

  /**
   * Get current task-level settings (PRD Section 13)
   */
  getTaskSettings(): TaskSettings | null

  /**
   * Get all settings (resolved)
   */
  getAll(): NervSettings

  /**
   * Get all settings with sources
   */
  getAllWithSources(): Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>>

  /**
   * Reload settings from disk
   */
  reload(): void
}
