/**
 * Organization Configuration Service for NERV
 *
 * Implements PRD Section 20: Organization Configuration
 *
 * Enables companies to set up central configuration repositories
 * that NERV syncs automatically for consistent settings, agents,
 * workflows, and permissions across all team members.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { execSync, spawnSync } from 'child_process'
import { homedir } from 'os'
import type {
  OrgConfigSource,
  OrgSyncStatus,
  OrganizationSettings,
  OrganizationConfig
} from '../shared/types/settings.js'
import { ORG_CONFIG } from '../shared/constants.js'
import { getSettingsService } from './settings.js'

/**
 * Get the NERV home directory
 */
function getNervHomeDir(): string {
  return join(homedir(), '.nerv')
}

/**
 * Get the organization config cache directory
 */
function getOrgCacheDir(): string {
  const settings = getSettingsService()
  const customPath = settings.get('org_cache_path')
  if (customPath) {
    return customPath
  }
  return join(getNervHomeDir(), ORG_CONFIG.defaultCacheDir)
}

/**
 * Get the sync status file path
 */
function getSyncStatusPath(): string {
  return join(getNervHomeDir(), ORG_CONFIG.syncStatusFile)
}

/**
 * Read sync status from file
 */
function readSyncStatus(): OrgSyncStatus {
  const statusPath = getSyncStatusPath()
  const defaultStatus: OrgSyncStatus = {
    configured: false,
    lastSyncTime: null,
    lastSyncSuccess: false,
    lastSyncError: null,
    localCachePath: null,
    configSource: null
  }

  try {
    if (!existsSync(statusPath)) {
      return defaultStatus
    }
    const content = readFileSync(statusPath, 'utf-8')
    return { ...defaultStatus, ...JSON.parse(content) }
  } catch {
    return defaultStatus
  }
}

/**
 * Write sync status to file
 */
function writeSyncStatus(status: OrgSyncStatus): void {
  const statusPath = getSyncStatusPath()
  const dir = dirname(statusPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf-8')
}

/**
 * Get organization configuration from settings
 */
export function getOrgConfig(): OrganizationConfig | null {
  const settings = getSettingsService()

  const name = settings.get('org_name')
  const sourceType = settings.get('org_config_source_type')

  if (!name || !sourceType) {
    return null
  }

  const configSource: OrgConfigSource = {
    type: sourceType,
    url: settings.get('org_config_url') ?? undefined,
    branch: settings.get('org_config_branch') ?? undefined,
    authMethod: settings.get('org_config_auth_method') ?? undefined
  }

  // For local type, url is the path
  if (sourceType === 'local') {
    configSource.path = settings.get('org_config_url') ?? undefined
  }

  return {
    name,
    configSource,
    autoSync: {
      enabled: settings.get('org_auto_sync_enabled'),
      intervalMinutes: settings.get('org_auto_sync_interval_minutes'),
      onAppStart: settings.get('org_auto_sync_on_app_start'),
      onProjectOpen: settings.get('org_auto_sync_on_project_open')
    },
    localCache: getOrgCacheDir()
  }
}

/**
 * Check if organization configuration is set up
 */
export function isOrgConfigured(): boolean {
  const config = getOrgConfig()
  return config !== null && config.configSource.type !== null
}

/**
 * Get the current sync status
 */
export function getOrgSyncStatus(): OrgSyncStatus {
  const config = getOrgConfig()
  const status = readSyncStatus()

  if (!config) {
    return {
      configured: false,
      lastSyncTime: null,
      lastSyncSuccess: false,
      lastSyncError: null,
      localCachePath: null,
      configSource: null
    }
  }

  return {
    ...status,
    configured: true,
    localCachePath: config.localCache,
    configSource: config.configSource
  }
}

/**
 * Sync organization configuration from git repository
 */
async function syncFromGit(config: OrganizationConfig): Promise<{ success: boolean; error?: string }> {
  const cacheDir = config.localCache
  const source = config.configSource

  if (!source.url) {
    return { success: false, error: 'Git URL not configured' }
  }

  try {
    // Ensure cache directory exists
    if (!existsSync(dirname(cacheDir))) {
      mkdirSync(dirname(cacheDir), { recursive: true })
    }

    // Check if repo already cloned
    const gitDir = join(cacheDir, '.git')
    if (existsSync(gitDir)) {
      // Pull latest changes
      const branch = source.branch || 'main'
      const result = spawnSync('git', ['pull', 'origin', branch], {
        cwd: cacheDir,
        encoding: 'utf-8',
        timeout: 60000 // 60 second timeout
      })

      if (result.status !== 0) {
        return {
          success: false,
          error: `Git pull failed: ${result.stderr || result.stdout}`
        }
      }
    } else {
      // Clone repository
      const args = ['clone', '--depth', '1']
      if (source.branch) {
        args.push('--branch', source.branch)
      }
      args.push(source.url, cacheDir)

      const result = spawnSync('git', args, {
        encoding: 'utf-8',
        timeout: 120000 // 2 minute timeout for clone
      })

      if (result.status !== 0) {
        return {
          success: false,
          error: `Git clone failed: ${result.stderr || result.stdout}`
        }
      }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Sync organization configuration from local path
 */
async function syncFromLocal(config: OrganizationConfig): Promise<{ success: boolean; error?: string }> {
  const source = config.configSource
  const sourcePath = source.path || source.url

  if (!sourcePath) {
    return { success: false, error: 'Local path not configured' }
  }

  if (!existsSync(sourcePath)) {
    return { success: false, error: `Local path does not exist: ${sourcePath}` }
  }

  // For local config, we just verify the path exists
  // The cache path IS the source path
  return { success: true }
}

/**
 * Sync organization configuration
 * Returns success status and any error message
 */
export async function syncOrgConfig(): Promise<{ success: boolean; error?: string }> {
  const config = getOrgConfig()

  if (!config) {
    return { success: false, error: 'Organization not configured' }
  }

  let result: { success: boolean; error?: string }

  if (config.configSource.type === 'git') {
    result = await syncFromGit(config)
  } else if (config.configSource.type === 'local') {
    result = await syncFromLocal(config)
  } else {
    result = { success: false, error: 'Invalid config source type' }
  }

  // Update sync status
  const status: OrgSyncStatus = {
    configured: true,
    lastSyncTime: new Date().toISOString(),
    lastSyncSuccess: result.success,
    lastSyncError: result.error || null,
    localCachePath: config.localCache,
    configSource: config.configSource
  }
  writeSyncStatus(status)

  // Invalidate settings cache so org changes take effect immediately
  if (result.success) {
    const settings = getSettingsService()
    settings.reload()
  }

  return result
}

/**
 * Get the effective org config path (cache for git, direct path for local)
 */
function getEffectiveOrgConfigPath(): string | null {
  const config = getOrgConfig()
  if (!config) return null

  if (config.configSource.type === 'local') {
    return config.configSource.path || config.configSource.url || null
  }

  return config.localCache
}

/**
 * Load organization settings from the synced config
 */
export function loadOrgSettings(): OrganizationSettings | null {
  const configPath = getEffectiveOrgConfigPath()
  if (!configPath) return null

  const settingsPath = join(configPath, ORG_CONFIG.settingsFile)

  try {
    if (!existsSync(settingsPath)) {
      return null
    }
    const content = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as OrganizationSettings
  } catch {
    return null
  }
}

/**
 * List available org agents
 */
export function listOrgAgents(): string[] {
  const configPath = getEffectiveOrgConfigPath()
  if (!configPath) return []

  const agentsDir = join(configPath, ORG_CONFIG.directories.agents)

  try {
    if (!existsSync(agentsDir)) return []
    return readdirSync(agentsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

/**
 * List available org skills
 */
export function listOrgSkills(): string[] {
  const configPath = getEffectiveOrgConfigPath()
  if (!configPath) return []

  const skillsDir = join(configPath, ORG_CONFIG.directories.skills)

  try {
    if (!existsSync(skillsDir)) return []
    return readdirSync(skillsDir)
      .filter(f => {
        const stat = statSync(join(skillsDir, f))
        return stat.isDirectory() && existsSync(join(skillsDir, f, 'SKILL.md'))
      })
  } catch {
    return []
  }
}

/**
 * List available org workflows
 */
export function listOrgWorkflows(): string[] {
  const configPath = getEffectiveOrgConfigPath()
  if (!configPath) return []

  const workflowsDir = join(configPath, ORG_CONFIG.directories.workflows)

  try {
    if (!existsSync(workflowsDir)) return []
    return readdirSync(workflowsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

/**
 * List available org terminal profiles (PRD Section 21)
 * Profiles can be defined in settings.json or as individual files in terminal-profiles/
 */
export function listOrgTerminalProfiles(): Array<{
  id: string
  name: string
  shell: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  icon?: string
}> {
  const profiles: Array<{
    id: string
    name: string
    shell: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    icon?: string
  }> = []

  // First, check settings.json for inline terminal profiles
  const orgSettings = loadOrgSettings()
  if (orgSettings?.terminalProfiles) {
    profiles.push(...orgSettings.terminalProfiles)
  }

  // Then, check terminal-profiles/ directory for individual profile files
  const configPath = getEffectiveOrgConfigPath()
  if (!configPath) return profiles

  const profilesDir = join(configPath, ORG_CONFIG.directories.terminalProfiles)

  try {
    if (!existsSync(profilesDir)) return profiles
    const files = readdirSync(profilesDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
      try {
        const content = readFileSync(join(profilesDir, file), 'utf-8')
        const profile = JSON.parse(content)
        // Ensure profile has required fields
        if (profile.id && profile.name && profile.shell) {
          // Avoid duplicates (settings.json takes precedence)
          if (!profiles.some(p => p.id === profile.id)) {
            profiles.push(profile)
          }
        }
      } catch {
        // Skip invalid profile files
      }
    }
  } catch {
    // Directory read error
  }

  return profiles
}

/**
 * Display organization config summary
 */
export function getOrgConfigSummary(): string {
  const config = getOrgConfig()
  const status = getOrgSyncStatus()

  if (!config) {
    return 'Organization: Not configured'
  }

  const lines: string[] = [
    `Organization: ${config.name}`,
    `Source: ${config.configSource.type === 'git' ? config.configSource.url : config.configSource.path || 'local'}`,
    `Auto-sync: ${config.autoSync.enabled ? 'Enabled' : 'Disabled'}`,
    `Last sync: ${status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : 'Never'}`,
    `Status: ${status.lastSyncSuccess ? 'OK' : status.lastSyncError || 'Unknown'}`
  ]

  const agents = listOrgAgents()
  const skills = listOrgSkills()
  const workflows = listOrgWorkflows()
  const terminalProfiles = listOrgTerminalProfiles()

  if (agents.length > 0) {
    lines.push(`Agents: ${agents.join(', ')}`)
  }
  if (skills.length > 0) {
    lines.push(`Skills: ${skills.join(', ')}`)
  }
  if (workflows.length > 0) {
    lines.push(`Workflows: ${workflows.join(', ')}`)
  }
  if (terminalProfiles.length > 0) {
    lines.push(`Terminal Profiles: ${terminalProfiles.map(p => p.name).join(', ')}`)
  }

  return lines.join('\n')
}
