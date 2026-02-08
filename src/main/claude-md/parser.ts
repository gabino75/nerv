/**
 * CLAUDE.md Management - Parsing and formatting
 */

import type { ClaudeMdSection, StackDetection } from './types'
import type { Repo } from '../database'
import { detectStack, collectFromStacks } from './stack-detection'

/**
 * Format a list section for CLAUDE.md
 */
export function formatListSection(title: string, items: string[], fallback: string): string[] {
  const lines = [`## ${title}`]
  if (items.length > 0) {
    lines.push(...items.map(i => `- ${i}`))
  } else {
    lines.push(fallback)
  }
  lines.push('')
  return lines
}

/**
 * Format commands section for CLAUDE.md
 */
export function formatCommandsSection(commands: Record<string, string>): string[] {
  const lines = ['## Commands']
  const entries = Object.entries(commands)
  if (entries.length > 0) {
    lines.push(...entries.map(([cmd, desc]) => `- \`${cmd}\` - ${desc}`))
  } else {
    lines.push('<!-- Add common commands for this project -->')
  }
  lines.push('')
  return lines
}

/**
 * Parse CLAUDE.md into sections for editing
 */
export function parseClaudeMd(content: string): ClaudeMdSection[] {
  const lines = content.split('\n')
  const sections: ClaudeMdSection[] = []
  let currentSection: ClaudeMdSection | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerMatch = line.match(/^##\s+(.+)$/)

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endLine = i - 1
        // Trim trailing empty lines from content
        currentSection.content = currentSection.content.replace(/\n+$/, '')
        sections.push(currentSection)
      }

      // Start new section
      currentSection = {
        name: headerMatch[1],
        content: '',
        startLine: i,
        endLine: -1
      }
    } else if (currentSection) {
      // Skip the first line if it's the header itself
      if (i > currentSection.startLine) {
        currentSection.content += (currentSection.content ? '\n' : '') + line
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1
    currentSection.content = currentSection.content.replace(/\n+$/, '')
    sections.push(currentSection)
  }

  return sections
}

/**
 * Generate initial CLAUDE.md content based on discovered stack
 */
export function generateInitialClaudeMd(projectName: string, repos: Repo[]): string {
  // Collect unique detected stacks from all repos
  const stackNames = new Set<string>()
  const allStacks: StackDetection[] = []
  for (const repo of repos) {
    for (const stack of detectStack(repo.path)) {
      if (!stackNames.has(stack.name)) {
        stackNames.add(stack.name)
        allStacks.push(stack)
      }
    }
  }

  const lines: string[] = [`# Project: ${projectName}`, '']

  // Commands
  lines.push(...formatCommandsSection(collectFromStacks(allStacks, 'commands') as Record<string, string>))

  // Environment
  lines.push(...formatListSection('Environment', collectFromStacks(allStacks, 'environment') as string[], '<!-- Environment requirements -->'))

  // Architecture
  lines.push('## Architecture')
  if (repos.length > 1) {
    lines.push('### Repositories')
    lines.push(...repos.map(r => `- **${r.name}** - ${r.path}${r.stack ? ` (${r.stack})` : ''}`))
    lines.push('')
  }
  const archs = collectFromStacks(allStacks, 'architecture') as string[]
  if (archs.length > 0) {
    lines.push(...archs.map(a => `- ${a}`))
  } else {
    lines.push('<!-- Project structure overview -->')
  }
  lines.push('')

  // Code Style
  lines.push(...formatListSection('Code Style', collectFromStacks(allStacks, 'codeStyle') as string[], '<!-- Coding conventions -->'))

  // Constraints
  const constraintsFromStacks = collectFromStacks(allStacks, 'constraints')
  const constraintsList = Array.isArray(constraintsFromStacks) ? constraintsFromStacks : []
  const constraints = [...constraintsList, 'Never commit .env or credential files']
  lines.push('## Constraints')
  lines.push(...[...new Set(constraints)].map(c => `- ${c}`))
  lines.push('')

  // Notes
  lines.push('## Notes', '<!-- Additional context for Claude -->', '')

  return lines.join('\n')
}
