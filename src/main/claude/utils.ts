/**
 * Claude session utilities
 */

import { app } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import type { ClaudeSpawnConfig } from '../../shared/types'
import { USE_MOCK_CLAUDE } from './state'

// Generate a unique session ID
export function generateSessionId(): string {
  return `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Find Claude executable on Windows using 'where' command
function findClaudeOnWindows(): string {
  const commonPaths = [
    join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'claude.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),
  ]

  for (const p of commonPaths) {
    if (existsSync(p)) {
      return p
    }
  }

  try {
    const result = execSync('where claude 2>nul', { encoding: 'utf-8' })
    const lines = result.trim().split('\n')
    if (lines.length > 0 && lines[0]) {
      return lines[0].trim()
    }
  } catch {
    // 'where' failed, claude not in PATH
  }

  return 'claude'
}

// Get claude executable
export function getClaudeCommand(): { command: string; prependArgs: string[] } {
  if (USE_MOCK_CLAUDE) {
    // After bundling, __dirname is out/main/, so ../../scripts reaches project root
    const mockScriptPath = app.isPackaged
      ? join(process.resourcesPath, 'scripts', 'mock-claude.js')
      : join(__dirname, '../../scripts/mock-claude.js')

    console.log(`[NERV] Using mock Claude at: ${mockScriptPath}`)
    return {
      command: process.platform === 'win32' ? 'node.exe' : 'node',
      prependArgs: [mockScriptPath]
    }
  }

  if (process.platform === 'win32') {
    const claudePath = findClaudeOnWindows()
    console.log(`[NERV] Found Claude at: ${claudePath}`)
    return { command: claudePath, prependArgs: [] }
  }
  return { command: 'claude', prependArgs: [] }
}

const THINKING_BUDGET_TOKENS: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
  max: 32768
}

// Build command arguments for Claude Code
export function buildClaudeArgs(config: ClaudeSpawnConfig): string[] {
  const args: string[] = []

  // Non-interactive mode with stream-json output
  args.push('--print')
  args.push('--output-format', 'stream-json')
  args.push('--verbose')

  if (config.model) {
    args.push('--model', config.model)
  }

  if (config.thinkingEffort) {
    const tokens = THINKING_BUDGET_TOKENS[config.thinkingEffort]
    if (tokens) {
      args.push('--thinking-budget-tokens', tokens.toString())
    }
  }

  if (config.systemPrompt) {
    args.push('--append-system-prompt', config.systemPrompt)
  }

  if (config.additionalDirs) {
    for (const dir of config.additionalDirs) {
      args.push('--add-dir', dir)
    }
  }

  if (config.maxTurns) {
    args.push('--max-turns', config.maxTurns.toString())
  }

  if (config.mcpConfigPath) {
    args.push('--mcp-config', config.mcpConfigPath)
  }

  if (config.customAgents && Object.keys(config.customAgents).length > 0) {
    args.push('--agents', JSON.stringify(config.customAgents))
  }

  // Use a specific agent for this session (--agent flag, PRD Section 35)
  if (config.agent) {
    args.push('--agent', config.agent)
  }

  if (config.allowedTools && config.allowedTools.length > 0) {
    args.push('--allowedTools', ...config.allowedTools)
  }

  // In benchmark mode, auto-approve Write/Edit/Bash so Claude can work autonomously
  if (process.env.NERV_BENCHMARK_MODE === 'true') {
    args.push('--allowedTools', 'Write', 'Edit', 'Bash')
  }

  if (config.disallowedTools && config.disallowedTools.length > 0) {
    args.push('--disallowedTools', ...config.disallowedTools)
  }

  // Continue last session (PRD Section 5)
  if (config.continueSession) {
    args.push('--continue')
  }

  // Permission mode (PRD Section 5)
  if (config.permissionMode) {
    args.push('--permission-mode', config.permissionMode)
  }

  // Input format for stream chaining (PRD Section 5)
  if (config.inputFormat) {
    args.push('--input-format', config.inputFormat)
  }

  // Use -- to separate options from the positional prompt argument
  args.push('--')
  args.push(config.prompt)

  return args
}
