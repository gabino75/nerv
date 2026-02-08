/**
 * CLI org command for NERV
 *
 * Implements PRD Section 20: Organization Configuration
 *
 * Usage:
 *   nerv org status          - Show organization config status
 *   nerv org sync            - Force immediate sync
 *   nerv org show            - Show full org configuration
 *   nerv org config          - Show org settings from synced config
 */

import type { DatabaseService } from '../../core/database.js'
import {
  getOrgConfig,
  getOrgSyncStatus,
  syncOrgConfig,
  loadOrgSettings,
  listOrgAgents,
  listOrgSkills,
  listOrgWorkflows,
  getOrgConfigSummary,
  isOrgConfigured
} from '../../core/org-config.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

/**
 * Show organization sync status
 */
function showStatus(jsonOutput: boolean): void {
  const status = getOrgSyncStatus()

  if (jsonOutput) {
    console.log(JSON.stringify(status, null, 2))
    return
  }

  if (!status.configured) {
    console.log(`\n${colors.yellow}Organization not configured${colors.reset}`)
    console.log(`\nTo configure, add organization settings to ~/.nerv/config.json:`)
    console.log(`${colors.gray}`)
    console.log(`{
  "org_name": "Your Company",
  "org_config_source_type": "git",
  "org_config_url": "https://github.com/yourorg/nerv-config.git",
  "org_config_branch": "main",
  "org_auto_sync_enabled": true
}`)
    console.log(`${colors.reset}`)
    console.log(`Or use local path:`)
    console.log(`${colors.gray}`)
    console.log(`{
  "org_name": "Your Company",
  "org_config_source_type": "local",
  "org_config_url": "/path/to/org-config"
}`)
    console.log(`${colors.reset}`)
    return
  }

  console.log(`\n${colors.bold}Organization Status${colors.reset}\n`)

  const config = getOrgConfig()
  if (config) {
    console.log(`${colors.cyan}Name:${colors.reset}        ${config.name}`)
    console.log(`${colors.cyan}Source:${colors.reset}      ${config.configSource.type}`)

    if (config.configSource.type === 'git') {
      console.log(`${colors.cyan}URL:${colors.reset}         ${config.configSource.url || 'Not set'}`)
      console.log(`${colors.cyan}Branch:${colors.reset}      ${config.configSource.branch || 'main'}`)
      console.log(`${colors.cyan}Auth:${colors.reset}        ${config.configSource.authMethod || 'none'}`)
    } else {
      console.log(`${colors.cyan}Path:${colors.reset}        ${config.configSource.path || config.configSource.url || 'Not set'}`)
    }

    console.log(`${colors.cyan}Cache:${colors.reset}       ${config.localCache}`)
    console.log(`${colors.cyan}Auto-sync:${colors.reset}   ${config.autoSync.enabled ? 'Enabled' : 'Disabled'}`)

    if (config.autoSync.enabled) {
      console.log(`${colors.cyan}Interval:${colors.reset}    ${config.autoSync.intervalMinutes} minutes`)
      console.log(`${colors.cyan}On start:${colors.reset}    ${config.autoSync.onAppStart ? 'Yes' : 'No'}`)
      console.log(`${colors.cyan}On project:${colors.reset}  ${config.autoSync.onProjectOpen ? 'Yes' : 'No'}`)
    }
  }

  console.log('')
  console.log(`${colors.bold}Sync Status${colors.reset}`)

  if (status.lastSyncTime) {
    const lastSync = new Date(status.lastSyncTime)
    const statusColor = status.lastSyncSuccess ? colors.green : colors.red
    const statusText = status.lastSyncSuccess ? 'Success' : 'Failed'

    console.log(`${colors.cyan}Last sync:${colors.reset}   ${lastSync.toLocaleString()}`)
    console.log(`${colors.cyan}Status:${colors.reset}      ${statusColor}${statusText}${colors.reset}`)

    if (!status.lastSyncSuccess && status.lastSyncError) {
      console.log(`${colors.cyan}Error:${colors.reset}       ${colors.red}${status.lastSyncError}${colors.reset}`)
    }
  } else {
    console.log(`${colors.cyan}Last sync:${colors.reset}   ${colors.yellow}Never${colors.reset}`)
  }

  // Show available resources
  const agents = listOrgAgents()
  const skills = listOrgSkills()
  const workflows = listOrgWorkflows()

  if (agents.length > 0 || skills.length > 0 || workflows.length > 0) {
    console.log('')
    console.log(`${colors.bold}Available Resources${colors.reset}`)

    if (agents.length > 0) {
      console.log(`${colors.cyan}Agents:${colors.reset}      ${agents.join(', ')}`)
    }
    if (skills.length > 0) {
      console.log(`${colors.cyan}Skills:${colors.reset}      ${skills.join(', ')}`)
    }
    if (workflows.length > 0) {
      console.log(`${colors.cyan}Workflows:${colors.reset}   ${workflows.join(', ')}`)
    }
  }
}

/**
 * Force sync organization config
 */
async function doSync(jsonOutput: boolean): Promise<void> {
  if (!isOrgConfigured()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ success: false, error: 'Organization not configured' }))
    } else {
      console.error(`${colors.red}Error: Organization not configured${colors.reset}`)
      console.log(`Run 'nerv org status' for setup instructions`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (!jsonOutput) {
    console.log(`${colors.cyan}Syncing organization config...${colors.reset}`)
  }

  const result = await syncOrgConfig()

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.success) {
    console.log(`${colors.green}Sync completed successfully${colors.reset}`)

    // Show what was synced
    const agents = listOrgAgents()
    const skills = listOrgSkills()
    const workflows = listOrgWorkflows()

    if (agents.length > 0 || skills.length > 0 || workflows.length > 0) {
      console.log('')
      if (agents.length > 0) {
        console.log(`  Agents: ${agents.join(', ')}`)
      }
      if (skills.length > 0) {
        console.log(`  Skills: ${skills.join(', ')}`)
      }
      if (workflows.length > 0) {
        console.log(`  Workflows: ${workflows.join(', ')}`)
      }
    }
  } else {
    console.error(`${colors.red}Sync failed: ${result.error}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

/**
 * Show full org configuration
 */
function showConfig(jsonOutput: boolean): void {
  if (!isOrgConfigured()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Organization not configured' }))
    } else {
      console.error(`${colors.red}Error: Organization not configured${colors.reset}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const settings = loadOrgSettings()

  if (jsonOutput) {
    console.log(JSON.stringify(settings, null, 2))
    return
  }

  if (!settings) {
    console.log(`${colors.yellow}No organization settings found${colors.reset}`)
    console.log(`Sync may be required: 'nerv org sync'`)
    return
  }

  console.log(`\n${colors.bold}Organization Settings${colors.reset}\n`)
  console.log(`${colors.cyan}Name:${colors.reset} ${settings.name}`)

  if (settings.defaults) {
    console.log('')
    console.log(`${colors.bold}Defaults${colors.reset}`)
    if (settings.defaults.model) {
      console.log(`  Model: ${settings.defaults.model}`)
    }
    if (settings.defaults.maxTokens) {
      console.log(`  Max tokens: ${settings.defaults.maxTokens}`)
    }
    if (settings.defaults.reviewMode) {
      console.log(`  Review mode: ${settings.defaults.reviewMode}`)
    }
    if (settings.defaults.auditFrequency) {
      console.log(`  Audit frequency: ${settings.defaults.auditFrequency}`)
    }
  }

  if (settings.permissions) {
    console.log('')
    console.log(`${colors.bold}Permissions${colors.reset}`)
    if (settings.permissions.alwaysDeny?.length) {
      console.log(`  ${colors.red}Always deny:${colors.reset} ${settings.permissions.alwaysDeny.join(', ')}`)
    }
    if (settings.permissions.alwaysRequireApproval?.length) {
      console.log(`  ${colors.yellow}Require approval:${colors.reset} ${settings.permissions.alwaysRequireApproval.join(', ')}`)
    }
    if (settings.permissions.alwaysAllow?.length) {
      console.log(`  ${colors.green}Always allow:${colors.reset} ${settings.permissions.alwaysAllow.join(', ')}`)
    }
  }

  if (settings.compliance) {
    console.log('')
    console.log(`${colors.bold}Compliance${colors.reset}`)
    if (settings.compliance.requireAuditLog !== undefined) {
      console.log(`  Require audit log: ${settings.compliance.requireAuditLog}`)
    }
    if (settings.compliance.sensitivePatterns?.length) {
      console.log(`  Sensitive patterns: ${settings.compliance.sensitivePatterns.join(', ')}`)
    }
    if (settings.compliance.approvedModels?.length) {
      console.log(`  Approved models: ${settings.compliance.approvedModels.join(', ')}`)
    }
  }

  if (settings.costLimits) {
    console.log('')
    console.log(`${colors.bold}Cost Limits${colors.reset}`)
    if (settings.costLimits.perTaskMax) {
      console.log(`  Per task: $${settings.costLimits.perTaskMax}`)
    }
    if (settings.costLimits.perDayMax) {
      console.log(`  Per day: $${settings.costLimits.perDayMax}`)
    }
    if (settings.costLimits.perMonthMax) {
      console.log(`  Per month: $${settings.costLimits.perMonthMax}`)
    }
    if (settings.costLimits.alertThreshold) {
      console.log(`  Alert threshold: ${settings.costLimits.alertThreshold * 100}%`)
    }
  }
}

/**
 * List available org agents
 */
function showAgents(jsonOutput: boolean): void {
  if (!isOrgConfigured()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Organization not configured', agents: [] }))
    } else {
      console.error(`${colors.red}Error: Organization not configured${colors.reset}`)
      console.log(`Run 'nerv org status' for setup instructions`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const agents = listOrgAgents()

  if (jsonOutput) {
    console.log(JSON.stringify({ agents }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Organization Agents${colors.reset}\n`)

  if (agents.length === 0) {
    console.log(`${colors.gray}No organization agents configured${colors.reset}`)
    console.log(`\nAgents are defined in the org config repository under agents/`)
    return
  }

  for (const agent of agents) {
    console.log(`  ${colors.cyan}${agent}${colors.reset}`)
  }

  console.log(`\n${colors.gray}Use with: nerv start --agent org:${agents[0]}${colors.reset}`)
}

/**
 * List available org skills
 */
function showSkills(jsonOutput: boolean): void {
  if (!isOrgConfigured()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Organization not configured', skills: [] }))
    } else {
      console.error(`${colors.red}Error: Organization not configured${colors.reset}`)
      console.log(`Run 'nerv org status' for setup instructions`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const skills = listOrgSkills()

  if (jsonOutput) {
    console.log(JSON.stringify({ skills }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Organization Skills${colors.reset}\n`)

  if (skills.length === 0) {
    console.log(`${colors.gray}No organization skills configured${colors.reset}`)
    console.log(`\nSkills are defined in the org config repository under skills/`)
    return
  }

  for (const skill of skills) {
    console.log(`  ${colors.cyan}${skill}${colors.reset}`)
  }
}

/**
 * Show command help
 */
function showHelp(): void {
  console.log(`
${colors.bold}NERV Org${colors.reset} - Organization configuration management

${colors.bold}USAGE${colors.reset}
  nerv org <subcommand> [options]

${colors.bold}SUBCOMMANDS${colors.reset}
  status        Show organization sync status
  sync          Force immediate sync from config source
  show          Show organization settings from synced config
  config        Alias for 'show'
  agents        List available organization agents
  skills        List available organization skills

${colors.bold}OPTIONS${colors.reset}
  --json        Output in JSON format

${colors.bold}CONFIGURATION${colors.reset}
  Add organization settings to ~/.nerv/config.json:

  ${colors.gray}Git repository:${colors.reset}
  {
    "org_name": "Your Company",
    "org_config_source_type": "git",
    "org_config_url": "https://github.com/yourorg/nerv-config.git",
    "org_config_branch": "main",
    "org_auto_sync_enabled": true
  }

  ${colors.gray}Local path:${colors.reset}
  {
    "org_name": "Your Company",
    "org_config_source_type": "local",
    "org_config_url": "/path/to/org-config"
  }

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# Check org status${colors.reset}
  nerv org status

  ${colors.gray}# Force sync from git${colors.reset}
  nerv org sync

  ${colors.gray}# View org settings${colors.reset}
  nerv org show

  ${colors.gray}# List org agents${colors.reset}
  nerv org agents

  ${colors.gray}# List org skills${colors.reset}
  nerv org skills

  ${colors.gray}# Get status as JSON${colors.reset}
  nerv org status --json
`)
}

/**
 * Main org command handler
 */
export async function orgCommand(args: string[], _db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const hasJsonFlag = args.includes('--json')

  switch (subcommand) {
    case undefined:
    case 'status':
      showStatus(hasJsonFlag)
      break

    case 'sync':
      await doSync(hasJsonFlag)
      break

    case 'show':
    case 'config':
      showConfig(hasJsonFlag)
      break

    case 'agents':
      showAgents(hasJsonFlag)
      break

    case 'skills':
      showSkills(hasJsonFlag)
      break

    case 'help':
    case '--help':
    case '-h':
      showHelp()
      break

    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      showHelp()
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}
