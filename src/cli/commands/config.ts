/**
 * CLI config command for NERV
 *
 * Implements PRD Section 12: Settings Hierarchy
 *
 * Usage:
 *   nerv config list              - List all settings with sources
 *   nerv config get <key>         - Get a specific setting
 *   nerv config set <key> <value> - Set a setting (global by default)
 *   nerv config set <key> <value> --project - Set at project level
 *   nerv config unset <key>       - Remove a setting
 *   nerv config path              - Show config file paths
 */

import type { DatabaseService } from '../../core/database.js'
import { getSettingsService } from '../../core/settings.js'
import { DEFAULT_SETTINGS, SETTINGS_ENV_MAPPINGS, CLI_EXIT_CODES } from '../../shared/constants.js'
import type { NervSettings, SettingsSource } from '../../shared/types/settings.js'
import { colors } from '../colors.js'

/**
 * Get source color for display
 */
function getSourceColor(source: SettingsSource): string {
  switch (source) {
    case 'environment': return colors.magenta
    case 'project': return colors.cyan
    case 'global': return colors.blue
    case 'default': return colors.gray
    case 'organization': return colors.yellow
    case 'repo': return colors.green
    case 'task': return colors.blue
    default: return colors.gray
  }
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  return String(value)
}

/**
 * Parse a string value to the appropriate type based on the key
 */
function parseValue(key: string, value: string): unknown {
  const defaultValue = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key]

  if (defaultValue === null || defaultValue === undefined) {
    // String by default, but check if it looks like a number or boolean
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    if (value === 'null') return null
    const num = parseFloat(value)
    if (!isNaN(num) && value.match(/^-?\d+\.?\d*$/)) return num
    return value
  }

  switch (typeof defaultValue) {
    case 'number': {
      const num = parseFloat(value)
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${value}`)
      }
      return num
    }
    case 'boolean':
      if (value.toLowerCase() === 'true' || value === '1') return true
      if (value.toLowerCase() === 'false' || value === '0') return false
      throw new Error(`Invalid boolean: ${value}`)
    default:
      return value
  }
}

/**
 * List all settings
 */
function listSettings(settings: ReturnType<typeof getSettingsService>, jsonOutput: boolean): void {
  const allSettings = settings.getAllWithSources()

  if (jsonOutput) {
    const output: Record<string, { value: unknown; source: string }> = {}
    for (const [key, resolved] of Object.entries(allSettings)) {
      output[key] = { value: resolved.value, source: resolved.source }
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  console.log(`\n${colors.bold}NERV Settings${colors.reset}\n`)
  console.log(`${colors.gray}Priority: ${colors.magenta}env${colors.gray} > ${colors.cyan}project${colors.gray} > ${colors.blue}global${colors.gray} > ${colors.gray}default${colors.reset}\n`)

  // Group settings by category
  const categories: Record<string, string[]> = {
    'Model': ['default_model', 'max_turns'],
    'Budget': ['monthly_budget_usd', 'budget_warning_threshold', 'budget_critical_threshold'],
    'Audit': ['audit_cycle_frequency', 'audit_test_coverage_threshold', 'audit_dry_violation_limit',
              'audit_type_error_limit', 'audit_dead_code_limit', 'audit_complexity_threshold',
              'audit_enable_code_health', 'audit_enable_plan_health'],
    'YOLO': ['yolo_max_cycles', 'yolo_max_cost_usd', 'yolo_max_duration_ms',
             'yolo_auto_approve_review', 'yolo_auto_approve_dangerous_tools'],
    'Terminal': ['terminal_cols', 'terminal_rows'],
    'Logging': ['log_level', 'output_format'],
    'Paths': ['project_path', 'config_path']
  }

  for (const [category, keys] of Object.entries(categories)) {
    console.log(`${colors.bold}${category}${colors.reset}`)
    for (const key of keys) {
      const resolved = allSettings[key as keyof NervSettings]
      if (resolved) {
        const sourceColor = getSourceColor(resolved.source)
        const value = formatValue(resolved.value)
        console.log(`  ${key}: ${value} ${sourceColor}[${resolved.source}]${colors.reset}`)
      }
    }
    console.log('')
  }
}

/**
 * Get a specific setting
 */
function getSetting(settings: ReturnType<typeof getSettingsService>, key: string, jsonOutput: boolean): void {
  if (!(key in DEFAULT_SETTINGS)) {
    console.error(`${colors.red}Unknown setting: ${key}${colors.reset}`)
    console.log(`\nAvailable settings: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const resolved = settings.getWithSource(key as keyof NervSettings)

  if (jsonOutput) {
    console.log(JSON.stringify({ key, value: resolved.value, source: resolved.source }, null, 2))
  } else {
    const sourceColor = getSourceColor(resolved.source)
    console.log(`${key}: ${formatValue(resolved.value)} ${sourceColor}[${resolved.source}]${colors.reset}`)
  }
}

/**
 * Set a setting
 */
function setSetting(
  settings: ReturnType<typeof getSettingsService>,
  key: string,
  value: string,
  isProject: boolean
): void {
  if (!(key in DEFAULT_SETTINGS)) {
    console.error(`${colors.red}Unknown setting: ${key}${colors.reset}`)
    console.log(`\nAvailable settings: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  try {
    const parsedValue = parseValue(key, value)

    if (isProject) {
      settings.setProject(key as keyof NervSettings, parsedValue as NervSettings[keyof NervSettings])
      console.log(`${colors.green}Set${colors.reset} ${key} = ${formatValue(parsedValue)} ${colors.cyan}[project]${colors.reset}`)
    } else {
      settings.setGlobal(key as keyof NervSettings, parsedValue as NervSettings[keyof NervSettings])
      console.log(`${colors.green}Set${colors.reset} ${key} = ${formatValue(parsedValue)} ${colors.blue}[global]${colors.reset}`)
    }
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset} ${err instanceof Error ? err.message : err}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

/**
 * Unset a setting
 */
function unsetSetting(
  settings: ReturnType<typeof getSettingsService>,
  key: string,
  isProject: boolean
): void {
  if (!(key in DEFAULT_SETTINGS)) {
    console.error(`${colors.red}Unknown setting: ${key}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (isProject) {
    settings.unsetProject(key as keyof NervSettings)
    console.log(`${colors.green}Unset${colors.reset} ${key} ${colors.cyan}[project]${colors.reset}`)
  } else {
    settings.unsetGlobal(key as keyof NervSettings)
    console.log(`${colors.green}Unset${colors.reset} ${key} ${colors.blue}[global]${colors.reset}`)
  }
}

/**
 * Show config file paths
 */
function showPaths(settings: ReturnType<typeof getSettingsService>): void {
  console.log(`\n${colors.bold}Config File Paths${colors.reset}\n`)

  const globalPath = settings.getGlobalConfigPath()
  const projectPath = settings.getProjectConfigPath()

  console.log(`${colors.blue}Global:${colors.reset}  ${globalPath}`)
  if (projectPath) {
    console.log(`${colors.cyan}Project:${colors.reset} ${projectPath}`)
  } else {
    console.log(`${colors.gray}Project: (not in a project directory)${colors.reset}`)
  }

  console.log(`\n${colors.bold}Environment Variables${colors.reset}\n`)
  const envOverrides = settings.getActiveEnvOverrides()
  if (envOverrides.length === 0) {
    console.log(`${colors.gray}No environment variable overrides active${colors.reset}`)
  } else {
    for (const override of envOverrides) {
      console.log(`${colors.magenta}${override.envVar}${colors.reset} = ${formatValue(override.value)}`)
    }
  }

  console.log(`\n${colors.bold}All Environment Variables${colors.reset}\n`)
  for (const mapping of SETTINGS_ENV_MAPPINGS) {
    console.log(`  ${mapping.envVar} -> ${mapping.key}`)
  }
}

/**
 * Show command help
 */
function showHelp(): void {
  console.log(`
${colors.bold}NERV Config${colors.reset} - Manage settings hierarchy

${colors.bold}USAGE${colors.reset}
  nerv config <subcommand> [options]

${colors.bold}SUBCOMMANDS${colors.reset}
  list              List all settings with their sources
  get <key>         Get a specific setting value
  set <key> <value> Set a setting (global by default)
  unset <key>       Remove a setting from config file
  path              Show config file paths and env vars

${colors.bold}OPTIONS${colors.reset}
  --project, -p     Apply to project config instead of global
  --json            Output in JSON format

${colors.bold}SETTINGS HIERARCHY${colors.reset}
  Settings are resolved in this order (highest priority first):
  1. Environment variables (NERV_*)
  2. Project config (.nerv/config.json or nerv.config.json)
  3. Global config (~/.nerv/config.json)
  4. Default values

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# List all settings${colors.reset}
  nerv config list

  ${colors.gray}# Get a specific setting${colors.reset}
  nerv config get default_model

  ${colors.gray}# Set global default model${colors.reset}
  nerv config set default_model opus

  ${colors.gray}# Set project-specific budget${colors.reset}
  nerv config set monthly_budget_usd 100 --project

  ${colors.gray}# Use environment variable${colors.reset}
  NERV_LOG_LEVEL=debug nerv start
`)
}

/**
 * Main config command handler
 */
export async function configCommand(args: string[], db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const hasProjectFlag = args.includes('--project') || args.includes('-p')
  const hasJsonFlag = args.includes('--json')

  // Get current project path from database (using first repo path)
  const currentProjectId = db.getSetting('current_project_id')
  let projectPath: string | undefined

  if (currentProjectId) {
    const repos = db.getReposForProject(currentProjectId)
    if (repos.length > 0) {
      projectPath = repos[0].path
    }
  }

  const settings = getSettingsService(projectPath)

  // Filter out flags from args
  const filteredArgs = args.filter(a => !a.startsWith('-'))

  switch (subcommand) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      showHelp()
      break

    case 'list':
    case 'ls':
      listSettings(settings, hasJsonFlag)
      break

    case 'get':
      if (!filteredArgs[1]) {
        console.error(`${colors.red}Error: Missing key${colors.reset}`)
        console.log('Usage: nerv config get <key>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      getSetting(settings, filteredArgs[1], hasJsonFlag)
      break

    case 'set':
      if (!filteredArgs[1] || !filteredArgs[2]) {
        console.error(`${colors.red}Error: Missing key or value${colors.reset}`)
        console.log('Usage: nerv config set <key> <value>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      setSetting(settings, filteredArgs[1], filteredArgs[2], hasProjectFlag)
      break

    case 'unset':
    case 'delete':
    case 'remove':
      if (!filteredArgs[1]) {
        console.error(`${colors.red}Error: Missing key${colors.reset}`)
        console.log('Usage: nerv config unset <key>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      unsetSetting(settings, filteredArgs[1], hasProjectFlag)
      break

    case 'path':
    case 'paths':
      showPaths(settings)
      break

    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      showHelp()
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}
