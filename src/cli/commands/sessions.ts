/**
 * Session management commands
 *
 * nerv sessions              - List active Claude sessions
 * nerv sessions --all        - Include completed sessions
 * nerv resume [sessionId]    - Resume a previous session
 * nerv session fork --name X - Fork session for experimentation
 * nerv session compare A B   - Compare forked sessions
 * nerv session merge A       - Merge fork back
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { buildClaudeArgs } from '../../core/claude-config.js'
import { getNervDir } from '../../core/platform.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

/**
 * List active sessions
 * Note: This is a placeholder - full session tracking requires session persistence in the database
 */
export async function sessionsCommand(args: string[], _db: DatabaseService): Promise<void> {
  const showAll = args.includes('--all') || args.includes('-a')

  if (args.includes('--json')) {
    console.log(JSON.stringify({ message: 'Session management uses Claude Code built-in session system', hint: 'Use claude --list-sessions' }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Claude Sessions${colors.reset}`)
  console.log()

  console.log(`${colors.gray}Session management uses Claude Code's built-in session system.${colors.reset}`)
  console.log()
  console.log(`${colors.cyan}To resume a session:${colors.reset}`)
  console.log(`  nerv resume                  Resume most recent session`)
  console.log(`  nerv resume <session-id>     Resume specific session`)
  console.log()
  console.log(`${colors.cyan}To list Claude's sessions:${colors.reset}`)
  console.log(`  claude --list-sessions       Show all Claude sessions`)
  if (!showAll) {
    console.log()
    console.log(`${colors.gray}Use --all to show completed sessions as well${colors.reset}`)
  }
}

function spawnClaudeProcess(claudeArgs: string[]): Promise<void> {
  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'
  console.log(`${colors.gray}Running: ${claudeCommand} ${claudeArgs.slice(0, 5).join(' ')}...${colors.reset}`)
  console.log()

  const claude = spawn(claudeCommand, claudeArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: process.cwd()
  })

  return new Promise<void>((resolve, reject) => {
    claude.on('close', (code) => {
      if (code === 0) {
        console.log(`\n${colors.green}✓${colors.reset} Claude session completed`)
        resolve()
      } else {
        console.error(`\n${colors.red}Claude exited with code ${code}${colors.reset}`)
        reject(new Error(`Claude exited with code ${code}`))
      }
    })

    claude.on('error', (err) => {
      console.error(`${colors.red}Failed to start Claude:${colors.reset}`, err.message)
      console.log(`${colors.gray}Make sure Claude Code is installed and in your PATH${colors.reset}`)
      reject(err)
    })
  })
}

/**
 * Resume a Claude session
 */
export async function resumeCommand(args: string[], db: DatabaseService): Promise<void> {
  const currentProject = db.getCurrentProject()
  if (!currentProject) {
    console.error(`${colors.red}No project found. Create one first: nerv project create <name>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  // Get session ID from args (first non-flag argument)
  const sessionId = args.find(arg => !arg.startsWith('-'))

  if (sessionId) {
    console.log(`${colors.blue}Resuming Claude session:${colors.reset} ${colors.cyan}${sessionId}${colors.reset}`)
  } else {
    console.log(`${colors.blue}Resuming most recent Claude session${colors.reset}`)
  }
  console.log(`  Project: ${currentProject.name}`)
  console.log()

  const claudeArgs = buildClaudeArgs({
    model: 'sonnet',
    maxTurns: 50,
    resume: sessionId || true // true = resume most recent
  })

  await spawnClaudeProcess(claudeArgs)
}

// ============================================================================
// Session forking, comparing, and merging
// ============================================================================

interface SessionFork {
  id: string
  name: string
  parentSessionId: string | null
  createdAt: string
  status: 'active' | 'completed' | 'merged'
  notes?: string
}

function getForksDir(): string {
  return path.join(getNervDir(), 'session-forks')
}

function getForksIndexPath(): string {
  return path.join(getForksDir(), 'index.json')
}

function loadForks(): SessionFork[] {
  const indexPath = getForksIndexPath()
  try {
    if (!fs.existsSync(indexPath)) return []
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as SessionFork[]
  } catch {
    return []
  }
}

function saveForks(forks: SessionFork[]): void {
  const dir = getForksDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(getForksIndexPath(), JSON.stringify(forks, null, 2), 'utf-8')
}

/**
 * Fork the current session for experimentation
 */
async function forkSession(args: string[], _db: DatabaseService): Promise<void> {
  const hasJson = args.includes('--json')
  let name = ''
  let sessionId: string | null = null

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--name' || args[i] === '-n') && args[i + 1]) {
      name = args[++i]
    } else if ((args[i] === '--session' || args[i] === '-s') && args[i + 1]) {
      sessionId = args[++i]
    } else if (!args[i].startsWith('-') && !name) {
      name = args[i]
    }
  }

  if (!name) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Fork name is required' }))
    } else {
      console.error(`${colors.red}Fork name is required${colors.reset}`)
      console.log(`Usage: nerv session fork --name "experiment-name"`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const forks = loadForks()

  if (forks.some(f => f.name === name)) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Fork '${name}' already exists` }))
    } else {
      console.error(`${colors.red}Fork '${name}' already exists${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const fork: SessionFork = {
    id: `fork-${Date.now()}`,
    name,
    parentSessionId: sessionId,
    createdAt: new Date().toISOString(),
    status: 'active'
  }

  forks.push(fork)
  saveForks(forks)

  if (hasJson) {
    console.log(JSON.stringify(fork, null, 2))
  } else {
    console.log(`${colors.green}✓${colors.reset} Created session fork: ${colors.cyan}${name}${colors.reset}`)
    console.log(`  ID: ${fork.id}`)
    if (sessionId) {
      console.log(`  Parent session: ${sessionId}`)
    }
    console.log(`\n${colors.gray}Start working in this fork with: nerv start${colors.reset}`)
  }
}

/**
 * Compare two forked sessions
 */
async function compareSessions(args: string[], _db: DatabaseService): Promise<void> {
  const hasJson = args.includes('--json')
  const nonFlagArgs = args.filter(a => !a.startsWith('-'))

  if (nonFlagArgs.length < 2) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Two fork names or IDs required' }))
    } else {
      console.error(`${colors.red}Two fork names or IDs required${colors.reset}`)
      console.log(`Usage: nerv session compare <fork-a> <fork-b>`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const [nameA, nameB] = nonFlagArgs
  const forks = loadForks()

  const forkA = forks.find(f => f.name === nameA || f.id === nameA)
  const forkB = forks.find(f => f.name === nameB || f.id === nameB)

  if (!forkA) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Fork '${nameA}' not found` }))
    } else {
      console.error(`${colors.red}Fork '${nameA}' not found${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (!forkB) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Fork '${nameB}' not found` }))
    } else {
      console.error(`${colors.red}Fork '${nameB}' not found${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (hasJson) {
    console.log(JSON.stringify({ forkA, forkB }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Session Fork Comparison${colors.reset}\n`)
  console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`)
  console.log(`  ${''.padEnd(20)} ${colors.cyan}${forkA.name.padEnd(18)}${colors.reset} ${colors.cyan}${forkB.name.padEnd(18)}${colors.reset}`)
  console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`)
  console.log(`  ${'ID'.padEnd(20)} ${forkA.id.padEnd(18)} ${forkB.id.padEnd(18)}`)
  console.log(`  ${'Status'.padEnd(20)} ${forkA.status.padEnd(18)} ${forkB.status.padEnd(18)}`)
  console.log(`  ${'Created'.padEnd(20)} ${new Date(forkA.createdAt).toLocaleDateString().padEnd(18)} ${new Date(forkB.createdAt).toLocaleDateString().padEnd(18)}`)
  console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`)
  console.log(`\n${colors.gray}Use 'nerv session merge <fork-name>' to merge a fork back${colors.reset}`)
}

/**
 * Merge a fork back
 */
async function mergeSession(args: string[], _db: DatabaseService): Promise<void> {
  const hasJson = args.includes('--json')
  const name = args.find(a => !a.startsWith('-'))

  if (!name) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Fork name or ID required' }))
    } else {
      console.error(`${colors.red}Fork name or ID required${colors.reset}`)
      console.log(`Usage: nerv session merge <fork-name>`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const forks = loadForks()
  const fork = forks.find(f => f.name === name || f.id === name)

  if (!fork) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Fork '${name}' not found` }))
    } else {
      console.error(`${colors.red}Fork '${name}' not found${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (fork.status === 'merged') {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Fork '${name}' has already been merged` }))
    } else {
      console.error(`${colors.yellow}Fork '${name}' has already been merged${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  fork.status = 'merged'
  saveForks(forks)

  if (hasJson) {
    console.log(JSON.stringify({ success: true, fork }, null, 2))
  } else {
    console.log(`${colors.green}✓${colors.reset} Merged session fork: ${colors.cyan}${fork.name}${colors.reset}`)
    console.log(`  Status: merged`)
  }
}

/**
 * List all session forks
 */
function listForks(hasJson: boolean): void {
  const forks = loadForks()

  if (hasJson) {
    console.log(JSON.stringify({ forks }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Session Forks${colors.reset}\n`)

  if (forks.length === 0) {
    console.log(`${colors.gray}No session forks found${colors.reset}`)
    console.log(`\nCreate a fork with: nerv session fork --name "experiment-name"`)
    return
  }

  for (const fork of forks) {
    const statusColor = fork.status === 'active' ? colors.green : fork.status === 'merged' ? colors.blue : colors.gray
    console.log(`  ${colors.cyan}${fork.name.padEnd(25)}${colors.reset} ${statusColor}${fork.status.padEnd(12)}${colors.reset} ${colors.gray}${new Date(fork.createdAt).toLocaleDateString()}${colors.reset}`)
  }
}

/**
 * Session command handler (fork, compare, merge)
 */
export async function sessionCommand(args: string[], db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const hasJson = args.includes('--json')

  switch (subcommand) {
    case 'fork':
      await forkSession(args.slice(1), db)
      break

    case 'compare':
      await compareSessions(args.slice(1), db)
      break

    case 'merge':
      await mergeSession(args.slice(1), db)
      break

    case 'list':
    case undefined:
      listForks(hasJson)
      break

    case 'help':
    case '--help':
    case '-h':
      console.log(`
${colors.bold}NERV Session${colors.reset} - Session forking and management

${colors.bold}USAGE${colors.reset}
  nerv session <subcommand> [options]

${colors.bold}SUBCOMMANDS${colors.reset}
  fork --name <name>       Fork session for experimentation
  compare <fork-a> <fork-b> Compare two session forks
  merge <fork-name>        Merge fork back
  list                     List all session forks

${colors.bold}OPTIONS${colors.reset}
  --json                   Output in JSON format
  --name, -n <name>        Fork name (for fork subcommand)
  --session, -s <id>       Parent session ID (for fork subcommand)

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# Fork a session to try different approaches${colors.reset}
  nerv session fork --name "try-redis-cache"
  nerv session fork --name "try-memcached"

  ${colors.gray}# Compare and merge winner${colors.reset}
  nerv session compare try-redis-cache try-memcached
  nerv session merge try-redis-cache
`)
      break

    default:
      console.error(`${colors.red}Unknown session subcommand: ${subcommand}${colors.reset}`)
      console.log(`Run 'nerv session help' for usage.`)
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }
}
