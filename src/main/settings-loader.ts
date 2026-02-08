/**
 * Settings Loader
 *
 * Loads user settings from ~/.nerv/config.json
 * Includes custom terminal profiles (PRD Section 10)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { TerminalProfile } from '../shared/types/terminal'
import type { GlobalConfig } from '../shared/types/settings'

/**
 * Get the global config file path
 */
function getGlobalConfigPath(): string {
  return join(homedir(), '.nerv', 'config.json')
}

/**
 * Read and parse the global config file
 */
function readGlobalConfig(): GlobalConfig | null {
  const configPath = getGlobalConfigPath()
  try {
    if (!existsSync(configPath)) {
      return null
    }
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as GlobalConfig
  } catch (error) {
    console.error('[NERV] Failed to load global config:', error)
    return null
  }
}

/**
 * Load custom terminal profiles from ~/.nerv/config.json
 * PRD Section 10: Custom Terminal Profiles
 *
 * Users can define custom profiles like:
 * {
 *   "terminalProfiles": {
 *     "ipython": {
 *       "name": "IPython",
 *       "command": "ipython",
 *       "cwd": "${projectRoot}"
 *     }
 *   }
 * }
 */
export function loadCustomTerminalProfiles(): TerminalProfile[] {
  const config = readGlobalConfig()
  if (!config?.terminalProfiles) {
    return []
  }

  // Convert the config format to TerminalProfile[]
  return config.terminalProfiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    shell: profile.shell,
    args: profile.args,
    env: profile.env,
    cwd: profile.cwd,
    icon: profile.icon,
    isBuiltIn: false,
    source: 'custom' as const,
  }))
}

/**
 * Save custom terminal profiles to ~/.nerv/config.json
 * Preserves other config keys while updating terminalProfiles
 */
export function saveCustomTerminalProfiles(profiles: TerminalProfile[]): void {
  const configPath = getGlobalConfigPath()
  const config = readGlobalConfig() ?? {}

  config.terminalProfiles = profiles.map(p => ({
    id: p.id,
    name: p.name,
    shell: p.shell,
    args: p.args,
    env: p.env,
    cwd: p.cwd,
    icon: p.icon,
  }))

  const dir = dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
