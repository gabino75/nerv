/**
 * Tests for buildClaudeArgs - PRD Section 5: Claude Code Integration
 *
 * Validates that NERV correctly builds CLI arguments for spawning Claude Code.
 * Maps to PRD lines 675-745 (CLI reference table and spawn configuration).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ClaudeSpawnConfig } from '../../src/shared/types'

// Mock electron and fs dependencies before importing
vi.mock('electron', () => ({
  app: { isPackaged: false }
}))
vi.mock('child_process', () => ({
  execSync: vi.fn()
}))
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false)
}))

// Import after mocks are set up
const { buildClaudeArgs } = await import('../../src/main/claude/utils')

describe('buildClaudeArgs', () => {
  const minimalConfig: ClaudeSpawnConfig = {
    projectId: 'proj-1',
    cwd: '/tmp/project',
    prompt: 'Implement the login feature'
  }

  afterEach(() => {
    delete process.env.NERV_BENCHMARK_MODE
  })

  it('should include base flags: --print, --output-format stream-json, --verbose', () => {
    const args = buildClaudeArgs(minimalConfig)

    expect(args).toContain('--print')
    expect(args).toContain('--verbose')
    expect(args.indexOf('--output-format')).toBeGreaterThanOrEqual(0)
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
  })

  it('should end with -- separator followed by the prompt', () => {
    const args = buildClaudeArgs(minimalConfig)

    const separatorIndex = args.indexOf('--')
    expect(separatorIndex).toBeGreaterThan(0)
    expect(args[separatorIndex + 1]).toBe('Implement the login feature')
    expect(args.length).toBe(separatorIndex + 2) // nothing after prompt
  })

  it('should include --model when model is specified', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, model: 'opus' }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--model')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('opus')
  })

  it('should not include --model when model is not specified', () => {
    const args = buildClaudeArgs(minimalConfig)
    expect(args).not.toContain('--model')
  })

  it('should include --append-system-prompt when systemPrompt is provided', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      systemPrompt: 'You are working on project X'
    }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--append-system-prompt')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('You are working on project X')
  })

  it('should include --add-dir for each additional directory', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      additionalDirs: ['../frontend', '../shared-lib']
    }
    const args = buildClaudeArgs(config)

    const firstIdx = args.indexOf('--add-dir')
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(args[firstIdx + 1]).toBe('../frontend')

    const secondIdx = args.indexOf('--add-dir', firstIdx + 1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    expect(args[secondIdx + 1]).toBe('../shared-lib')
  })

  it('should include --max-turns as string when specified', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, maxTurns: 50 }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--max-turns')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('50')
  })

  it('should include --mcp-config when path is provided', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      mcpConfigPath: '/home/user/.nerv/projects/proj-1/mcp-config.json'
    }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--mcp-config')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('/home/user/.nerv/projects/proj-1/mcp-config.json')
  })

  it('should include --allowedTools with each tool as separate arg', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      allowedTools: ['Read', 'Grep', 'Bash(npm test:*)']
    }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--allowedTools')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('Read')
    expect(args[idx + 2]).toBe('Grep')
    expect(args[idx + 3]).toBe('Bash(npm test:*)')
  })

  it('should not include --allowedTools when array is empty', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, allowedTools: [] }
    const args = buildClaudeArgs(config)

    // Only check before the separator to avoid false match with benchmark mode
    const separatorIdx = args.indexOf('--')
    const argsBeforeSeparator = args.slice(0, separatorIdx)
    expect(argsBeforeSeparator).not.toContain('--allowedTools')
  })

  it('should include --disallowedTools with each tool as separate arg', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      disallowedTools: ['Bash(rm -rf:*)', 'Bash(sudo:*)']
    }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--disallowedTools')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('Bash(rm -rf:*)')
    expect(args[idx + 2]).toBe('Bash(sudo:*)')
  })

  it('should include --continue when continueSession is true', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, continueSession: true }
    const args = buildClaudeArgs(config)

    expect(args).toContain('--continue')
  })

  it('should not include --continue when continueSession is false/undefined', () => {
    const args = buildClaudeArgs(minimalConfig)
    expect(args).not.toContain('--continue')
  })

  it('should include --permission-mode when specified', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, permissionMode: 'plan' }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--permission-mode')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('plan')
  })

  it('should include --input-format when specified', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, inputFormat: 'stream-json' }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--input-format')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('stream-json')
  })

  it('should include --thinking-budget-tokens for valid thinking effort levels', () => {
    const levels: Array<{ effort: 'low' | 'medium' | 'high' | 'max'; tokens: string }> = [
      { effort: 'low', tokens: '1024' },
      { effort: 'medium', tokens: '4096' },
      { effort: 'high', tokens: '16384' },
      { effort: 'max', tokens: '32768' },
    ]

    for (const { effort, tokens } of levels) {
      const config: ClaudeSpawnConfig = { ...minimalConfig, thinkingEffort: effort }
      const args = buildClaudeArgs(config)

      const idx = args.indexOf('--thinking-budget-tokens')
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(args[idx + 1]).toBe(tokens)
    }
  })

  it('should include --agents as JSON when customAgents are provided', () => {
    const config: ClaudeSpawnConfig = {
      ...minimalConfig,
      customAgents: { 'test-agent': { name: 'Test', prompt: 'Do stuff' } } as any
    }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--agents')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(() => JSON.parse(args[idx + 1])).not.toThrow()
  })

  it('should not include --agents when customAgents is empty object', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, customAgents: {} as any }
    const args = buildClaudeArgs(config)

    expect(args).not.toContain('--agents')
  })

  it('should include --agent when agent is specified', () => {
    const config: ClaudeSpawnConfig = { ...minimalConfig, agent: 'code-reviewer' }
    const args = buildClaudeArgs(config)

    const idx = args.indexOf('--agent')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('code-reviewer')
  })

  it('should add benchmark allowedTools when NERV_BENCHMARK_MODE is true', () => {
    process.env.NERV_BENCHMARK_MODE = 'true'
    const args = buildClaudeArgs(minimalConfig)

    // Should have an --allowedTools entry with Write, Edit, Bash
    const idx = args.indexOf('--allowedTools')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args).toContain('Write')
    expect(args).toContain('Edit')
    expect(args).toContain('Bash')
  })

  it('should not add benchmark tools when NERV_BENCHMARK_MODE is not set', () => {
    const args = buildClaudeArgs(minimalConfig)

    // The prompt comes after --, those shouldn't appear before --
    const separatorIdx = args.indexOf('--')
    const argsBeforeSeparator = args.slice(0, separatorIdx)
    expect(argsBeforeSeparator).not.toContain('Write')
    expect(argsBeforeSeparator).not.toContain('Edit')
  })

  it('should handle full config with all options', () => {
    const fullConfig: ClaudeSpawnConfig = {
      taskId: 'task-42',
      projectId: 'proj-1',
      cwd: '/projects/myapp',
      prompt: 'Build the auth module',
      systemPrompt: 'NERV context here',
      additionalDirs: ['../frontend'],
      model: 'sonnet',
      maxTurns: 100,
      allowedTools: ['Read', 'Grep'],
      disallowedTools: ['Bash(rm:*)'],
      mcpConfigPath: '/tmp/mcp.json',
      continueSession: false,
      permissionMode: 'default',
      inputFormat: 'text',
      thinkingEffort: 'medium',
      agent: 'my-agent'
    }
    const args = buildClaudeArgs(fullConfig)

    expect(args).toContain('--print')
    expect(args).toContain('--verbose')
    expect(args).toContain('--model')
    expect(args).toContain('--append-system-prompt')
    expect(args).toContain('--add-dir')
    expect(args).toContain('--max-turns')
    expect(args).toContain('--mcp-config')
    expect(args).toContain('--allowedTools')
    expect(args).toContain('--disallowedTools')
    expect(args).toContain('--permission-mode')
    expect(args).toContain('--input-format')
    expect(args).toContain('--thinking-budget-tokens')
    expect(args).toContain('--agent')
    expect(args).not.toContain('--continue')
    expect(args[args.length - 1]).toBe('Build the auth module')
  })
})
