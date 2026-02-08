/**
 * Claude stream-json output parsing
 */

import type { StreamMessage, ClaudeSession, TaskToolInput, FileAccessType } from './types'
import { broadcastToRenderers } from '../utils'
import { databaseService } from '../database'
import { trackFileAccess } from './state'
import { recordSessionAction, notifyCompaction as notifyRecoveryCompaction } from '../recovery'

// Parse a line of stream-json output
export function parseStreamJsonLine(line: string): StreamMessage | null {
  try {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('{')) {
      return null
    }
    return JSON.parse(trimmed) as StreamMessage
  } catch {
    return null
  }
}

// Notify renderer of session ID
function notifySessionId(sessionId: string, claudeSessionId: string): void {
  broadcastToRenderers('claude:sessionId', sessionId, claudeSessionId)
}

// Notify renderer of token usage (PRD Section 6: includes compactionsSinceClear)
function notifyTokenUsage(sessionId: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }, compactionCount: number, compactionsSinceClear: number): void {
  broadcastToRenderers('claude:tokenUsage', sessionId, usage, compactionCount, compactionsSinceClear)
}

// Notify renderer of compaction
function notifyCompaction(sessionId: string, count: number): void {
  broadcastToRenderers('claude:compaction', sessionId, count)
}

// Notify renderer of result
function notifyResult(sessionId: string, result: { cost_usd?: number; duration_ms?: number; num_turns?: number }): void {
  broadcastToRenderers('claude:result', sessionId, result)
}

// Notify renderer of subagent spawn
function notifySubagentSpawn(sessionId: string, subagent: { id: string; agentType: string }): void {
  broadcastToRenderers('claude:subagentSpawn', sessionId, subagent)
}

// Notify renderer of subagent completion
function notifySubagentComplete(sessionId: string, subagent: { id: string; agentType: string }): void {
  broadcastToRenderers('claude:subagentComplete', sessionId, subagent)
}

// Detect Task tool usage and create subagent record
function detectSubagentSpawn(session: ClaudeSession, msg: StreamMessage): void {
  if (msg.type !== 'assistant' || !msg.message?.content) return

  for (const content of msg.message.content) {
    if (content.type === 'tool_use' && content.name === 'Task' && content.id) {
      const input = content.input as TaskToolInput | undefined
      if (input?.subagent_type) {
        const agentType = input.subagent_type
        const subagent = databaseService.createSubagent(session.id, session.taskId, agentType)

        session.pendingSubagents.set(content.id, subagent.id)

        console.log(`[NERV] Subagent spawned: ${agentType} (${subagent.id})`)
        notifySubagentSpawn(session.id, subagent)
      }
    }
  }
}

// Detect tool_result for Task tool to mark subagent as completed
function detectSubagentComplete(session: ClaudeSession, msg: StreamMessage): void {
  if (msg.type !== 'user' || !msg.message?.content) return

  for (const content of msg.message.content) {
    if (content.type === 'tool_result' && content.tool_use_id) {
      const subagentId = session.pendingSubagents.get(content.tool_use_id)
      if (subagentId) {
        const subagent = databaseService.completeSubagent(subagentId, 'completed')
        session.pendingSubagents.delete(content.tool_use_id)

        if (subagent) {
          console.log(`[NERV] Subagent completed: ${subagent.agentType} (${subagentId})`)
          notifySubagentComplete(session.id, subagent)
        }
      }
    }
  }
}

// File operation tool names and their access types
const FILE_TOOL_ACCESS_TYPES: Record<string, FileAccessType> = {
  'Read': 'read',
  'Write': 'write',
  'Edit': 'edit',
  'Glob': 'read',
  'Grep': 'read'
}

// Notify renderer of file conflict
function notifyFileConflict(
  sessionId: string,
  filePath: string,
  conflictingSessionId: string,
  accessType: FileAccessType
): void {
  broadcastToRenderers('claude:fileConflict', {
    sessionId,
    filePath,
    conflictingSessionId,
    accessType
  })
}

// Record tool actions for loop detection (PRD Section 21 - Error Recovery)
function recordToolActionForLoopDetection(session: ClaudeSession, msg: StreamMessage): void {
  if (msg.type !== 'assistant' || !msg.message?.content) return

  for (const content of msg.message.content) {
    if (content.type === 'tool_use' && content.name) {
      // Create action identifier from tool name and key input parameters
      const input = content.input as Record<string, unknown> | undefined
      let actionKey = content.name

      // Add relevant context to distinguish similar actions
      if (input) {
        if (content.name === 'Read' || content.name === 'Write' || content.name === 'Edit') {
          actionKey += `:${input.file_path || 'unknown'}`
        } else if (content.name === 'Bash') {
          // Include first 50 chars of command
          const cmd = (input.command as string) || ''
          actionKey += `:${cmd.substring(0, 50)}`
        } else if (content.name === 'Grep' || content.name === 'Glob') {
          actionKey += `:${input.pattern || input.path || 'unknown'}`
        }
      }

      recordSessionAction(session.id, actionKey)
    }
  }
}

// Detect file access operations and track them for conflict detection (PRD Section 10)
function detectFileAccess(session: ClaudeSession, msg: StreamMessage): void {
  if (msg.type !== 'assistant' || !msg.message?.content) return

  for (const content of msg.message.content) {
    if (content.type === 'tool_use' && content.name && content.input) {
      const accessType = FILE_TOOL_ACCESS_TYPES[content.name]
      if (!accessType) continue

      // Extract file path from tool input
      const input = content.input as Record<string, unknown>
      let filePath: string | undefined

      if (content.name === 'Read' || content.name === 'Write') {
        filePath = input.file_path as string | undefined
      } else if (content.name === 'Edit') {
        filePath = input.file_path as string | undefined
      } else if (content.name === 'Glob' || content.name === 'Grep') {
        // These operate on directories/patterns, track the path if specified
        filePath = input.path as string | undefined
      }

      if (filePath) {
        const result = trackFileAccess(session.id, filePath, accessType)
        if (result.hasConflict && result.conflictingSession) {
          console.log(`[NERV] File conflict detected: ${filePath} (session ${session.id} vs ${result.conflictingSession.sessionId})`)
          notifyFileConflict(
            session.id,
            filePath,
            result.conflictingSession.sessionId,
            result.conflictingSession.accessType
          )
        }
      }
    }
  }
}

// Process stream-json output and extract information
export function processStreamOutput(session: ClaudeSession, data: string): void {
  session.jsonBuffer += data

  const lines = session.jsonBuffer.split('\n')
  session.jsonBuffer = lines.pop() || ''

  for (const line of lines) {
    const msg = parseStreamJsonLine(line)
    if (!msg) continue

    // Extract session ID
    if (msg.session_id && !session.sessionId) {
      session.sessionId = msg.session_id
      notifySessionId(session.id, msg.session_id)
      try {
        databaseService.updateTaskSession(session.taskId, msg.session_id)
        console.log(`[NERV] Updated task ${session.taskId} with session ID: ${msg.session_id}`)
      } catch (err) {
        console.error(`[NERV] Failed to update task session ID:`, err)
      }
    }

    // Track token usage
    if (msg.usage) {
      const prevTokens = session.tokenUsage.inputTokens

      session.tokenUsage.inputTokens = msg.usage.input_tokens
      session.tokenUsage.outputTokens += msg.usage.output_tokens
      session.tokenUsage.cacheReadTokens = msg.usage.cache_read_input_tokens || 0
      session.tokenUsage.cacheCreationTokens = msg.usage.cache_creation_input_tokens || 0

      // Detect compaction (significant drop in input tokens)
      if (prevTokens > 0 && msg.usage.input_tokens < prevTokens * 0.5) {
        session.compactionCount++
        session.compactionsSinceClear++  // PRD Section 6: also track since last /clear
        notifyCompaction(session.id, session.compactionCount)
        // PRD Section 6: Also trigger the alert notification with both counts
        notifyRecoveryCompaction(session.id, session.taskId, session.compactionCount, session.compactionsSinceClear)
      }

      notifyTokenUsage(session.id, session.tokenUsage, session.compactionCount, session.compactionsSinceClear)
    }

    // Capture last assistant text for review summary (PRD Review Modes section)
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const content of msg.message.content) {
        if (content.type === 'text' && content.text) {
          session.lastAssistantText = content.text
        }
      }
    }

    // Handle result (session ended)
    if (msg.type === 'result' && msg.result) {
      notifyResult(session.id, msg.result)
    }

    // Detect subagent spawns
    detectSubagentSpawn(session, msg)

    // Detect subagent completions
    detectSubagentComplete(session, msg)

    // Detect file access for conflict detection (PRD Section 10)
    detectFileAccess(session, msg)

    // Record tool actions for loop detection (PRD Section 21)
    recordToolActionForLoopDetection(session, msg)
  }
}

// Convert stream-json to human-readable terminal output
export function streamJsonToTerminal(data: string): string {
  const output: string[] = []
  const lines = data.split('\n')

  for (const line of lines) {
    const msg = parseStreamJsonLine(line)
    if (!msg) {
      // Pass through non-JSON content but skip empty lines to reduce whitespace
      const trimmed = line.trim()
      if (trimmed) {
        output.push(trimmed)
      }
      continue
    }

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const content of msg.message.content) {
        if (content.type === 'text' && content.text) {
          // Trim leading whitespace from each line to prevent indentation drift
          const text = content.text.replace(/^\s+/gm, (match) => {
            // Preserve intentional indentation (2-4 spaces) but remove excessive whitespace
            return match.length > 4 ? '    ' : match
          })
          output.push(text)
        } else if (content.type === 'tool_use') {
          output.push(`\x1b[36m[Tool: ${content.name}]\x1b[0m`)
        }
      }
    } else if (msg.type === 'system' && msg.subtype === 'init') {
      output.push('\x1b[90m[Claude Code session starting...]\x1b[0m')
    }
  }

  // Filter consecutive empty lines to prevent excess whitespace
  const result = output.join('\n')
  return result.replace(/\n{3,}/g, '\n\n')
}
