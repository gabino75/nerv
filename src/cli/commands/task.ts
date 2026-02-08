/**
 * Task management commands
 *
 * nerv task list               - List tasks (Kanban view)
 * nerv task create <title>     - Create a new task
 * nerv task update <id>        - Update task status
 * nerv task verify <id>        - Verify task acceptance criteria
 */

import type { DatabaseService } from '../../core/database.js'
import type { Task, TaskStatus } from '../../shared/types.js'
import { verifyTask } from '../../core/verification.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

// Status colors for Kanban columns
const statusColors: Record<TaskStatus, string> = {
  todo: colors.gray,
  in_progress: colors.blue,
  interrupted: colors.yellow,
  review: colors.magenta,
  done: colors.green
}

const statusLabels: Record<TaskStatus, string> = {
  todo: 'TODO',
  in_progress: 'IN PROGRESS',
  interrupted: 'INTERRUPTED',
  review: 'REVIEW',
  done: 'DONE'
}

function formatTaskShort(task: Task): string {
  const color = statusColors[task.status] || colors.gray
  const id = task.id.slice(0, 8)
  const title = task.title.length > 40 ? task.title.slice(0, 37) + '...' : task.title
  return `  ${color}${id}${colors.reset}  ${title}`
}

function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    interrupted: [],
    review: [],
    done: []
  }

  for (const task of tasks) {
    if (groups[task.status]) {
      groups[task.status].push(task)
    }
  }

  return groups
}

function printKanban(tasks: Task[]): void {
  const groups = groupTasksByStatus(tasks)
  const statuses: TaskStatus[] = ['todo', 'in_progress', 'interrupted', 'review', 'done']

  // Calculate column widths
  const columnWidth = 50

  // Print header
  console.log()
  for (const status of statuses) {
    const label = statusLabels[status]
    const count = groups[status].length
    const color = statusColors[status]
    const header = `${color}${label}${colors.reset} (${count})`
    process.stdout.write(header.padEnd(columnWidth + 10)) // Extra for ANSI codes
  }
  console.log()

  // Print separator
  for (let i = 0; i < statuses.length; i++) {
    process.stdout.write('─'.repeat(columnWidth - 5) + '     ')
  }
  console.log()

  // Find max tasks in any column
  const maxTasks = Math.max(...Object.values(groups).map(g => g.length), 1)

  // Print rows
  for (let row = 0; row < maxTasks; row++) {
    for (const status of statuses) {
      const task = groups[status][row]
      if (task) {
        const id = task.id.slice(0, 6)
        const title = task.title.length > 35 ? task.title.slice(0, 32) + '...' : task.title
        const color = statusColors[status]
        const cell = `${color}${id}${colors.reset} ${title}`
        process.stdout.write(cell.padEnd(columnWidth + 10))
      } else {
        process.stdout.write(' '.repeat(columnWidth))
      }
    }
    console.log()
  }
  console.log()
}

function parseFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined
}

function findTaskByIdOrPrefix(id: string, tasks: Task[]): Task {
  const matches = tasks.filter(t => t.id === id || t.id.startsWith(id))

  if (matches.length === 0) {
    console.error(`${colors.red}Task not found: ${id}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.TASK_NOT_FOUND)
  }
  if (matches.length > 1) {
    console.error(`${colors.yellow}Multiple matches:${colors.reset}`)
    for (const t of matches) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.title}`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  return matches[0]
}

function handleTaskList(args: string[], tasks: Task[], projectName: string): void {
  // Filter by --status if provided (PRD Section 12: nerv task list --status in_progress)
  const statusFilter = parseFlag(args, '--status') as TaskStatus | undefined
  if (statusFilter) {
    const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'interrupted', 'review', 'done']
    if (!validStatuses.includes(statusFilter)) {
      console.error(`${colors.red}Invalid status filter. Must be one of: ${validStatuses.join(', ')}${colors.reset}`)
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
    }
    tasks = tasks.filter(t => t.status === statusFilter)
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    const filterMsg = statusFilter ? ` with status "${statusFilter}"` : ''
    console.log(`${colors.gray}No tasks found${filterMsg}. Create one with: nerv task create <title>${colors.reset}`)
    return
  }

  const format = parseFlag(args, '--format') || 'kanban'

  if (format === 'kanban') {
    console.log(`${colors.bold}${projectName}${colors.reset} - Tasks`)
    printKanban(tasks)
  } else {
    console.log(`${colors.bold}Tasks (${tasks.length})${colors.reset}\n`)
    for (const task of tasks) {
      console.log(formatTaskShort(task))
    }
  }
}

function handleTaskCreate(args: string[], db: DatabaseService, projectId: string): void {
  if (args.length < 2) {
    console.error(`${colors.red}Error: Task title required${colors.reset}`)
    console.log('Usage: nerv task create <title> [--description "desc"] [--type implementation|research]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const title = args[1]
  const description = parseFlag(args, '--description')
  let taskType: 'implementation' | 'research' = 'implementation'

  const typeArg = parseFlag(args, '--type')
  if (typeArg === 'implementation' || typeArg === 'research') {
    taskType = typeArg
  }

  const task = db.createTaskWithType(projectId, title, taskType, description)

  if (args.includes('--json')) {
    console.log(JSON.stringify(task, null, 2))
    return
  }

  console.log(`${colors.green}✓${colors.reset} Created task: ${colors.cyan}${task.id.slice(0, 8)}${colors.reset}`)
  console.log(`  Title: ${task.title}`)
  console.log(`  Type: ${task.task_type}`)
  console.log(`  Status: ${colors.gray}${task.status}${colors.reset}`)
}

function handleTaskUpdate(args: string[], db: DatabaseService, tasks: Task[]): void {
  if (args.length < 2) {
    console.error(`${colors.red}Error: Task ID required${colors.reset}`)
    console.log('Usage: nerv task update <id> --status <todo|in_progress|interrupted|review|done>')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const id = args[1]
  const task = findTaskByIdOrPrefix(id, tasks)
  const newStatus = parseFlag(args, '--status') as TaskStatus | undefined

  if (!newStatus) {
    console.log('No updates specified. Use --status to change status.')
    return
  }

  const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'interrupted', 'review', 'done']
  if (!validStatuses.includes(newStatus)) {
    console.error(`${colors.red}Invalid status. Must be one of: ${validStatuses.join(', ')}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const updated = db.updateTaskStatus(task.id, newStatus)
  if (updated) {
    const color = statusColors[newStatus]
    console.log(`${colors.green}✓${colors.reset} Updated task ${colors.cyan}${task.id.slice(0, 8)}${colors.reset} → ${color}${newStatus}${colors.reset}`)
  }
}

async function handleTaskVerify(args: string[], db: DatabaseService, tasks: Task[]): Promise<void> {
  if (args.length < 2) {
    console.error(`${colors.red}Error: Task ID required${colors.reset}`)
    console.log('Usage: nerv task verify <id> [--cwd <path>]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const id = args[1]
  const task = findTaskByIdOrPrefix(id, tasks)
  const cwd = parseFlag(args, '--cwd')

  console.log(`\n${colors.bold}Verifying task:${colors.reset} ${task.title}`)
  console.log(`${colors.gray}ID: ${task.id.slice(0, 8)}${colors.reset}\n`)

  const criteria = db.getCriteriaForTask(task.id)
  if (criteria.length === 0) {
    console.log(`${colors.yellow}No acceptance criteria defined for this task.${colors.reset}`)
    console.log(`${colors.gray}Add criteria with: nerv task criteria add <id> --verifier command --command "npm test"${colors.reset}`)
    return
  }

  console.log(`Running ${criteria.length} verifier(s)...\n`)

  const result = await verifyTask(task.id, db, cwd)

  // Display results
  for (const verifierResult of result.results) {
    const criterion = criteria.find(c => c.id === verifierResult.criterion_id)
    const statusIcon = verifierResult.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`
    const statusText = verifierResult.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`

    console.log(`${statusIcon} ${criterion?.description ?? 'Unknown criterion'}`)
    console.log(`   Status: ${statusText}`)
    console.log(`   Duration: ${verifierResult.duration_ms}ms`)
    if (!verifierResult.passed && verifierResult.output) {
      const outputPreview = verifierResult.output.split('\n').slice(0, 3).join('\n   ')
      console.log(`   Output: ${colors.gray}${outputPreview}${colors.reset}`)
    }
    console.log()
  }

  // Summary
  const counts = db.getCriteriaCounts(task.id)
  console.log('─'.repeat(50))
  console.log(`${colors.bold}Summary:${colors.reset}`)
  console.log(`  ${colors.green}Passed:${colors.reset}  ${counts.pass}`)
  console.log(`  ${colors.red}Failed:${colors.reset}  ${counts.fail}`)
  console.log(`  ${colors.yellow}Pending:${colors.reset} ${counts.pending} (manual checks)`)
  console.log(`  ${colors.gray}Total:${colors.reset}   ${counts.total}`)
  console.log()

  if (result.all_passed) {
    console.log(`${colors.green}${colors.bold}All criteria passed!${colors.reset}`)
  } else if (result.auto_criteria_passed && result.manual_pending > 0) {
    console.log(`${colors.yellow}Automated checks passed. ${result.manual_pending} manual verification(s) pending.${colors.reset}`)
  } else {
    console.log(`${colors.red}Some criteria failed. Fix issues and run verify again.${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

export async function taskCommand(args: string[], db: DatabaseService): Promise<void> {
  if (args.length === 0) {
    console.log(`${colors.yellow}Usage: nerv task <list|create|update|verify> [options]${colors.reset}`)
    console.log(`\n  list   [--status <status>] [--format kanban|list] [--json]`)
    console.log(`  create <title> [--description "desc"] [--type implementation|research]`)
    console.log(`  update <id> --status <status>`)
    console.log(`  verify <id> [--cwd <path>]`)
    return
  }

  const subcommand = args[0]

  const currentProject = db.getCurrentProject()
  if (!currentProject) {
    console.error(`${colors.red}No project found. Create one first: nerv project create <name>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  const tasks = db.getTasksForProject(currentProject.id)

  switch (subcommand) {
    case 'list':
      handleTaskList(args, tasks, currentProject.name)
      break
    case 'create':
      handleTaskCreate(args, db, currentProject.id)
      break
    case 'update':
      handleTaskUpdate(args, db, tasks)
      break
    case 'verify':
      await handleTaskVerify(args, db, tasks)
      break
    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      console.log('Available: list, create, update, verify')
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
}
