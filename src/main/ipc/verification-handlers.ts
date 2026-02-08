/**
 * Verification IPC Handlers (PRD Section 16)
 *
 * Handles acceptance criteria, iterations, and verification templates.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { verifyTask, verifyManualCriterion, getVerificationSummary } from '../verification'
import { cancelAutoIteration, isAutoIterating } from '../verification/auto-iterate'
import type {
  AcceptanceCriterion,
  AcceptanceCriterionInput,
  CriterionStatus,
  TaskIteration,
  TaskVerificationResult,
  VerificationTemplate
} from '../../shared/types'

export function registerVerificationHandlers(): void {
  // =====================
  // Acceptance Criteria
  // =====================

  safeHandle('db:verification:getCriteria', (_event, taskId: string): AcceptanceCriterion[] => {
    return databaseService.verification.getCriteriaForTask(taskId)
  })

  safeHandle('db:verification:getCriterion', (_event, id: string): AcceptanceCriterion | null => {
    return databaseService.verification.getCriterion(id)
  })

  safeHandle('db:verification:createCriterion', (
    _event,
    taskId: string,
    input: AcceptanceCriterionInput
  ): AcceptanceCriterion => {
    return databaseService.verification.createCriterion(taskId, input)
  })

  safeHandle('db:verification:updateCriterionStatus', (
    _event,
    id: string,
    status: CriterionStatus,
    output?: string
  ): void => {
    databaseService.verification.updateCriterionStatus(id, status, output)
  })

  safeHandle('db:verification:deleteCriterion', (_event, id: string): void => {
    databaseService.verification.deleteCriterion(id)
  })

  safeHandle('db:verification:deleteCriteriaForTask', (_event, taskId: string): void => {
    databaseService.verification.deleteCriteriaForTask(taskId)
  })

  safeHandle('db:verification:getCriteriaCounts', (_event, taskId: string): {
    pending: number
    pass: number
    fail: number
    total: number
  } => {
    return databaseService.verification.getCriteriaCounts(taskId)
  })

  // =====================
  // Task Iterations
  // =====================

  safeHandle('db:verification:getIterations', (_event, taskId: string): TaskIteration[] => {
    return databaseService.verification.getIterationsForTask(taskId)
  })

  safeHandle('db:verification:getIteration', (_event, id: string): TaskIteration | null => {
    return databaseService.verification.getIteration(id)
  })

  safeHandle('db:verification:getCurrentIterationNumber', (_event, taskId: string): number => {
    return databaseService.verification.getCurrentIterationNumber(taskId)
  })

  safeHandle('db:verification:createIteration', (_event, taskId: string): TaskIteration => {
    return databaseService.verification.createIteration(taskId)
  })

  safeHandle('db:verification:completeIteration', (
    _event,
    id: string,
    status: 'completed' | 'failed',
    durationMs: number,
    filesChanged?: Array<{ file_path: string; lines_added: number; lines_removed: number }>,
    verificationResult?: TaskVerificationResult
  ): void => {
    databaseService.verification.completeIteration(id, status, durationMs, filesChanged, verificationResult)
  })

  safeHandle('db:verification:getIterationStats', (_event, taskId: string): {
    totalIterations: number
    completedIterations: number
    failedIterations: number
    averageDurationMs: number
  } => {
    return databaseService.verification.getIterationStats(taskId)
  })

  // =====================
  // Verification Templates
  // =====================

  safeHandle('db:verification:getAllTemplates', (): VerificationTemplate[] => {
    return databaseService.verification.getAllTemplates()
  })

  safeHandle('db:verification:getTemplate', (_event, id: string): VerificationTemplate | null => {
    return databaseService.verification.getTemplate(id)
  })

  safeHandle('db:verification:getTemplateByName', (_event, name: string): VerificationTemplate | null => {
    return databaseService.verification.getTemplateByName(name)
  })

  safeHandle('db:verification:createTemplate', (
    _event,
    name: string,
    criteria: AcceptanceCriterionInput[]
  ): VerificationTemplate => {
    return databaseService.verification.createTemplate(name, criteria)
  })

  safeHandle('db:verification:deleteTemplate', (_event, id: string): void => {
    databaseService.verification.deleteTemplate(id)
  })

  safeHandle('db:verification:applyTemplate', (
    _event,
    taskId: string,
    templateId: string
  ): AcceptanceCriterion[] => {
    return databaseService.verification.applyTemplateToTask(taskId, templateId)
  })

  // =====================
  // Verification Execution
  // =====================

  safeHandle('verification:runTask', async (
    _event,
    taskId: string,
    workingDir: string
  ): Promise<TaskVerificationResult> => {
    return verifyTask(taskId, workingDir)
  })

  safeHandle('verification:markManual', async (
    _event,
    criterionId: string,
    passed: boolean,
    notes?: string
  ): Promise<AcceptanceCriterion | null> => {
    return verifyManualCriterion(criterionId, passed, notes)
  })

  safeHandle('verification:getSummary', (_event, taskId: string): {
    total: number
    passed: number
    failed: number
    pending: number
    manualPending: number
    allAutoPassed: boolean
    allPassed: boolean
  } => {
    return getVerificationSummary(taskId)
  })

  // =====================
  // Iteration Analytics (PRD Section 16)
  // =====================

  safeHandle('db:verification:getAverageIterationsToSuccess', (_event, projectId: string): number => {
    return databaseService.verification.getAverageIterationsToSuccess(projectId)
  })

  safeHandle('db:verification:getCommonFailurePatterns', (_event, projectId: string): Array<{
    pattern: string
    frequency: number
    suggested_fix: string
  }> => {
    return databaseService.verification.getCommonFailurePatterns(projectId)
  })

  safeHandle('db:verification:getSuggestedCriteria', (
    _event,
    taskDescription: string,
    projectId?: string
  ): AcceptanceCriterionInput[] => {
    return databaseService.verification.getSuggestedCriteria(taskDescription, projectId)
  })

  safeHandle('db:verification:recordSuccessfulPattern', (
    _event,
    taskId: string,
    pattern: string
  ): void => {
    databaseService.verification.recordSuccessfulPattern(taskId, pattern)
  })

  safeHandle('db:verification:getIterationAnalytics', (_event, taskId: string): {
    task_id: string
    total_iterations: number
    average_iteration_duration_ms: number
    success_rate: number
    common_failure_patterns: Array<{ pattern: string; frequency: number; suggested_fix: string }>
  } => {
    return databaseService.verification.getIterationAnalytics(taskId)
  })

  // =====================
  // Auto-Iteration Control (PRD Section 16)
  // =====================

  safeHandle('autoIterate:cancel', (_event, taskId: string): boolean => {
    return cancelAutoIteration(taskId)
  })

  safeHandle('autoIterate:isActive', (_event, taskId: string): boolean => {
    return isAutoIterating(taskId)
  })
}
