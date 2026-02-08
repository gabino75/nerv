/**
 * Subagent tracking types (Claude Code Task tool)
 */

export type SubagentStatus = 'running' | 'completed' | 'failed'

export interface Subagent {
  id: string
  parentSessionId: string
  taskId: string
  agentType: string
  status: SubagentStatus
  inputTokens: number
  outputTokens: number
  costUsd: number
  startedAt: string
  completedAt: string | null
}

export interface SubagentSpawnEvent {
  parentSessionId: string
  agentId: string
  agentType: string
  prompt: string
}

export interface SubagentCompleteEvent {
  agentId: string
  status: SubagentStatus
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface SubagentUsage {
  activeCount: number
  totalSpawned: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
}
