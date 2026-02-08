/**
 * Recommend command - "What's Next?" for NERV workflow
 *
 * nerv recommend          - Get Claude's recommendation for next step
 * nerv recommend --json   - Output as JSON
 *
 * Gathers current project context (cycle, tasks, learnings, decisions)
 * and asks Claude to recommend the next logical step based on the
 * NERV development lifecycle from the PRD.
 */

import { execSync } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { buildRecommendPrompt, parseRecommendation, type RecommendContext } from '../../shared/prompts/recommend.js'
import { colors } from '../colors.js'

function gatherContext(db: DatabaseService): RecommendContext | null {
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
  }
}

export async function recommendCommand(args: string[], db: DatabaseService): Promise<void> {
  const jsonOutput = args.includes('--json')

  const ctx = gatherContext(db)
  if (!ctx) {
    console.error(`${colors.red}No project selected.${colors.reset} Use: nerv project switch <id>`)
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const prompt = buildRecommendPrompt(ctx)

  if (!jsonOutput) {
    console.log(`\n${colors.cyan}Analyzing project state...${colors.reset}`)
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

    const recommendation = parseRecommendation(result)

    if (!recommendation) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'Failed to parse recommendation', raw: result }))
      } else {
        console.log(`\n${colors.yellow}Claude's suggestion:${colors.reset}`)
        console.log(result)
      }
      return
    }

    if (jsonOutput) {
      console.log(JSON.stringify(recommendation, null, 2))
      return
    }

    // Pretty-print the recommendation
    const phaseColors: Record<string, string> = {
      discovery: colors.blue,
      mvp: colors.green,
      building: colors.cyan,
      polish: colors.magenta,
      done: colors.green,
    }
    const phaseColor = phaseColors[recommendation.phase] || colors.gray

    console.log(`\n${colors.bold}What's Next?${colors.reset}`)
    console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}`)
    console.log(`${phaseColor}Phase: ${recommendation.phase.replace(/_/g, ' ')}${colors.reset}`)
    console.log(`${colors.bold}${recommendation.title}${colors.reset}`)
    console.log(`\n${recommendation.description}`)
    console.log(`\n${colors.cyan}How:${colors.reset} ${recommendation.details}`)
    console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}\n`)
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
