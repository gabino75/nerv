/**
 * Unit tests for subagent tracking functionality
 *
 * Tests the subagent types and data structures
 */

import { describe, it, expect } from 'vitest'
import type { Subagent, SubagentStatus, SubagentUsage, CustomAgentDefinition, CustomAgentsConfig, ClaudeSpawnConfig, Project } from '../../src/shared/types'

describe('subagent types', () => {
  describe('Subagent interface', () => {
    it('should have all required fields', () => {
      const subagent: Subagent = {
        id: 'subagent-123',
        parentSessionId: 'session-456',
        taskId: 'task-789',
        agentType: 'Explore',
        status: 'running',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.05,
        startedAt: '2026-01-31T18:00:00.000Z',
        completedAt: null
      }

      expect(subagent.id).toBe('subagent-123')
      expect(subagent.parentSessionId).toBe('session-456')
      expect(subagent.taskId).toBe('task-789')
      expect(subagent.agentType).toBe('Explore')
      expect(subagent.status).toBe('running')
      expect(subagent.inputTokens).toBe(1000)
      expect(subagent.outputTokens).toBe(500)
      expect(subagent.costUsd).toBe(0.05)
      expect(subagent.startedAt).toBe('2026-01-31T18:00:00.000Z')
      expect(subagent.completedAt).toBeNull()
    })

    it('should accept completed status with completedAt', () => {
      const subagent: Subagent = {
        id: 'subagent-123',
        parentSessionId: 'session-456',
        taskId: 'task-789',
        agentType: 'Plan',
        status: 'completed',
        inputTokens: 2000,
        outputTokens: 1000,
        costUsd: 0.10,
        startedAt: '2026-01-31T18:00:00.000Z',
        completedAt: '2026-01-31T18:05:00.000Z'
      }

      expect(subagent.status).toBe('completed')
      expect(subagent.completedAt).toBe('2026-01-31T18:05:00.000Z')
    })
  })

  describe('SubagentStatus type', () => {
    it('should accept valid status values', () => {
      const statuses: SubagentStatus[] = ['running', 'completed', 'failed']

      expect(statuses).toContain('running')
      expect(statuses).toContain('completed')
      expect(statuses).toContain('failed')
      expect(statuses.length).toBe(3)
    })
  })

  describe('SubagentUsage interface', () => {
    it('should aggregate subagent metrics', () => {
      const usage: SubagentUsage = {
        activeCount: 2,
        totalSpawned: 5,
        totalCostUsd: 0.25,
        totalInputTokens: 10000,
        totalOutputTokens: 5000
      }

      expect(usage.activeCount).toBe(2)
      expect(usage.totalSpawned).toBe(5)
      expect(usage.totalCostUsd).toBe(0.25)
      expect(usage.totalInputTokens).toBe(10000)
      expect(usage.totalOutputTokens).toBe(5000)
    })

    it('should handle zero values', () => {
      const usage: SubagentUsage = {
        activeCount: 0,
        totalSpawned: 0,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0
      }

      expect(usage.activeCount).toBe(0)
      expect(usage.totalSpawned).toBe(0)
    })
  })

  describe('common agent types', () => {
    it('should support common Claude Code agent types', () => {
      const agentTypes = [
        'Explore',
        'Plan',
        'Bash',
        'general-purpose',
        'statusline-setup'
      ]

      agentTypes.forEach(agentType => {
        const subagent: Subagent = {
          id: `subagent-${agentType}`,
          parentSessionId: 'session-1',
          taskId: 'task-1',
          agentType,
          status: 'running',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          startedAt: new Date().toISOString(),
          completedAt: null
        }

        expect(subagent.agentType).toBe(agentType)
      })
    })
  })

  describe('subagent lifecycle', () => {
    it('should track subagent from spawn to completion', () => {
      // Spawn
      const spawned: Subagent = {
        id: 'subagent-lifecycle',
        parentSessionId: 'session-main',
        taskId: 'task-main',
        agentType: 'Explore',
        status: 'running',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        startedAt: '2026-01-31T18:00:00.000Z',
        completedAt: null
      }

      expect(spawned.status).toBe('running')
      expect(spawned.completedAt).toBeNull()

      // Running with metrics
      const running: Subagent = {
        ...spawned,
        inputTokens: 5000,
        outputTokens: 2000,
        costUsd: 0.07
      }

      expect(running.inputTokens).toBe(5000)
      expect(running.outputTokens).toBe(2000)
      expect(running.costUsd).toBe(0.07)

      // Completed
      const completed: Subagent = {
        ...running,
        status: 'completed',
        inputTokens: 8000,
        outputTokens: 4000,
        costUsd: 0.12,
        completedAt: '2026-01-31T18:02:00.000Z'
      }

      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toBe('2026-01-31T18:02:00.000Z')
      expect(completed.inputTokens).toBe(8000)
      expect(completed.outputTokens).toBe(4000)
    })

    it('should handle failed subagent', () => {
      const failed: Subagent = {
        id: 'subagent-failed',
        parentSessionId: 'session-main',
        taskId: 'task-main',
        agentType: 'Bash',
        status: 'failed',
        inputTokens: 1000,
        outputTokens: 100,
        costUsd: 0.01,
        startedAt: '2026-01-31T18:00:00.000Z',
        completedAt: '2026-01-31T18:00:30.000Z'
      }

      expect(failed.status).toBe('failed')
      expect(failed.completedAt).not.toBeNull()
    })
  })

  describe('CustomAgentDefinition interface', () => {
    it('should define a custom agent with all fields', () => {
      const agent: CustomAgentDefinition = {
        description: 'Expert code reviewer. Use proactively after code changes.',
        prompt: 'You are a senior code reviewer. Focus on code quality, security, and best practices.',
        tools: ['Read', 'Grep', 'Glob', 'Bash'],
        model: 'sonnet'
      }

      expect(agent.description).toBe('Expert code reviewer. Use proactively after code changes.')
      expect(agent.prompt).toBe('You are a senior code reviewer. Focus on code quality, security, and best practices.')
      expect(agent.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash'])
      expect(agent.model).toBe('sonnet')
    })

    it('should allow minimal definition with only required fields', () => {
      const agent: CustomAgentDefinition = {
        description: 'Simple test agent',
        prompt: 'You are a test agent.'
      }

      expect(agent.description).toBe('Simple test agent')
      expect(agent.prompt).toBe('You are a test agent.')
      expect(agent.tools).toBeUndefined()
      expect(agent.model).toBeUndefined()
    })
  })

  describe('CustomAgentsConfig type', () => {
    it('should define multiple custom agents', () => {
      const config: CustomAgentsConfig = {
        'code-reviewer': {
          description: 'Expert code reviewer',
          prompt: 'You are a senior code reviewer.',
          tools: ['Read', 'Grep'],
          model: 'sonnet'
        },
        'test-writer': {
          description: 'Test generation specialist',
          prompt: 'You write comprehensive unit tests.',
          tools: ['Read', 'Write', 'Bash']
        }
      }

      expect(Object.keys(config)).toHaveLength(2)
      expect(config['code-reviewer'].description).toBe('Expert code reviewer')
      expect(config['test-writer'].tools).toEqual(['Read', 'Write', 'Bash'])
    })

    it('should serialize to JSON for CLI --agents flag', () => {
      const config: CustomAgentsConfig = {
        'security-auditor': {
          description: 'Security vulnerability scanner',
          prompt: 'You audit code for security issues.',
          tools: ['Read', 'Grep', 'Glob'],
          model: 'opus'
        }
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json) as CustomAgentsConfig

      expect(parsed['security-auditor'].description).toBe('Security vulnerability scanner')
      expect(parsed['security-auditor'].model).toBe('opus')
    })
  })

  describe('ClaudeSpawnConfig with customAgents', () => {
    it('should include customAgents in spawn config', () => {
      const config: ClaudeSpawnConfig = {
        taskId: 'task-123',
        projectId: 'project-456',
        cwd: '/path/to/project',
        prompt: 'Review the codebase',
        customAgents: {
          'reviewer': {
            description: 'Code reviewer',
            prompt: 'You review code.'
          }
        }
      }

      expect(config.customAgents).toBeDefined()
      expect(config.customAgents!['reviewer'].description).toBe('Code reviewer')
    })

    it('should work without customAgents (backwards compatible)', () => {
      const config: ClaudeSpawnConfig = {
        taskId: 'task-123',
        projectId: 'project-456',
        cwd: '/path/to/project',
        prompt: 'Simple task'
      }

      expect(config.customAgents).toBeUndefined()
    })
  })

  describe('Project with custom_agents', () => {
    it('should store custom_agents as JSON string', () => {
      const customAgents: CustomAgentsConfig = {
        'test-runner': {
          description: 'Runs tests',
          prompt: 'Run npm test and report failures.'
        },
        'doc-generator': {
          description: 'Generates documentation',
          prompt: 'Generate JSDoc for public APIs.',
          tools: ['Read', 'Write']
        }
      }

      const project: Project = {
        id: 'project-123',
        name: 'Test Project',
        goal: 'Test custom agents',
        custom_agents: JSON.stringify(customAgents),
        created_at: '2026-01-31T18:00:00.000Z'
      }

      expect(project.custom_agents).toBeDefined()
      const parsed = JSON.parse(project.custom_agents!) as CustomAgentsConfig
      expect(Object.keys(parsed)).toHaveLength(2)
      expect(parsed['test-runner'].description).toBe('Runs tests')
      expect(parsed['doc-generator'].tools).toEqual(['Read', 'Write'])
    })

    it('should allow null custom_agents for backwards compatibility', () => {
      const project: Project = {
        id: 'project-456',
        name: 'Simple Project',
        goal: null,
        custom_agents: null,
        created_at: '2026-01-31T18:00:00.000Z'
      }

      expect(project.custom_agents).toBeNull()
    })

    it('should parse empty custom_agents correctly', () => {
      const project: Project = {
        id: 'project-789',
        name: 'Empty Agents Project',
        goal: null,
        custom_agents: '{}',
        created_at: '2026-01-31T18:00:00.000Z'
      }

      const parsed = JSON.parse(project.custom_agents!) as CustomAgentsConfig
      expect(Object.keys(parsed)).toHaveLength(0)
    })

    it('should round-trip through JSON serialization', () => {
      const customAgents: CustomAgentsConfig = {
        'security-scanner': {
          description: 'Scans for security vulnerabilities',
          prompt: 'Analyze code for OWASP Top 10 vulnerabilities.',
          tools: ['Read', 'Grep', 'Glob'],
          model: 'opus'
        }
      }

      const jsonStr = JSON.stringify(customAgents)
      const project: Project = {
        id: 'project-101',
        name: 'Security Project',
        goal: 'Security scanning',
        custom_agents: jsonStr,
        created_at: '2026-01-31T18:00:00.000Z'
      }

      const parsed = JSON.parse(project.custom_agents!) as CustomAgentsConfig
      expect(parsed['security-scanner'].description).toBe('Scans for security vulnerabilities')
      expect(parsed['security-scanner'].model).toBe('opus')
      expect(parsed['security-scanner'].tools).toEqual(['Read', 'Grep', 'Glob'])
    })
  })
})
