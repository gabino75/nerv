/**
 * Shared constants for NERV
 * Single source of truth for configuration values
 */

import type { NervSettings, SettingsEnvMapping } from './types/settings'
import type { TerminalProfile } from './types/terminal'

// ============================================================================
// CLI Exit Codes (PRD Section 12)
// ============================================================================

export const CLI_EXIT_CODES = {
  SUCCESS: 0,           // Success
  GENERAL_ERROR: 1,     // General error
  INVALID_ARGS: 2,      // Invalid arguments
  PROJECT_NOT_FOUND: 3, // Project not found
  TASK_NOT_FOUND: 4,    // Task not found
  CLAUDE_FAILED: 5,     // Claude session failed
  PERMISSION_DENIED: 6, // Permission denied
  BENCHMARK_FAILED: 7,  // Benchmark failed (score < threshold)
} as const

// ============================================================================
// Model Configuration
// ============================================================================

export const MODEL_CONTEXT_SIZES: Record<string, number> = {
  // Current model IDs (PRD Section 29: Model Configuration & Opus 4.6)
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Short aliases
  'opus': 1_000_000,
  'sonnet': 200_000,
  'haiku': 200_000,
  // Legacy model IDs (backward compat for existing sessions)
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-3-5-20241022': 200_000,
} as const

export const DEFAULT_MODEL = 'sonnet'
export const DEFAULT_MAX_TURNS = 100

// ============================================================================
// Terminal Configuration
// ============================================================================

export const TERMINAL_DEFAULTS = {
  cols: 120,
  rows: 30,
} as const

export const PTY_DEFAULTS = {
  cols: 80,
  rows: 24,
} as const

// ============================================================================
// Terminal Profiles (PRD Section 21)
// ============================================================================

/**
 * Built-in terminal profiles available on all platforms
 * Platform-specific profiles are filtered at runtime
 */
export const BUILT_IN_TERMINAL_PROFILES: TerminalProfile[] = [
  {
    id: 'system-default',
    name: 'System Default',
    shell: '', // Empty string means use system default
    isDefault: true,
    isBuiltIn: true,
    source: 'built-in',
  },
  // Windows profiles
  {
    id: 'powershell',
    name: 'PowerShell',
    shell: 'pwsh.exe',
    args: ['-NoLogo'],
    isBuiltIn: true,
    source: 'built-in',
  },
  {
    id: 'powershell-legacy',
    name: 'Windows PowerShell',
    shell: 'powershell.exe',
    args: ['-NoLogo'],
    isBuiltIn: true,
    source: 'built-in',
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    shell: 'cmd.exe',
    isBuiltIn: true,
    source: 'built-in',
  },
  {
    id: 'git-bash',
    name: 'Git Bash',
    shell: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login', '-i'],
    isBuiltIn: true,
    source: 'built-in',
  },
  // Unix/Mac profiles
  {
    id: 'bash',
    name: 'Bash',
    shell: '/bin/bash',
    args: ['--login'],
    isBuiltIn: true,
    source: 'built-in',
  },
  {
    id: 'zsh',
    name: 'Zsh',
    shell: '/bin/zsh',
    args: ['--login'],
    isBuiltIn: true,
    source: 'built-in',
  },
]

/**
 * Get platform-appropriate built-in profiles
 */
export function getBuiltInProfilesForPlatform(): TerminalProfile[] {
  const isWindows = typeof process !== 'undefined' && process.platform === 'win32'

  return BUILT_IN_TERMINAL_PROFILES.filter(profile => {
    // System default is always available
    if (profile.id === 'system-default') return true

    // Filter by platform
    if (isWindows) {
      return ['powershell', 'powershell-legacy', 'cmd', 'git-bash'].includes(profile.id)
    } else {
      return ['bash', 'zsh'].includes(profile.id)
    }
  })
}

// ============================================================================
// Window Configuration
// ============================================================================

export const WINDOW_DEFAULTS = {
  width: 1400,
  height: 900,
  minWidth: 800,
  minHeight: 600,
} as const

// ============================================================================
// Session Tracking
// ============================================================================

export const COMPACTION_THRESHOLD = 0.5 // 50% drop in tokens indicates compaction

// ============================================================================
// Loop Detection (PRD Section 9)
// ============================================================================

export const LOOP_DETECTION = {
  historySize: 20,          // Maximum actions to track for loop detection
  repeatThreshold: 3,       // Number of repeats to trigger loop detection
  recentWindow: 10,         // Look at last N actions for repetition detection
} as const

// ============================================================================
// Session Recovery (PRD Section 9)
// ============================================================================

export const SESSION_RECOVERY = {
  hangThresholdMs: 10 * 60 * 1000,      // 10 minutes - notify if session silent
  hangCheckIntervalMs: 30 * 1000,        // Check every 30 seconds
  approvalWaitThresholdMs: 5 * 60 * 1000, // 5 minutes - notify if approval waiting
  approvalCheckIntervalMs: 30 * 1000,    // Check every 30 seconds
} as const

// ============================================================================
// Session Limits (PRD Section 10)
// ============================================================================

export const SESSION_LIMITS = {
  maxConcurrentSessions: 4,           // Maximum Claude sessions (PRD Section 10: default 4, configurable)
  totalContextBudget: 600_000,        // Total tokens across all sessions (PRD Section 10)
  perSessionDefaultBudget: 150_000,   // Default budget per session (600K / 4)
} as const

// ============================================================================
// Audit Configuration (PRD Section 5)
// ============================================================================

export const AUDIT_CYCLE_FREQUENCY = 3 // Trigger audit every N cycles (PRD default: 3)

export const AUDIT_THRESHOLDS = {
  testCoverage: 70,          // Minimum test coverage percentage
  dryViolationLimit: 5,      // Maximum DRY violations allowed
  typeErrorLimit: 0,         // Maximum type errors (any types) allowed
  deadCodeLimit: 10,         // Maximum dead code items allowed
  complexityThreshold: 50,   // Maximum lines per function
  staleTaskDays: 7,          // Days before a task is considered stale
} as const

export const AUDIT_SETTINGS_KEYS = {
  cycleFrequency: 'audit_cycle_frequency',
  testCoverageThreshold: 'audit_test_coverage_threshold',
  dryViolationLimit: 'audit_dry_violation_limit',
  typeErrorLimit: 'audit_type_error_limit',
  deadCodeLimit: 'audit_dead_code_limit',
  complexityThreshold: 'audit_complexity_threshold',
  enableCodeHealth: 'audit_enable_code_health',
  enablePlanHealth: 'audit_enable_plan_health',
} as const

// ============================================================================
// ID Generation
// ============================================================================

export const ID_RANDOM_LENGTH = 9

export function generateId(prefix?: string): string {
  const random = Math.random().toString(36).substring(2, 2 + ID_RANDOM_LENGTH)
  const timestamp = Date.now()
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
}

// ============================================================================
// Theme Colors (CSS custom properties defined in app.css)
// ============================================================================

export const THEME = {
  colors: {
    primary: '#ff6b35',
    primaryHover: '#ff8c5a',
    background: '#0a0a0f',
    backgroundLight: '#12121a',
    backgroundLighter: '#1a1a24',
    text: '#e0e0e0',
    textMuted: '#888',
    textDim: '#666',
    border: '#2a2a3a',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#ef4444',
    info: '#60a5fa',
  },
  zIndex: {
    dropdown: 100,
    modal: 1000,
    modalOverlay: 999,
    tooltip: 1500,
    notification: 2000,
  },
} as const

// ============================================================================
// Task Status Display
// ============================================================================

export const TASK_STATUS_CONFIG = {
  todo: { icon: '○', color: THEME.colors.textMuted, label: 'To Do' },
  in_progress: { icon: '●', color: THEME.colors.primary, label: 'In Progress' },
  interrupted: { icon: '◐', color: THEME.colors.warning, label: 'Interrupted' },
  review: { icon: '◉', color: THEME.colors.info, label: 'Review' },
  done: { icon: '✓', color: THEME.colors.success, label: 'Done' },
} as const

export const TASK_TYPE_LABELS = {
  implementation: 'Impl',
  research: 'Research',
  'bug-fix': 'Bug Fix',
  refactor: 'Refactor',
  debug: 'Debug',
} as const

// ============================================================================
// IPC Channel Names
// ============================================================================

export const IPC_CHANNELS = {
  // Terminal
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',

  // Claude
  CLAUDE_DATA: 'claude:data',
  CLAUDE_RAW_DATA: 'claude:rawData',
  CLAUDE_SESSION_ID: 'claude:sessionId',
  CLAUDE_TOKEN_USAGE: 'claude:tokenUsage',
  CLAUDE_COMPACTION: 'claude:compaction',
  CLAUDE_RESULT: 'claude:result',
  CLAUDE_EXIT: 'claude:exit',
} as const

// ============================================================================
// File Paths
// ============================================================================

export const NERV_DIR_NAME = '.nerv'
export const NERV_MD_FILENAME = 'NERV.md'
export const CLAUDE_MD_FILENAME = 'CLAUDE.md'

// ============================================================================
// Claude Code Tool Permissions (PRD §7-8)
// ============================================================================

// Safe tools that can be auto-approved
export const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'LS',
  'Bash(npm test:*)',
  'Bash(npm run:*)',
  'Bash(git log:*)',
  'Bash(git diff:*)',
  'Bash(git status)',
] as const

// Dangerous tools that should be blocked
export const DEFAULT_DISALLOWED_TOOLS = [
  'Bash(rm -rf /)',
  'Bash(sudo:*)',
  'Read(~/.ssh/*)',
  'Read(~/.nerv/*)',
  'Write(~/.nerv/*)',
  'Edit(~/.nerv/*)',
] as const

// ============================================================================
// YOLO Benchmark Configuration (Golden Test 2)
// ============================================================================

export const YOLO_BENCHMARK_DEFAULTS = {
  maxCycles: 10,
  maxCostUsd: 5.0,
  maxDurationMs: 30 * 60 * 1000, // 30 minutes
  autoApproveReview: true,
  autoApproveDangerousTools: false,
} as const

export const YOLO_BENCHMARK_GRADE_WEIGHTS = {
  specCompletion: 0.4,
  testPassRate: 0.4,
  costEfficiency: 0.2,
} as const

// ============================================================================
// Monthly Budget Configuration
// ============================================================================

export const MONTHLY_BUDGET_DEFAULTS = {
  budgetUsd: 50.0,           // Default monthly budget
  warningThreshold: 0.8,     // Alert at 80% of budget
  criticalThreshold: 0.95,   // Critical alert at 95% of budget
} as const

export const BUDGET_SETTINGS_KEYS = {
  monthlyBudget: 'monthly_budget_usd',
  warningThreshold: 'budget_warning_threshold',
  criticalThreshold: 'budget_critical_threshold',
} as const

// ============================================================================
// Settings Hierarchy (PRD Section 12)
// ============================================================================

/**
 * Default values for all NERV settings
 * These are used when no config file or environment variable overrides exist
 */
export const DEFAULT_SETTINGS: NervSettings = {
  // Claude Model Configuration
  default_model: 'sonnet',
  default_max_tokens: 200_000, // PRD Section 13: GlobalSettings.defaultMaxTokens
  max_turns: DEFAULT_MAX_TURNS,

  // Budget & Costs
  monthly_budget_usd: MONTHLY_BUDGET_DEFAULTS.budgetUsd,
  budget_warning_threshold: MONTHLY_BUDGET_DEFAULTS.warningThreshold,
  budget_critical_threshold: MONTHLY_BUDGET_DEFAULTS.criticalThreshold,

  // Audit Configuration
  audit_cycle_frequency: AUDIT_CYCLE_FREQUENCY,
  audit_test_coverage_threshold: AUDIT_THRESHOLDS.testCoverage,
  audit_dry_violation_limit: AUDIT_THRESHOLDS.dryViolationLimit,
  audit_type_error_limit: AUDIT_THRESHOLDS.typeErrorLimit,
  audit_dead_code_limit: AUDIT_THRESHOLDS.deadCodeLimit,
  audit_complexity_threshold: AUDIT_THRESHOLDS.complexityThreshold,
  audit_enable_code_health: true,
  audit_enable_plan_health: true,

  // YOLO Mode
  yolo_max_cycles: YOLO_BENCHMARK_DEFAULTS.maxCycles,
  yolo_max_cost_usd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd,
  yolo_max_duration_ms: YOLO_BENCHMARK_DEFAULTS.maxDurationMs,
  yolo_auto_approve_review: YOLO_BENCHMARK_DEFAULTS.autoApproveReview,
  yolo_auto_approve_dangerous_tools: YOLO_BENCHMARK_DEFAULTS.autoApproveDangerousTools,

  // Terminal
  terminal_cols: TERMINAL_DEFAULTS.cols,
  terminal_rows: TERMINAL_DEFAULTS.rows,
  terminal_font_size: 14, // PRD Section 13: GlobalSettings.terminalFontSize

  // UI Preferences (PRD Section 13: GlobalSettings)
  theme: 'system',
  show_token_usage: true,

  // Session Management (PRD Section 13: GlobalSettings)
  max_concurrent_sessions: 4, // PRD Section 10: max 4 concurrent sessions
  auto_save_interval: 30000, // 30 seconds in milliseconds

  // Budget (PRD Section 13: GlobalSettings)
  per_task_budget_default: 5.0, // Default $5 per task

  // Logging
  log_level: 'info',
  output_format: 'text',

  // Paths
  project_path: null,
  config_path: null,

  // Organization Configuration (PRD Section 20)
  org_name: null,
  org_config_source_type: null,
  org_config_url: null,
  org_config_branch: null,
  org_config_auth_method: null,
  org_auto_sync_enabled: false,
  org_auto_sync_interval_minutes: 60,
  org_auto_sync_on_app_start: true,
  org_auto_sync_on_project_open: true,
  org_cache_path: null,

  // Auto-Update Configuration (PRD Section 22)
  updates_auto_check: true,
  updates_auto_download: true,
  updates_auto_install: false,
  updates_check_interval: 3600000, // 1 hour in milliseconds
  updates_channel: 'stable',
  updates_allow_downgrade: false,
  updates_feed_url: null,
  updates_skip_version: null,
} as const

/**
 * Environment variable to settings key mappings
 * Format: NERV_<SETTING_NAME> in uppercase
 */
export const SETTINGS_ENV_MAPPINGS: SettingsEnvMapping[] = [
  // Claude Model Configuration
  { key: 'default_model', envVar: 'NERV_DEFAULT_MODEL', type: 'string' },
  { key: 'default_max_tokens', envVar: 'NERV_DEFAULT_MAX_TOKENS', type: 'number' },
  { key: 'max_turns', envVar: 'NERV_MAX_TURNS', type: 'number' },

  // Budget & Costs
  { key: 'monthly_budget_usd', envVar: 'NERV_MONTHLY_BUDGET_USD', type: 'number' },
  { key: 'budget_warning_threshold', envVar: 'NERV_BUDGET_WARNING_THRESHOLD', type: 'number' },
  { key: 'budget_critical_threshold', envVar: 'NERV_BUDGET_CRITICAL_THRESHOLD', type: 'number' },

  // Audit Configuration
  { key: 'audit_cycle_frequency', envVar: 'NERV_AUDIT_CYCLE_FREQUENCY', type: 'number' },
  { key: 'audit_test_coverage_threshold', envVar: 'NERV_AUDIT_TEST_COVERAGE_THRESHOLD', type: 'number' },
  { key: 'audit_enable_code_health', envVar: 'NERV_AUDIT_ENABLE_CODE_HEALTH', type: 'boolean' },
  { key: 'audit_enable_plan_health', envVar: 'NERV_AUDIT_ENABLE_PLAN_HEALTH', type: 'boolean' },

  // YOLO Mode
  { key: 'yolo_max_cycles', envVar: 'NERV_YOLO_MAX_CYCLES', type: 'number' },
  { key: 'yolo_max_cost_usd', envVar: 'NERV_YOLO_MAX_COST_USD', type: 'number' },
  { key: 'yolo_max_duration_ms', envVar: 'NERV_YOLO_MAX_DURATION_MS', type: 'number' },
  { key: 'yolo_auto_approve_review', envVar: 'NERV_YOLO_AUTO_APPROVE_REVIEW', type: 'boolean' },

  // Terminal (PRD Section 13)
  { key: 'terminal_font_size', envVar: 'NERV_TERMINAL_FONT_SIZE', type: 'number' },

  // UI Preferences (PRD Section 13)
  { key: 'theme', envVar: 'NERV_THEME', type: 'string' },
  { key: 'show_token_usage', envVar: 'NERV_SHOW_TOKEN_USAGE', type: 'boolean' },

  // Session Management (PRD Section 13)
  { key: 'max_concurrent_sessions', envVar: 'NERV_MAX_CONCURRENT_SESSIONS', type: 'number' },
  { key: 'auto_save_interval', envVar: 'NERV_AUTO_SAVE_INTERVAL', type: 'number' },

  // Budget (PRD Section 13)
  { key: 'per_task_budget_default', envVar: 'NERV_PER_TASK_BUDGET_DEFAULT', type: 'number' },

  // Logging
  { key: 'log_level', envVar: 'NERV_LOG_LEVEL', type: 'string' },
  { key: 'output_format', envVar: 'NERV_OUTPUT_FORMAT', type: 'string' },

  // Paths
  { key: 'project_path', envVar: 'NERV_PROJECT_PATH', type: 'string' },
  { key: 'config_path', envVar: 'NERV_CONFIG_PATH', type: 'string' },

  // Organization Configuration
  { key: 'org_name', envVar: 'NERV_ORG_NAME', type: 'string' },
  { key: 'org_config_source_type', envVar: 'NERV_ORG_CONFIG_SOURCE_TYPE', type: 'string' },
  { key: 'org_config_url', envVar: 'NERV_ORG_CONFIG_URL', type: 'string' },
  { key: 'org_config_branch', envVar: 'NERV_ORG_CONFIG_BRANCH', type: 'string' },
  { key: 'org_config_auth_method', envVar: 'NERV_ORG_CONFIG_AUTH_METHOD', type: 'string' },
  { key: 'org_auto_sync_enabled', envVar: 'NERV_ORG_AUTO_SYNC_ENABLED', type: 'boolean' },
  { key: 'org_auto_sync_interval_minutes', envVar: 'NERV_ORG_AUTO_SYNC_INTERVAL_MINUTES', type: 'number' },
  { key: 'org_auto_sync_on_app_start', envVar: 'NERV_ORG_AUTO_SYNC_ON_APP_START', type: 'boolean' },
  { key: 'org_auto_sync_on_project_open', envVar: 'NERV_ORG_AUTO_SYNC_ON_PROJECT_OPEN', type: 'boolean' },
  { key: 'org_cache_path', envVar: 'NERV_ORG_CACHE_PATH', type: 'string' },

  // Auto-Update Configuration
  { key: 'updates_auto_check', envVar: 'NERV_UPDATES_AUTO_CHECK', type: 'boolean' },
  { key: 'updates_auto_download', envVar: 'NERV_UPDATES_AUTO_DOWNLOAD', type: 'boolean' },
  { key: 'updates_auto_install', envVar: 'NERV_UPDATES_AUTO_INSTALL', type: 'boolean' },
  { key: 'updates_check_interval', envVar: 'NERV_UPDATES_CHECK_INTERVAL', type: 'number' },
  { key: 'updates_channel', envVar: 'NERV_UPDATES_CHANNEL', type: 'string' },
  { key: 'updates_allow_downgrade', envVar: 'NERV_UPDATES_ALLOW_DOWNGRADE', type: 'boolean' },
  { key: 'updates_feed_url', envVar: 'NERV_UPDATES_FEED_URL', type: 'string' },
  { key: 'updates_skip_version', envVar: 'NERV_UPDATES_SKIP_VERSION', type: 'string' },
]

/**
 * Config file names to look for
 */
export const CONFIG_FILE_NAMES = {
  global: 'config.json',           // ~/.nerv/config.json
  projectDir: '.nerv/config.json', // <project>/.nerv/config.json
  projectRoot: 'nerv.config.json', // <project>/nerv.config.json
} as const

/**
 * Organization configuration constants (PRD Section 20)
 */
export const ORG_CONFIG = {
  // Default cache directory relative to ~/.nerv/
  defaultCacheDir: 'org-config',
  // Settings file in org config repo
  settingsFile: 'settings.json',
  // Permissions file in org config repo
  permissionsFile: 'permissions.json',
  // Directories in org config repo
  directories: {
    agents: 'agents',
    skills: 'skills',
    workflows: 'workflows',
    templates: 'templates',
    hooks: 'hooks',
    terminalProfiles: 'terminal-profiles',
  },
  // Default sync interval in minutes
  defaultSyncIntervalMinutes: 60,
  // Sync status file
  syncStatusFile: 'sync-status.json',
} as const
