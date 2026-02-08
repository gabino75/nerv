/**
 * Recommend command - "What's Next?" for NERV workflow
 *
 * nerv recommend                        - Get Claude's recommendations
 * nerv recommend --direction "text"     - Steer recommendations with direction
 * nerv recommend --json                 - Output as JSON
 *
 * Gathers current project context (cycle, tasks, learnings, decisions)
 * and asks Claude to recommend the next logical steps based on the
 * NERV development lifecycle from the PRD.
 */

import { execSync } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { buildRecommendPrompt, parseRecommendations, type Recommendation, type RecommendContext } from '../../shared/prompts/recommend.js'
import { colors } from '../colors.js'

function gatherContext(db: DatabaseService, direction?: string): RecommendContext | null {
  const project = db.getCurrentProject()
  if (!project) {
    return null
  }

  const tasks = db.getTasksForProject(project.id).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    taskType: t.task_type || 'implementation',
  }))

  const learnings = db.getLearningsForProject(project.id).map(l => ({
    content: l.content,
    category: l.category || 'general',
  }))

  const decisions = db.getDecisionsForProject(project.id).map(d => ({
    title: d.title,
    decision: d.decision,
  }))

  const activeCycle = db.getActiveCycle(project.id)
  const allCycles = db.getCyclesForProject(project.id)

  return {
    projectName: project.name,
    projectGoal: project.goal || null,
    cycleNumber: activeCycle?.cycle_number ?? null,
    cycleGoal: activeCycle?.goal ?? null,
    tasks,
    learnings,
    decisions,
    hasCycle: !!activeCycle,
    totalCycles: allCycles.length,
    userDirection: direction,
  }
}

function parseDirectionFlag(args: string[]): string | undefined {
  const idx = args.indexOf('--direction')
  if (idx === -1) return undefined
  const value = args[idx + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

export async function recommendCommand(args: string[], db: DatabaseService): Promise<void> {
  const jsonOutput = args.includes('--json')
  const direction = parseDirectionFlag(args)

  const ctx = gatherContext(db, direction)
  if (!ctx) {
    console.error(`${colors.red}No project selected.${colors.reset} Use: nerv project switch <id>`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const prompt = buildRecommendPrompt(ctx)

  if (!jsonOutput) {
    if (direction) {
      console.log(`\n${colors.cyan}Analyzing project state with direction: "${direction}"...${colors.reset}`)
    } else {
      console.log(`\n${colors.cyan}Analyzing project state...${colors.reset}`)
    }
  }

  try {
    // Use claude --print for one-shot recommendation
    const result = execSync(
      `claude --print --model sonnet --max-turns 1`,
      {
        input: prompt,
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim()

    const recommendations = parseRecommendations(result)

    if (recommendations.length === 0) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'Failed to parse recommendations', raw: result }))
      } else {
        console.log(`\n${colors.yellow}Claude's suggestion:${colors.reset}`)
        console.log(result)
      }
      return
    }

    if (jsonOutput) {
      console.log(JSON.stringify({ recommendations }, null, 2))
      return
    }

    // Pretty-print recommendations
    const phaseColors: Record<string, string> = {
      discovery: colors.blue,
      mvp: colors.green,
      building: colors.cyan,
      polish: colors.magenta,
      done: colors.green,
    }

    console.log(`\n${colors.bold}What's Next?${colors.reset}`)
    console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}`)

    recommendations.forEach((rec: Recommendation, i: number) => {
      const phaseColor = phaseColors[rec.phase] || colors.gray
      const num = i + 1

      console.log(`\n  ${colors.bold}${num}. ${rec.title}${colors.reset}`)
      console.log(`     ${phaseColor}Phase: ${rec.phase}${colors.reset}  |  Action: ${rec.action}`)
      console.log(`     ${rec.description}`)
      console.log(`     ${colors.cyan}How:${colors.reset} ${rec.details}`)
    })

    console.log(`\n${colors.gray}${'─'.repeat(50)}${colors.reset}\n`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes('ENOENT') || message.includes('not found')) {
      console.error(`${colors.red}Claude CLI not found.${colors.reset} Install with: npm install -g @anthropic-ai/claude-code`)
    } else if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      console.error(`${colors.red}Claude request timed out.${colors.reset} Try again.`)
    } else {
      console.error(`${colors.red}Recommendation failed:${colors.reset} ${message}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}
