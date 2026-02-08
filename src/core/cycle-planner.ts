/**
 * Claude-Assisted Cycle Planning
 *
 * After completing a cycle, Claude analyzes project state and suggests
 * the next cycle's goal + tasks. Used by both CLI and UI.
 */

import { spawn } from 'child_process'
import type { CycleSuggestion } from '../shared/types/benchmark.js'
import type { Cycle, Task, Decision, Project } from '../shared/types/database.js'

/**
 * Minimal database interface for cycle planning.
 * Compatible with both core/DatabaseService and main/databaseService.
 */
export interface CyclePlannerDb {
  getProject(id: string): Project | undefined
  getCyclesForProject(projectId: string): Cycle[]
  getDecisionsForProject(projectId: string): Decision[]
  getTasksForProject(projectId: string): Task[]
  getTasksForCycle(cycleId: string): Task[]
  getNextCycleNumber(projectId: string): number
}

/**
 * Gather project context and ask Claude to suggest the next cycle.
 */
export async function planNextCycle(
  db: CyclePlannerDb,
  projectId: string,
  direction?: string,
): Promise<CycleSuggestion> {
  const project = db.getProject(projectId)
  if (!project) throw new Error('Project not found')

  const cycles = db.getCyclesForProject(projectId)
  const decisions = db.getDecisionsForProject(projectId)
  const tasks = db.getTasksForProject(projectId)

  // Build context from completed cycles with learnings
  const cycleHistory = cycles
    .filter(c => c.status === 'completed')
    .map(c => {
      const cycleTasks = db.getTasksForCycle(c.id)
      const done = cycleTasks.filter(t => t.status === 'done').length
      return `Cycle ${c.cycle_number}: ${c.goal || 'No goal'}\n  Tasks: ${done}/${cycleTasks.length} done\n  Learnings: ${c.learnings || 'None'}`
    })
    .join('\n\n')

  const decisionList = decisions
    .map(d => `- ${d.title}${d.rationale ? `: ${d.rationale}` : ''}`)
    .join('\n')

  const taskSummary = tasks
    .map(t => `- [${t.status}] ${t.title}`)
    .join('\n')

  const nextCycleNumber = db.getNextCycleNumber(projectId)

  const prompt = buildPlanningPrompt({
    projectName: project.name,
    projectGoal: project.goal || '',
    cycleHistory,
    decisionList,
    taskSummary,
    nextCycleNumber,
    direction,
  })

  const raw = await spawnClaudeForPlanning(prompt)
  return parseSuggestion(raw)
}

interface PlanningContext {
  projectName: string
  projectGoal: string
  cycleHistory: string
  decisionList: string
  taskSummary: string
  nextCycleNumber: number
  direction?: string
}

function buildPlanningPrompt(ctx: PlanningContext): string {
  let prompt = `You are a development planning assistant. Analyze the project state and suggest the next development cycle.

PROJECT: ${ctx.projectName}
GOAL: ${ctx.projectGoal}

COMPLETED CYCLES:
${ctx.cycleHistory || 'None yet'}

DECISIONS MADE:
${ctx.decisionList || 'None'}

CURRENT TASKS:
${ctx.taskSummary || 'None'}

NEXT CYCLE NUMBER: ${ctx.nextCycleNumber}
`

  if (ctx.direction) {
    prompt += `\nUSER DIRECTION: ${ctx.direction}\n`
  }

  prompt += `
Based on this context, suggest the next cycle. Follow these rules:
- Each cycle should have 1-3 focused tasks
- Build incrementally on what's already done
- Consider learnings from previous cycles
- Task types: implementation, research, bug-fix, refactor, debug

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "goal": "Brief cycle goal",
  "tasks": [
    { "title": "Task title", "description": "What to do", "type": "implementation" }
  ],
  "rationale": "Why this cycle makes sense given the project state"
}`

  return prompt
}

/**
 * Spawn Claude CLI in --print mode to get planning suggestion.
 */
function spawnClaudeForPlanning(prompt: string): Promise<string> {
  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'

  const args = [
    '--print',
    '--output-format', 'text',
    '--max-turns', '1',
    '-p', prompt,
  ]

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(claudeCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`))
        return
      }
      resolve(stdout)
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Claude: ${err.message}`))
    })
  })
}

/**
 * Parse Claude's response into a CycleSuggestion.
 */
function parseSuggestion(raw: string): CycleSuggestion {
  // Try to extract JSON from the response (Claude may wrap in markdown code blocks)
  let jsonStr = raw.trim()

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  // Find JSON object boundaries
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    jsonStr = jsonStr.slice(start, end + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      goal: String(parsed.goal || ''),
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map((t: Record<string, unknown>) => ({
            title: String(t.title || ''),
            description: String(t.description || ''),
            type: String(t.type || 'implementation'),
          }))
        : [],
      rationale: String(parsed.rationale || ''),
    }
  } catch {
    throw new Error(`Failed to parse Claude's suggestion as JSON: ${raw.slice(0, 200)}`)
  }
}
