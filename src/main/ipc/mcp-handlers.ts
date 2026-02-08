/**
 * MCP Config IPC Handlers
 *
 * Handles all MCP configuration related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import {
  generateMCPConfig,
  getMCPConfigPath,
  deleteMCPConfig,
  readMCPConfig,
  updateMCPConfigDomains
} from '../mcp-config'

export function registerMCPHandlers(): void {
  safeHandle('mcp:generateConfig', (_event, projectId: string, allowedDomains: string[], taskId?: string): string => {
    return generateMCPConfig(projectId, allowedDomains, taskId)
  })

  safeHandle('mcp:getConfigPath', (_event, projectId: string): string | null => {
    return getMCPConfigPath(projectId)
  })

  safeHandle('mcp:deleteConfig', (_event, projectId: string): void => {
    deleteMCPConfig(projectId)
  })

  safeHandle('mcp:readConfig', (_event, projectId: string): unknown => {
    return readMCPConfig(projectId)
  })

  safeHandle('mcp:updateDomains', (_event, projectId: string, allowedDomains: string[]): string | null => {
    return updateMCPConfigDomains(projectId, allowedDomains)
  })

  // Helper to generate MCP config from documentation sources
  safeHandle('mcp:generateFromDocSources', (_event, projectId: string, taskId?: string): string | null => {
    const docSources = databaseService.getDocumentationSources(projectId)

    // Extract domains from URL patterns
    const domains = docSources.map(source => {
      // Extract domain from URL pattern (e.g., "docs.aws.amazon.com/cognito/*" -> "docs.aws.amazon.com")
      const pattern = source.url_pattern
      const match = pattern.match(/^(?:https?:\/\/)?([^\/]+)/)
      return match ? match[1] : pattern
    })

    return generateMCPConfig(projectId, domains, taskId)
  })
}
