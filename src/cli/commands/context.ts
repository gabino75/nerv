/**
 * Context management commands
 *
 * nerv context          - Show current session context
 * nerv context show     - Show NERV.md content
 * nerv context generate - Generate NERV.md for project
 * nerv context --full   - Include all repo context
 */

import type { DatabaseService } from '../../core/database.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

function showContext(db: DatabaseService, full: boolean): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.log(`${colors.gray}No project selected. Use: nerv project switch <id>${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Project Context: ${project.name}${colors.reset}`)
  console.log(`${colors.gray}${'─'.repeat(40)}${colors.reset}`)

  // Project info
  console.log(`\n${colors.cyan}Project${colors.reset}`)
  console.log(`  ID: ${project.id}`)
  if (project.goal) {
    console.log(`  Goal: ${project.goal}`)
  }

  // Repos
  const repos = db.getReposForProject(project.id)
  if (repos.length > 0) {
    console.log(`\n${colors.cyan}Repositories (${repos.length})${colors.reset}`)
    for (const repo of repos) {
      console.log(`  ${repo.name}: ${repo.path}`)
      if (full) {
        const contexts = db.getRepoContextForRepo(repo.id)
        if (contexts.length > 0) {
          for (const ctx of contexts) {
            console.log(`    ${colors.gray}└─ ${ctx.context_type}: ${ctx.file_path}${colors.reset}`)
          }
        }
      }
    }
  }

  // Active cycle
  const cycle = db.getActiveCycle(project.id)
  if (cycle) {
    console.log(`\n${colors.cyan}Active Cycle${colors.reset}`)
    console.log(`  Cycle ${cycle.cycle_number}: ${cycle.goal || '(no goal)'}`)
    const cycleTasks = db.getTasksForCycle(cycle.id)
    const done = cycleTasks.filter(t => t.status === 'done').length
    console.log(`  Tasks: ${done}/${cycleTasks.length} done`)
  }

  // Tasks overview
  const tasks = db.getTasksForProject(project.id)
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const pending = tasks.filter(t => t.status === 'todo')

  console.log(`\n${colors.cyan}Tasks${colors.reset}`)
  console.log(`  In progress: ${inProgress.length}`)
  console.log(`  Pending: ${pending.length}`)
  console.log(`  Total: ${tasks.length}`)

  if (inProgress.length > 0) {
    console.log(`\n${colors.cyan}Active Tasks${colors.reset}`)
    for (const task of inProgress) {
      console.log(`  ${colors.yellow}●${colors.reset} ${task.id.slice(0, 8)} - ${task.title}`)
    }
  }

  // Learnings
  const learnings = db.getLearningsForProject(project.id)
  if (learnings.length > 0) {
    console.log(`\n${colors.cyan}Learnings (${learnings.length})${colors.reset}`)
    const recent = learnings.slice(0, 5)
    for (const learning of recent) {
      const cat = learning.category ? `[${learning.category}] ` : ''
      console.log(`  • ${cat}${learning.content.slice(0, 60)}${learning.content.length > 60 ? '...' : ''}`)
    }
    if (learnings.length > 5) {
      console.log(`  ${colors.gray}... and ${learnings.length - 5} more${colors.reset}`)
    }
  }

  // Decisions
  const decisions = db.getDecisionsForProject(project.id)
  if (decisions.length > 0) {
    console.log(`\n${colors.cyan}Decisions (${decisions.length})${colors.reset}`)
    const recent = decisions.slice(0, 5)
    for (const decision of recent) {
      console.log(`  • ${decision.title}`)
    }
    if (decisions.length > 5) {
      console.log(`  ${colors.gray}... and ${decisions.length - 5} more${colors.reset}`)
    }
  }
}

function generateNervMd(db: DatabaseService): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.error(`${colors.red}No project selected. Use: nerv project switch <id>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  const lines: string[] = []
  lines.push(`# ${project.name}`)
  lines.push('')
  if (project.goal) {
    lines.push(`**Goal:** ${project.goal}`)
    lines.push('')
  }

  // Active cycle
  const cycle = db.getActiveCycle(project.id)
  if (cycle) {
    lines.push(`## Current Cycle`)
    lines.push('')
    lines.push(`Cycle ${cycle.cycle_number}: ${cycle.goal || 'No goal specified'}`)
    lines.push('')
  }

  // Learnings
  const learnings = db.getLearningsForProject(project.id)
  if (learnings.length > 0) {
    lines.push(`## Learnings`)
    lines.push('')
    for (const learning of learnings) {
      const cat = learning.category ? `[${learning.category}] ` : ''
      lines.push(`- ${cat}${learning.content}`)
    }
    lines.push('')
  }

  // Decisions
  const decisions = db.getDecisionsForProject(project.id)
  if (decisions.length > 0) {
    lines.push(`## Decisions`)
    lines.push('')
    for (const decision of decisions) {
      lines.push(`### ${decision.title}`)
      if (decision.rationale) {
        lines.push('')
        lines.push(`**Rationale:** ${decision.rationale}`)
      }
      if (decision.alternatives) {
        lines.push('')
        lines.push(`**Alternatives considered:** ${decision.alternatives}`)
      }
      lines.push('')
    }
  }

  // Tasks
  const tasks = db.getTasksForProject(project.id)
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const pending = tasks.filter(t => t.status === 'todo')

  if (inProgress.length > 0) {
    lines.push(`## In Progress`)
    lines.push('')
    for (const task of inProgress) {
      lines.push(`- ${task.title}`)
      if (task.description) {
        lines.push(`  ${task.description}`)
      }
    }
    lines.push('')
  }

  if (pending.length > 0) {
    lines.push(`## Pending Tasks`)
    lines.push('')
    for (const task of pending.slice(0, 10)) {
      lines.push(`- ${task.title}`)
    }
    if (pending.length > 10) {
      lines.push(`- ... and ${pending.length - 10} more`)
    }
    lines.push('')
  }

  const content = lines.join('\n')
  console.log(content)
}

function showNervMd(db: DatabaseService): void {
  generateNervMd(db)
}

export async function contextCommand(args: string[], db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const full = args.includes('--full')

  if (!subcommand || subcommand === '--full') {
    showContext(db, full)
    return
  }

  switch (subcommand) {
    case 'show':
      showNervMd(db)
      break
    case 'generate':
      generateNervMd(db)
      break
    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      console.log('Usage: nerv context [show|generate] [--full]')
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
}
