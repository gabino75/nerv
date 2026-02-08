/**
 * Built-in skill discovery and management
 * Skills are Claude Code workflow templates stored in .claude/skills/
 */

import { app, shell } from 'electron'
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BuiltInSkill, SkillDefinition, MarketplaceSkill } from '../shared/types'

export type { BuiltInSkill, SkillDefinition, MarketplaceSkill }

/**
 * Get the path to the .claude/skills directory
 * In development, use the project directory
 * In production, use the app resources
 */
function getSkillsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, '.claude', 'skills')
  }
  // In development, skills are in the project root
  return join(__dirname, '../../.claude/skills')
}

/**
 * Parse the frontmatter from a SKILL.md file
 */
function parseSkillFrontmatter(content: string): { name?: string; description?: string; allowedTools?: string[] } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter = match[1]
  const result: { name?: string; description?: string; allowedTools?: string[] } = {}

  // Parse name
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  if (nameMatch) result.name = nameMatch[1].trim()

  // Parse description
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (descMatch) result.description = descMatch[1].trim()

  // Parse allowed-tools
  const toolsMatch = frontmatter.match(/^allowed-tools:\s*\[([^\]]+)\]/m)
  if (toolsMatch) {
    result.allowedTools = toolsMatch[1].split(',').map(t => t.trim())
  }

  return result
}

/**
 * Discover all built-in skills from the .claude/skills directory
 */
export function discoverBuiltInSkills(): BuiltInSkill[] {
  const skillsDir = getSkillsDir()

  if (!existsSync(skillsDir)) {
    console.log(`[NERV] Skills directory not found: ${skillsDir}`)
    return []
  }

  const skills: BuiltInSkill[] = []

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = join(skillsDir, entry.name, 'SKILL.md')
      if (!existsSync(skillPath)) continue

      try {
        const content = readFileSync(skillPath, 'utf-8')
        const frontmatter = parseSkillFrontmatter(content)

        skills.push({
          name: frontmatter.name || entry.name,
          description: frontmatter.description || `${entry.name} workflow`,
          allowedTools: frontmatter.allowedTools || [],
          path: skillPath
        })
      } catch (err) {
        console.error(`[NERV] Failed to parse skill ${entry.name}:`, err)
      }
    }
  } catch (err) {
    console.error('[NERV] Failed to read skills directory:', err)
  }

  return skills
}

/**
 * Get a specific skill by name
 */
export function getSkill(name: string): BuiltInSkill | undefined {
  const skills = discoverBuiltInSkills()
  return skills.find(s => s.name === name)
}

/**
 * Generate a prompt prefix for a skill invocation
 * This tells Claude to follow the skill workflow
 */
export function generateSkillPrompt(skillName: string): string {
  const skill = getSkill(skillName)
  if (!skill) return ''

  return `Use the /${skillName} skill to complete this task. Follow the workflow defined in ${skill.path}.`
}

/**
 * Get the project-specific skills directory
 * Custom skills are created in the project's .claude/skills directory
 */
function getProjectSkillsDir(): string {
  // In development, use the project directory
  // In production, also use the project directory (skills are project-specific)
  if (app.isPackaged) {
    return join(process.resourcesPath, '.claude', 'skills')
  }
  return join(__dirname, '../../.claude/skills')
}

/**
 * Generate SKILL.md content from a SkillDefinition
 */
function generateSkillMarkdown(skill: SkillDefinition): string {
  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`name: ${skill.name}`)
  lines.push(`description: ${skill.description}`)
  lines.push(`allowed-tools: [${skill.allowedTools.join(', ')}]`)
  lines.push('---')
  lines.push('')

  // Title
  lines.push(`# ${skill.name.charAt(0).toUpperCase() + skill.name.slice(1)} Workflow`)
  lines.push('')

  // Acceptance Criteria
  if (skill.acceptanceCriteria && skill.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria')
    for (const criterion of skill.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`)
    }
    lines.push('')
  }

  // Steps
  if (skill.steps && skill.steps.length > 0) {
    lines.push('## Steps')
    for (let i = 0; i < skill.steps.length; i++) {
      lines.push(`${i + 1}. ${skill.steps[i]}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Create a new custom skill (PRD Section 15)
 * Creates a SKILL.md file in .claude/skills/{name}/
 */
export function createSkill(skill: SkillDefinition): BuiltInSkill {
  const skillsDir = getProjectSkillsDir()
  const skillDir = join(skillsDir, skill.name)
  const skillPath = join(skillDir, 'SKILL.md')

  // Ensure directories exist
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
  }
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true })
  }

  // Generate and write SKILL.md
  const content = generateSkillMarkdown(skill)
  writeFileSync(skillPath, content, 'utf-8')

  console.log(`[NERV] Created custom skill: ${skill.name} at ${skillPath}`)

  return {
    name: skill.name,
    description: skill.description,
    allowedTools: skill.allowedTools,
    path: skillPath
  }
}

/**
 * Edit an existing skill by opening it in the default editor (PRD Section 15)
 */
export async function editSkill(skillName: string): Promise<boolean> {
  const skill = getSkill(skillName)
  if (!skill) {
    console.error(`[NERV] Skill not found: ${skillName}`)
    return false
  }

  try {
    // Open the SKILL.md file in the default editor
    await shell.openPath(skill.path)
    console.log(`[NERV] Opened skill for editing: ${skill.path}`)
    return true
  } catch (err) {
    console.error(`[NERV] Failed to open skill for editing:`, err)
    return false
  }
}

/**
 * Delete a custom skill
 */
export function deleteSkill(skillName: string): boolean {
  const skill = getSkill(skillName)
  if (!skill) {
    console.error(`[NERV] Skill not found: ${skillName}`)
    return false
  }

  const { rmSync } = require('fs')
  const skillDir = join(skill.path, '..')

  try {
    rmSync(skillDir, { recursive: true })
    console.log(`[NERV] Deleted skill: ${skillName}`)
    return true
  } catch (err) {
    console.error(`[NERV] Failed to delete skill:`, err)
    return false
  }
}

/**
 * Simulated marketplace skills catalog (PRD Section 15)
 * In production, this would query an actual Claude Code skills registry API.
 * For now we provide a curated set of useful workflow templates.
 */
const MARKETPLACE_SKILLS_CATALOG: MarketplaceSkill[] = [
  {
    id: 'marketplace-api-docs',
    name: 'api-docs',
    description: 'Generate API documentation from source code',
    author: 'nerv-team',
    downloads: 1243,
    rating: 4.7,
    allowedTools: ['Read', 'Write', 'Glob', 'Grep'],
    tags: ['documentation', 'api', 'openapi'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-migration',
    name: 'database-migration',
    description: 'Create and run database schema migrations',
    author: 'nerv-team',
    downloads: 892,
    rating: 4.5,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
    tags: ['database', 'migration', 'schema'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-security-audit',
    name: 'security-audit',
    description: 'Scan code for security vulnerabilities (OWASP Top 10)',
    author: 'nerv-team',
    downloads: 2156,
    rating: 4.8,
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    tags: ['security', 'audit', 'owasp'],
    version: '1.1.0'
  },
  {
    id: 'marketplace-changelog',
    name: 'changelog',
    description: 'Generate changelog from git commits',
    author: 'community',
    downloads: 567,
    rating: 4.3,
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    tags: ['documentation', 'git', 'changelog'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-dependency-update',
    name: 'dependency-update',
    description: 'Update project dependencies and fix breaking changes',
    author: 'community',
    downloads: 1034,
    rating: 4.4,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'WebSearch'],
    tags: ['dependencies', 'npm', 'upgrade'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-i18n',
    name: 'internationalization',
    description: 'Extract strings and set up i18n framework',
    author: 'community',
    downloads: 421,
    rating: 4.2,
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob'],
    tags: ['i18n', 'localization', 'strings'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-performance',
    name: 'performance-audit',
    description: 'Analyze and optimize application performance',
    author: 'nerv-team',
    downloads: 789,
    rating: 4.6,
    allowedTools: ['Read', 'Bash', 'Grep', 'Glob'],
    tags: ['performance', 'optimization', 'audit'],
    version: '1.0.0'
  },
  {
    id: 'marketplace-ci-setup',
    name: 'ci-setup',
    description: 'Set up CI/CD pipeline (GitHub Actions, GitLab CI)',
    author: 'community',
    downloads: 1567,
    rating: 4.5,
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    tags: ['ci', 'cd', 'github-actions', 'devops'],
    version: '1.0.0'
  }
]

/**
 * Skill templates for installing from marketplace
 */
const MARKETPLACE_SKILL_TEMPLATES: Record<string, SkillDefinition> = {
  'marketplace-api-docs': {
    name: 'api-docs',
    description: 'Generate API documentation from source code',
    allowedTools: ['Read', 'Write', 'Glob', 'Grep'],
    acceptanceCriteria: [
      'All public endpoints documented',
      'Request/response schemas included',
      'Authentication requirements noted',
      'Example requests provided'
    ],
    steps: [
      'Scan codebase for API routes/endpoints',
      'Extract endpoint metadata (method, path, parameters)',
      'Document request and response schemas',
      'Add authentication and authorization notes',
      'Generate OpenAPI/Swagger spec if applicable',
      'Create markdown documentation'
    ]
  },
  'marketplace-migration': {
    name: 'database-migration',
    description: 'Create and run database schema migrations',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
    acceptanceCriteria: [
      'Migration file created with up/down methods',
      'Migration tested in development',
      'Rollback procedure documented',
      'No data loss on migration'
    ],
    steps: [
      'Analyze current schema and requested changes',
      'Create migration file with timestamp',
      'Write up migration (schema changes)',
      'Write down migration (rollback)',
      'Test migration in development environment',
      'Document any manual steps required'
    ]
  },
  'marketplace-security-audit': {
    name: 'security-audit',
    description: 'Scan code for security vulnerabilities (OWASP Top 10)',
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    acceptanceCriteria: [
      'All user inputs validated',
      'No SQL injection vulnerabilities',
      'No XSS vulnerabilities',
      'Secrets not hardcoded',
      'Dependencies scanned for CVEs'
    ],
    steps: [
      'Scan for hardcoded secrets and credentials',
      'Check input validation and sanitization',
      'Review SQL queries for injection risks',
      'Check for XSS vulnerabilities in outputs',
      'Run npm audit or equivalent',
      'Generate security report with findings'
    ]
  },
  'marketplace-changelog': {
    name: 'changelog',
    description: 'Generate changelog from git commits',
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    acceptanceCriteria: [
      'Changelog follows Keep a Changelog format',
      'Commits categorized (Added, Changed, Fixed, etc.)',
      'Breaking changes highlighted',
      'Version number updated'
    ],
    steps: [
      'Get git log since last release tag',
      'Parse commit messages for conventional commits',
      'Categorize changes by type',
      'Highlight breaking changes',
      'Update CHANGELOG.md with new section',
      'Update version in package.json if needed'
    ]
  },
  'marketplace-dependency-update': {
    name: 'dependency-update',
    description: 'Update project dependencies and fix breaking changes',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'WebSearch'],
    acceptanceCriteria: [
      'All dependencies updated to latest compatible versions',
      'Breaking changes addressed',
      'All tests still pass',
      'No security vulnerabilities'
    ],
    steps: [
      'Check for outdated dependencies',
      'Review changelogs for breaking changes',
      'Update dependencies incrementally',
      'Fix breaking changes in code',
      'Run tests after each update',
      'Document any manual migration needed'
    ]
  },
  'marketplace-i18n': {
    name: 'internationalization',
    description: 'Extract strings and set up i18n framework',
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob'],
    acceptanceCriteria: [
      'i18n framework installed and configured',
      'All user-facing strings extracted',
      'Base language file created',
      'Components updated to use translations'
    ],
    steps: [
      'Identify i18n framework (react-intl, i18next, etc.)',
      'Install and configure framework',
      'Scan codebase for hardcoded strings',
      'Extract strings to translation files',
      'Update components to use translation functions',
      'Create base language JSON/YAML files'
    ]
  },
  'marketplace-performance': {
    name: 'performance-audit',
    description: 'Analyze and optimize application performance',
    allowedTools: ['Read', 'Bash', 'Grep', 'Glob'],
    acceptanceCriteria: [
      'Performance bottlenecks identified',
      'Bundle size analyzed',
      'Memory leaks checked',
      'Optimization recommendations provided'
    ],
    steps: [
      'Analyze bundle size and identify large dependencies',
      'Check for memory leaks and inefficient renders',
      'Profile slow functions and database queries',
      'Review caching strategies',
      'Identify lazy loading opportunities',
      'Generate performance report with recommendations'
    ]
  },
  'marketplace-ci-setup': {
    name: 'ci-setup',
    description: 'Set up CI/CD pipeline (GitHub Actions, GitLab CI)',
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    acceptanceCriteria: [
      'CI configuration file created',
      'Build step configured',
      'Test step configured',
      'Linting step configured',
      'Deployment step configured (if applicable)'
    ],
    steps: [
      'Detect project type and build system',
      'Create workflow file (.github/workflows/ or .gitlab-ci.yml)',
      'Configure build step',
      'Configure test step',
      'Configure linting step',
      'Add caching for dependencies',
      'Configure deployment if needed'
    ]
  }
}

/**
 * Search the skills marketplace (PRD Section 15)
 * @param query Search query (matches name, description, or tags)
 */
export function searchMarketplace(query: string): MarketplaceSkill[] {
  const normalizedQuery = query.toLowerCase().trim()

  if (!normalizedQuery) {
    // Return all skills sorted by downloads
    return [...MARKETPLACE_SKILLS_CATALOG].sort((a, b) => b.downloads - a.downloads)
  }

  return MARKETPLACE_SKILLS_CATALOG.filter(skill => {
    const searchable = [
      skill.name,
      skill.description,
      ...skill.tags
    ].join(' ').toLowerCase()

    return searchable.includes(normalizedQuery)
  }).sort((a, b) => b.downloads - a.downloads)
}

/**
 * Install a skill from the marketplace (PRD Section 15)
 * @param skillId The marketplace skill ID to install
 * @param scope Where to install: 'global' or 'project'
 */
export function installSkill(skillId: string, scope: 'global' | 'project'): BuiltInSkill {
  const marketplaceSkill = MARKETPLACE_SKILLS_CATALOG.find(s => s.id === skillId)
  if (!marketplaceSkill) {
    throw new Error(`Marketplace skill not found: ${skillId}`)
  }

  const template = MARKETPLACE_SKILL_TEMPLATES[skillId]
  if (!template) {
    throw new Error(`Skill template not found: ${skillId}`)
  }

  // Check if already installed
  const existing = getSkill(template.name)
  if (existing) {
    throw new Error(`Skill '${template.name}' is already installed`)
  }

  console.log(`[NERV] Installing marketplace skill: ${marketplaceSkill.name} (scope: ${scope})`)

  // Create the skill using existing createSkill function
  return createSkill(template)
}
