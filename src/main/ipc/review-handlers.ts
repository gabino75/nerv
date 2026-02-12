/**
 * Review IPC Handlers
 *
 * Handles all task review-related IPC messages for the review gate before merge feature.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { broadcastToRenderers } from '../utils'
import { finishedSessions } from '../claude/state'
import type { TaskReview, ReviewContext } from '../../shared/types'

const execAsync = promisify(exec)

export function registerReviewHandlers(): void {
  safeHandle('db:reviews:getForTask', (_event, taskId: string): TaskReview | undefined => {
    return databaseService.getReviewForTask(taskId)
  })

  safeHandle('db:reviews:getPending', (): TaskReview[] => {
    return databaseService.getPendingReviews()
  })

  safeHandle('db:reviews:create', (_event, taskId: string): TaskReview => {
    const review = databaseService.createReview(taskId)
    // Broadcast notification when review is requested
    const task = databaseService.getTask(taskId)
    if (task) {
      broadcastToRenderers('notification:reviewRequested', {
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.project_id,
        reviewId: review.id
      })
    }
    return review
  })

  safeHandle('db:reviews:approve', (_event, taskId: string, notes?: string): TaskReview | undefined => {
    const review = databaseService.approveReview(taskId, notes)
    if (review) {
      const task = databaseService.getTask(taskId)
      if (task) {
        broadcastToRenderers('notification:reviewApproved', {
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.project_id,
          reviewId: review.id
        })
      }
    }
    return review
  })

  safeHandle('db:reviews:reject', (_event, taskId: string, notes: string): TaskReview | undefined => {
    const review = databaseService.rejectReview(taskId, notes)
    if (review) {
      const task = databaseService.getTask(taskId)
      if (task) {
        broadcastToRenderers('notification:reviewRejected', {
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.project_id,
          reviewId: review.id,
          notes
        })
      }
    }
    return review
  })

  /**
   * Get review context for Normal mode human review (PRD Review Modes section)
   * Fetches git diff, test results, and Claude summary for informed review
   */
  safeHandle('db:reviews:getContext', async (_event, taskId: string): Promise<ReviewContext> => {
    const task = databaseService.getTask(taskId)
    if (!task) {
      return {
        gitDiff: '',
        gitDiffStats: '',
        testResults: null,
        testsPass: null,
        claudeSummary: null,
        error: 'Task not found'
      }
    }

    const worktreePath = task.worktree_path
    if (!worktreePath) {
      return {
        gitDiff: '',
        gitDiffStats: '',
        testResults: null,
        testsPass: null,
        claudeSummary: null,
        error: 'Task has no worktree path'
      }
    }

    let gitDiff = ''
    let gitDiffStats = ''

    try {
      // Get base branch for comparison
      const { stdout: baseBranch } = await execAsync(
        'git rev-parse --abbrev-ref HEAD@{upstream} 2>/dev/null || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "HEAD~10"',
        { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
      )
      const base = baseBranch.trim().replace('origin/', '')

      // Get diff stats
      try {
        const { stdout: stats } = await execAsync(
          `git diff ${base}...HEAD --stat`,
          { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
        )
        gitDiffStats = stats
      } catch {
        gitDiffStats = '(Unable to get diff stats)'
      }

      // Get full diff
      try {
        const { stdout: diff } = await execAsync(
          `git diff ${base}...HEAD`,
          { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
        )
        // Limit diff size
        const maxDiffLength = 100000
        if (diff.length > maxDiffLength) {
          gitDiff = diff.substring(0, maxDiffLength) + '\n\n[... diff truncated due to size ...]'
        } else {
          gitDiff = diff
        }
      } catch {
        gitDiff = '(Unable to generate diff)'
      }
    } catch {
      // Fallback: show recent changes
      try {
        const { stdout: stats } = await execAsync(
          'git diff HEAD~5...HEAD --stat',
          { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
        )
        gitDiffStats = stats

        const { stdout: diff } = await execAsync(
          'git diff HEAD~5...HEAD',
          { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
        )
        const maxDiffLength = 100000
        if (diff.length > maxDiffLength) {
          gitDiff = diff.substring(0, maxDiffLength) + '\n\n[... diff truncated due to size ...]'
        } else {
          gitDiff = diff
        }
      } catch {
        gitDiff = '(Unable to generate diff)'
        gitDiffStats = ''
      }
    }

    // Populate Claude summary: check in-memory sessions first, then DB review record
    let claudeSummary: string | null = null
    for (const finished of finishedSessions.values()) {
      if (finished.taskId === taskId && finished.lastAssistantText) {
        claudeSummary = finished.lastAssistantText
        break
      }
    }
    // Fallback: check the review record's stored claude_summary (persists across restarts)
    if (!claudeSummary) {
      const review = databaseService.getReviewForTask(taskId)
      if (review?.claude_summary) {
        claudeSummary = review.claude_summary
      }
    }

    return {
      gitDiff,
      gitDiffStats,
      testResults: null,
      testsPass: null,
      claudeSummary
    }
  })
}
