/**
 * Branching types
 */

import type { Branch } from './database'

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

export interface BranchCreateResult {
  branch: Branch
  branchContext: string
}
