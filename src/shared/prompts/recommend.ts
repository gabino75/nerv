/**
 * Recommendation prompt template for the "What's Next?" feature.
 *
 * Encodes the NERV workflow from the PRD so Claude can recommend
 * the next logical step based on current project state.
 */

/** All known recommendation actions */
export type RecommendAction =
  | 'create_project_goal'
  | 'create_cycle'
  | 'create_task'
  | 'start_task'
  | 'review_task'
  | 'approve_task'
  | 'complete_cycle'
  | 'run_audit'
  | 'record_learning'
  | 'explore_codebase'
  | 'write_tests'
  | 'resume_task'

/** Parameters for executing a recommendation */
export interface RecommendParams {
  cycleGoal?: string
  taskTitle?: string
  taskDescription?: string
  taskType?: string
  taskId?: string
  learningContent?: string
}

export interface RecommendContext {
  projectName: string
  projectGoal: string | null
  cycleNumber: number | null
  cycleGoal: string | null
  tasks: { id: string; title: string; status: string; taskType: string }[]
  learnings: { content: string; category: string }[]
  decisions: { title: string; decision: string }[]
  repositories: { name: string; stack: string | null; path: string }[]
  hasCycle: boolean
  totalCycles: number
  userDirection?: string
}

export interface Recommendation {
  phase: 'discovery' | 'mvp' | 'building' | 'polish' | 'done'
  action: RecommendAction
  title: string
  description: string
  details: string
  params?: RecommendParams
}

export interface RecommendResponse {
  recommendations: Recommendation[]
}

export function buildRecommendPrompt(ctx: RecommendContext): string {
  const tasksByStatus = {
    todo: ctx.tasks.filter(t => t.status === 'todo'),
    in_progress: ctx.tasks.filter(t => t.status === 'in_progress'),
    review: ctx.tasks.filter(t => t.status === 'review'),
    done: ctx.tasks.filter(t => t.status === 'done'),
    interrupted: ctx.tasks.filter(t => t.status === 'interrupted'),
  }

  const taskSummary = ctx.tasks.length > 0
    ? `${tasksByStatus.done.length}/${ctx.tasks.length} done, ${tasksByStatus.in_progress.length} in progress, ${tasksByStatus.todo.length} todo, ${tasksByStatus.review.length} in review`
    : 'No tasks created yet'

  const learningsSummary = ctx.learnings.length > 0
    ? ctx.learnings.slice(-5).map(l => `  - [${l.category}] ${l.content}`).join('\n')
    : '  (none recorded yet)'

  const decisionsSummary = ctx.decisions.length > 0
    ? ctx.decisions.slice(-5).map(d => `  - ${d.title}: ${d.decision}`).join('\n')
    : '  (none recorded yet)'

  const taskList = ctx.tasks.length > 0
    ? ctx.tasks.map(t => `  - [${t.status}] ${t.id}: ${t.title} (${t.taskType})`).join('\n')
    : '  (no tasks)'

  const directionBlock = ctx.userDirection
    ? `\nUser Direction: "${ctx.userDirection}"\nIncorporate this direction into your recommendations. Prioritize actions that align with what the user wants.\n`
    : ''

  return `You are the NERV workflow advisor. Given the current project state, recommend 2-3 ranked next steps.

NERV Development Lifecycle:
- Discovery: Explore codebase, understand patterns, identify the project's milestones and priorities
- Early cycles: Prioritize MVP scope and E2E tests. Get core functionality working first.
- Later cycles: Build toward milestones, expand features, improve quality
- Each cycle: Create tasks -> Work tasks -> Review -> Record learnings -> Audit -> Plan next
- Claude uses cycles to iteratively work toward the user's goals in a structured manner
- 1-3 tasks per cycle, audit after each cycle, record learnings

Key principles:
- MVP and E2E tests should come first in early cycles
- The user may have specific milestones or direction in mind - respect their project goal
- After each cycle: audit code health, record learnings, decide what to tackle next
- Tasks flow: todo -> in_progress -> review -> done
${directionBlock}
Current State:
- Project: ${ctx.projectName}
- Goal: ${ctx.projectGoal || '(not set)'}
- Cycle: ${ctx.hasCycle ? `#${ctx.cycleNumber} - ${ctx.cycleGoal || '(no goal)'}` : 'No cycle created yet'}
- Total Cycles Completed: ${ctx.totalCycles}
- Tasks: ${taskSummary}
${taskList}
- Recent Learnings (last 5):
${learningsSummary}
- Repositories:
${ctx.repositories.length > 0 ? ctx.repositories.map(r => `  - ${r.name}: ${r.stack || 'unknown stack'} (${r.path})`).join('\n') : '  (no repositories added)'}
- Recent Decisions (last 5):
${decisionsSummary}

Respond with ONLY a valid JSON array of 2-3 recommendations (no markdown, no code fences):
[
  {
    "phase": "discovery|mvp|building|polish|done",
    "action": "create_project_goal|create_cycle|create_task|start_task|review_task|approve_task|complete_cycle|run_audit|record_learning|explore_codebase|write_tests|resume_task",
    "title": "Short action title (max 60 chars)",
    "description": "Why this is the right next step (1-2 sentences)",
    "details": "Specific instructions for the user (1-3 sentences)",
    "params": {
      "cycleGoal": "(optional) goal for create_cycle",
      "taskTitle": "(optional) title for create_task",
      "taskDescription": "(optional) description for create_task",
      "taskType": "(optional) implementation|research|bug-fix|refactor|debug",
      "taskId": "(optional) ID for start_task/resume_task",
      "learningContent": "(optional) content for record_learning"
    }
  }
]

Only include params fields that are relevant to the action. Rank recommendations from most to least important.`
}

/**
 * Extract JSON array or object from a string that may contain surrounding text.
 * Handles real Claude output like: "Here are my recommendations:\n\n[{...}]\n\nI hope this helps"
 */
function extractJson(text: string): string | null {
  // Try to find a JSON array first (most common)
  const arrayStart = text.indexOf('[')
  if (arrayStart !== -1) {
    let depth = 0
    for (let i = arrayStart; i < text.length; i++) {
      if (text[i] === '[') depth++
      else if (text[i] === ']') depth--
      if (depth === 0) return text.slice(arrayStart, i + 1)
    }
  }

  // Try to find a JSON object (single recommendation)
  const objStart = text.indexOf('{')
  if (objStart !== -1) {
    let depth = 0
    for (let i = objStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      if (depth === 0) return text.slice(objStart, i + 1)
    }
  }

  return null
}

/**
 * Parse recommendation response — handles both array and single-object formats.
 * Robust against real Claude output that includes surrounding text or code fences.
 */
export function parseRecommendations(raw: string): Recommendation[] {
  try {
    // Strip markdown code fences
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // First try direct parse (fast path for well-formatted responses)
    try {
      const direct = JSON.parse(cleaned) as Recommendation | Recommendation[]
      if (Array.isArray(direct)) {
        return direct.filter(r => r.phase && r.action && r.title && r.description)
      }
      if (direct.phase && direct.action && direct.title && direct.description) {
        return [direct]
      }
    } catch {
      // Direct parse failed — extract JSON from surrounding text
    }

    // Extract JSON from text that may have explanations before/after
    const jsonStr = extractJson(cleaned)
    if (!jsonStr) return []

    const parsed = JSON.parse(jsonStr) as Recommendation | Recommendation[]

    if (Array.isArray(parsed)) {
      return parsed.filter(r => r.phase && r.action && r.title && r.description)
    }

    // Single object — wrap in array
    if (parsed.phase && parsed.action && parsed.title && parsed.description) {
      return [parsed]
    }

    return []
  } catch {
    return []
  }
}

/**
 * Legacy single-recommendation parser for backward compatibility.
 */
export function parseRecommendation(raw: string): Recommendation | null {
  const results = parseRecommendations(raw)
  return results[0] ?? null
}
