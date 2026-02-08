#!/usr/bin/env node
/**
 * NERV CLI
 *
 * Command-line interface for NERV - the AI-orchestrated multi-repository
 * development framework.
 *
 * See PRD Section 12: CLI-First Architecture
 *
 * Usage:
 *   nerv init                    - Initialize NERV in current directory
 *   nerv project create <name>   - Create a new project
 *   nerv project list            - List all projects
 *   nerv task list               - List tasks (Kanban view)
 *   nerv task create <title>     - Create a new task
 *   nerv start [taskId]          - Start Claude session
 *   nerv yolo                    - Run YOLO benchmark
 *   nerv benchmark <spec>        - Run benchmark with spec file
 */

import { createDatabaseService, type DatabaseService } from '../core/database.js'
import { ensureNervDir, getNervDir } from '../core/platform.js'
import { CLI_EXIT_CODES } from '../shared/constants.js'
import { projectCommand } from './commands/project.js'
import { taskCommand } from './commands/task.js'
import { startCommand } from './commands/start.js'
import { benchmarkCommand } from './commands/benchmark.js'
import { contextCommand } from './commands/context.js'
import { learnCommand, learningsCommand } from './commands/learn.js'
import { decideCommand, decisionsCommand } from './commands/decide.js'
import { cycleCommand } from './commands/cycle.js'
import { configCommand } from './commands/config.js'
import { permissionsCommand } from './commands/permissions.js'
import { terminalCommand, terminalsCommand } from './commands/terminal.js'
import { orgCommand } from './commands/org.js'
import { updateCommand } from './commands/update.js'
import { approvalsCommand, approveCommand, denyCommand } from './commands/approvals.js'
import { resumeCommand, sessionsCommand, sessionCommand } from './commands/sessions.js'
import { agentsCommand, agentCommand } from './commands/agents.js'
import { startRepl } from './commands/repl.js'
import { skillCommand, isSlashCommand, listSkills } from './commands/skill.js'
import { recommendCommand } from './commands/recommend.js'
import { statusCommand } from './commands/status.js'
import { colors } from './colors.js'

// Version from package.json
const VERSION = '1.0.0'

function printHelp(): void {
  console.log(`
${colors.bold}NERV${colors.reset} - Neural Evolution & Repository Vectoring
${colors.gray}AI-orchestrated multi-repository development${colors.reset}

${colors.bold}USAGE${colors.reset}
  nerv                      Enter interactive mode (REPL)
  nerv <command> [options]

${colors.bold}COMMANDS${colors.reset}
  ${colors.cyan}Project Management${colors.reset}
    init                      Initialize NERV in current directory
    project create <name>     Create a new project
    project list              List all projects
    project info [id]         Show project details
    project switch <id>       Switch to a project

  ${colors.cyan}Task Management${colors.reset}
    task list                 List tasks (Kanban view)
    task create <title>       Create a new task
    task update <id> --status Update task status
    task verify <id>          Verify task acceptance criteria

  ${colors.cyan}Claude Sessions${colors.reset}
    start [taskId]            Start Claude session (generic or task-specific)
    start --agent <agent>     Start with a specific agent
    resume [sessionId]        Resume a previous session
    sessions                  List active sessions
    session fork --name <n>   Fork session for experimentation
    session compare <a> <b>   Compare forked sessions
    session merge <fork>      Merge fork back

  ${colors.cyan}Agents${colors.reset}
    agents                    List available agents
    agents --verbose          List with tool access details
    agent create <name>       Create a custom agent
    agent edit <name>         Edit a custom agent
    agent delete <name>       Delete a custom agent

  ${colors.cyan}Skills (Slash Commands)${colors.reset}
    /research "prompt"        Research and exploration with web search
    /architect "prompt"       Architecture and system design planning
    /implement --task T001    Implementation-focused code writing
    /review ./path --focus X  Code review and security analysis
    skills                    List all available skills

  ${colors.cyan}Autonomous Mode${colors.reset}
    yolo                      Run in YOLO mode (AI review)
    yolo --cycles <n>         Run for n cycles
    yolo --max-cost <usd>     Stop at cost limit
    yolo --stop-on-failure    Stop on first failure

  ${colors.cyan}Benchmarking${colors.reset}
    benchmark <spec>          Run benchmark with spec file
    benchmark score <dir>     Score a benchmark result
    benchmark history         View benchmark history
    benchmark compare <a> <b> Compare two benchmark runs

  ${colors.cyan}Context & Knowledge${colors.reset}
    context                   Show current context
    context show              Show NERV.md content
    context generate          Generate NERV.md
    learn "content"           Record a learning
    learnings                 List all learnings
    decide "title"            Record a decision
    decisions                 List all decisions

  ${colors.cyan}Cycles${colors.reset}
    cycle create "goal"       Create a new cycle
    cycle list                List all cycles
    cycle complete            Complete active cycle
    cycle audit               Run code health check

  ${colors.cyan}Configuration${colors.reset}
    config list               List all settings with sources
    config get <key>          Get a setting value
    config set <key> <value>  Set a setting (--project for project-level)
    config unset <key>        Remove a setting
    config path               Show config file paths

  ${colors.cyan}Permissions${colors.reset}
    permissions list          List all permission rules
    permissions learn         Show suggested rules from approval history
    permissions add <pattern> Add an allow rule
    permissions deny <pattern> Add a deny rule
    permissions remove <pattern> Remove a rule

  ${colors.cyan}Approvals${colors.reset}
    approvals                 View pending approvals
    approvals --all           View all approvals (including resolved)
    approve <id>              Approve a pending request
    deny <id> [--reason ""]   Deny a pending request

  ${colors.cyan}Terminal${colors.reset}
    terminal profiles         List available terminal profiles
    terminal open <id>        Open a terminal with specific profile
    terminals list            List terminal profiles (alias)
    terminals add <name> ...  Add a custom terminal profile
    terminals remove <id>     Remove a custom terminal profile

  ${colors.cyan}Organization${colors.reset}
    org status                Show organization config status
    org sync                  Force sync from config source
    org show                  Show organization settings
    org agents                List available org agents
    org skills                List available org skills

  ${colors.cyan}Updates${colors.reset}
    update status             Show current update status and settings
    update check              Check for available updates
    update install            Install available update
    update notes              Show release notes

  ${colors.cyan}Status${colors.reset}
    status                    Show current project status summary
    status --json             Output status as JSON

  ${colors.cyan}Workflow Guidance${colors.reset}
    recommend                 Get Claude's recommendation for next step
    recommend --json          Output recommendation as JSON

  ${colors.cyan}Other${colors.reset}
    help                      Show this help message
    version                   Show version

${colors.bold}OPTIONS${colors.reset}
  --project <id>            Override project detection
  --verbose                 Verbose output
  --json                    Output in JSON format

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# Initialize and create a project${colors.reset}
  nerv init
  nerv project create "OAuth Feature"

  ${colors.gray}# Create and start a task${colors.reset}
  nerv task create "Implement login endpoint"
  nerv start T001

  ${colors.gray}# Run YOLO benchmark${colors.reset}
  nerv yolo --cycles 5 --max-cost 10.00

${colors.bold}ENVIRONMENT VARIABLES${colors.reset}
  NERV_PROJECT_PATH         Override project detection
  NERV_CONFIG_PATH          Override config location (~/.nerv)
  NERV_LOG_LEVEL            Logging verbosity (debug, info, warn, error)
  NERV_OUTPUT_FORMAT        CLI output format (text, json)
`)
}

function printVersion(): void {
  console.log(`NERV v${VERSION}`)
}

// Global database instance
let db: DatabaseService | null = null

function getDb(): DatabaseService {
  if (!db) {
    db = createDatabaseService()
    db.initialize()
  }
  return db
}

function cleanup(): void {
  if (db) {
    db.close()
    db = null
  }
}

const helpFlags = new Set(['--help', '-h', 'help'])
const versionFlags = new Set(['--version', '-v', 'version'])

function handleGlobalFlags(command: string): boolean {
  if (helpFlags.has(command)) {
    printHelp()
    return true
  }
  if (versionFlags.has(command)) {
    printVersion()
    return true
  }
  return false
}

async function runCommand(command: string, args: string[], database: DatabaseService): Promise<void> {
  switch (command) {
    case 'init':
      console.log(`${colors.green}✓${colors.reset} NERV initialized at ${getNervDir()}`)
      console.log(`${colors.gray}Database: ${database.getDbPath()}${colors.reset}`)
      break
    case 'project':
      await projectCommand(args.slice(1), database)
      break
    case 'task':
      await taskCommand(args.slice(1), database)
      break
    case 'start':
      await startCommand(args.slice(1), database)
      break
    case 'yolo':
    case 'benchmark':
      await benchmarkCommand(args.slice(1), database, command === 'yolo')
      break
    case 'context':
      await contextCommand(args.slice(1), database)
      break
    case 'learn':
      await learnCommand(args.slice(1), database)
      break
    case 'learnings':
      await learningsCommand(args.slice(1), database)
      break
    case 'decide':
      await decideCommand(args.slice(1), database)
      break
    case 'decisions':
      await decisionsCommand(args.slice(1), database)
      break
    case 'cycle':
      await cycleCommand(args.slice(1), database)
      break
    case 'config':
    case 'settings':
      await configCommand(args.slice(1), database)
      break
    case 'permissions':
    case 'perms':
      await permissionsCommand(args.slice(1), database)
      break
    case 'terminal':
      await terminalCommand(args.slice(1))
      break
    case 'terminals':
      await terminalsCommand(args.slice(1))
      break
    case 'org':
    case 'organization':
      await orgCommand(args.slice(1), database)
      break
    case 'update':
    case 'updates':
      await updateCommand(args.slice(1), database)
      break
    case 'approvals':
      await approvalsCommand(args.slice(1), database)
      break
    case 'approve':
      await approveCommand(args.slice(1), database)
      break
    case 'deny':
      await denyCommand(args.slice(1), database)
      break
    case 'sessions':
      await sessionsCommand(args.slice(1), database)
      break
    case 'session':
      await sessionCommand(args.slice(1), database)
      break
    case 'resume':
      await resumeCommand(args.slice(1), database)
      break
    case 'agents':
      await agentsCommand(args.slice(1))
      break
    case 'agent':
      await agentCommand(args.slice(1))
      break
    case 'skills':
      listSkills()
      break
    case 'recommend':
    case 'next':
      await recommendCommand(args.slice(1), database)
      break
    case 'status':
      await statusCommand(args.slice(1), database)
      break
    default:
      // Handle slash commands (skills) per PRD Section 12
      if (isSlashCommand(command)) {
        await skillCommand(command, args.slice(1), database)
        break
      }
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}`)
      console.log(`Run 'nerv help' for usage.`)
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  ensureNervDir()

  // No arguments: enter interactive REPL mode (PRD Section 12)
  if (args.length === 0) {
    try {
      await startRepl(getDb())
    } finally {
      cleanup()
    }
    return
  }

  const command = args[0]

  if (handleGlobalFlags(command)) {
    process.exit(0)
  }

  try {
    await runCommand(command, args, getDb())
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error instanceof Error ? error.message : error)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  } finally {
    cleanup()
  }
}

// Handle process signals
process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

// Run main
main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error)
  cleanup()
  process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
})
