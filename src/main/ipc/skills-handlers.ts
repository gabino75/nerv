/**
 * IPC handlers for skill discovery and management (PRD Section 15)
 */

import { safeHandle } from './safe-handle'
import {
  discoverBuiltInSkills,
  getSkill,
  generateSkillPrompt,
  createSkill,
  editSkill,
  deleteSkill,
  searchMarketplace,
  installSkill,
  BuiltInSkill,
  SkillDefinition,
  MarketplaceSkill
} from '../skills'

export function registerSkillsHandlers(): void {
  // Discover all available built-in skills
  safeHandle('skills:discover', (): BuiltInSkill[] => {
    return discoverBuiltInSkills()
  })

  // Get a specific skill by name
  safeHandle('skills:get', (_event, name: string): BuiltInSkill | undefined => {
    return getSkill(name)
  })

  // Generate a prompt prefix for skill invocation
  safeHandle('skills:generatePrompt', (_event, skillName: string): string => {
    return generateSkillPrompt(skillName)
  })

  // Create a new custom skill (PRD Section 15)
  safeHandle('skills:create', (_event, skill: SkillDefinition): BuiltInSkill => {
    return createSkill(skill)
  })

  // Edit an existing skill by opening in editor (PRD Section 15)
  safeHandle('skills:edit', async (_event, skillName: string): Promise<boolean> => {
    return await editSkill(skillName)
  })

  // Delete a custom skill
  safeHandle('skills:delete', (_event, skillName: string): boolean => {
    return deleteSkill(skillName)
  })

  // Search the skills marketplace (PRD Section 15)
  safeHandle('skills:searchMarketplace', (_event, query: string): MarketplaceSkill[] => {
    return searchMarketplace(query)
  })

  // Install a skill from the marketplace (PRD Section 15)
  safeHandle('skills:installSkill', (_event, skillId: string, scope: 'global' | 'project'): BuiltInSkill => {
    return installSkill(skillId, scope)
  })
}
