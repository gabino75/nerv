/**
 * Claude Code Configuration Helpers
 *
 * Platform-agnostic utilities for building Claude Code CLI arguments
 * and parsing stream-json output.
 *
 * This module can be used by both the CLI and Electron app.
 */

import type { CustomAgentsConfig } from '../shared/types.js'

/**
 * Configuration for building Claude CLI arguments
 */
export interface ClaudeArgsConfig {
  /** System prompt to append (NERV.md content) */
  systemPrompt?: string
  /** Additional directories for multi-repo */
  additionalDirs?: string[]
  /** Model to use (sonnet, opus, haiku) */
  model?: string
  /** Max turns to prevent runaway */
  maxTurns?: number
  /** MCP configuration file path */
  mcpConfigPath?: string
  /** Custom agent definitions */
  customAgents?: CustomAgentsConfig
  /** Use a specific agent for the session (--agent flag) */
  agent?: string
  /** Allowed tools list */
  allowedTools?: string[]
  /** Disallowed tools list */
  disallowedTools?: string[]
  /** The prompt/task to execute */
  prompt?: string
  /** Whether to skip permission prompts (DANGEROUS) */
  dangerouslySkipPermissions?: boolean
  /** Resume a previous session (session ID, or true for most recent) */
  resume?: string | boolean
}

/**
 * Stream JSON message types from Claude Code output
 */
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result'
  subtype?: string
  message?: {
    content?: Array<{
      type: string
      text?: string
      content?: string | Array<{ type: string; text?: string }>
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

/**
 * Token usage tracking structure
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

/** Helper to add a string option if present */
function addStringOption(args: string[], flag: string, value: string | undefined): void {
  if (value) {
    args.push(flag, value)
  }
}

/** Helper to add multiple directory options */
function addDirOptions(args: string[], dirs: string[] | undefined): void {
  if (dirs) {
    for (const dir of dirs) {
      args.push('--add-dir', dir)
    }
  }
}

/** Helper to add variadic tool options */
function addToolOptions(args: string[], flag: string, tools: string[] | undefined): void {
  if (tools && tools.length > 0) {
    args.push(flag, ...tools)
  }
}

/**
 * Build command line arguments for Claude Code CLI.
 *
 * @param config - Configuration options
 * @returns Array of command line arguments
 */
export function buildClaudeArgs(config: ClaudeArgsConfig): string[] {
  const args: string[] = ['--print', '--output-format', 'stream-json', '--verbose']

  addStringOption(args, '--model', config.model)
  addStringOption(args, '--append-system-prompt', config.systemPrompt)
  addDirOptions(args, config.additionalDirs)
  addStringOption(args, '--max-turns', config.maxTurns?.toString())
  addStringOption(args, '--mcp-config', config.mcpConfigPath)

  // Custom agent definitions (--agents JSON)
  if (config.customAgents && Object.keys(config.customAgents).length > 0) {
    args.push('--agents', JSON.stringify(config.customAgents))
  }

  // Use a specific agent for this session (--agent flag, PRD Section 35)
  addStringOption(args, '--agent', config.agent)

  addToolOptions(args, '--allowedTools', config.allowedTools)
  addToolOptions(args, '--disallowedTools', config.disallowedTools)
  if (config.resume) {
    if (typeof config.resume === 'string') {
      args.push('--resume', config.resume)
    } else {
      // true means resume most recent session (no argument needed)
      args.push('--resume')
    }
  }

  if (config.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions')
  }

  // The prompt should be the last argument (positional)
  if (config.prompt) {
    args.push(config.prompt)
  }

  return args
}

/**
 * Parse a stream-json line from Claude Code output.
 *
 * @param line - A single line of stream-json output
 * @returns Parsed StreamMessage or null if invalid
 */
export function parseStreamMessage(line: string): StreamMessage | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('{')) {
    return null
  }

  try {
    return JSON.parse(trimmed) as StreamMessage
  } catch {
    return null
  }
}

/**
 * Extract session ID from a stream message if present.
 *
 * @param message - Parsed stream message
 * @returns Session ID or null
 */
export function extractSessionId(message: StreamMessage): string | null {
  if (message.type === 'system' && message.session_id) {
    return message.session_id
  }
  return null
}

/**
 * Extract token usage from a stream message if present.
 *
 * @param message - Parsed stream message
 * @returns Token usage or null
 */
export function extractTokenUsage(message: StreamMessage): TokenUsage | null {
  if (message.usage) {
    return {
      inputTokens: message.usage.input_tokens || 0,
      outputTokens: message.usage.output_tokens || 0,
      cacheReadTokens: message.usage.cache_read_input_tokens || 0,
      cacheCreationTokens: message.usage.cache_creation_input_tokens || 0
    }
  }
  return null
}

/**
 * Extract result data from a stream message if present.
 *
 * @param message - Parsed stream message
 * @returns Result data or null
 */
export function extractResult(message: StreamMessage): { costUsd?: number; durationMs?: number; numTurns?: number } | null {
  if (message.type === 'result' && message.result) {
    return {
      costUsd: message.result.cost_usd,
      durationMs: message.result.duration_ms,
      numTurns: message.result.num_turns
    }
  }
  return null
}

/**
 * Check if a message indicates a Task tool invocation (subagent spawn).
 *
 * @param message - Parsed stream message
 * @returns Tool use info if it's a Task tool call, null otherwise
 */
export function extractTaskToolUse(message: StreamMessage): { toolUseId: string; agentType: string; prompt: string } | null {
  if (message.type !== 'assistant' || !message.message?.content) {
    return null
  }

  for (const block of message.message.content) {
    if (block.type === 'tool_use' && block.name === 'Task' && block.id) {
      const input = block.input as { subagent_type?: string; prompt?: string } | undefined
      if (input?.subagent_type && input?.prompt) {
        return {
          toolUseId: block.id,
          agentType: input.subagent_type,
          prompt: input.prompt
        }
      }
    }
  }

  return null
}

/**
 * Check if a message indicates a tool result (subagent completion).
 *
 * @param message - Parsed stream message
 * @returns Tool use ID if it's a tool result, null otherwise
 */
export function extractToolResult(message: StreamMessage): string | null {
  if (message.type !== 'user' || !message.message?.content) {
    return null
  }

  for (const block of message.message.content) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      return block.tool_use_id
    }
  }

  return null
}

/**
 * Detect context compaction by comparing token counts.
 * If input tokens drop significantly, compaction likely occurred.
 *
 * @param previousTokens - Previous input token count
 * @param currentTokens - Current input token count
 * @returns True if compaction was likely detected
 */
export function detectCompaction(previousTokens: number, currentTokens: number): boolean {
  // If tokens dropped by more than 50%, likely compaction
  return previousTokens > 0 && currentTokens < previousTokens * 0.5
}

/**
 * Calculate estimated cost based on token usage and model.
 * Uses approximate pricing for Claude models.
 *
 * @param tokenUsage - Token usage data
 * @param model - Model name (sonnet, opus, haiku)
 * @returns Estimated cost in USD
 */
export function estimateCost(tokenUsage: TokenUsage, model: string = 'sonnet'): number {
  // Approximate pricing per 1M tokens (as of 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    'opus': { input: 15, output: 75 },
    'sonnet': { input: 3, output: 15 },
    'haiku': { input: 0.25, output: 1.25 }
  }

  // Normalize model name
  const modelKey = model.toLowerCase().includes('opus') ? 'opus'
    : model.toLowerCase().includes('haiku') ? 'haiku'
    : 'sonnet'

  const rates = pricing[modelKey] || pricing['sonnet']

  const inputCost = (tokenUsage.inputTokens / 1_000_000) * rates.input
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * rates.output

  // Cache reads are typically much cheaper
  const cacheReadCost = (tokenUsage.cacheReadTokens / 1_000_000) * (rates.input * 0.1)

  return inputCost + outputCost + cacheReadCost
}
