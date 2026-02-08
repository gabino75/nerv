/**
 * Benchmark Scoring - Deterministic NERV operations scoring
 *
 * Pure math from summary.json metrics - no Claude needed.
 * Scores worktree usage, parallelism, cycle management,
 * review process, error handling, and cost efficiency.
 */

import type { NervOpsScore, NervOpsBreakdown, BenchmarkSummary } from '../shared/types/benchmark.js'

/**
 * Score weights for each dimension (must sum to 100).
 */
const WEIGHTS = {
  worktreeUsage: 25,
  parallelism: 15,
  cycleManagement: 20,
  reviewProcess: 15,
  errorHandling: 10,
  costEfficiency: 15,
} as const

/**
 * Score NERV operations deterministically from summary.json data.
 * Returns a score from 0-100 with per-dimension breakdown.
 */
export function scoreNervOps(summary: BenchmarkSummary): NervOpsScore {
  const breakdown: NervOpsBreakdown = {
    worktreeUsage: scoreWorktreeUsage(summary),
    parallelism: scoreParallelism(summary),
    cycleManagement: scoreCycleManagement(summary),
    reviewProcess: scoreReviewProcess(summary),
    errorHandling: scoreErrorHandling(summary),
    costEfficiency: scoreCostEfficiency(summary),
  }

  const totalScore =
    (breakdown.worktreeUsage.score / breakdown.worktreeUsage.max) * WEIGHTS.worktreeUsage +
    (breakdown.parallelism.score / breakdown.parallelism.max) * WEIGHTS.parallelism +
    (breakdown.cycleManagement.score / breakdown.cycleManagement.max) * WEIGHTS.cycleManagement +
    (breakdown.reviewProcess.score / breakdown.reviewProcess.max) * WEIGHTS.reviewProcess +
    (breakdown.errorHandling.score / breakdown.errorHandling.max) * WEIGHTS.errorHandling +
    (breakdown.costEfficiency.score / breakdown.costEfficiency.max) * WEIGHTS.costEfficiency

  return {
    score: Math.round(totalScore),
    breakdown,
  }
}

/**
 * Convert 0-100 NERV ops score to 0-10 scale.
 */
export function nervOpsScoreTo10(score: number): number {
  return Math.round((score / 10) * 10) / 10
}

/**
 * Worktree Usage (25%): created > 0, merged > 0, per-task isolation
 */
function scoreWorktreeUsage(summary: BenchmarkSummary): NervOpsBreakdown['worktreeUsage'] {
  const wf = summary.workflow
  let score = 0
  const max = 10
  const details: string[] = []

  if (wf.worktreesCreated > 0) {
    score += 3
    details.push(`${wf.worktreesCreated} worktrees created`)
  } else {
    details.push('No worktrees created (0/3)')
  }

  if (wf.worktreesMerged > 0) {
    score += 3
    details.push(`${wf.worktreesMerged} worktrees merged`)
  } else {
    details.push('No worktrees merged (0/3)')
  }

  // Per-task isolation: worktrees >= tasks completed
  const tasksCompleted = summary.tasks.completed
  if (tasksCompleted > 0 && wf.worktreesCreated >= tasksCompleted) {
    score += 2
    details.push('Per-task worktree isolation')
  } else if (wf.worktreesCreated > 0) {
    score += 1
    details.push('Partial worktree isolation')
  }

  // No discarded worktrees is good (clean workflow)
  if (wf.worktreesCreated > 0 && wf.worktreesDiscarded === 0) {
    score += 2
    details.push('No worktrees discarded')
  } else if (wf.worktreesCreated > 0) {
    score += 1
    details.push(`${wf.worktreesDiscarded} worktrees discarded`)
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

/**
 * Parallelism (15%): parallel tasks > 0, concurrent execution
 */
function scoreParallelism(summary: BenchmarkSummary): NervOpsBreakdown['parallelism'] {
  const wf = summary.workflow
  let score = 0
  const max = 10
  const details: string[] = []

  if (wf.parallelTasksRun > 0) {
    score += 5
    details.push(`${wf.parallelTasksRun} parallel tasks ran`)
  } else {
    details.push('No parallel tasks (0/5)')
  }

  // More parallel tasks = better
  if (wf.parallelTasksRun >= 4) {
    score += 3
    details.push('Strong parallelism (4+)')
  } else if (wf.parallelTasksRun >= 2) {
    score += 2
    details.push('Moderate parallelism (2-3)')
  } else if (wf.parallelTasksRun === 1) {
    score += 1
    details.push('Minimal parallelism (1)')
  }

  // Parallel tasks relative to total tasks
  if (summary.tasks.total > 1 && wf.parallelTasksRun >= summary.tasks.total * 0.5) {
    score += 2
    details.push('50%+ tasks ran in parallel')
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

/**
 * Cycle Management (20%): multiple cycles, spec completion increases
 */
function scoreCycleManagement(summary: BenchmarkSummary): NervOpsBreakdown['cycleManagement'] {
  let score = 0
  const max = 10
  const details: string[] = []

  const totalCycles = summary.cycles.total

  if (totalCycles >= 3) {
    score += 4
    details.push(`${totalCycles} cycles completed (good progression)`)
  } else if (totalCycles >= 2) {
    score += 2
    details.push(`${totalCycles} cycles completed`)
  } else if (totalCycles === 1) {
    score += 1
    details.push('Single cycle only')
  } else {
    details.push('No cycles completed (0/4)')
  }

  // Spec completion
  const specCompletion = summary.spec.completionPercent
  if (specCompletion >= 80) {
    score += 3
    details.push(`${specCompletion}% spec completion`)
  } else if (specCompletion >= 50) {
    score += 2
    details.push(`${specCompletion}% spec completion`)
  } else if (specCompletion > 0) {
    score += 1
    details.push(`${specCompletion}% spec completion`)
  }

  // Tasks completed vs total
  if (summary.tasks.total > 0 && summary.tasks.completed === summary.tasks.total) {
    score += 2
    details.push('All tasks completed')
  } else if (summary.tasks.completed > 0) {
    score += 1
    details.push(`${summary.tasks.completed}/${summary.tasks.total} tasks completed`)
  }

  // Audit cycles
  if (summary.cycles.auditsRun > 0) {
    score += 1
    details.push(`${summary.cycles.auditsRun} audits ran`)
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

/**
 * Review Process (15%): reviews ran, decisions recorded
 */
function scoreReviewProcess(summary: BenchmarkSummary): NervOpsBreakdown['reviewProcess'] {
  let score = 0
  const max = 10
  const details: string[] = []

  // Check if workflow has review data (via extended summary format)
  const extWorkflow = summary.workflow as Record<string, unknown>
  const reviewsRun = (extWorkflow.reviewsRun as number) || 0
  const reviewsApproved = (extWorkflow.reviewsApproved as number) || 0

  if (reviewsRun > 0) {
    score += 5
    details.push(`${reviewsRun} reviews ran`)
  } else {
    details.push('No reviews ran (0/5)')
  }

  if (reviewsApproved > 0) {
    score += 3
    details.push(`${reviewsApproved} reviews approved`)
  }

  // Review coverage: reviews >= tasks completed
  if (reviewsRun >= summary.tasks.completed && summary.tasks.completed > 0) {
    score += 2
    details.push('Full review coverage')
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

/**
 * Error Handling (10%): low errors, no loops/stuck states
 */
function scoreErrorHandling(summary: BenchmarkSummary): NervOpsBreakdown['errorHandling'] {
  let score = 10 // Start at max, deduct for issues
  const max = 10
  const details: string[] = []

  const issues = summary.issues

  // Deduct for tool errors
  if (issues.toolErrors > 20) {
    score -= 4
    details.push(`${issues.toolErrors} tool errors (high)`)
  } else if (issues.toolErrors > 10) {
    score -= 2
    details.push(`${issues.toolErrors} tool errors (moderate)`)
  } else if (issues.toolErrors > 0) {
    score -= 1
    details.push(`${issues.toolErrors} tool errors (low)`)
  } else {
    details.push('No tool errors')
  }

  // Deduct for loops
  if (issues.loopsDetected > 0) {
    score -= 3
    details.push(`${issues.loopsDetected} loops detected`)
  }

  // Deduct for stuck states
  if (issues.stuckDetections > 0) {
    score -= 2
    details.push(`${issues.stuckDetections} stuck detections`)
  }

  // Deduct for many compactions
  if (issues.compactions > 3) {
    score -= 1
    details.push(`${issues.compactions} compactions (high context usage)`)
  }

  if (score >= 9) {
    details.push('Clean execution')
  }

  return { score: Math.max(0, Math.min(score, max)), max, details: details.join('; ') }
}

/**
 * Cost Efficiency (15%): reasonable cost for complexity
 */
function scoreCostEfficiency(summary: BenchmarkSummary): NervOpsBreakdown['costEfficiency'] {
  let score = 0
  const max = 10
  const details: string[] = []

  const costUsd = summary.cost.totalUsd
  const specItems = summary.spec.totalItems || 1
  const costPerItem = costUsd / specItems

  // Absolute cost thresholds
  if (costUsd <= 0.50) {
    score += 4
    details.push(`Total cost $${costUsd.toFixed(2)} (very efficient)`)
  } else if (costUsd <= 2.00) {
    score += 3
    details.push(`Total cost $${costUsd.toFixed(2)} (efficient)`)
  } else if (costUsd <= 5.00) {
    score += 2
    details.push(`Total cost $${costUsd.toFixed(2)} (moderate)`)
  } else {
    score += 1
    details.push(`Total cost $${costUsd.toFixed(2)} (expensive)`)
  }

  // Cost per spec item
  if (costPerItem <= 0.10) {
    score += 3
    details.push(`$${costPerItem.toFixed(3)}/item (very efficient)`)
  } else if (costPerItem <= 0.25) {
    score += 2
    details.push(`$${costPerItem.toFixed(3)}/item (efficient)`)
  } else if (costPerItem <= 0.50) {
    score += 1
    details.push(`$${costPerItem.toFixed(3)}/item (moderate)`)
  }

  // Duration efficiency
  const durationMin = summary.duration.totalMs / 60000
  if (durationMin <= 5) {
    score += 3
    details.push(`${durationMin.toFixed(1)}min duration (fast)`)
  } else if (durationMin <= 15) {
    score += 2
    details.push(`${durationMin.toFixed(1)}min duration (moderate)`)
  } else if (durationMin <= 30) {
    score += 1
    details.push(`${durationMin.toFixed(1)}min duration (slow)`)
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}
