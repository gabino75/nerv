/**
 * Spec Proposal IPC Handlers (PRD Section 5, lines 896-924)
 *
 * Handles spec update proposals from Claude MCP sessions.
 * Users can approve, edit & approve, or reject proposals.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import type { SpecProposalStatus } from '../../shared/types'

export function registerSpecProposalHandlers(): void {
  // Get pending spec proposals for a project
  safeHandle('spec-proposals:getPending', (_event, projectId?: string) => {
    return databaseService.getPendingSpecProposals(projectId)
  })

  // Get all spec proposals (including resolved) for a project
  safeHandle('spec-proposals:getAll', (_event, projectId?: string) => {
    return databaseService.getAllSpecProposals(projectId)
  })

  // Resolve a spec proposal (approve, edit & approve, or reject)
  safeHandle('spec-proposals:resolve', (
    _event,
    id: number,
    status: SpecProposalStatus,
    notes?: string,
    editedContent?: string
  ) => {
    return databaseService.resolveSpecProposal(id, status, notes, editedContent)
  })
}
