/**
 * User Statements IPC Handlers (PRD Section 2)
 *
 * Handles all user statement related IPC messages for spec drift detection.
 */

import { databaseService } from '../database'
import type { UserStatementSource } from '../../shared/types'
import { safeHandle } from './safe-handle'

export function registerUserStatementsHandlers(): void {
  // Get all user statements for a project
  safeHandle('db:userStatements:getForProject', (_event, projectId: string) => {
    return databaseService.getUserStatementsForProject(projectId)
  })

  // Get unaddressed user statements for a project (for spec drift detection)
  safeHandle('db:userStatements:getUnaddressed', (_event, projectId: string) => {
    return databaseService.getUnaddressedUserStatements(projectId)
  })

  // Get a single user statement
  safeHandle('db:userStatements:get', (_event, id: string) => {
    return databaseService.getUserStatement(id)
  })

  // Create a new user statement
  safeHandle('db:userStatements:create', (_event, projectId: string, text: string, source: UserStatementSource) => {
    return databaseService.createUserStatement(projectId, text, source)
  })

  // Mark a statement as addressed (linked to spec)
  safeHandle('db:userStatements:markAddressed', (_event, id: string, specReference: string) => {
    databaseService.markUserStatementAddressed(id, specReference)
    return { success: true }
  })

  // Mark a statement as unaddressed
  safeHandle('db:userStatements:markUnaddressed', (_event, id: string) => {
    databaseService.markUserStatementUnaddressed(id)
    return { success: true }
  })

  // Delete a user statement
  safeHandle('db:userStatements:delete', (_event, id: string) => {
    databaseService.deleteUserStatement(id)
    return { success: true }
  })

  // Get statement statistics for a project
  safeHandle('db:userStatements:getStats', (_event, projectId: string) => {
    return databaseService.getUserStatementStats(projectId)
  })
}
