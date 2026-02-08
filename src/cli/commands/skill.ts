/**
 * Skill command - Invoke Claude Code skills from CLI
 *
 * nerv /research "OAuth2 best practices"
 * nerv /architect "Design auth system"
 * nerv /implement T001
 * nerv /review PR#123
 *
 * See PRD Section 12: CLI-First Architecture - Skills & Commands (Slash Commands)
 */

import { spawn } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { buildClaudeArgs } from '../../core/claude-config.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

/**
 * Known built-in skills with descriptions
 * PRD Section 12 specifies: /research, /architect, /implement, /review
 */
const KNOWN_SKILLS: Record<string, { description: string; agent?: string }> = {
  research: {
    description: 'Research and exploration with web search',
    agent: 'researcher'
  },
  architect: {
    description: 'Architecture and system design planning',
    agent: 'planner'
  },
  implement: {
    description: 'Implementation-focused code writing',
    agent: 'builder'
  },
  review: {
    description: 'Code review and security analysis',
    agent: 'reviewer'
  },
  debug: {
    description: 'Debugging and troubleshooting',
    agent: 'debugger'
  },
  refactor: {
    description: 'Refactoring while maintaining behavior'
  },
  'write-tests': {
    description: 'Generate comprehensive tests'
  },
  'pr-review': {
    description: 'Review a pull request'
  },
  documentation: {
    description: 'Update documentation'
  }
}

interface SkillArgs {
  skillName: string
  prompt: string
  options: {
    depth?: string
    output?: string
    focus?: string
    approach?: string
    task?: string
  }
}

function parseSkillArgs(skill: string, args: string[]): SkillArgs {
  const result: SkillArgs = {
    skillName: skill.replace(/^\//, ''), // Remove leading /
    prompt: '',
    options: {}
  }

  const promptParts: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--depth') {
      result.options.depth = args[++i]
    } else if (arg === '--output') {
      result.options.output = args[++i]
    } else if (arg === '--focus') {
      result.options.focus = args[++i]
    } else if (arg === '--approach') {
      result.options.approach = args[++i]
    } else if (arg === '--task' || arg === '-t') {
      result.options.task = args[++i]
    } else if (!arg.startsWith('-')) {
      promptParts.push(arg)
    }
  }

  result.prompt = promptParts.join(' ')
  return result
}

function buildSkillPrompt(parsed: SkillArgs): string {
  let prompt = `/${parsed.skillName}`

  if (parsed.options.depth) {
    prompt += ` [depth: ${parsed.options.depth}]`
  }
  if (parsed.options.focus) {
    prompt += ` [focus: ${parsed.options.focus}]`
  }
  if (parsed.options.approach) {
    prompt += ` [approach: ${parsed.options.approach}]`
  }
  if (parsed.options.task) {
    prompt += ` [task: ${parsed.options.task}]`
  }

  if (parsed.prompt) {
    prompt += ` ${parsed.prompt}`
  }

  return prompt
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
        console.log(`\n${colors.green}✓${colors.reset} Skill completed`)
        resolve()
      } else {
        console.error(`\n${colors.red}Claude exited with code ${code}${colors.reset}`)
        process.exit(CLI_EXIT_CODES.CLAUDE_FAILED)
      }
    })

    claude.on('error', (err) => {
      console.error(`${colors.red}Failed to start Claude:${colors.reset}`, err.message)
      console.log(`${colors.gray}Make sure Claude Code is installed and in your PATH${colors.reset}`)
      process.exit(CLI_EXIT_CODES.CLAUDE_FAILED)
    })
  })
}

export async function skillCommand(
  skill: string,
  args: string[],
  db: DatabaseService
): Promise<void> {
  const parsed = parseSkillArgs(skill, args)
  const knownSkill = KNOWN_SKILLS[parsed.skillName]

  if (!parsed.prompt && !parsed.options.task) {
    console.error(`${colors.red}Missing prompt for /${parsed.skillName}${colors.reset}`)
    console.log(`${colors.gray}Usage: nerv /${parsed.skillName} "your prompt here"${colors.reset}`)
    if (knownSkill) {
      console.log(`${colors.gray}Description: ${knownSkill.description}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  console.log(`${colors.blue}Invoking skill:${colors.reset} ${colors.cyan}/${parsed.skillName}${colors.reset}`)
  if (knownSkill) {
    console.log(`  ${colors.gray}${knownSkill.description}${colors.reset}`)
    if (knownSkill.agent) {
      console.log(`  Agent: ${colors.yellow}${knownSkill.agent}${colors.reset}`)
    }
  }
  if (parsed.prompt) {
    console.log(`  Prompt: ${colors.gray}${parsed.prompt}${colors.reset}`)
  }
  console.log()

  // Build the prompt that invokes the skill
  const skillPrompt = buildSkillPrompt(parsed)

  // Build Claude args with the skill prompt
  const claudeArgs = buildClaudeArgs({
    model: 'sonnet',
    maxTurns: 50,
    prompt: skillPrompt,
    agent: knownSkill?.agent
  })

  await spawnClaudeProcess(claudeArgs)
}

export function listSkills(): void {
  console.log(`
${colors.bold}Available Skills${colors.reset}

${colors.cyan}Built-in Skills${colors.reset}`)

  for (const [name, info] of Object.entries(KNOWN_SKILLS)) {
    const agentInfo = info.agent ? ` ${colors.gray}(agent: ${info.agent})${colors.reset}` : ''
    console.log(`  /${name}${agentInfo}`)
    console.log(`    ${colors.gray}${info.description}${colors.reset}`)
  }

  console.log(`
${colors.bold}Usage${colors.reset}
  nerv /research "OAuth2 best practices for SPAs"
  nerv /research --depth thorough "WebSocket authentication"
  nerv /architect "Design auth system with refresh tokens"
  nerv /implement --task T001
  nerv /review ./src/auth/ --focus security
`)
}

/**
 * Check if a command is a slash command (skill invocation)
 */
export function isSlashCommand(cmd: string): boolean {
  return cmd.startsWith('/')
}
