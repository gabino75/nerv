/**
 * Recommend IPC Handlers
 *
 * Handles the "What's Next?" recommendation feature.
 * Gathers project context from database, builds a prompt,
 * and calls claude --print for a one-shot recommendation.
 */

import { execSync } from 'child_process'
import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import {
  buildRecommendPrompt,
  parseRecommendation,
  parseRecommendations,
  type Recommendation,
  type RecommendContext,
} from '../../shared/prompts/recommend'

interface ExecuteResult {
  success: boolean
  action: string
  data?: Record<string, unknown>
  error?: string
}

function gatherContext(projectId: string, direction?: string): RecommendContext | null {
  const project = databaseService.getProject(projectId)
  if (!project) return null

  const tasks = databaseService.getTasksForProject(projectId).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    taskType: t.task_type || 'implementation',
  }))

  // Learnings are stored as text on completed cycles (no separate table in main DB)
  const allCycles = databaseService.getCyclesForProject(projectId)
  const learnings = allCycles
    .filter(c => c.learnings)
    .map(c => ({
      content: c.learnings!,
      category: 'cycle' as const,
    }))

  const decisions = databaseService.getDecisionsForProject(projectId).map(d => ({
    title: d.title,
    decision: d.decision,
  }))

  const activeCycle = databaseService.getActiveCycle(projectId)

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

function callClaude(prompt: string, ctx?: RecommendContext): string {
  // In mock/test mode, return realistic sample recommendations based on context
  const isMock = process.env.NERV_MOCK_CLAUDE === '1' || process.env.NERV_MOCK_CLAUDE === 'true'
    || process.env.NERV_TEST_MODE === '1' || process.env.NERV_TEST_MODE === 'true'
  if (isMock) {
    // Use structured context when available (more reliable than prompt parsing)
    const hasCycle = ctx ? ctx.hasCycle : prompt.includes('Cycle: #')
    const hasTodoTasks = ctx
      ? ctx.tasks.some(t => t.status === 'todo')
      : prompt.includes('todo:')
    const hasInProgress = ctx
      ? ctx.tasks.some(t => t.status === 'in_progress')
      : prompt.includes('in_progress:')
    const hasReview = ctx
      ? ctx.tasks.some(t => t.status === 'review')
      : prompt.includes('review:')
    const allTasksDone = ctx
      ? ctx.tasks.length > 0 && ctx.tasks.every(t => t.status === 'done')
      : false
    if (!hasCycle) {
      return JSON.stringify([
        { phase: 'mvp', action: 'create_cycle', title: 'Start your first development cycle', description: 'Create a cycle to organize your work into focused iterations.', details: 'A cycle groups related tasks. Start with a small MVP scope.', params: { cycleGoal: 'MVP: Core functionality with tests' } },
        { phase: 'discovery', action: 'explore_codebase', title: 'Explore the project structure', description: 'Understand existing code patterns before making changes.', details: 'Look at entry points, dependencies, and test coverage.' },
      ])
    }
    if (!hasTodoTasks && !hasInProgress && !hasReview && !allTasksDone) {
      // No tasks at all — create some
      return JSON.stringify([
        { phase: 'mvp', action: 'create_task', title: 'Implement core feature', description: 'Create a task for the main functionality.', details: 'Focus on the critical path first.', params: { taskTitle: 'Implement core feature', taskType: 'implementation' } },
        { phase: 'mvp', action: 'create_task', title: 'Add integration tests', description: 'Ensure the core feature works end-to-end.', details: 'Write tests that cover the happy path.', params: { taskTitle: 'Add integration tests', taskType: 'implementation' } },
      ])
    }
    if (allTasksDone) {
      // All tasks complete — wrap up the cycle
      return JSON.stringify([
        { phase: 'completion', action: 'complete_cycle', title: 'Complete the current cycle', description: 'All tasks are done. Record learnings and close this cycle.', details: 'Summarize what was accomplished and lessons learned.' },
        { phase: 'completion', action: 'record_learning', title: 'Record cycle learnings', description: 'Document insights from this development cycle.', details: 'What worked well? What could be improved?', params: { learningContent: 'Completed all tasks successfully. Core feature implemented with tests.' } },
      ])
    }
    if (hasReview) {
      // Tasks in review — approve them
      return JSON.stringify([
        { phase: 'building', action: 'approve_task', title: 'Approve the reviewed task', description: 'The task review looks good. Approve and merge.', details: 'Mark the task as done after successful review.' },
        { phase: 'building', action: 'run_audit', title: 'Audit code health', description: 'Check code quality and test coverage.', details: 'Review recent changes for issues.' },
      ])
    }
    if (hasInProgress) {
      // Tasks in progress — review them
      return JSON.stringify([
        { phase: 'building', action: 'review_task', title: 'Review the current task', description: 'Check the in-progress task for completion.', details: 'Review output and decide whether to approve or iterate.' },
        { phase: 'building', action: 'run_audit', title: 'Audit code health', description: 'Check code quality and test coverage.', details: 'Review recent changes for issues.' },
      ])
    }
    // Has todo tasks — start them
    return JSON.stringify([
      { phase: 'building', action: 'start_task', title: 'Start working on the next task', description: 'Pick up the highest priority todo task.', details: 'Claude will work in an isolated worktree.' },
      { phase: 'building', action: 'run_audit', title: 'Audit code health', description: 'Check code quality and test coverage.', details: 'Review recent changes for issues.' },
    ])
  }

  return execSync(
    'claude --print --model sonnet --max-turns 1',
    {
      input: prompt,
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  ).trim()
}

export function registerRecommendHandlers(): void {
  // Legacy: get single recommendation
  safeHandle('recommend:getNext', async (_event, projectId: string): Promise<Recommendation | null> => {
    const ctx = gatherContext(projectId)
    if (!ctx) return null

    try {
      const result = callClaude(buildRecommendPrompt(ctx), ctx)
      return parseRecommendation(result)
    } catch (err) {
      console.error('[NERV] Recommendation failed:', err instanceof Error ? err.message : err)
      return null
    }
  })

  // Get multiple recommendations with optional user direction
  safeHandle('recommend:getNextWithDirection', async (_event, projectId: string, direction?: string): Promise<Recommendation[]> => {
    const ctx = gatherContext(projectId, direction)
    if (!ctx) return []

    try {
      const result = callClaude(buildRecommendPrompt(ctx), ctx)
      return parseRecommendations(result)
    } catch (err) {
      console.error('[NERV] Recommendation failed:', err instanceof Error ? err.message : err)
      return []
    }
  })

  // Execute a recommendation action
  safeHandle('recommend:execute', async (_event, projectId: string, recommendation: Recommendation): Promise<ExecuteResult> => {
    const project = databaseService.getProject(projectId)
    if (!project) {
      return { success: false, action: recommendation.action, error: 'Project not found' }
    }

    const { action, params } = recommendation

    try {
      switch (action) {
        case 'create_cycle': {
          const activeCycle = databaseService.getActiveCycle(projectId)
          if (activeCycle) {
            return { success: false, action, error: 'A cycle is already active. Complete it first.' }
          }
          const nextNum = databaseService.getNextCycleNumber(projectId)
          const cycle = databaseService.createCycle(projectId, nextNum, params?.cycleGoal)
          return { success: true, action, data: { cycleId: cycle.id, cycleNumber: cycle.cycle_number } }
        }

        case 'create_task': {
          const activeCycle = databaseService.getActiveCycle(projectId)
          const title = params?.taskTitle || recommendation.title
          const task = databaseService.createTaskWithType(
            projectId,
            title,
            (params?.taskType as 'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug') || 'implementation',
            params?.taskDescription,
            activeCycle?.id
          )
          return { success: true, action, data: { taskId: task.id, taskTitle: task.title } }
        }

        case 'start_task': {
          // UI handles starting the task (terminal spawn, worktree creation)
          const taskId = params?.taskId || databaseService.getTasksForProject(projectId).find(t => t.status === 'todo')?.id
          // In mock mode, also update task status so the recommend loop can progress
          const isMock = process.env.NERV_MOCK_CLAUDE === '1' || process.env.NERV_MOCK_CLAUDE === 'true'
            || process.env.NERV_TEST_MODE === '1' || process.env.NERV_TEST_MODE === 'true'
          if (isMock && taskId) {
            databaseService.updateTaskStatus(taskId, 'in_progress')
          }
          return { success: true, action, data: { taskId, uiAction: 'start_task' } }
        }

        case 'complete_cycle': {
          const activeCycle = databaseService.getActiveCycle(projectId)
          if (!activeCycle) {
            return { success: false, action, error: 'No active cycle to complete' }
          }
          databaseService.completeCycle(activeCycle.id)
          return { success: true, action, data: { cycleId: activeCycle.id } }
        }

        case 'record_learning': {
          if (!params?.learningContent) {
            return { success: false, action, error: 'No learning content provided' }
          }
          // Store learning on the active cycle (learnings are cycle-level in main DB)
          const cycle = databaseService.getActiveCycle(projectId)
          if (cycle) {
            const existing = cycle.learnings ? cycle.learnings + '\n' : ''
            databaseService.updateCycle(cycle.id, { learnings: existing + params.learningContent })
            return { success: true, action, data: { cycleId: cycle.id } }
          }
          return { success: false, action, error: 'No active cycle to record learning on' }
        }

        case 'run_audit': {
          // UI handles opening the audit panel
          return { success: true, action, data: { uiAction: 'open_audit' } }
        }

        case 'create_project_goal': {
          // UI handles this — goal is set via project update
          return { success: true, action, data: { uiAction: 'set_goal' } }
        }

        case 'review_task':
        case 'approve_task': {
          const targetTask = params?.taskId
            ? databaseService.getTasksForProject(projectId).find(t => t.id === params.taskId)
            : databaseService.getTasksForProject(projectId).find(t => t.status === 'in_progress' || t.status === 'review')
          const targetTaskId = targetTask?.id
          // In mock mode, advance task status so the recommend loop can progress
          const isMockMode = process.env.NERV_MOCK_CLAUDE === '1' || process.env.NERV_MOCK_CLAUDE === 'true'
            || process.env.NERV_TEST_MODE === '1' || process.env.NERV_TEST_MODE === 'true'
          if (isMockMode && targetTaskId) {
            if (action === 'review_task') {
              databaseService.updateTaskStatus(targetTaskId, 'review')
            } else if (action === 'approve_task') {
              databaseService.updateTaskStatus(targetTaskId, 'done')
            }
          }
          return { success: true, action, data: { taskId: targetTaskId, uiAction: action } }
        }

        case 'explore_codebase':
        case 'write_tests':
        case 'resume_task': {
          // These require UI interaction — return the action for the UI to handle
          const uiTaskId = params?.taskId || databaseService.getTasksForProject(projectId).find(
            t => action === 'resume_task' ? t.status === 'interrupted' : t.status === 'in_progress'
          )?.id
          return { success: true, action, data: { taskId: uiTaskId, uiAction: action } }
        }

        default:
          return { success: false, action, error: `Unknown action: ${action}` }
      }
    } catch (err) {
      return { success: false, action, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
