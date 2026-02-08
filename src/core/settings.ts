/**
 * Settings Service for NERV
 *
 * Implements PRD Section 12: Settings Hierarchy
 *
 * Resolution priority (highest to lowest):
 * 1. Environment variables (NERV_*)
 * 2. Project config (.nerv/config.json or nerv.config.json)
 * 3. Global config (~/.nerv/config.json)
 * 4. Default values
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getNervDir } from './platform.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_ENV_MAPPINGS,
  CONFIG_FILE_NAMES
} from '../shared/constants.js'
import type {
  NervSettings,
  PartialNervSettings,
  SettingsSource,
  ResolvedSetting,
  GlobalConfig,
  ProjectConfig,
  OrganizationSettings,
  RepoSettings,
  TaskSettings
} from '../shared/types/settings.js'

/**
 * Read and parse a JSON config file
 */
function readConfigFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) {
      return null
    }
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    // Invalid JSON or read error - return null
    return null
  }
}

/**
 * Write a config file (creates parent directories if needed)
 */
function writeConfigFile<T>(filePath: string, config: T): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Parse environment variable value to the correct type
 */
function parseEnvValue(
  value: string,
  type: 'string' | 'number' | 'boolean'
): string | number | boolean | null {
  switch (type) {
    case 'string':
      return value
    case 'number': {
      const num = parseFloat(value)
      return isNaN(num) ? null : num
    }
    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1'
    default:
      return null
  }
}

/**
 * Get a setting value from environment variables
 */
function getFromEnv<K extends keyof NervSettings>(key: K): NervSettings[K] | undefined {
  const mapping = SETTINGS_ENV_MAPPINGS.find(m => m.key === key)
  if (!mapping) {
    return undefined
  }

  const envValue = process.env[mapping.envVar]
  if (envValue === undefined) {
    return undefined
  }

  const parsed = parseEnvValue(envValue, mapping.type)
  if (parsed === null) {
    return undefined
  }

  return parsed as NervSettings[K]
}

/**
 * Map OrganizationSettings to PartialNervSettings
 * This converts org settings format to the standard NervSettings format
 */
function mapOrgSettingsToNervSettings(orgSettings: OrganizationSettings): PartialNervSettings {
  const result: PartialNervSettings = {}

  // Map defaults
  if (orgSettings.defaults) {
    if (orgSettings.defaults.model) {
      const modelMap: Record<string, 'sonnet' | 'opus' | 'haiku'> = {
        sonnet: 'sonnet',
        opus: 'opus',
        haiku: 'haiku'
      }
      const model = modelMap[orgSettings.defaults.model]
      if (model) {
        result.default_model = model
      }
    }
    if (orgSettings.defaults.maxTokens !== undefined) {
      result.default_max_tokens = orgSettings.defaults.maxTokens
    }
    if (orgSettings.defaults.auditFrequency !== undefined) {
      result.audit_cycle_frequency = orgSettings.defaults.auditFrequency
    }
  }

  // Map cost limits
  if (orgSettings.costLimits) {
    if (orgSettings.costLimits.perMonthMax !== undefined) {
      result.monthly_budget_usd = orgSettings.costLimits.perMonthMax
    }
    if (orgSettings.costLimits.alertThreshold !== undefined) {
      result.budget_warning_threshold = orgSettings.costLimits.alertThreshold
    }
  }

  return result
}

/**
 * Settings service implementation
 */
export class SettingsServiceImpl {
  private globalConfig: GlobalConfig | null = null
  private projectConfig: ProjectConfig | null = null
  private orgSettings: OrganizationSettings | null = null
  private orgSettingsMapped: PartialNervSettings | null = null
  private projectPath: string | null = null
  // PRD Section 13: Repo-level settings cache (keyed by repo path)
  private repoSettingsCache: Map<string, RepoSettings> = new Map()
  // PRD Section 13: Task-level settings (in-memory, highest priority)
  private taskSettings: TaskSettings | null = null

  constructor(projectPath?: string) {
    this.projectPath = projectPath ?? null
    this.reload()
  }

  /**
   * Get global config file path
   */
  getGlobalConfigPath(): string {
    return join(getNervDir(), CONFIG_FILE_NAMES.global)
  }

  /**
   * Get project config file path (returns first existing, or default location)
   */
  getProjectConfigPath(): string | null {
    if (!this.projectPath) {
      return null
    }

    // Check .nerv/config.json first
    const nervDirPath = join(this.projectPath, CONFIG_FILE_NAMES.projectDir)
    if (existsSync(nervDirPath)) {
      return nervDirPath
    }

    // Check nerv.config.json
    const rootPath = join(this.projectPath, CONFIG_FILE_NAMES.projectRoot)
    if (existsSync(rootPath)) {
      return rootPath
    }

    // Return default location (.nerv/config.json)
    return nervDirPath
  }

  /**
   * Reload settings from disk
   */
  reload(): void {
    this.globalConfig = readConfigFile<GlobalConfig>(this.getGlobalConfigPath())

    const projectConfigPath = this.getProjectConfigPath()
    this.projectConfig = projectConfigPath
      ? readConfigFile<ProjectConfig>(projectConfigPath)
      : null

    // Load org settings (deferred to avoid circular dependency)
    // org-config.ts imports settings.ts, so we import dynamically
    this.loadOrgSettingsDeferred()
  }

  /**
   * Load organization settings (called after initial load to avoid circular deps)
   */
  private loadOrgSettingsDeferred(): void {
    try {
      // Dynamic import to break circular dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const orgConfig = require('./org-config.js')
      this.orgSettings = orgConfig.loadOrgSettings() as OrganizationSettings | null
      this.orgSettingsMapped = this.orgSettings
        ? mapOrgSettingsToNervSettings(this.orgSettings)
        : null
    } catch {
      // Org config module not available or not configured
      this.orgSettings = null
      this.orgSettingsMapped = null
    }
  }

  /**
   * Set the project path for project-level settings
   */
  setProjectPath(projectPath: string | null): void {
    this.projectPath = projectPath
    this.repoSettingsCache.clear() // Clear repo cache when project changes
    this.reload()
  }

  /**
   * Get repo settings file path (PRD Section 13)
   * Format: ~/.nerv/projects/{projectName}/repos/{repoName}/settings.json
   */
  private getRepoSettingsPath(repoPath: string): string | null {
    if (!this.projectPath) {
      return null
    }
    const projectName = this.projectConfig?.project_name || 'default'
    const repoName = repoPath.replace(/[\\/:]/g, '_') // Sanitize path for filename
    return join(getNervDir(), 'projects', projectName, 'repos', repoName, 'settings.json')
  }

  /**
   * Get repo-level settings (PRD Section 13)
   */
  getRepoSettings(repoPath: string): RepoSettings | null {
    // Check cache first
    if (this.repoSettingsCache.has(repoPath)) {
      return this.repoSettingsCache.get(repoPath)!
    }

    const settingsPath = this.getRepoSettingsPath(repoPath)
    if (!settingsPath) {
      return null
    }

    const settings = readConfigFile<RepoSettings>(settingsPath)
    if (settings) {
      this.repoSettingsCache.set(repoPath, settings)
    }
    return settings
  }

  /**
   * Set repo-level settings (PRD Section 13)
   */
  setRepoSettings(repoPath: string, settings: RepoSettings): void {
    const settingsPath = this.getRepoSettingsPath(repoPath)
    if (!settingsPath) {
      throw new Error('No project path set - cannot save repo settings')
    }

    writeConfigFile(settingsPath, settings)
    this.repoSettingsCache.set(repoPath, settings)
  }

  /**
   * Get current task-level settings (PRD Section 13)
   */
  getTaskSettings(): TaskSettings | null {
    return this.taskSettings
  }

  /**
   * Set task-level overrides (PRD Section 13)
   * These are in-memory only and have highest priority
   */
  setTaskSettings(settings: TaskSettings | null): void {
    this.taskSettings = settings
  }

  /**
   * Set organization settings directly (for testing)
   */
  setOrgSettings(settings: OrganizationSettings | null): void {
    this.orgSettings = settings
    this.orgSettingsMapped = settings ? mapOrgSettingsToNervSettings(settings) : null
  }

  /**
   * Get a setting value (resolved from hierarchy)
   */
  get<K extends keyof NervSettings>(key: K): NervSettings[K] {
    return this.getWithSource(key).value
  }

  /**
   * Get a setting with source information
   *
   * Resolution priority (highest to lowest) - PRD Section 13:
   * 1. Task settings (in-memory, during task execution)
   * 2. Environment variables (NERV_*)
   * 3. Repo config (~/.nerv/projects/{name}/repos/{repo}/settings.json) - not for NervSettings
   * 4. Project config (.nerv/config.json or nerv.config.json)
   * 5. Organization config (org-config/settings.json)
   * 6. Global config (~/.nerv/config.json)
   * 7. Default values
   *
   * Note: Repo settings (RepoSettings) are separate from NervSettings and accessed
   * via getRepoSettings(). They contain repo-specific commands like buildCommand, testCommand.
   */
  getWithSource<K extends keyof NervSettings>(key: K): ResolvedSetting<NervSettings[K]> {
    // 1. Check task settings (highest priority) - PRD Section 13
    if (this.taskSettings) {
      // Task settings only override specific keys
      if (key === 'default_model' && this.taskSettings.model !== undefined) {
        return { value: this.taskSettings.model as NervSettings[K], source: 'task' }
      }
    }

    // 2. Check environment variables
    const envValue = getFromEnv(key)
    if (envValue !== undefined) {
      return { value: envValue, source: 'environment' }
    }

    // 3. Check project config
    if (this.projectConfig && key in this.projectConfig) {
      const value = (this.projectConfig as PartialNervSettings)[key]
      if (value !== undefined) {
        return { value: value as NervSettings[K], source: 'project' }
      }
    }

    // 4. Check organization config (between project and global)
    if (this.orgSettingsMapped && key in this.orgSettingsMapped) {
      const value = this.orgSettingsMapped[key]
      if (value !== undefined) {
        return { value: value as NervSettings[K], source: 'organization' }
      }
    }

    // 5. Check global config
    if (this.globalConfig && key in this.globalConfig) {
      const value = (this.globalConfig as PartialNervSettings)[key]
      if (value !== undefined) {
        return { value: value as NervSettings[K], source: 'global' }
      }
    }

    // 6. Return default
    return { value: DEFAULT_SETTINGS[key], source: 'default' }
  }

  /**
   * Set a setting at the global level
   */
  setGlobal<K extends keyof NervSettings>(key: K, value: NervSettings[K]): void {
    if (!this.globalConfig) {
      this.globalConfig = { config_version: 1 }
    }
    (this.globalConfig as PartialNervSettings)[key] = value
    writeConfigFile(this.getGlobalConfigPath(), this.globalConfig)
  }

  /**
   * Set a setting at the project level
   */
  setProject<K extends keyof NervSettings>(key: K, value: NervSettings[K]): void {
    const configPath = this.getProjectConfigPath()
    if (!configPath) {
      throw new Error('No project path set - cannot save project settings')
    }

    if (!this.projectConfig) {
      this.projectConfig = { config_version: 1 }
    }
    (this.projectConfig as PartialNervSettings)[key] = value
    writeConfigFile(configPath, this.projectConfig)
  }

  /**
   * Remove a setting from global config (revert to default)
   */
  unsetGlobal<K extends keyof NervSettings>(key: K): void {
    if (this.globalConfig && key in this.globalConfig) {
      delete (this.globalConfig as PartialNervSettings)[key]
      writeConfigFile(this.getGlobalConfigPath(), this.globalConfig)
    }
  }

  /**
   * Remove a setting from project config (revert to global/default)
   */
  unsetProject<K extends keyof NervSettings>(key: K): void {
    const configPath = this.getProjectConfigPath()
    if (!configPath) {
      return
    }

    if (this.projectConfig && key in this.projectConfig) {
      delete (this.projectConfig as PartialNervSettings)[key]
      writeConfigFile(configPath, this.projectConfig)
    }
  }

  /**
   * Get all settings (resolved)
   */
  getAll(): NervSettings {
    const result = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof NervSettings)[]) {
      (result as Record<keyof NervSettings, unknown>)[key] = this.get(key)
    }
    return result
  }

  /**
   * Get all settings with sources
   */
  getAllWithSources(): Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>> {
    const result = {} as Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>>
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof NervSettings)[]) {
      result[key] = this.getWithSource(key)
    }
    return result
  }

  /**
   * Get the raw global config
   */
  getGlobalConfig(): GlobalConfig | null {
    return this.globalConfig
  }

  /**
   * Get the raw project config
   */
  getProjectConfig(): ProjectConfig | null {
    return this.projectConfig
  }

  /**
   * Get the raw organization settings
   */
  getOrgSettings(): OrganizationSettings | null {
    return this.orgSettings
  }

  /**
   * List all environment variable overrides currently active
   */
  getActiveEnvOverrides(): Array<{ key: keyof NervSettings; envVar: string; value: unknown }> {
    const overrides: Array<{ key: keyof NervSettings; envVar: string; value: unknown }> = []
    for (const mapping of SETTINGS_ENV_MAPPINGS) {
      const envValue = process.env[mapping.envVar]
      if (envValue !== undefined) {
        const parsed = parseEnvValue(envValue, mapping.type)
        if (parsed !== null) {
          overrides.push({ key: mapping.key, envVar: mapping.envVar, value: parsed })
        }
      }
    }
    return overrides
  }
}

// Singleton instance for global access
let settingsInstance: SettingsServiceImpl | null = null

/**
 * Get the singleton settings service instance
 */
export function getSettingsService(projectPath?: string): SettingsServiceImpl {
  if (!settingsInstance) {
    settingsInstance = new SettingsServiceImpl(projectPath)
  } else if (projectPath !== undefined) {
    settingsInstance.setProjectPath(projectPath)
  }
  return settingsInstance
}

/**
 * Create a new settings service instance (for testing or isolated use)
 */
export function createSettingsService(projectPath?: string): SettingsServiceImpl {
  return new SettingsServiceImpl(projectPath)
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSettingsService(): void {
  settingsInstance = null
}
