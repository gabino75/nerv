/**
 * Status command
 *
 * nerv status          - Show current project status summary
 * nerv status --json   - Output as JSON
 */

import type { DatabaseService } from '../../core/database.js'
import { colors } from '../colors.js'

export async function statusCommand(args: string[], db: DatabaseService): Promise<void> {
  const jsonOutput = args.includes('--json')

  const project = db.getCurrentProject()
  if (!project) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'no_project' }))
    } else {
      console.log(`${colors.gray}No project selected.${colors.reset}`)
      console.log(`  Create one: ${colors.cyan}nerv project create <name>${colors.reset}`)
      console.log(`  Or switch:  ${colors.cyan}nerv project switch <id>${colors.reset}`)
    }
    return
  }

  const repos = db.getReposForProject(project.id)
  const tasks = db.getTasksForProject(project.id)
  const cycles = db.getCyclesForProject(project.id)
  const activeCycle = db.getActiveCycle(project.id)
  const learnings = db.getLearningsForProject(project.id)
  const decisions = db.getDecisionsForProject(project.id)

  // Task counts by status
  const tasksByStatus: Record<string, number> = {}
  for (const task of tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      project: { id: project.id, name: project.name, goal: project.goal },
      repos: repos.length,
      tasks: { total: tasks.length, by_status: tasksByStatus },
      cycles: { total: cycles.length, active: activeCycle ? { number: activeCycle.cycle_number, goal: activeCycle.goal } : null },
      learnings: learnings.length,
      decisions: decisions.length,
    }, null, 2))
    return
  }

  // Header
  console.log(`\n${colors.bold}NERV Status${colors.reset}`)
  console.log(`${'─'.repeat(50)}`)

  // Project
  console.log(`\n${colors.cyan}Project${colors.reset}  ${colors.bold}${project.name}${colors.reset}`)
  console.log(`         ${colors.gray}${project.id}${colors.reset}`)
  if (project.goal) {
    console.log(`         ${project.goal}`)
  }

  // Repositories
  console.log(`\n${colors.cyan}Repos${colors.reset}    ${repos.length === 0 ? colors.gray + 'none' + colors.reset : repos.map(r => r.name).join(', ')}`)

  // Tasks
  console.log(`\n${colors.cyan}Tasks${colors.reset}    ${tasks.length} total`)
  if (tasks.length > 0) {
    const statusOrder = ['in_progress', 'pending', 'review', 'done', 'blocked']
    for (const status of statusOrder) {
      const count = tasksByStatus[status]
      if (count) {
        const statusColor = status === 'in_progress' ? colors.yellow
          : status === 'done' ? colors.green
          : status === 'blocked' ? colors.red
          : colors.gray
        console.log(`         ${statusColor}${status}${colors.reset}: ${count}`)
      }
    }
    // Any other statuses not in the order
    for (const [status, count] of Object.entries(tasksByStatus)) {
      if (!statusOrder.includes(status)) {
        console.log(`         ${colors.gray}${status}${colors.reset}: ${count}`)
      }
    }
  }

  // Cycle
  if (activeCycle) {
    console.log(`\n${colors.cyan}Cycle${colors.reset}    ${colors.bold}#${activeCycle.cycle_number}${colors.reset} (active)`)
    if (activeCycle.goal) {
      console.log(`         ${activeCycle.goal}`)
    }
  } else {
    console.log(`\n${colors.cyan}Cycle${colors.reset}    ${colors.gray}no active cycle${colors.reset}`)
  }
  console.log(`         ${cycles.length} total cycle(s)`)

  // Knowledge
  if (learnings.length > 0 || decisions.length > 0) {
    console.log(`\n${colors.cyan}Knowledge${colors.reset}`)
    if (learnings.length > 0) {
      console.log(`         ${learnings.length} learning(s)`)
    }
    if (decisions.length > 0) {
      console.log(`         ${decisions.length} decision(s)`)
    }
  }

  console.log()
}
