/**
 * Agents command - List and manage NERV agents
 *
 * nerv agents              - List available agents
 * nerv agents --verbose    - List with descriptions and tool access
 * nerv agent create <name> - Create a custom agent
 * nerv agent edit <name>   - Edit a custom agent
 * nerv agent delete <name> - Delete a custom agent
 *
 * See PRD Section 12: CLI-First Architecture
 */

import * as fs from 'fs'
import * as path from 'path'
import { getNervDir } from '../../core/platform.js'
import type { CustomAgentDefinition, CustomAgentsConfig } from '../../shared/types.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

/**
 * Built-in agents as defined in PRD Section 12
 */
const BUILT_IN_AGENTS: Record<string, { description: string; bestFor: string; toolAccess: string }> = {
  default: {
    description: 'Balanced general-purpose',
    bestFor: 'Most tasks',
    toolAccess: 'All tools'
  },
  builder: {
    description: 'Implementation-focused, writes code',
    bestFor: 'Feature development',
    toolAccess: 'All tools'
  },
  planner: {
    description: 'Architecture, design, planning',
    bestFor: 'System design, specs',
    toolAccess: 'Read, Glob, Grep, Write (docs only)'
  },
  researcher: {
    description: 'Exploration, documentation',
    bestFor: 'Research, learning codebase',
    toolAccess: 'Read, Glob, Grep, WebSearch, WebFetch'
  },
  reviewer: {
    description: 'Code review, security analysis',
    bestFor: 'PR reviews, audits',
    toolAccess: 'Read, Glob, Grep (no writes)'
  },
  debugger: {
    description: 'Debugging, troubleshooting',
    bestFor: 'Bug fixes, investigations',
    toolAccess: 'All tools'
  },
  auditor: {
    description: 'Code health, spec drift detection',
    bestFor: 'Cycle audits',
    toolAccess: 'Read, Glob, Grep, Bash (test runners)'
  }
}

function getAgentsConfigPath(): string {
  return path.join(getNervDir(), 'agents.json')
}

function loadCustomAgents(): CustomAgentsConfig {
  const configPath = getAgentsConfigPath()
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as CustomAgentsConfig
    } catch {
      return {}
    }
  }
  return {}
}

function saveCustomAgents(agents: CustomAgentsConfig): void {
  const configPath = getAgentsConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(agents, null, 2), 'utf-8')
}

interface AgentsCommandArgs {
  verbose: boolean
  json: boolean
}

function parseAgentsArgs(args: string[]): AgentsCommandArgs {
  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json')
  }
}

function printAgentsTable(verbose: boolean): void {
  const customAgents = loadCustomAgents()

  console.log(`\n${colors.bold}Built-in Agents${colors.reset}`)
  console.log(`${colors.gray}${'─'.repeat(70)}${colors.reset}`)

  if (verbose) {
    // Verbose mode: show full table
    console.log(
      `${colors.cyan}${'Agent'.padEnd(12)}${colors.reset}` +
      `${'Description'.padEnd(30)}` +
      `${'Best For'.padEnd(25)}`
    )
    console.log(`${colors.gray}${'─'.repeat(70)}${colors.reset}`)

    for (const [name, info] of Object.entries(BUILT_IN_AGENTS)) {
      console.log(
        `${colors.cyan}${name.padEnd(12)}${colors.reset}` +
        `${info.description.padEnd(30)}` +
        `${colors.gray}${info.bestFor.padEnd(25)}${colors.reset}`
      )
      console.log(`  ${colors.gray}Tools: ${info.toolAccess}${colors.reset}`)
    }
  } else {
    // Compact mode
    for (const [name, info] of Object.entries(BUILT_IN_AGENTS)) {
      console.log(`  ${colors.cyan}${name.padEnd(12)}${colors.reset} ${info.description}`)
    }
  }

  // Custom agents
  const customNames = Object.keys(customAgents)
  if (customNames.length > 0) {
    console.log(`\n${colors.bold}Custom Agents${colors.reset}`)
    console.log(`${colors.gray}${'─'.repeat(70)}${colors.reset}`)

    for (const [name, agent] of Object.entries(customAgents)) {
      console.log(`  ${colors.yellow}${name.padEnd(12)}${colors.reset} ${agent.description}`)
      if (verbose) {
        if (agent.tools && agent.tools.length > 0) {
          console.log(`  ${colors.gray}Tools: ${agent.tools.join(', ')}${colors.reset}`)
        }
        if (agent.model) {
          console.log(`  ${colors.gray}Model: ${agent.model}${colors.reset}`)
        }
      }
    }
  }

  console.log(`\n${colors.gray}Use 'nerv agents --verbose' for detailed tool access info${colors.reset}`)
  console.log(`${colors.gray}Use 'nerv start --agent <name>' to start with a specific agent${colors.reset}`)
}

export async function agentsCommand(args: string[]): Promise<void> {
  const { verbose, json } = parseAgentsArgs(args)

  if (json) {
    const customAgents = loadCustomAgents()
    const result = {
      builtIn: Object.entries(BUILT_IN_AGENTS).map(([name, info]) => ({ name, ...info })),
      custom: Object.entries(customAgents).map(([name, agent]) => ({ name, ...agent }))
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  printAgentsTable(verbose)
}

interface AgentCreateArgs {
  name: string
  description?: string
  prompt?: string
  allowedTools?: string[]
  model?: string
}

function parseAgentCreateArgs(args: string[]): AgentCreateArgs {
  const result: AgentCreateArgs = { name: '' }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--description' || arg === '-d') {
      result.description = args[++i]
    } else if (arg === '--prompt' || arg === '-p') {
      result.prompt = args[++i]
    } else if (arg === '--allowed-tools' || arg === '--tools') {
      result.allowedTools = args[++i]?.split(',').map(t => t.trim())
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i]
    } else if (!arg.startsWith('-') && !result.name) {
      result.name = arg
    }
  }

  return result
}

export async function agentCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'create':
      await createAgent(args.slice(1))
      break
    case 'edit':
      await editAgent(args.slice(1))
      break
    case 'delete':
    case 'remove':
      await deleteAgent(args.slice(1))
      break
    default:
      console.error(`${colors.red}Unknown agent subcommand: ${subcommand}${colors.reset}`)
      console.log(`Usage:`)
      console.log(`  nerv agent create <name> --description "..." --prompt "..."`)
      console.log(`  nerv agent edit <name>`)
      console.log(`  nerv agent delete <name>`)
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

async function createAgent(args: string[]): Promise<void> {
  const hasJson = args.includes('--json')
  const { name, description, prompt, allowedTools, model } = parseAgentCreateArgs(args)

  if (!name) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Agent name is required' }))
    } else {
      console.error(`${colors.red}Agent name is required${colors.reset}`)
      console.log(`Usage: nerv agent create <name> --description "..." --prompt "..."`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (BUILT_IN_AGENTS[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Cannot override built-in agent: ${name}` }))
    } else {
      console.error(`${colors.red}Cannot override built-in agent: ${name}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (!description || !prompt) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Both --description and --prompt are required' }))
    } else {
      console.error(`${colors.red}Both --description and --prompt are required${colors.reset}`)
      console.log(`Usage: nerv agent create ${name} --description "..." --prompt "..."`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const agents = loadCustomAgents()

  if (agents[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Agent '${name}' already exists. Use 'nerv agent edit' to modify.` }))
    } else {
      console.error(`${colors.yellow}Agent '${name}' already exists. Use 'nerv agent edit' to modify.${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const newAgent: CustomAgentDefinition = {
    description,
    prompt
  }

  if (allowedTools && allowedTools.length > 0) {
    newAgent.tools = allowedTools
  }

  if (model) {
    newAgent.model = model
  }

  agents[name] = newAgent
  saveCustomAgents(agents)

  if (hasJson) {
    console.log(JSON.stringify({ success: true, agent: { name, ...newAgent } }, null, 2))
  } else {
    console.log(`${colors.green}✓${colors.reset} Created custom agent: ${colors.cyan}${name}${colors.reset}`)
    console.log(`  Description: ${description}`)
    if (allowedTools) {
      console.log(`  Tools: ${allowedTools.join(', ')}`)
    }
    if (model) {
      console.log(`  Model: ${model}`)
    }
  }
}

async function editAgent(args: string[]): Promise<void> {
  const hasJson = args.includes('--json')
  const { name, description, prompt, allowedTools, model } = parseAgentCreateArgs(args)

  if (!name) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Agent name is required' }))
    } else {
      console.error(`${colors.red}Agent name is required${colors.reset}`)
      console.log(`Usage: nerv agent edit <name> [--description "..."] [--prompt "..."]`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (BUILT_IN_AGENTS[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Cannot edit built-in agent: ${name}` }))
    } else {
      console.error(`${colors.red}Cannot edit built-in agent: ${name}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const agents = loadCustomAgents()

  if (!agents[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Agent '${name}' not found. Use 'nerv agent create' to create it.` }))
    } else {
      console.error(`${colors.red}Agent '${name}' not found. Use 'nerv agent create' to create it.${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  // Update only provided fields
  if (description) agents[name].description = description
  if (prompt) agents[name].prompt = prompt
  if (allowedTools) agents[name].tools = allowedTools
  if (model) agents[name].model = model

  saveCustomAgents(agents)

  if (hasJson) {
    console.log(JSON.stringify({ success: true, agent: { name, ...agents[name] } }, null, 2))
  } else {
    console.log(`${colors.green}✓${colors.reset} Updated custom agent: ${colors.cyan}${name}${colors.reset}`)
    console.log(`  Description: ${agents[name].description}`)
    if (agents[name].tools) {
      console.log(`  Tools: ${agents[name].tools!.join(', ')}`)
    }
    if (agents[name].model) {
      console.log(`  Model: ${agents[name].model}`)
    }
  }
}

async function deleteAgent(args: string[]): Promise<void> {
  const hasJson = args.includes('--json')
  const name = args.find(a => !a.startsWith('-'))

  if (!name) {
    if (hasJson) {
      console.log(JSON.stringify({ error: 'Agent name is required' }))
    } else {
      console.error(`${colors.red}Agent name is required${colors.reset}`)
      console.log(`Usage: nerv agent delete <name>`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (BUILT_IN_AGENTS[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Cannot delete built-in agent: ${name}` }))
    } else {
      console.error(`${colors.red}Cannot delete built-in agent: ${name}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const agents = loadCustomAgents()

  if (!agents[name]) {
    if (hasJson) {
      console.log(JSON.stringify({ error: `Agent '${name}' not found` }))
    } else {
      console.error(`${colors.red}Agent '${name}' not found${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  delete agents[name]
  saveCustomAgents(agents)

  if (hasJson) {
    console.log(JSON.stringify({ success: true, deleted: name }, null, 2))
  } else {
    console.log(`${colors.green}✓${colors.reset} Deleted custom agent: ${colors.cyan}${name}${colors.reset}`)
  }
}

/**
 * Get agent configuration for use in Claude sessions
 */
export function getAgentConfig(agentName: string): { prompt?: string; allowedTools?: string[]; disallowedTools?: string[]; model?: string } | null {
  // Check built-in agents first
  const builtIn = BUILT_IN_AGENTS[agentName]
  if (builtIn) {
    // Map built-in agent tool access to actual tool restrictions
    const toolConfig = getBuiltInAgentToolConfig(agentName)
    return toolConfig
  }

  // Check custom agents
  const customAgents = loadCustomAgents()
  const custom = customAgents[agentName]
  if (custom) {
    return {
      prompt: custom.prompt,
      allowedTools: custom.tools,
      model: custom.model
    }
  }

  return null
}

function getBuiltInAgentToolConfig(agentName: string): { prompt?: string; allowedTools?: string[]; disallowedTools?: string[] } {
  switch (agentName) {
    case 'planner':
      return {
        prompt: 'You are an architecture and planning specialist. Focus on system design, API design, and documentation.',
        disallowedTools: ['Bash', 'Edit']
      }
    case 'researcher':
      return {
        prompt: 'You are a research and exploration specialist. Focus on understanding the codebase and gathering information.',
        allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch']
      }
    case 'reviewer':
      return {
        prompt: 'You are a code review and security analysis specialist. Focus on code quality, security issues, and best practices.',
        disallowedTools: ['Write', 'Edit', 'Bash']
      }
    case 'debugger':
      return {
        prompt: 'You are a debugging and troubleshooting specialist. Focus on identifying root causes and fixing bugs.'
      }
    case 'auditor':
      return {
        prompt: 'You are a code health auditor. Focus on detecting spec drift, code quality issues, and test coverage.',
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash']
      }
    case 'builder':
      return {
        prompt: 'You are an implementation specialist. Focus on writing clean, efficient code that meets requirements.'
      }
    default:
      return {}
  }
}

/**
 * List all available agent names (built-in + custom)
 */
export function listAgentNames(): string[] {
  const builtIn = Object.keys(BUILT_IN_AGENTS)
  const custom = Object.keys(loadCustomAgents())
  return [...builtIn, ...custom]
}
