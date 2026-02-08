/**
 * Project management commands
 *
 * nerv project create <name>   - Create a new project
 * nerv project list            - List all projects
 * nerv project info [id]       - Show project details
 * nerv project switch <id>     - Switch to a project
 * nerv project add-repo <id> <path> - Add a repo to a project
 * nerv project scan [path]     - Scan directory for git repos
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DatabaseService } from '../../core/database.js'
import type { Project } from '../../shared/types.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'
import { parseSpec } from '../../core/spec-parser.js'

function formatProject(project: Project, detailed: boolean = false, isCurrent: boolean = false): string {
  const lines: string[] = []
  const created = new Date(project.created_at).toLocaleDateString()
  const currentMarker = isCurrent ? `${colors.green}*${colors.reset} ` : '  '

  if (detailed) {
    lines.push(`${colors.bold}${project.name}${colors.reset}${isCurrent ? ` ${colors.green}(current)${colors.reset}` : ''}`)
    lines.push(`  ID: ${colors.gray}${project.id}${colors.reset}`)
    lines.push(`  Created: ${colors.gray}${created}${colors.reset}`)
    if (project.goal) {
      lines.push(`  Goal: ${project.goal}`)
    }
  } else {
    lines.push(`${currentMarker}${colors.cyan}${project.id.slice(0, 8)}${colors.reset}  ${project.name}  ${colors.gray}(${created})${colors.reset}`)
  }

  return lines.join('\n')
}

function handleProjectCreate(args: string[], db: DatabaseService): void {
  const specIndex = args.indexOf('--from-spec')
  if (specIndex !== -1) {
    return handleProjectCreateFromSpec(args, db, specIndex)
  }

  if (args.length < 2) {
    console.error(`${colors.red}Error: Project name required${colors.reset}`)
    console.log('Usage: nerv project create <name> [--goal "description"]')
    console.log('       nerv project create --from-spec <spec-file>')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const name = args[1]
  let goal: string | undefined

  const goalIndex = args.indexOf('--goal')
  if (goalIndex !== -1 && args[goalIndex + 1]) {
    goal = args[goalIndex + 1]
  }

  const project = db.createProject(name, goal)
  db.setCurrentProjectId(project.id)
  console.log(`${colors.green}✓${colors.reset} Created project: ${colors.bold}${project.name}${colors.reset}`)
  console.log(`  ID: ${colors.cyan}${project.id}${colors.reset}`)
  console.log(`  ${colors.gray}(set as current project)${colors.reset}`)
}

function handleProjectCreateFromSpec(args: string[], db: DatabaseService, specIndex: number): void {
  const specPath = args[specIndex + 1]
  if (!specPath) {
    console.error(`${colors.red}Error: Spec file path required after --from-spec${colors.reset}`)
    console.log('Usage: nerv project create --from-spec <spec-file>')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const resolvedPath = path.resolve(specPath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${colors.red}Error: Spec file not found: ${resolvedPath}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const specContent = fs.readFileSync(resolvedPath, 'utf-8')
  const parsed = parseSpec(specContent)

  // Use spec title as project name, allow override via positional arg
  const nameArg = args.find((a, i) => i >= 1 && !a.startsWith('--') && i !== specIndex + 1)
  const projectName = nameArg || parsed.title

  let goal: string | undefined
  const goalIndex = args.indexOf('--goal')
  if (goalIndex !== -1 && args[goalIndex + 1]) {
    goal = args[goalIndex + 1]
  }

  const project = db.createProject(projectName, goal)
  db.setCurrentProjectId(project.id)

  console.log(`${colors.green}✓${colors.reset} Created project: ${colors.bold}${project.name}${colors.reset}`)
  console.log(`  ID: ${colors.cyan}${project.id}${colors.reset}`)
  console.log(`  Spec: ${colors.gray}${resolvedPath}${colors.reset}`)

  // Create a cycle and tasks for each parsed cycle
  let totalTasks = 0
  for (const cycle of parsed.cycles) {
    const dbCycle = db.createCycle(project.id, cycle.cycleNumber, cycle.title)
    for (const subtask of cycle.subtasks) {
      db.createTask(project.id, subtask.title, subtask.description, dbCycle.id)
      totalTasks++
    }
  }

  console.log(`  Cycles: ${colors.cyan}${parsed.cycles.length}${colors.reset}`)
  console.log(`  Tasks: ${colors.cyan}${totalTasks}${colors.reset}`)
  console.log(`  Acceptance criteria: ${colors.cyan}${parsed.totalAcceptanceCriteria}${colors.reset}`)
  console.log(`  ${colors.gray}(set as current project)${colors.reset}`)
}

function handleProjectList(db: DatabaseService, jsonOutput: boolean): void {
  const projects = db.getAllProjects()
  const currentProjectId = db.getCurrentProjectId()

  if (jsonOutput) {
    console.log(JSON.stringify(projects.map(p => ({ ...p, is_current: p.id === currentProjectId })), null, 2))
    return
  }

  if (projects.length === 0) {
    console.log(`${colors.gray}No projects found. Create one with: nerv project create <name>${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Projects (${projects.length})${colors.reset}\n`)
  for (const project of projects) {
    const isCurrent = project.id === currentProjectId
    console.log(formatProject(project, false, isCurrent))
  }
  console.log(`\n${colors.gray}* = current project${colors.reset}`)
}

function displayProjectDetails(project: Project, db: DatabaseService, isCurrent: boolean): void {
  console.log(formatProject(project, true, isCurrent))

  const repos = db.getReposForProject(project.id)
  if (repos.length > 0) {
    console.log(`\n${colors.bold}Repositories (${repos.length})${colors.reset}`)
    for (const repo of repos) {
      console.log(`  ${colors.cyan}${repo.name}${colors.reset} - ${colors.gray}${repo.path}${colors.reset}`)
    }
  }

  const tasks = db.getTasksForProject(project.id)
  console.log(`\n${colors.bold}Tasks${colors.reset}: ${tasks.length}`)
  const byStatus: Record<string, number> = {}
  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1
  }
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`)
  }
}

function handleProjectInfo(args: string[], db: DatabaseService, jsonOutput: boolean): void {
  const filteredArgs = args.filter(a => !a.startsWith('-'))
  const id = filteredArgs[1]
  let project: Project | undefined

  if (!id) {
    project = db.getCurrentProject()
    if (!project) {
      if (jsonOutput) {
        console.log(JSON.stringify(null))
      } else {
        console.log(`${colors.gray}No projects found.${colors.reset}`)
      }
      return
    }
  } else {
    project = db.getProject(id)
    if (!project) {
      console.error(`${colors.red}Project not found: ${id}${colors.reset}`)
      process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
    }
  }

  if (jsonOutput) {
    const repos = db.getReposForProject(project.id)
    const tasks = db.getTasksForProject(project.id)
    console.log(JSON.stringify({ ...project, repos, tasks }, null, 2))
    return
  }

  const currentProjectId = db.getCurrentProjectId()
  displayProjectDetails(project, db, project.id === currentProjectId)
}

function findProjectByIdOrPrefix(id: string, db: DatabaseService): Project {
  const project = db.getProject(id)
  if (project) return project

  const projects = db.getAllProjects()
  const matches = projects.filter(p => p.id.startsWith(id))
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    console.error(`${colors.yellow}Multiple matches:${colors.reset}`)
    for (const p of matches) {
      console.log(`  ${p.id.slice(0, 8)}  ${p.name}`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
  console.error(`${colors.red}Project not found: ${id}${colors.reset}`)
  process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
}

function handleProjectSwitch(args: string[], db: DatabaseService): void {
  const id = args[1]
  if (!id) {
    console.error(`${colors.red}Error: Project ID required${colors.reset}`)
    console.log('Usage: nerv project switch <id>')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const project = findProjectByIdOrPrefix(id, db)
  db.setCurrentProjectId(project.id)
  console.log(`${colors.green}✓${colors.reset} Switched to: ${colors.bold}${project.name}${colors.reset}`)
}

function handleProjectAddRepo(args: string[], db: DatabaseService): void {
  if (args.length < 3) {
    console.error(`${colors.red}Error: Project ID and repo path required${colors.reset}`)
    console.log('Usage: nerv project add-repo <project-id> <repo-path> [--name <name>]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const projectId = args[1]
  const repoPath = path.resolve(args[2])

  // Validate project exists
  const project = findProjectByIdOrPrefix(projectId, db)

  // Validate repo path exists on filesystem
  if (!fs.existsSync(repoPath)) {
    console.error(`${colors.red}Error: Path does not exist: ${repoPath}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  if (!fs.statSync(repoPath).isDirectory()) {
    console.error(`${colors.red}Error: Path is not a directory: ${repoPath}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  // Derive repo name from --name flag or directory name
  const nameIndex = args.indexOf('--name')
  const repoName = (nameIndex !== -1 && args[nameIndex + 1])
    ? args[nameIndex + 1]
    : path.basename(repoPath)

  // Check if repo already exists in project
  const existingRepos = db.getReposForProject(project.id)
  const alreadyAdded = existingRepos.find(r => r.path === repoPath)
  if (alreadyAdded) {
    console.error(`${colors.yellow}Repo already in project: ${repoName} (${repoPath})${colors.reset}`)
    return
  }

  const repo = db.createRepo(project.id, repoName, repoPath)
  console.log(`${colors.green}✓${colors.reset} Added repo to project ${colors.bold}${project.name}${colors.reset}`)
  console.log(`  Name: ${colors.cyan}${repo.name}${colors.reset}`)
  console.log(`  Path: ${colors.gray}${repo.path}${colors.reset}`)
}

function isGitRepo(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.git'))
}

function handleProjectScan(args: string[], db: DatabaseService): void {
  const scanPath = args[1] ? path.resolve(args[1]) : process.cwd()
  const addToProject = args.includes('--add')

  if (!fs.existsSync(scanPath)) {
    console.error(`${colors.red}Error: Path does not exist: ${scanPath}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  console.log(`${colors.bold}Scanning for git repositories in:${colors.reset} ${scanPath}\n`)

  const foundRepos: { name: string; repoPath: string }[] = []

  // Check if the scan path itself is a git repo
  if (isGitRepo(scanPath)) {
    foundRepos.push({ name: path.basename(scanPath), repoPath: scanPath })
  }

  // Scan immediate subdirectories
  try {
    const entries = fs.readdirSync(scanPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subDir = path.join(scanPath, entry.name)
        if (isGitRepo(subDir)) {
          foundRepos.push({ name: entry.name, repoPath: subDir })
        }
      }
    }
  } catch (err) {
    console.error(`${colors.red}Error scanning directory: ${err instanceof Error ? err.message : err}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (foundRepos.length === 0) {
    console.log(`${colors.gray}No git repositories found.${colors.reset}`)
    return
  }

  console.log(`${colors.green}Found ${foundRepos.length} git repository(ies):${colors.reset}\n`)
  for (const repo of foundRepos) {
    console.log(`  ${colors.cyan}${repo.name}${colors.reset} - ${colors.gray}${repo.repoPath}${colors.reset}`)
  }

  if (addToProject) {
    const project = db.getCurrentProject()
    if (!project) {
      console.log(`\n${colors.yellow}No current project. Create one first: nerv project create <name>${colors.reset}`)
      return
    }

    const existingRepos = db.getReposForProject(project.id)
    const existingPaths = new Set(existingRepos.map(r => r.path))
    let added = 0

    for (const repo of foundRepos) {
      if (!existingPaths.has(repo.repoPath)) {
        db.createRepo(project.id, repo.name, repo.repoPath)
        added++
      }
    }

    console.log(`\n${colors.green}✓${colors.reset} Added ${added} repo(s) to project ${colors.bold}${project.name}${colors.reset}`)
    if (added < foundRepos.length) {
      console.log(`  ${colors.gray}${foundRepos.length - added} already in project${colors.reset}`)
    }
  } else {
    console.log(`\n${colors.gray}Use --add to add these repos to the current project${colors.reset}`)
  }
}

export async function projectCommand(args: string[], db: DatabaseService): Promise<void> {
  if (args.length === 0) {
    console.log(`${colors.yellow}Usage: nerv project <create|list|info|switch|add-repo|scan> [options]${colors.reset}`)
    return
  }

  const subcommand = args[0]
  const jsonOutput = args.includes('--json')

  switch (subcommand) {
    case 'create':
      handleProjectCreate(args, db)
      break
    case 'list':
      handleProjectList(db, jsonOutput)
      break
    case 'info':
      handleProjectInfo(args, db, jsonOutput)
      break
    case 'switch':
      handleProjectSwitch(args, db)
      break
    case 'add-repo':
      handleProjectAddRepo(args, db)
      break
    case 'scan':
      handleProjectScan(args, db)
      break
    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      console.log('Usage: nerv project <create|list|info|switch|add-repo|scan> [options]')
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
}
