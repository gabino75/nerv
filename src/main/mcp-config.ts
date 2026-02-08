/**
 * MCP Configuration Management
 *
 * Generates mcp-config.json files for Claude Code sessions with
 * NERV context, progress tracking, and documentation sources.
 *
 * Three MCP servers are provided:
 * - nerv-context: Read-only access to project/task/cycle info
 * - nerv-progress: Write access to update status, record learnings/decisions
 * - nerv-docs: Scoped documentation search
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'

// MCP server configuration structure
interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

// Get the path to an MCP server
function getMcpServerPath(serverName: string): string {
  // In development, use the source path
  // In production, use the bundled path in resources
  const isDev = !app.isPackaged

  if (isDev) {
    // Development: use the src path directly (requires npm install in that directory)
    return path.join(__dirname, '..', 'mcp', serverName, 'dist', 'index.js')
  } else {
    // Production: use bundled MCP server in resources
    return path.join(process.resourcesPath, 'mcp', serverName, 'index.js')
  }
}

// Legacy function for backwards compatibility
function getNervDocsPath(): string {
  return getMcpServerPath('nerv-docs')
}

// Get the NERV projects directory
function getNervProjectsDir(): string {
  return path.join(os.homedir(), '.nerv', 'projects')
}

/**
 * Generate MCP configuration for a project
 *
 * @param projectId - The project ID
 * @param allowedDomains - List of allowed documentation domains
 * @param taskId - Optional task ID for task-specific context
 * @returns Path to the generated mcp-config.json
 */
export function generateMCPConfig(projectId: string, allowedDomains: string[], taskId?: string): string {
  const projectDir = path.join(getNervProjectsDir(), projectId)
  const configPath = path.join(projectDir, 'mcp-config.json')

  // Ensure project directory exists
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true })
  }

  const config: MCPConfig = {
    mcpServers: {
      // nerv-context: Read-only access to project/task/cycle info
      'nerv-context': {
        command: 'node',
        args: [getMcpServerPath('nerv-context')],
        env: {
          NERV_PROJECT_ID: projectId,
          ...(taskId ? { NERV_TASK_ID: taskId } : {})
        }
      },
      // nerv-progress: Write access to update status, record learnings/decisions
      'nerv-progress': {
        command: 'node',
        args: [getMcpServerPath('nerv-progress')],
        env: {
          NERV_PROJECT_ID: projectId,
          ...(taskId ? { NERV_TASK_ID: taskId } : {})
        }
      },
      // nerv-docs: Scoped documentation search
      'nerv-docs': {
        command: 'node',
        args: [getMcpServerPath('nerv-docs')],
        env: {
          NERV_PROJECT_ID: projectId,
          NERV_ALLOWED_DOMAINS: allowedDomains.join(',')
        }
      }
    }
  }

  // Write the config file
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

  console.log(`[NERV] Generated MCP config at: ${configPath}`)
  console.log(`[NERV] Project ID: ${projectId}`)
  console.log(`[NERV] Task ID: ${taskId || '(none)'}`)
  console.log(`[NERV] Allowed domains: ${allowedDomains.join(', ') || '(none)'}`)

  return configPath
}

/**
 * Get the MCP config path for a project (if it exists)
 *
 * @param projectId - The project ID
 * @returns Path to mcp-config.json or null if not found
 */
export function getMCPConfigPath(projectId: string): string | null {
  const configPath = path.join(getNervProjectsDir(), projectId, 'mcp-config.json')

  if (fs.existsSync(configPath)) {
    return configPath
  }

  return null
}

/**
 * Delete MCP config for a project
 *
 * @param projectId - The project ID
 */
export function deleteMCPConfig(projectId: string): void {
  const configPath = path.join(getNervProjectsDir(), projectId, 'mcp-config.json')

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
    console.log(`[NERV] Deleted MCP config: ${configPath}`)
  }
}

/**
 * Read MCP config for a project
 *
 * @param projectId - The project ID
 * @returns The MCP config or null if not found
 */
export function readMCPConfig(projectId: string): MCPConfig | null {
  const configPath = getMCPConfigPath(projectId)

  if (!configPath) {
    return null
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as MCPConfig
  } catch (error) {
    console.error(`[NERV] Failed to read MCP config:`, error)
    return null
  }
}

/**
 * Update allowed domains in an existing MCP config
 *
 * @param projectId - The project ID
 * @param allowedDomains - New list of allowed domains
 * @returns Updated config path or null on failure
 */
export function updateMCPConfigDomains(
  projectId: string,
  allowedDomains: string[]
): string | null {
  const config = readMCPConfig(projectId)

  if (!config) {
    // Create new config if doesn't exist
    return generateMCPConfig(projectId, allowedDomains)
  }

  // Update the environment variable
  if (config.mcpServers['nerv-docs']?.env) {
    config.mcpServers['nerv-docs'].env.NERV_ALLOWED_DOMAINS = allowedDomains.join(',')
  }

  const configPath = path.join(getNervProjectsDir(), projectId, 'mcp-config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

  console.log(`[NERV] Updated MCP config domains: ${allowedDomains.join(', ') || '(none)'}`)

  return configPath
}
