/**
 * Custom agent definitions (--agents CLI flag)
 */

export interface CustomAgentDefinition {
  description: string
  prompt: string
  tools?: string[]
  model?: string
}

export type CustomAgentsConfig = Record<string, CustomAgentDefinition>

/**
 * Built-in skill (workflow template) from .claude/skills/
 */
export interface BuiltInSkill {
  name: string
  description: string
  allowedTools: string[]
  path: string
}

/**
 * Skill definition for creating/editing custom skills (PRD Section 15)
 */
export interface SkillDefinition {
  name: string
  description: string
  allowedTools: string[]
  acceptanceCriteria?: string[]
  steps?: string[]
}

/**
 * Marketplace skill from the Claude Code skills registry (PRD Section 15)
 */
export interface MarketplaceSkill {
  id: string
  name: string
  description: string
  author: string
  downloads: number
  rating: number
  allowedTools: string[]
  tags: string[]
  version: string
}
