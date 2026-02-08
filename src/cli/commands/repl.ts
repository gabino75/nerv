/**
 * Interactive REPL mode
 *
 * When nerv is run without arguments, enters an interactive mode.
 * See PRD Section 12: CLI-First Architecture - Interactive Mode
 *
 * nerv> task list
 * nerv> start T001
 * nerv> quit
 */

import * as readline from 'readline'
import type { DatabaseService } from '../../core/database.js'
import { projectCommand } from './project.js'
import { taskCommand } from './task.js'
import { startCommand } from './start.js'
import { benchmarkCommand } from './benchmark.js'
import { contextCommand } from './context.js'
import { learnCommand, learningsCommand } from './learn.js'
import { decideCommand, decisionsCommand } from './decide.js'
import { cycleCommand } from './cycle.js'
import { configCommand } from './config.js'
import { permissionsCommand } from './permissions.js'
import { terminalCommand, terminalsCommand } from './terminal.js'
import { orgCommand } from './org.js'
import { updateCommand } from './update.js'
import { approvalsCommand, approveCommand, denyCommand } from './approvals.js'
import { resumeCommand, sessionsCommand } from './sessions.js'
import { agentsCommand, agentCommand } from './agents.js'
import { skillCommand, isSlashCommand, listSkills } from './skill.js'
import { colors } from '../colors.js'

const VERSION = '1.0.0'

function getProjectInfo(db: DatabaseService): string {
  const project = db.getCurrentProject()
  if (!project) {
    return 'No project selected'
  }
  const repos = db.getReposForProject(project.id)
  return `${project.name} (${repos.length} repos)`
}

async function runReplCommand(
  command: string,
  args: string[],
  db: DatabaseService
): Promise<boolean> {
  // Return true to continue REPL, false to exit

  switch (command) {
    case 'quit':
    case 'exit':
    case 'q':
      console.log(`${colors.gray}Goodbye!${colors.reset}`)
      return false

    case 'help':
    case '?':
      printReplHelp()
      return true

    case 'clear':
      console.clear()
      return true

    case 'project':
      await projectCommand(args, db)
      return true

    case 'task':
      await taskCommand(args, db)
      return true

    case 'start':
      await startCommand(args, db)
      return true

    case 'yolo':
    case 'benchmark':
      await benchmarkCommand(args, db, command === 'yolo')
      return true

    case 'context':
      await contextCommand(args, db)
      return true

    case 'learn':
      await learnCommand(args, db)
      return true

    case 'learnings':
      await learningsCommand(args, db)
      return true

    case 'decide':
      await decideCommand(args, db)
      return true

    case 'decisions':
      await decisionsCommand(args, db)
      return true

    case 'cycle':
      await cycleCommand(args, db)
      return true

    case 'config':
    case 'settings':
      await configCommand(args, db)
      return true

    case 'permissions':
    case 'perms':
      await permissionsCommand(args, db)
      return true

    case 'terminal':
      await terminalCommand(args)
      return true

    case 'terminals':
      await terminalsCommand(args)
      return true

    case 'org':
    case 'organization':
      await orgCommand(args, db)
      return true

    case 'update':
    case 'updates':
      await updateCommand(args, db)
      return true

    case 'approvals':
      await approvalsCommand(args, db)
      return true

    case 'approve':
      await approveCommand(args, db)
      return true

    case 'deny':
      await denyCommand(args, db)
      return true

    case 'sessions':
      await sessionsCommand(args, db)
      return true

    case 'resume':
      await resumeCommand(args, db)
      return true

    case 'agents':
      await agentsCommand(args)
      return true

    case 'agent':
      await agentCommand(args)
      return true

    case 'skills':
      listSkills()
      return true

    case '':
      // Empty line, just continue
      return true

    default:
      // Handle slash commands (skills) per PRD Section 12
      if (isSlashCommand(command)) {
        await skillCommand('/' + command.replace(/^\//, ''), args, db)
        return true
      }
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}`)
      console.log(`Type 'help' for available commands.`)
      return true
  }
}

function printReplHelp(): void {
  console.log(`
${colors.bold}Interactive Mode Commands${colors.reset}

${colors.cyan}Project & Tasks${colors.reset}
  project list/create/info/switch
  task list/create/update
  cycle list/create/complete/audit

${colors.cyan}Claude Sessions${colors.reset}
  start [taskId]           Start Claude session
  start --agent <name>     Start with specific agent
  resume [sessionId]       Resume previous session
  sessions                 List active sessions
  agents                   List available agents

${colors.cyan}Autonomous Mode${colors.reset}
  yolo                     Run YOLO mode
  benchmark <spec>         Run benchmark

${colors.cyan}Context & Knowledge${colors.reset}
  context                  Show current context
  learn "content"          Record a learning
  learnings                List learnings
  decide "title"           Record a decision
  decisions                List decisions

${colors.cyan}Permissions & Approvals${colors.reset}
  approvals                View pending approvals
  approve <id>             Approve request
  deny <id>                Deny request
  permissions list/add/deny/remove

${colors.cyan}Skills (Slash Commands)${colors.reset}
  /research "prompt"       Research with web search
  /architect "prompt"      Architecture planning
  /implement --task T001   Implementation
  /review ./path           Code review
  skills                   List all skills

${colors.cyan}Other${colors.reset}
  config                   Manage settings
  terminal/terminals       Manage terminal profiles
  org                      Organization settings
  update                   Check for updates

${colors.cyan}REPL${colors.reset}
  help, ?                  Show this help
  clear                    Clear screen
  quit, exit, q            Exit interactive mode
`)
}

function parseReplLine(line: string): { command: string; args: string[] } {
  // Handle quoted strings
  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (const char of line) {
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false
        if (current) {
          tokens.push(current)
          current = ''
        }
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true
      quoteChar = char
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    tokens.push(current)
  }

  const command = tokens[0] || ''
  const args = tokens.slice(1)

  return { command, args }
}

export async function startRepl(db: DatabaseService): Promise<void> {
  const projectInfo = getProjectInfo(db)

  console.log(`${colors.bold}NERV${colors.reset} v${VERSION} - ${colors.cyan}${projectInfo}${colors.reset}`)
  console.log(`${colors.gray}Type 'help' for commands, 'quit' to exit${colors.reset}`)
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bold}nerv>${colors.reset} `
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    const { command, args } = parseReplLine(trimmed)

    try {
      const shouldContinue = await runReplCommand(command.toLowerCase(), args, db)
      if (!shouldContinue) {
        rl.close()
        return
      }
    } catch (error) {
      console.error(
        `${colors.red}Error:${colors.reset}`,
        error instanceof Error ? error.message : error
      )
    }

    rl.prompt()
  })

  rl.on('close', () => {
    // Exit cleanly
    process.exit(0)
  })

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log()
    console.log(`${colors.gray}Use 'quit' to exit${colors.reset}`)
    rl.prompt()
  })
}
