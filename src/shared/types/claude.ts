/**
 * Claude Code integration types
 */

import type { CustomAgentsConfig } from './agents'

/** Teammate definition for Agent Teams (PRD Agent Teams section) */
export interface TeammateConfig {
  name: string
  prompt: string
}

export interface ClaudeSpawnConfig {
  taskId?: string  // Optional for standalone sessions
  projectId: string
  cwd: string
  prompt: string
  systemPrompt?: string
  additionalDirs?: string[]
  model?: string
  maxTurns?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  mcpConfigPath?: string
  customAgents?: CustomAgentsConfig
  /** Use a specific agent for the session (--agent flag) */
  agent?: string
  /** Continue last session (--continue flag, PRD Section 5) */
  continueSession?: boolean
  /** Start in a specific permission mode (--permission-mode flag, PRD Section 5) */
  permissionMode?: 'default' | 'plan' | 'bypassPermissions'
  /** Input format for stream chaining (--input-format flag, PRD Section 5) */
  inputFormat?: 'text' | 'stream-json'
  /** Adaptive thinking effort level (maps to --thinking-budget-tokens) */
  thinkingEffort?: 'low' | 'medium' | 'high' | 'max'
  /** Enable Agent Teams mode (PRD Agent Teams section) */
  agentTeams?: boolean
  /** Teammate definitions for Agent Teams (PRD Agent Teams section) */
  teammates?: TeammateConfig[]
}

export interface ClaudeTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ClaudeSessionInfo {
  taskId: string
  projectId: string
  claudeSessionId: string | null
  model: string
  tokenUsage: ClaudeTokenUsage
  compactionCount: number
  isRunning: boolean
  spawnArgs: string[]
}

export interface ClaudeResult {
  cost_usd?: number
  duration_ms?: number
  num_turns?: number
}

/**
 * Active session summary for Active Sessions panel (PRD Section 10)
 */
export interface ActiveClaudeSession {
  sessionId: string
  taskId: string | null
  projectId: string
  claudeSessionId: string | null
  model: string
  tokenUsage: ClaudeTokenUsage
  compactionCount: number
  isRunning: boolean
  isPaused: boolean
}

export interface ClaudeSpawnResult {
  success: boolean
  sessionId?: string
  error?: string
}

/**
 * Tab type for terminal sessions
 */
export type TabType = 'claude' | 'shell'

/**
 * Represents a terminal tab (PRD Section 10: Concurrent Sessions)
 * Supports both Claude Code sessions and regular shell terminals
 */
export interface ClaudeTab {
  id: string
  title: string
  type: TabType // 'claude' for Claude Code, 'shell' for regular terminal
  taskId: string | null // null for standalone/generic sessions (Claude only)
  projectId: string
  sessionId: string | null // Claude session ID once spawned (Claude only)
  terminalId: string | null // PTY terminal ID (shell only)
  isRunning: boolean
  createdAt: string
  paneId?: string // Which split pane this tab belongs to (for split view)
}

/**
 * Split view direction for terminal panes
 */
export type SplitDirection = 'horizontal' | 'vertical'

/**
 * Split view layout mode
 * PRD Section 10: tabs, horizontal split, vertical split, and 2x2 grid
 */
export type LayoutMode = 'tabs' | 'split-horizontal' | 'split-vertical' | 'grid'

/**
 * Split pane structure for terminal layout
 */
export interface SplitPane {
  id: string
  tabs: string[] // Tab IDs in this pane
  activeTabId: string | null // Currently active tab in this pane
}

/**
 * Terminal split layout state
 */
export interface SplitLayout {
  mode: LayoutMode
  panes: SplitPane[] // Array of panes (2 for split, 4 for grid)
  splitRatio: number // 0-1, position of divider (0.5 = 50/50 split)
  gridRatios?: { horizontal: number; vertical: number } // For grid mode: position of h/v dividers
  focusedPaneId: string | null // Which pane has focus
}
