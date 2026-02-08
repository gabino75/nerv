/**
 * Start command - Launch Claude sessions
 *
 * nerv start             - Start generic Claude session
 * nerv start <taskId>    - Start Claude for a specific task
 * nerv start --agent <agent> - Start with specific agent
 * nerv resume [session]  - Resume a previous session
 *
 * See PRD Section 12: CLI-First Architecture
 */

import { spawn } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { buildClaudeArgs } from '../../core/claude-config.js'
import { getAgentConfig, listAgentNames } from './agents.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

import type { Project, Task } from '../../shared/types.js'

interface StartArgs {
  taskId: string | undefined
  sessionToResume: string | undefined
  agent: string | undefined
}

function parseStartArgs(args: string[]): StartArgs {
  const result: StartArgs = { taskId: undefined, sessionToResume: undefined, agent: undefined }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--resume' || arg === '-r') {
      result.sessionToResume = args[++i]
    } else if (arg === '--task' || arg === '-t') {
      result.taskId = args[++i]
    } else if (arg === '--agent' || arg === '-a') {
      result.agent = args[++i]
    } else if (!arg.startsWith('-')) {
      result.taskId = arg
    }
  }

  return result
}

function findTaskByIdOrPrefix(taskId: string, tasks: Task[]): Task {
  const matches = tasks.filter(t => t.id === taskId || t.id.startsWith(taskId))

  if (matches.length === 0) {
    console.error(`${colors.red}Task not found: ${taskId}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.TASK_NOT_FOUND)
  }
  if (matches.length > 1) {
    console.error(`${colors.yellow}Multiple matches - be more specific:${colors.reset}`)
    for (const t of matches) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.title}`)
    }
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  return matches[0]
}

function buildTaskContext(project: Project, task: Task): string {
  return `
## NERV Task Context

Project: ${project.name}
${project.goal ? `Goal: ${project.goal}` : ''}

## Current Task: ${task.id}
Title: ${task.title}
Type: ${task.task_type}
${task.description ? `Description: ${task.description}` : ''}

Please complete this task and update the status when done.
`.trim()
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
        // Use CLAUDE_FAILED exit code per PRD Section 12
        process.exit(CLI_EXIT_CODES.CLAUDE_FAILED)
      }
    })

    claude.on('error', (err) => {
      console.error(`${colors.red}Failed to start Claude:${colors.reset}`, err.message)
      console.log(`${colors.gray}Make sure Claude Code is installed and in your PATH${colors.reset}`)
      // Use CLAUDE_FAILED exit code per PRD Section 12
      process.exit(CLI_EXIT_CODES.CLAUDE_FAILED)
    })
  })
}

export async function startCommand(args: string[], db: DatabaseService): Promise<void> {
  const currentProject = db.getCurrentProject()
  if (!currentProject) {
    console.error(`${colors.red}No project found. Create one first: nerv project create <name>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  const { taskId, sessionToResume, agent } = parseStartArgs(args)

  // Validate agent if specified
  let agentConfig: ReturnType<typeof getAgentConfig> = null
  if (agent) {
    agentConfig = getAgentConfig(agent)
    if (!agentConfig) {
      const availableAgents = listAgentNames()
      console.error(`${colors.red}Unknown agent: ${agent}${colors.reset}`)
      console.log(`${colors.gray}Available agents: ${availableAgents.join(', ')}${colors.reset}`)
      console.log(`${colors.gray}Run 'nerv agents' to see all available agents${colors.reset}`)
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
    }
  }

  let claudeArgs: string[]

  if (taskId) {
    const tasks = db.getTasksForProject(currentProject.id)
    const task = findTaskByIdOrPrefix(taskId, tasks)

    db.updateTaskStatus(task.id, 'in_progress')

    console.log(`${colors.blue}Starting Claude for task:${colors.reset} ${colors.cyan}${task.id.slice(0, 8)}${colors.reset}`)
    console.log(`  Title: ${task.title}`)
    if (task.description) {
      console.log(`  Description: ${colors.gray}${task.description}${colors.reset}`)
    }
    if (agent) {
      console.log(`  Agent: ${colors.yellow}${agent}${colors.reset}`)
    }
    console.log()

    const taskContext = buildTaskContext(currentProject, task)
    const systemPrompt = agentConfig?.prompt
      ? `${agentConfig.prompt}\n\n${taskContext}`
      : taskContext

    claudeArgs = buildClaudeArgs({
      model: agentConfig?.model || 'sonnet',
      maxTurns: 50,
      systemPrompt,
      prompt: task.description || task.title,
      resume: sessionToResume,
      agent: agent, // Pass --agent flag to Claude (PRD Section 35)
      allowedTools: agentConfig?.allowedTools,
      disallowedTools: agentConfig?.disallowedTools
    })
  } else {
    console.log(`${colors.blue}Starting generic Claude session${colors.reset}`)
    console.log(`  Project: ${currentProject.name}`)
    if (agent) {
      console.log(`  Agent: ${colors.yellow}${agent}${colors.reset}`)
    }
    console.log()

    claudeArgs = buildClaudeArgs({
      model: agentConfig?.model || 'sonnet',
      maxTurns: 50,
      systemPrompt: agentConfig?.prompt,
      resume: sessionToResume,
      agent: agent, // Pass --agent flag to Claude (PRD Section 35)
      allowedTools: agentConfig?.allowedTools,
      disallowedTools: agentConfig?.disallowedTools
    })
  }

  await spawnClaudeProcess(claudeArgs)

  if (taskId) {
    console.log(`${colors.gray}Use 'nerv task update ${taskId.slice(0, 8)} --status done' to mark complete${colors.reset}`)
  }
}
