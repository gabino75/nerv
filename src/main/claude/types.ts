/**
 * Claude session internal types
 */

import type { IPty } from 'node-pty'

// Stream JSON message types from Claude Code
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result'
  subtype?: string
  message?: {
    content?: Array<{
      type: string
      text?: string
      tool_use_id?: string
      id?: string // tool_use block id
      name?: string
      input?: unknown
    }>
  }
  session_id?: string
  result?: {
    cost_usd?: number
    duration_ms?: number
    num_turns?: number
  }
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

// Task tool input structure (for subagent detection)
export interface TaskToolInput {
  subagent_type: string
  prompt: string
  description?: string
  model?: string
}

// Token usage tracking
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

// File access types for conflict detection (PRD Section 10)
export type FileAccessType = 'read' | 'write' | 'edit'

export interface SessionFileAccess {
  sessionId: string
  filePath: string
  accessType: FileAccessType
  timestamp: number
}

// Session state
export interface ClaudeSession {
  id: string
  taskId: string | null  // null for standalone sessions
  projectId: string
  pty: IPty
  sessionId: string | null
  model: string
  tokenUsage: TokenUsage
  compactionCount: number
  compactionsSinceClear: number  // PRD Section 6: "Since last /clear" counter
  lastOutputTime: number
  jsonBuffer: string
  isRunning: boolean
  isPaused: boolean // PRD Section 10: Session pause capability
  spawnArgs: string[] // CLI args used to spawn the session
  // Map of tool_use_id to subagent ID for tracking Task tool invocations
  pendingSubagents: Map<string, string>
  // Files this session is currently accessing (PRD Section 10: Conflict detection)
  activeFiles: Map<string, FileAccessType>
  // Last assistant text output for review summary (PRD Review Modes section)
  lastAssistantText: string
}

// Finished session info (for recently finished sessions)
export interface FinishedSessionInfo {
  taskId: string
  projectId: string
  claudeSessionId: string | null
  model: string
  tokenUsage: TokenUsage
  compactionCount: number
  finishedAt: number
  lastAssistantText: string
}
