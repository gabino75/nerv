/**
 * CLAUDE.md Management Service
 *
 * Handles discovery, generation, and persistence of CLAUDE.md files.
 * CLAUDE.md contains project-specific conventions that Claude discovers or the user configures.
 *
 * This module re-exports from the modular structure:
 * - types.ts: Type definitions
 * - stack-detection.ts: Stack detection logic and data
 * - file-operations.ts: File I/O operations
 * - parser.ts: CLAUDE.md parsing and formatting
 */

import { databaseService } from '../database'
import { detectStack } from './stack-detection'
import { readClaudeMd, saveClaudeMd } from './file-operations'
import { parseClaudeMd, generateInitialClaudeMd } from './parser'
import type { StackDetection, SuggestionsResult } from './types'

// Re-export types
export type { ClaudeMdSection, ClaudeMdSuggestions, StackDetection, SuggestionsResult } from './types'

// Re-export file operations
export { getClaudeMdPath, claudeMdExists, readClaudeMd, saveClaudeMd } from './file-operations'

// Re-export parsing
export { parseClaudeMd, generateInitialClaudeMd } from './parser'

// Re-export stack detection
export { detectStack, collectFromStacks, STACK_DETECTIONS } from './stack-detection'

/**
 * Initialize CLAUDE.md for a project by discovering stack from repos
 */
export function initializeClaudeMd(projectId: string): string {
  const project = databaseService.getProject(projectId)
  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  const repos = databaseService.getReposForProject(projectId)
  const content = generateInitialClaudeMd(project.name, repos)

  return saveClaudeMd(projectId, content)
}

/**
 * Update a specific section in CLAUDE.md
 */
export function updateClaudeMdSection(
  projectId: string,
  sectionName: string,
  newContent: string
): string {
  let content = readClaudeMd(projectId)
  if (!content) {
    // Initialize if doesn't exist
    initializeClaudeMd(projectId)
    content = readClaudeMd(projectId)!
  }

  const lines = content.split('\n')
  let inSection = false
  let sectionStart = -1
  let sectionEnd = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerMatch = line.match(/^##\s+(.+)$/)

    if (headerMatch) {
      if (headerMatch[1] === sectionName) {
        inSection = true
        sectionStart = i + 1
      } else if (inSection) {
        sectionEnd = i
        break
      }
    }
  }

  if (sectionStart === -1) {
    // Section doesn't exist, append it
    content += `\n## ${sectionName}\n${newContent}\n`
  } else {
    if (sectionEnd === -1) {
      sectionEnd = lines.length
    }
    // Replace section content
    const newLines = [
      ...lines.slice(0, sectionStart),
      newContent,
      ...lines.slice(sectionEnd)
    ]
    content = newLines.join('\n')
  }

  saveClaudeMd(projectId, content)
  return content
}

/**
 * Append a learning or note to CLAUDE.md Notes section
 */
export function appendToNotes(projectId: string, note: string): void {
  let content = readClaudeMd(projectId)
  if (!content) {
    initializeClaudeMd(projectId)
    content = readClaudeMd(projectId)!
  }

  const sections = parseClaudeMd(content)
  const notesSection = sections.find(s => s.name === 'Notes')

  if (notesSection) {
    const updatedNotes = notesSection.content + '\n- ' + note
    updateClaudeMdSection(projectId, 'Notes', updatedNotes)
  } else {
    // Add Notes section if it doesn't exist
    content += `\n## Notes\n- ${note}\n`
    saveClaudeMd(projectId, content)
  }
}

/**
 * Get suggested CLAUDE.md content based on repo analysis
 */
export function getSuggestions(projectId: string): SuggestionsResult {
  const repos = databaseService.getReposForProject(projectId)
  const allStacks: StackDetection[] = []

  for (const repo of repos) {
    const stacks = detectStack(repo.path)
    for (const stack of stacks) {
      if (!allStacks.find(s => s.name === stack.name)) {
        allStacks.push(stack)
      }
    }
  }

  const suggestions = {
    commands: {} as Record<string, string>,
    environment: [] as string[],
    architecture: [] as string[],
    codeStyle: [] as string[],
    constraints: [] as string[]
  }

  for (const stack of allStacks) {
    if (stack.suggestions.commands) {
      Object.assign(suggestions.commands, stack.suggestions.commands)
    }
    if (stack.suggestions.environment) {
      suggestions.environment.push(...stack.suggestions.environment)
    }
    if (stack.suggestions.architecture) {
      suggestions.architecture.push(...stack.suggestions.architecture)
    }
    if (stack.suggestions.codeStyle) {
      suggestions.codeStyle.push(...stack.suggestions.codeStyle)
    }
    if (stack.suggestions.constraints) {
      suggestions.constraints.push(...stack.suggestions.constraints)
    }
  }

  // Deduplicate
  suggestions.environment = [...new Set(suggestions.environment)]
  suggestions.architecture = [...new Set(suggestions.architecture)]
  suggestions.codeStyle = [...new Set(suggestions.codeStyle)]
  suggestions.constraints = [...new Set(suggestions.constraints)]

  return {
    detected: allStacks.map(s => s.name),
    suggestions
  }
}
