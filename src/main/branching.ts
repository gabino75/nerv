import { ipcMain } from 'electron'
import { databaseService, Task, Branch } from './database'
import { broadcastToRenderers } from './utils'

// Types for branching operations
export interface BranchContext {
  taskDescription: string
  workSummary: string
  recentErrors: string[]
  includeFullHistory: boolean
}

export interface BranchSummary {
  attemptedApproaches: string[]
  keyLearnings: string[]
  nextStepsToTry: string[]
}

export interface ClearWithSummaryOptions {
  taskId: string
  summary: BranchSummary
}

// Generate context for a branch session
function generateBranchContext(task: Task, options: BranchContext): string {
  let context = `## Branch Session

This is an experimental branch from task: ${task.title}

### Context from parent session:
${options.workSummary}

### Goal:
Find a solution to the current blocker. If successful, summarize what worked
so it can be merged back to the main session.

### Task description:
${options.taskDescription}
`

  if (options.recentErrors.length > 0) {
    context += `
### Recent errors:
${options.recentErrors.map(e => `- ${e}`).join('\n')}
`
  }

  context += `
### Rules:
- Experiment freely
- Document what works and what doesn't
- When done, use /branch-complete to summarize findings
- Focus on solving the specific blocker
`

  return context
}

// Generate a summary for clearing context
function generateClearSummary(summary: BranchSummary): string {
  let content = ''

  if (summary.attemptedApproaches.length > 0) {
    content += `## Attempted approaches:\n`
    summary.attemptedApproaches.forEach((approach, i) => {
      content += `${i + 1}. ${approach}\n`
    })
    content += '\n'
  }

  if (summary.keyLearnings.length > 0) {
    content += `## Key learnings:\n`
    summary.keyLearnings.forEach(learning => {
      content += `- ${learning}\n`
    })
    content += '\n'
  }

  if (summary.nextStepsToTry.length > 0) {
    content += `## Next steps to try:\n`
    summary.nextStepsToTry.forEach(step => {
      content += `- ${step}\n`
    })
  }

  return content
}

// Create a branch session for a task
export async function createBranch(
  taskId: string,
  parentSessionId: string | null,
  context: BranchContext
): Promise<{ branch: Branch; branchContext: string }> {
  const task = databaseService.getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  // Create branch record in database
  const branch = databaseService.createBranch(taskId, parentSessionId || undefined)

  // Generate context for the branch session
  const branchContext = generateBranchContext(task, context)

  // Log the branch creation
  databaseService.logAuditEvent(taskId, 'branch_created', JSON.stringify({
    branchId: branch.id,
    parentSessionId,
    timestamp: new Date().toISOString()
  }))

  // Notify renderer of branch creation
  broadcastToRenderers('branching:created', branch)

  return { branch, branchContext }
}

// Merge a branch back to main (saves learnings)
export async function mergeBranch(branchId: string, summary: string): Promise<Branch | undefined> {
  const branches = await getAllBranches()
  const branch = branches.find(b => b.id === branchId)

  if (!branch) {
    throw new Error(`Branch ${branchId} not found`)
  }

  // Update branch status to merged with summary
  const updatedBranch = databaseService.updateBranchStatus(branchId, 'merged', summary)

  // Log the merge
  databaseService.logAuditEvent(branch.parent_task_id, 'branch_merged', JSON.stringify({
    branchId,
    summary,
    timestamp: new Date().toISOString()
  }))

  // Notify renderer
  broadcastToRenderers('branching:merged', updatedBranch)

  return updatedBranch
}

// Discard a branch (no learnings saved)
export async function discardBranch(branchId: string, reason?: string): Promise<Branch | undefined> {
  const branches = await getAllBranches()
  const branch = branches.find(b => b.id === branchId)

  if (!branch) {
    throw new Error(`Branch ${branchId} not found`)
  }

  // Update branch status to discarded
  const updatedBranch = databaseService.updateBranchStatus(branchId, 'discarded')

  // Log the discard with optional reason
  databaseService.logAuditEvent(branch.parent_task_id, 'branch_discarded', JSON.stringify({
    branchId,
    reason: reason || 'No reason provided',
    timestamp: new Date().toISOString()
  }))

  // Notify renderer
  broadcastToRenderers('branching:discarded', updatedBranch)

  return updatedBranch
}

// Get all branches (helper)
async function getAllBranches(): Promise<Branch[]> {
  // Get all tasks and their branches
  const projects = databaseService.getAllProjects()
  const allBranches: Branch[] = []

  for (const project of projects) {
    const tasks = databaseService.getTasksForProject(project.id)
    for (const task of tasks) {
      const branches = databaseService.getBranchesForTask(task.id)
      allBranches.push(...branches)
    }
  }

  return allBranches
}

// Get branches for a specific task
export function getBranchesForTask(taskId: string): Branch[] {
  return databaseService.getBranchesForTask(taskId)
}

// Get active branch for a task (if any)
export function getActiveBranch(taskId: string): Branch | undefined {
  const branches = databaseService.getBranchesForTask(taskId)
  return branches.find(b => b.status === 'active')
}

// Generate clear-with-summary context
export function generateClearContext(task: Task, summary: BranchSummary): string {
  const summaryContent = generateClearSummary(summary)

  return `## Context Reset - ${task.title}

The previous context has been cleared. Here's a summary of what was learned:

${summaryContent}

## Current Task:
${task.description || task.title}

Continue from here, using the learnings above to guide your approach.
Avoid repeating approaches that have already been tried.
`
}

// Append learnings to task notes (for branch merge)
export function appendLearningsToTask(taskId: string, learnings: string): void {
  const task = databaseService.getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  // For now, log the learnings to audit trail
  // In a full implementation, this could update a task notes field
  databaseService.logAuditEvent(taskId, 'learnings_appended', JSON.stringify({
    learnings,
    timestamp: new Date().toISOString()
  }))
}

// Register IPC handlers for branching operations
export function registerBranchingIpcHandlers(): void {
  // Create a branch session
  ipcMain.handle(
    'branching:create',
    async (_event, taskId: string, parentSessionId: string | null, context: BranchContext) => {
      return createBranch(taskId, parentSessionId, context)
    }
  )

  // Merge a branch with summary
  ipcMain.handle('branching:merge', async (_event, branchId: string, summary: string) => {
    return mergeBranch(branchId, summary)
  })

  // Discard a branch
  ipcMain.handle('branching:discard', async (_event, branchId: string, reason?: string) => {
    return discardBranch(branchId, reason)
  })

  // Get branches for a task
  ipcMain.handle('branching:getForTask', async (_event, taskId: string) => {
    return getBranchesForTask(taskId)
  })

  // Get active branch for a task
  ipcMain.handle('branching:getActive', async (_event, taskId: string) => {
    return getActiveBranch(taskId)
  })

  // Generate context for clear-with-summary
  ipcMain.handle('branching:generateClearContext', async (_event, taskId: string, summary: BranchSummary) => {
    const task = databaseService.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }
    return generateClearContext(task, summary)
  })

  // Append learnings to a task
  ipcMain.handle('branching:appendLearnings', async (_event, taskId: string, learnings: string) => {
    appendLearningsToTask(taskId, learnings)
  })
}
