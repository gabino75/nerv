import type { SpecProposal, SpecProposalStatus } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Spec Proposal database operations (PRD Section 5, lines 896-924)
 *
 * Spec proposals are stored in the audit_log table with event_type = 'spec_update_proposed'
 * This module provides operations to query and resolve them.
 */
export class SpecProposalOperations {
  constructor(
    private getDb: () => Database.Database,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  /**
   * Get all pending spec proposals for a project
   */
  getPendingProposals(projectId?: string): SpecProposal[] {
    const entries = this.getDb().prepare(`
      SELECT id, timestamp, details
      FROM audit_log
      WHERE event_type = 'spec_update_proposed'
      ORDER BY timestamp DESC
    `).all() as Array<{ id: number; timestamp: string; details: string | null }>

    const proposals: SpecProposal[] = []
    for (const entry of entries) {
      if (!entry.details) continue

      try {
        const details = JSON.parse(entry.details) as {
          projectId: string
          section: string
          content: string
          status?: SpecProposalStatus
          resolved_at?: string
          resolution_notes?: string
        }

        // Filter by projectId if provided
        if (projectId && details.projectId !== projectId) continue

        // Only include pending proposals (status not set or explicitly pending)
        if (details.status && details.status !== 'pending') continue

        proposals.push({
          id: entry.id,
          timestamp: entry.timestamp,
          project_id: details.projectId,
          section: details.section,
          content: details.content,
          status: details.status || 'pending',
          resolved_at: details.resolved_at || null,
          resolution_notes: details.resolution_notes || null
        })
      } catch {
        // Skip entries with invalid JSON
        continue
      }
    }

    return proposals
  }

  /**
   * Get all spec proposals (including resolved ones)
   */
  getAllProposals(projectId?: string): SpecProposal[] {
    const entries = this.getDb().prepare(`
      SELECT id, timestamp, details
      FROM audit_log
      WHERE event_type = 'spec_update_proposed'
      ORDER BY timestamp DESC
    `).all() as Array<{ id: number; timestamp: string; details: string | null }>

    const proposals: SpecProposal[] = []
    for (const entry of entries) {
      if (!entry.details) continue

      try {
        const details = JSON.parse(entry.details) as {
          projectId: string
          section: string
          content: string
          status?: SpecProposalStatus
          resolved_at?: string
          resolution_notes?: string
        }

        // Filter by projectId if provided
        if (projectId && details.projectId !== projectId) continue

        proposals.push({
          id: entry.id,
          timestamp: entry.timestamp,
          project_id: details.projectId,
          section: details.section,
          content: details.content,
          status: details.status || 'pending',
          resolved_at: details.resolved_at || null,
          resolution_notes: details.resolution_notes || null
        })
      } catch {
        // Skip entries with invalid JSON
        continue
      }
    }

    return proposals
  }

  /**
   * Resolve a spec proposal (approve, edit & approve, or reject)
   */
  resolveProposal(
    id: number,
    status: SpecProposalStatus,
    notes?: string,
    editedContent?: string
  ): SpecProposal | undefined {
    // Get the existing entry
    const entry = this.getDb().prepare(
      'SELECT id, timestamp, details FROM audit_log WHERE id = ?'
    ).get(id) as { id: number; timestamp: string; details: string | null } | undefined

    if (!entry || !entry.details) return undefined

    try {
      const details = JSON.parse(entry.details) as {
        projectId: string
        section: string
        content: string
        status?: SpecProposalStatus
        resolved_at?: string
        resolution_notes?: string
      }

      // Update the details with resolution info
      const resolvedAt = new Date().toISOString()
      const updatedDetails = {
        ...details,
        status,
        resolved_at: resolvedAt,
        resolution_notes: notes || null,
        content: editedContent || details.content // Use edited content if provided
      }

      // Update the audit_log entry
      this.getDb().prepare(
        'UPDATE audit_log SET details = ? WHERE id = ?'
      ).run(JSON.stringify(updatedDetails), id)

      // Log the resolution
      this.logAuditEvent(null, 'spec_proposal_resolved', JSON.stringify({
        proposalId: id,
        section: details.section,
        status,
        notes
      }))

      return {
        id: entry.id,
        timestamp: entry.timestamp,
        project_id: details.projectId,
        section: updatedDetails.section,
        content: updatedDetails.content,
        status,
        resolved_at: resolvedAt,
        resolution_notes: notes || null
      }
    } catch {
      return undefined
    }
  }
}
