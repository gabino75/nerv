/**
 * Hook management for NERV
 * Handles nerv-hook binary setup and Claude Code hook configuration
 */

import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { platform, arch } from 'os'

// ============================================================================
// Types
// ============================================================================

export interface HookConfig {
  hooks: {
    PreToolUse?: HookEntry[]
    PostToolUse?: HookEntry[]
    Stop?: HookEntry[]
  }
  permissions: {
    allow: string[]
    deny: string[]
  }
}

interface HookEntry {
  matcher?: string
  hooks: HookDefinition[]
}

interface HookDefinition {
  type: 'command'
  command: string
}

export interface PermissionConfig {
  allow: string[]
  deny: string[]
}

// ============================================================================
// Paths
// ============================================================================

function getNervDir(): string {
  return join(app.getPath('home'), '.nerv')
}

function getBinDir(): string {
  return join(getNervDir(), 'bin')
}

function getHookBinaryName(): string {
  const plat = platform()
  const a = arch()

  if (plat === 'win32') {
    return 'nerv-hook-win-x64.exe'
  } else if (plat === 'darwin') {
    return a === 'arm64' ? 'nerv-hook-darwin-arm64' : 'nerv-hook-darwin-x64'
  } else {
    return a === 'arm64' ? 'nerv-hook-linux-arm64' : 'nerv-hook-linux-x64'
  }
}

function getHookBinaryPath(): string {
  return join(getBinDir(), platform() === 'win32' ? 'nerv-hook.exe' : 'nerv-hook')
}

function getResourcePath(): string {
  // In development, resources are in the project root
  // In production, they're in app.getPath('userData')/../resources
  const isDev = !app.isPackaged

  if (isDev) {
    return join(app.getAppPath(), 'resources', 'hooks')
  } else {
    return join(process.resourcesPath, 'hooks')
  }
}

// ============================================================================
// Binary Installation
// ============================================================================

/**
 * Ensures the nerv-hook binary is installed and executable
 */
export function ensureHookBinary(): string {
  const binDir = getBinDir()
  const hookPath = getHookBinaryPath()

  // Create bin directory if needed
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Check if binary already exists
  if (existsSync(hookPath)) {
    return hookPath
  }

  // Find source binary
  const sourceBinary = join(getResourcePath(), getHookBinaryName())

  if (!existsSync(sourceBinary)) {
    console.warn(`Hook binary not found: ${sourceBinary}`)
    // Try development fallback - direct build output
    const devPath = join(app.getAppPath(), 'resources', 'nerv-hook.exe')
    if (existsSync(devPath)) {
      copyFileSync(devPath, hookPath)
    } else {
      throw new Error(`nerv-hook binary not found. Run 'npm run build:hooks' first.`)
    }
  } else {
    copyFileSync(sourceBinary, hookPath)
  }

  // Make executable on Unix
  if (platform() !== 'win32') {
    chmodSync(hookPath, 0o755)
  }

  console.log(`Installed nerv-hook binary to: ${hookPath}`)
  return hookPath
}

// ============================================================================
// Hook Configuration Generation
// ============================================================================

/**
 * Default permission rules per PRD
 */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
  allow: [
    'Read',
    'Grep',
    'Glob',
    'LS',
    'Bash(npm test:*)',
    'Bash(npm run:*)',
    'Bash(git log:*)',
    'Bash(git diff:*)',
    'Bash(git status)',
  ],
  deny: [
    // Critical system protection (PRD Section 7)
    'Bash(rm -rf /)',
    'Bash(rm -rf /*)',
    'Bash(sudo:*)',
    'Read(~/.ssh/*)',
    // Git safety - require explicit approval (PRD Section 25)
    'Bash(git push:*)',
    'Bash(git checkout:*)',
    'Bash(git reset:*)',
    'Bash(git rebase:*)',
    // NERV state protection (PRD Section 22)
    'Read(~/.nerv/*)',
    'Write(~/.nerv/*)',
    'Edit(~/.nerv/*)',
    'Bash(nerv-hook:*)',
    'Bash(*~/.nerv*)',
  ],
}

/**
 * Generates a Claude Code hook configuration for a project
 */
export function generateHookConfig(
  projectId: string,
  taskId: string,
  permissions: PermissionConfig = DEFAULT_PERMISSIONS
): HookConfig {
  const hookPath = getHookBinaryPath()

  // Build environment variable prefix for hook commands
  const envPrefix = platform() === 'win32'
    ? `set NERV_PROJECT_ID=${projectId} && set NERV_TASK_ID=${taskId} && `
    : `NERV_PROJECT_ID=${projectId} NERV_TASK_ID=${taskId} `

  return {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `${envPrefix}"${hookPath}" pre-tool-use`,
            },
          ],
        },
        {
          matcher: 'Write|Edit',
          hooks: [
            {
              type: 'command',
              command: `${envPrefix}"${hookPath}" pre-tool-use`,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [
            {
              type: 'command',
              command: `${envPrefix}"${hookPath}" post-tool-use`,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: `${envPrefix}"${hookPath}" stop`,
            },
          ],
        },
      ],
    },
    permissions,
  }
}

/**
 * Writes hook configuration to a project's .claude directory
 */
export function writeProjectHookConfig(
  projectPath: string,
  projectId: string,
  taskId: string,
  permissions?: PermissionConfig
): string {
  const claudeDir = join(projectPath, '.claude')

  // Create .claude directory if needed
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }

  const settingsPath = join(claudeDir, 'settings.json')
  const config = generateHookConfig(projectId, taskId, permissions)

  // Read existing settings if present
  let existingSettings = {}
  if (existsSync(settingsPath)) {
    try {
      existingSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Ignore parse errors
    }
  }

  // Merge with existing settings
  const mergedSettings = {
    ...existingSettings,
    hooks: config.hooks,
    permissions: config.permissions,
  }

  writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2))
  console.log(`Wrote hook config to: ${settingsPath}`)

  return settingsPath
}

// ============================================================================
// Permission Management
// ============================================================================

/**
 * Loads global permission configuration
 */
export function loadGlobalPermissions(): PermissionConfig {
  const permPath = join(getNervDir(), 'permissions.json')

  if (!existsSync(permPath)) {
    return DEFAULT_PERMISSIONS
  }

  try {
    const data = readFileSync(permPath, 'utf-8')
    const perms = JSON.parse(data) as PermissionConfig
    return {
      allow: perms.allow || DEFAULT_PERMISSIONS.allow,
      deny: perms.deny || DEFAULT_PERMISSIONS.deny,
    }
  } catch {
    return DEFAULT_PERMISSIONS
  }
}

/**
 * Saves global permission configuration
 */
export function saveGlobalPermissions(permissions: PermissionConfig): void {
  const nervDir = getNervDir()

  if (!existsSync(nervDir)) {
    mkdirSync(nervDir, { recursive: true })
  }

  const permPath = join(nervDir, 'permissions.json')
  writeFileSync(permPath, JSON.stringify(permissions, null, 2))
  console.log(`Saved permissions to: ${permPath}`)
}

/**
 * Adds a new allow rule to global permissions
 */
export function addAllowRule(pattern: string): void {
  const perms = loadGlobalPermissions()
  if (!perms.allow.includes(pattern)) {
    perms.allow.push(pattern)
    saveGlobalPermissions(perms)
  }
}

/**
 * Adds a new deny rule to global permissions
 */
export function addDenyRule(pattern: string): void {
  const perms = loadGlobalPermissions()
  if (!perms.deny.includes(pattern)) {
    perms.deny.push(pattern)
    saveGlobalPermissions(perms)
  }
}

/**
 * Removes an allow rule from global permissions
 */
export function removeAllowRule(pattern: string): void {
  const perms = loadGlobalPermissions()
  perms.allow = perms.allow.filter((r) => r !== pattern)
  saveGlobalPermissions(perms)
}

/**
 * Removes a deny rule from global permissions
 */
export function removeDenyRule(pattern: string): void {
  const perms = loadGlobalPermissions()
  perms.deny = perms.deny.filter((r) => r !== pattern)
  saveGlobalPermissions(perms)
}

// ============================================================================
// Pattern Generation
// ============================================================================

// Helper: Generate Bash command patterns
// PRD Section 8 example:
//   Input: rm -rf ./build
//   Output: "Bash(rm -rf ./build)", "Bash(rm -rf ./build/*)", "Bash(rm:./build/*)"
function generateBashPatterns(command: string): string[] {
  const patterns: string[] = [`Bash(${command})`]
  const parts = command.trim().split(/\s+/)
  if (parts.length === 0) return patterns

  const cmdName = parts[0]

  // Find the last path-like argument (starts with ./ or / or contains /)
  const pathArg = parts.slice(1).find((p) => p.startsWith('./') || p.startsWith('/') || p.includes('/'))

  if (pathArg) {
    // Pattern: command with wildcard on path (e.g., "Bash(rm -rf ./build/*)")
    patterns.push(`Bash(${command}${command.endsWith(pathArg) ? '/*' : ''})`)
    // Pattern: cmdName with path wildcard (e.g., "Bash(rm:./build/*)")
    patterns.push(`Bash(${cmdName}:${pathArg}${pathArg.endsWith('*') ? '' : '/*'})`)
  }

  // For package managers and git, suggest more specific patterns
  const isPackageManager = cmdName === 'npm' || cmdName === 'yarn' || cmdName === 'pnpm'
  if ((isPackageManager || cmdName === 'git') && parts.length > 1) {
    patterns.push(`Bash(${cmdName} ${parts[1]}:*)`)
  }

  // Broadest pattern: command name with full wildcard
  patterns.push(`Bash(${cmdName}:*)`)

  return patterns
}

// Helper: Generate file tool patterns
function generateFilePatterns(toolName: string, filePath: string): string[] {
  const patterns: string[] = [`${toolName}(${filePath})`]
  const dir = dirname(filePath)
  if (dir && dir !== '.') {
    patterns.push(`${toolName}(${dir}/*)`)
  }
  return patterns
}

/**
 * Generates permission pattern suggestions for a tool use
 */
export function generatePatternSuggestions(
  toolName: string,
  toolInput: Record<string, unknown>
): string[] {
  if (toolName === 'Bash') {
    const command = toolInput.command as string | undefined
    return command ? generateBashPatterns(command) : []
  }

  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    const filePath = toolInput.file_path as string | undefined
    return filePath ? generateFilePatterns(toolName, filePath) : []
  }

  return [toolName]
}
