/**
 * Approval management commands
 *
 * nerv approvals           - View pending approvals
 * nerv approve <id>        - Approve a request
 * nerv deny <id>           - Deny a request with optional reason
 */

import type { DatabaseService } from '../../core/database.js'
import type { Approval } from '../../shared/types.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

function formatApproval(approval: Approval): void {
  const statusIcon = approval.status === 'pending'
    ? `${colors.yellow}⏳${colors.reset}`
    : approval.status === 'approved'
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`

  console.log(`${statusIcon} ${colors.cyan}[${approval.id}]${colors.reset} ${colors.bold}${approval.tool_name}${colors.reset}`)

  if (approval.tool_input) {
    const input = approval.tool_input.length > 60
      ? approval.tool_input.slice(0, 57) + '...'
      : approval.tool_input
    console.log(`   ${colors.gray}Input: ${input}${colors.reset}`)
  }

  if (approval.context) {
    const context = approval.context.length > 60
      ? approval.context.slice(0, 57) + '...'
      : approval.context
    console.log(`   ${colors.gray}Context: ${context}${colors.reset}`)
  }

  if (approval.deny_reason) {
    console.log(`   ${colors.red}Reason: ${approval.deny_reason}${colors.reset}`)
  }

  console.log(`   ${colors.gray}Created: ${approval.created_at}${colors.reset}`)
  console.log()
}

function findApprovalById(id: string, approvals: Approval[]): Approval | undefined {
  const numericId = parseInt(id, 10)
  if (!isNaN(numericId)) {
    return approvals.find(a => a.id === numericId)
  }
  return undefined
}

/**
 * List approvals (pending by default, or all with --all)
 */
function handleApprovalsList(args: string[], db: DatabaseService): void {
  const showAll = args.includes('--all') || args.includes('-a')
  const approvals = showAll ? db.getAllApprovals() : db.getPendingApprovals()

  if (args.includes('--json')) {
    console.log(JSON.stringify(approvals, null, 2))
    return
  }

  if (approvals.length === 0) {
    if (showAll) {
      console.log(`${colors.gray}No approvals found.${colors.reset}`)
    } else {
      console.log(`${colors.green}✓${colors.reset} No pending approvals.`)
    }
    return
  }

  const title = showAll ? 'All Approvals' : 'Pending Approvals'
  console.log(`\n${colors.bold}${title}${colors.reset} (${approvals.length})\n`)

  for (const approval of approvals) {
    formatApproval(approval)
  }
}

/**
 * Approve a pending request
 */
function handleApprove(args: string[], db: DatabaseService): void {
  if (args.length < 1) {
    console.error(`${colors.red}Error: Approval ID required${colors.reset}`)
    console.log('Usage: nerv approve <id>')
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const id = args[0]
  const pendingApprovals = db.getPendingApprovals()
  const approval = findApprovalById(id, pendingApprovals)

  if (!approval) {
    const allApprovals = db.getAllApprovals()
    const exists = findApprovalById(id, allApprovals)
    if (exists) {
      console.error(`${colors.yellow}Approval ${id} is already resolved (${exists.status})${colors.reset}`)
    } else {
      console.error(`${colors.red}Approval not found: ${id}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const resolved = db.resolveApproval(approval.id, 'approved')
  if (resolved) {
    console.log(`${colors.green}✓${colors.reset} Approved: ${colors.bold}${resolved.tool_name}${colors.reset}`)
    if (resolved.tool_input) {
      console.log(`  ${colors.gray}${resolved.tool_input.slice(0, 60)}${colors.reset}`)
    }
  }
}

/**
 * Deny a pending request
 */
function handleDeny(args: string[], db: DatabaseService): void {
  if (args.length < 1) {
    console.error(`${colors.red}Error: Approval ID required${colors.reset}`)
    console.log('Usage: nerv deny <id> [--reason "reason"]')
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const id = args[0]
  let reason: string | undefined

  const reasonIndex = args.indexOf('--reason')
  if (reasonIndex !== -1 && args[reasonIndex + 1]) {
    reason = args[reasonIndex + 1]
  }

  const pendingApprovals = db.getPendingApprovals()
  const approval = findApprovalById(id, pendingApprovals)

  if (!approval) {
    const allApprovals = db.getAllApprovals()
    const exists = findApprovalById(id, allApprovals)
    if (exists) {
      console.error(`${colors.yellow}Approval ${id} is already resolved (${exists.status})${colors.reset}`)
    } else {
      console.error(`${colors.red}Approval not found: ${id}${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const resolved = db.resolveApproval(approval.id, 'denied', reason)
  if (resolved) {
    console.log(`${colors.red}✗${colors.reset} Denied: ${colors.bold}${resolved.tool_name}${colors.reset}`)
    if (reason) {
      console.log(`  ${colors.gray}Reason: ${reason}${colors.reset}`)
    }
  }
}

/**
 * Main approvals command handler
 */
export async function approvalsCommand(args: string[], db: DatabaseService): Promise<void> {
  handleApprovalsList(args, db)
}

/**
 * Approve command handler
 */
export async function approveCommand(args: string[], db: DatabaseService): Promise<void> {
  handleApprove(args, db)
}

/**
 * Deny command handler
 */
export async function denyCommand(args: string[], db: DatabaseService): Promise<void> {
  handleDeny(args, db)
}
