/**
 * IPC Handlers - Main Entry Point
 *
 * Registers all IPC handlers for communication between renderer and main process.
 * Handlers are split by domain for maintainability.
 */

import { registerProjectHandlers } from './project-handlers'
import { registerTaskHandlers } from './task-handlers'
import { registerCycleHandlers } from './cycle-handlers'
import { registerApprovalHandlers } from './approval-handlers'
import { registerRepoHandlers } from './repo-handlers'
import { registerMetricsHandlers } from './metrics-handlers'
import { registerDecisionHandlers } from './decision-handlers'
import { registerBranchHandlers } from './branch-handlers'
import { registerAuditHandlers } from './audit-handlers'
import { registerNervMdHandlers } from './nerv-md-handlers'
import { registerHooksHandlers } from './hooks-handlers'
import { registerClaudeMdHandlers } from './claude-md-handlers'
import { registerMCPHandlers } from './mcp-handlers'
import { registerSubagentHandlers } from './subagent-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerDialogHandlers } from './dialog-handlers'
import { registerReviewHandlers } from './review-handlers'
import { registerFindingsHandlers } from './findings-handlers'
import { registerSkillsHandlers } from './skills-handlers'
import { registerOrgHandlers } from './org-handlers'
import { registerInstanceHandlers } from './instance-handlers'
import { registerVerificationHandlers } from './verification-handlers'
import { registerSuccessMetricsHandlers } from './success-metrics-handlers'
import { registerCrashReporterHandlers } from './crash-reporter-handlers'
import { registerUserStatementsHandlers } from './user-statements-handlers'
import { registerSpecProposalHandlers } from './spec-proposal-handlers'
import { registerRecommendHandlers } from './recommend-handlers'

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 */
export function registerIpcHandlers(): void {
  // Database entity handlers
  registerProjectHandlers()
  registerTaskHandlers()
  registerCycleHandlers()
  registerApprovalHandlers()
  registerRepoHandlers()
  registerMetricsHandlers()
  registerDecisionHandlers()
  registerBranchHandlers()
  registerAuditHandlers()
  registerSubagentHandlers()
  registerSettingsHandlers()
  registerReviewHandlers()
  registerFindingsHandlers()
  registerSkillsHandlers()

  // Feature handlers
  registerNervMdHandlers()
  registerHooksHandlers()
  registerClaudeMdHandlers()
  registerMCPHandlers()
  registerDialogHandlers()
  registerOrgHandlers()
  registerInstanceHandlers()
  registerVerificationHandlers()
  registerSuccessMetricsHandlers()
  registerCrashReporterHandlers()
  registerUserStatementsHandlers()
  registerSpecProposalHandlers()
  registerRecommendHandlers()
}
