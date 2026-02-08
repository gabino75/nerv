/**
 * NERV.md Generator
 *
 * Generates the NERV.md context file from SQLite state.
 * This file is passed to Claude Code via --append-system-prompt
 * to provide project context for each task.
 *
 * Per PRD guidelines:
 * - Target size: 500-1000 tokens
 * - Max size: 2000 tokens
 * - Include only what Claude can't infer from code
 */

import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { databaseService } from './database'
import type { Task, Repo } from './database'
import type { ParsedClaudeMd, RepoSkill } from '../shared/types'

// Status emoji mapping for tasks
const STATUS_ICONS: Record<Task['status'], string> = {
  todo: '📋',
  in_progress: '🔄',
  interrupted: '⚠️',
  review: '👀',
  done: '✅'
}

interface NervMdOptions {
  includeAllTasks?: boolean // If false, only show current cycle tasks
  includeCompletedCycles?: boolean // If false, only show active cycle
  maxLearnings?: number // Max number of cycle learnings to include
  maxDecisions?: number // Max number of decisions to include
}

const DEFAULT_OPTIONS: NervMdOptions = {
  includeAllTasks: false,
  includeCompletedCycles: false,
  maxLearnings: 5,
  maxDecisions: 10
}

// Helper: Format repositories as a table (per PRD Section 17)
function formatRepositoriesTable(repos: Repo[]): string[] {
  if (repos.length === 0) return []
  const lines = ['## Repositories', '| Repo | Path | Stack |', '|------|------|-------|']
  for (const repo of repos) {
    const stack = repo.stack || '-'
    lines.push(`| ${repo.name} | ${repo.path} | ${stack} |`)
  }
  lines.push('')
  return lines
}

/**
 * Generate NERV.md content for a project
 */
export function generateNervMd(
  projectId: string,
  currentTaskId?: string,
  options: NervMdOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const project = databaseService.getProject(projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const repos = databaseService.getReposForProject(projectId)
  const cycles = databaseService.getCyclesForProject(projectId)
  const allTasks = databaseService.getTasksForProject(projectId)
  const decisions = databaseService.getDecisionsForProject(projectId)
  const activeCycle = cycles.find((c) => c.status === 'active')

  const tasks = opts.includeAllTasks
    ? allTasks
    : allTasks.filter((t) => !activeCycle || t.cycle_id === activeCycle.id)

  const currentTask = currentTaskId ? allTasks.find((t) => t.id === currentTaskId) : null
  const completedCycles = cycles
    .filter((c) => c.status === 'completed' && c.learnings)
    .slice(-(opts.maxLearnings ?? 5))

  const sections: string[] = []

  // Header and Goal
  sections.push(`# NERV Context: ${project.name}`, '')
  if (project.goal) {
    sections.push('## Goal', project.goal, '')
  }

  // Current Cycle
  if (activeCycle) {
    sections.push(`## Current Cycle: ${activeCycle.cycle_number}`)
    if (activeCycle.goal) sections.push(`Focus: ${activeCycle.goal}`)
    sections.push('')
  }

  // Repositories (table format per PRD Section 17)
  sections.push(...formatRepositoriesTable(repos))

  // Tasks table
  if (tasks.length > 0) {
    sections.push(...formatTasksTable(tasks, cycles))
  }

  // Current Task Details
  if (currentTask) {
    sections.push(...formatCurrentTask(currentTask))
  }

  // Repository context: CLAUDE.md constraints & skills (PRD Section 24)
  sections.push(...formatRepoConstraints(projectId))
  sections.push(...formatRepoSkills(projectId))

  // Documentation, Learnings, Decisions, Constraints
  sections.push(...formatDocSources(projectId))
  sections.push(...formatLearnings(completedCycles))
  sections.push(...formatDecisions(decisions, opts.maxDecisions ?? 10))
  sections.push(...formatConstraints(project.constraints))

  // Notes
  sections.push(
    '## Notes',
    '- Your context window will be automatically compacted as needed',
    '- Use /branch if you need to experiment without polluting context',
    '- If stuck, ask for human guidance rather than repeating failed approaches',
    ''
  )

  return sections.join('\n')
}

// Helper: Format tasks table
function formatTasksTable(
  tasks: Task[],
  cycles: Array<{ id: string; cycle_number: number }>
): string[] {
  const lines = ['## Tasks', '| ID | Title | Status | Cycle |', '|----|-------|--------|-------|']
  for (const task of tasks) {
    const cycle = cycles.find((c) => c.id === task.cycle_id)
    const cycleNum = cycle?.cycle_number ?? '-'
    const statusIcon = STATUS_ICONS[task.status]
    const shortId = task.id.slice(-7)
    lines.push(`| ${shortId} | ${task.title} | ${statusIcon} ${task.status} | ${cycleNum} |`)
  }
  lines.push('')
  return lines
}

// Helper: Format current task details
function formatCurrentTask(task: Task): string[] {
  const lines = [`## Current Task: ${task.id.slice(-7)}`, `**${task.title}**`, '']
  if (task.description) lines.push(task.description, '')
  if (task.worktree_path) lines.push(`Working in: ${task.worktree_path}`, '')
  return lines
}

// Helper: Format repo CLAUDE.md constraints (PRD Section 24 - Context Scanning)
function formatRepoConstraints(projectId: string): string[] {
  try {
    const claudeMdContexts = databaseService.getProjectClaudeMdContexts(projectId)
    if (claudeMdContexts.length === 0) return []

    const lines = ['## Repository Constraints']
    for (const ctx of claudeMdContexts) {
      if (!ctx.parsed_sections) continue
      try {
        const parsed = JSON.parse(ctx.parsed_sections) as ParsedClaudeMd
        const constraints = parsed.constraints || []
        const errorConstraints = constraints.filter(c => c.severity === 'error')
        if (errorConstraints.length === 0) continue

        lines.push(`### ${ctx.repo_name}`)
        for (const c of errorConstraints.slice(0, 5)) {
          lines.push(`- ${c.rule}`)
        }
      } catch {
        // Skip unparseable sections
      }
    }

    if (lines.length <= 1) return [] // Only header, no content
    lines.push('')
    return lines
  } catch {
    return []
  }
}

// Helper: Format available repo skills (PRD Section 24 - Skill Discovery)
function formatRepoSkills(projectId: string): string[] {
  try {
    const skills: RepoSkill[] = databaseService.getProjectSkills(projectId)
    if (skills.length === 0) return []

    const lines = ['## Available Skills']
    for (const skill of skills.slice(0, 10)) {
      const desc = skill.description ? ` — ${skill.description}` : ''
      lines.push(`- \`/${skill.skill_name}\`${desc}`)
    }
    lines.push('')
    return lines
  } catch {
    return []
  }
}

// Helper: Format documentation sources
function formatDocSources(projectId: string): string[] {
  const docSources = getDocumentationSources(projectId)
  if (docSources.length === 0) return []
  const lines = ['## Documentation Sources', 'Search these when you need external documentation:']
  for (const doc of docSources) {
    lines.push(`- ${doc.name}: ${doc.url_pattern}`)
  }
  lines.push('')
  return lines
}

// Helper: Format learnings from cycles
function formatLearnings(completedCycles: Array<{ cycle_number: number; learnings?: string | null }>): string[] {
  if (completedCycles.length === 0) return []
  const lines = ['## Learnings from Previous Cycles']
  for (const cycle of completedCycles) {
    if (cycle.learnings) lines.push(`- Cycle ${cycle.cycle_number}: ${cycle.learnings}`)
  }
  lines.push('')
  return lines
}

// Helper: Format decisions
function formatDecisions(decisions: Array<{ title: string; rationale?: string | null }>, max: number): string[] {
  const recent = decisions.slice(0, max)
  if (recent.length === 0) return []
  const lines = ['## Key Decisions']
  for (let i = 0; i < recent.length; i++) {
    const decision = recent[i]
    const adrNum = String(i + 1).padStart(3, '0')
    lines.push(`- ADR-${adrNum}: ${decision.title}`)
    if (decision.rationale) lines.push(`  - ${decision.rationale}`)
  }
  lines.push('')
  return lines
}

// Helper: Format project constraints (PRD Section 17)
function formatConstraints(constraintsJson: string | null): string[] {
  if (!constraintsJson) return []
  try {
    const constraints = JSON.parse(constraintsJson) as string[]
    if (!Array.isArray(constraints) || constraints.length === 0) return []
    const lines = ['## Constraints']
    for (const constraint of constraints) {
      lines.push(`- ${constraint}`)
    }
    lines.push('')
    return lines
  } catch {
    return []
  }
}

/**
 * Get documentation sources for a project
 */
function getDocumentationSources(
  projectId: string
): Array<{ name: string; url_pattern: string }> {
  try {
    const sources = databaseService.getDocumentationSources(projectId)
    return sources.map((s) => ({ name: s.name, url_pattern: s.url_pattern }))
  } catch {
    // Ignore errors, return empty array
    return []
  }
}

/**
 * Generate and save NERV.md file for a project
 */
export function saveNervMd(
  projectId: string,
  currentTaskId?: string,
  options?: NervMdOptions
): string {
  const content = generateNervMd(projectId, currentTaskId, options)

  // Save to ~/.nerv/projects/{projectId}/NERV.md
  const nervDir = join(app.getPath('home'), '.nerv', 'projects', projectId)

  if (!existsSync(nervDir)) {
    mkdirSync(nervDir, { recursive: true })
  }

  const nervMdPath = join(nervDir, 'NERV.md')
  writeFileSync(nervMdPath, content, 'utf-8')

  return nervMdPath
}

/**
 * Get the path where NERV.md would be saved for a project
 */
export function getNervMdPath(projectId: string): string {
  return join(app.getPath('home'), '.nerv', 'projects', projectId, 'NERV.md')
}

/**
 * Estimate token count for NERV.md content
 * Uses a simple heuristic: ~4 characters per token for English text
 */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4)
}

/**
 * Check if NERV.md content is within recommended size limits
 */
export function checkContentSize(content: string): {
  tokens: number
  isWithinTarget: boolean
  isWithinMax: boolean
  warning?: string
} {
  const tokens = estimateTokenCount(content)
  const isWithinTarget = tokens <= 1000
  const isWithinMax = tokens <= 2000

  let warning: string | undefined
  if (!isWithinMax) {
    warning = `NERV.md is ${tokens} tokens (max recommended: 2000). Consider reducing content.`
  } else if (!isWithinTarget) {
    warning = `NERV.md is ${tokens} tokens (target: 500-1000). Consider trimming non-essential content.`
  }

  return { tokens, isWithinTarget, isWithinMax, warning }
}
