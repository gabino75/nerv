/**
 * Repository Context Scanner (PRD Section 24)
 *
 * Scans repositories for LLM-relevant context:
 * - CLAUDE.md files (project conventions)
 * - Skills (.claude/skills/*.md)
 * - MCP config (.claude/mcp.json)
 * - README, CONTRIBUTING, ARCHITECTURE docs
 * - Package configs (package.json, pyproject.toml, etc.)
 */

import { join, basename } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { createHash } from 'crypto'
import type {
  RepoContext,
  RepoSkill,
  ParsedClaudeMd,
  RepoScanResult
} from '../shared/types'

// Paths to check for CLAUDE.md
const CLAUDE_MD_PATHS = ['CLAUDE.md', '.claude/CLAUDE.md', 'docs/CLAUDE.md']

// Paths to check for skills
const SKILL_DIRS = ['.claude/skills', '.claude/commands']

// Paths to check for MCP config
const MCP_CONFIG_PATHS = ['.claude/mcp.json', 'mcp-config.json']

// Paths to check for README
const README_PATHS = ['README.md', 'README.txt', 'readme.md', 'Readme.md']

// Paths to check for CONTRIBUTING
const CONTRIBUTING_PATHS = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md']

// Paths to check for architecture docs
const ARCHITECTURE_PATHS = ['ARCHITECTURE.md', 'docs/architecture.md', 'docs/ARCHITECTURE.md']

// Package config files
const PACKAGE_CONFIGS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'composer.json',
  'Gemfile'
]

// CI/CD config files
const CI_CD_PATHS = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  '.travis.yml',
  'azure-pipelines.yml',
  '.drone.yml'
]

// Testing config files
const TESTING_CONFIG_PATHS = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'pytest.ini',
  'setup.cfg',
  'tox.ini',
  'karma.conf.js',
  '.mocharc.json',
  '.mocharc.yml',
  'phpunit.xml',
  'phpunit.xml.dist'
]

/**
 * Compute SHA256 hash of content
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Check if a directory exists
 */
function dirExists(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

/**
 * Read file content safely
 */
function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

// Helper: Extract raw sections from markdown
function extractRawSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/)
    if (sectionMatch) {
      if (currentSection) sections[currentSection] = currentContent.join('\n').trim()
      currentSection = sectionMatch[1]
      currentContent = []
    } else if (currentSection) {
      currentContent.push(line)
    }
  }
  if (currentSection) sections[currentSection] = currentContent.join('\n').trim()
  return sections
}

// Helper: Parse commands section
function parseCommandsSection(text: string): ParsedClaudeMd['commands'] {
  const commands: ParsedClaudeMd['commands'] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^[-*]\s+`([^`]+)`\s*[-–—]?\s*(.*)$/)
    if (match) {
      commands.push({ name: match[1].split(' ')[0], command: match[1], description: match[2] || undefined })
    }
  }
  return commands
}

// Helper: Parse constraints section
function parseConstraintsSection(text: string): ParsedClaudeMd['constraints'] {
  const constraints: ParsedClaudeMd['constraints'] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^[-*]\s+(.+)$/)
    if (match) {
      const rule = match[1]
      const lower = rule.toLowerCase()
      const isError = lower.includes('never') || lower.includes('must not') || lower.includes('do not')
      constraints.push({ rule, severity: isError ? 'error' : 'warning' })
    }
  }
  return constraints
}

// Helper: Parse simple list items
function parseListItems(text: string): string[] {
  const items: string[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^[-*]\s+(.+)$/)
    if (match) items.push(match[1])
  }
  return items
}

// Helper: Parse architecture section
function parseArchitectureSection(text: string): ParsedClaudeMd['architecture'] {
  const arch: ParsedClaudeMd['architecture'] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^[-*]\s+`?([^`\s]+)`?\s*[-–—]?\s*(.*)$/)
    if (match && match[1].startsWith('/')) {
      arch.push({ path: match[1], description: match[2] || '' })
    }
  }
  return arch
}

/**
 * Parse CLAUDE.md content into structured sections
 */
export function parseClaudeMdContent(content: string): ParsedClaudeMd {
  const rawSections = extractRawSections(content)

  return {
    commands: rawSections['Commands'] ? parseCommandsSection(rawSections['Commands']) : [],
    constraints: rawSections['Constraints'] ? parseConstraintsSection(rawSections['Constraints']) : [],
    codeStyle: rawSections['Code Style'] ? parseListItems(rawSections['Code Style']).map(p => ({ pattern: p })) : [],
    architecture: rawSections['Architecture'] ? parseArchitectureSection(rawSections['Architecture']) : [],
    environment: rawSections['Environment'] ? parseListItems(rawSections['Environment']).map(r => ({ requirement: r })) : [],
    testing: rawSections['Testing']?.match(/`([^`]+)`/)?.[1] ? { command: rawSections['Testing'].match(/`([^`]+)`/)![1] } : undefined,
    rawSections
  }
}

/**
 * Parse a skill file (frontmatter + markdown content)
 */
function parseSkillFile(
  content: string,
  filePath: string
): { name: string; description?: string; trigger?: string; content: string } | null {
  const lines = content.split('\n')
  const result: { name: string; description?: string; trigger?: string; content: string } = {
    name: basename(filePath, '.md'),
    content
  }

  // Check for YAML frontmatter
  if (lines[0] === '---') {
    let frontmatterEnd = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatterEnd = i
        break
      }
    }

    if (frontmatterEnd > 0) {
      const frontmatter = lines.slice(1, frontmatterEnd).join('\n')

      // Parse simple YAML fields
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
      const triggerMatch = frontmatter.match(/^trigger:\s*(.+)$/m)

      if (nameMatch) result.name = nameMatch[1].trim()
      if (descMatch) result.description = descMatch[1].trim()
      if (triggerMatch) result.trigger = triggerMatch[1].trim()

      // Content is everything after frontmatter
      result.content = lines.slice(frontmatterEnd + 1).join('\n').trim()
    }
  }

  return result
}

/**
 * Parse package.json for relevant info
 */
function parsePackageJson(content: string): RepoScanResult['packageInfo'] {
  try {
    const pkg = JSON.parse(content)
    return {
      name: pkg.name,
      version: pkg.version,
      scripts: pkg.scripts,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies
    }
  } catch {
    return null
  }
}

// Helper: Find first matching file content from paths
function findFileContent(repoPath: string, paths: readonly string[]): string | null {
  for (const p of paths) {
    const content = readFileSafe(join(repoPath, p))
    if (content) return content
  }
  return null
}

// Helper: Scan skills from directories
function scanSkills(repoPath: string): RepoScanResult['skills'] {
  const skills: RepoScanResult['skills'] = []
  for (const dir of SKILL_DIRS) {
    const skillPath = join(repoPath, dir)
    if (!dirExists(skillPath)) continue
    try {
      for (const file of readdirSync(skillPath).filter(f => f.endsWith('.md'))) {
        const content = readFileSafe(join(skillPath, file))
        if (!content) continue
        const skill = parseSkillFile(content, join(skillPath, file))
        if (skill) {
          skills.push({
            name: skill.name,
            path: join(dir, file),
            description: skill.description,
            trigger: skill.trigger,
            content: skill.content
          })
        }
      }
    } catch {
      // Continue if we can't read directory
    }
  }
  return skills
}

// Helper: Parse MCP config safely
function parseMcpConfig(content: string | null): object | null {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Scan for CI/CD config files.
 * GitHub Actions is a directory of .yml files; others are single files.
 */
function scanCiCd(repoPath: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = []

  // GitHub Actions: scan directory for workflow files
  const ghWorkflowDir = join(repoPath, '.github/workflows')
  if (dirExists(ghWorkflowDir)) {
    try {
      for (const file of readdirSync(ghWorkflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
        const content = readFileSafe(join(ghWorkflowDir, file))
        if (content) {
          results.push({ path: `.github/workflows/${file}`, content })
        }
      }
    } catch {
      // Continue if we can't read directory
    }
  }

  // Single-file CI/CD configs (skip the directory entry)
  for (const p of CI_CD_PATHS) {
    if (p === '.github/workflows') continue
    const content = readFileSafe(join(repoPath, p))
    if (content) {
      results.push({ path: p, content })
    }
  }

  return results
}

/**
 * Scan for testing configuration files.
 */
function scanTestingConfigs(repoPath: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = []

  for (const p of TESTING_CONFIG_PATHS) {
    const content = readFileSafe(join(repoPath, p))
    if (content) {
      results.push({ path: p, content })
    }
  }

  return results
}

/**
 * Scan a repository for LLM-relevant context
 */
export async function scanRepository(repoPath: string): Promise<RepoScanResult> {
  if (!dirExists(repoPath)) {
    return { claudeMd: null, skills: [], mcpConfig: null, readme: null, contributing: null, architecture: null, packageInfo: null, ciCd: null, testingConfigs: null }
  }

  const claudeMdContent = findFileContent(repoPath, CLAUDE_MD_PATHS)
  const pkgContent = findFileContent(repoPath, PACKAGE_CONFIGS)
  const ciCdResults = scanCiCd(repoPath)
  const testingResults = scanTestingConfigs(repoPath)

  return {
    claudeMd: claudeMdContent ? parseClaudeMdContent(claudeMdContent) : null,
    skills: scanSkills(repoPath),
    mcpConfig: parseMcpConfig(findFileContent(repoPath, MCP_CONFIG_PATHS)),
    readme: findFileContent(repoPath, README_PATHS),
    contributing: findFileContent(repoPath, CONTRIBUTING_PATHS),
    architecture: findFileContent(repoPath, ARCHITECTURE_PATHS),
    packageInfo: pkgContent ? (pkgContent.startsWith('{') ? parsePackageJson(pkgContent) : { name: 'package' }) : null,
    ciCd: ciCdResults.length > 0 ? ciCdResults : null,
    testingConfigs: testingResults.length > 0 ? testingResults : null
  }
}

// Helper: Find file path and content from paths list
function findFilePath(repoPath: string, paths: readonly string[]): { path: string; content: string } | null {
  for (const p of paths) {
    const content = readFileSafe(join(repoPath, p))
    if (content) return { path: p, content }
  }
  return null
}

// Helper: Create a context entry
interface ContextEntryParams {
  repoId: string
  contextType: string
  filePath: string
  content: string
  now: number
  parsedSections?: string | null
}

function createContextEntry(params: ContextEntryParams): Omit<RepoContext, 'id'> {
  return {
    repo_id: params.repoId,
    context_type: params.contextType,
    file_path: params.filePath,
    content: params.content,
    parsed_sections: params.parsedSections ?? null,
    last_scanned_at: params.now,
    file_hash: computeHash(params.content)
  }
}

/**
 * Convert scan result to repo_context entries for database storage
 */
export function scanResultToContextEntries(
  repoId: string,
  repoPath: string,
  scanResult: RepoScanResult
): Array<Omit<RepoContext, 'id'>> {
  const entries: Array<Omit<RepoContext, 'id'>> = []
  const now = Date.now()

  // Define mappings: [condition, paths, contextType, parsedData]
  const mappings: Array<[unknown, readonly string[], string, unknown]> = [
    [scanResult.claudeMd, CLAUDE_MD_PATHS, 'claude_md', scanResult.claudeMd],
    [scanResult.mcpConfig, MCP_CONFIG_PATHS, 'mcp_config', null],
    [scanResult.readme, README_PATHS, 'readme', null],
    [scanResult.contributing, CONTRIBUTING_PATHS, 'contributing', null],
    [scanResult.architecture, ARCHITECTURE_PATHS, 'architecture', null],
    [scanResult.packageInfo, PACKAGE_CONFIGS, 'package_config', scanResult.packageInfo]
  ]

  for (const [condition, paths, contextType, parsedData] of mappings) {
    if (!condition) continue
    const found = findFilePath(repoPath, paths)
    if (found) {
      entries.push(createContextEntry({
        repoId,
        contextType,
        filePath: found.path,
        content: found.content,
        now,
        parsedSections: parsedData ? JSON.stringify(parsedData) : null
      }))
    }
  }

  // CI/CD configs (multiple files possible)
  if (scanResult.ciCd) {
    for (const ciFile of scanResult.ciCd) {
      entries.push(createContextEntry({
        repoId,
        contextType: 'ci_cd',
        filePath: ciFile.path,
        content: ciFile.content,
        now
      }))
    }
  }

  // Testing configs (multiple files possible)
  if (scanResult.testingConfigs) {
    for (const testFile of scanResult.testingConfigs) {
      entries.push(createContextEntry({
        repoId,
        contextType: 'testing_config',
        filePath: testFile.path,
        content: testFile.content,
        now
      }))
    }
  }

  return entries
}

/**
 * Convert scan result to repo_skills entries for database storage
 */
export function scanResultToSkillEntries(
  repoId: string,
  scanResult: RepoScanResult
): Array<Omit<RepoSkill, 'id'>> {
  return scanResult.skills.map(skill => ({
    repo_id: repoId,
    skill_name: skill.name,
    skill_path: skill.path,
    description: skill.description || null,
    trigger_pattern: skill.trigger || null,
    content: skill.content
  }))
}
