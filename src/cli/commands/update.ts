/**
 * CLI update command for NERV
 *
 * Implements PRD Section 22: App Auto-Update
 *
 * Usage:
 *   nerv update check          - Check for available updates
 *   nerv update install        - Download and install update (if available)
 *   nerv update notes          - Show release notes for available update
 *   nerv update status         - Show current update status
 */

import type { DatabaseService } from '../../core/database.js'
import type { NervSettings } from '../../shared/types/settings.js'
import { getSettingsService } from '../../core/settings.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

// Since CLI runs outside of Electron context, we need to use different approach
// For now, we provide status/config commands and note that check/install require GUI

/**
 * Get current version from package.json
 */
function getVersion(): string {
  try {
    // In CLI context, read from package.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../package.json')
    return pkg.version
  } catch {
    return '1.0.0'
  }
}

/**
 * Show current update settings
 */
function showStatus(jsonOutput: boolean): void {
  const version = getVersion()

  const autoCheck = getSettingsService().get('updates_auto_check')
  const autoDownload = getSettingsService().get('updates_auto_download')
  const autoInstall = getSettingsService().get('updates_auto_install')
  const checkInterval = getSettingsService().get('updates_check_interval')
  const channel = getSettingsService().get('updates_channel')
  const allowDowngrade = getSettingsService().get('updates_allow_downgrade')
  const feedUrl = getSettingsService().get('updates_feed_url')
  const skipVersion = getSettingsService().get('updates_skip_version')

  if (jsonOutput) {
    console.log(JSON.stringify({
      currentVersion: version,
      settings: {
        autoCheck,
        autoDownload,
        autoInstall,
        checkInterval,
        channel,
        allowDowngrade,
        feedUrl,
        skipVersion
      }
    }, null, 2))
    return
  }

  console.log(`\n${colors.bold}NERV Update Status${colors.reset}\n`)
  console.log(`${colors.cyan}Current version:${colors.reset}  ${version}`)
  console.log(`${colors.cyan}Channel:${colors.reset}          ${channel}`)
  console.log('')
  console.log(`${colors.bold}Settings${colors.reset}`)
  console.log(`${colors.cyan}Auto-check:${colors.reset}       ${autoCheck ? colors.green + 'Enabled' : colors.yellow + 'Disabled'}${colors.reset}`)
  console.log(`${colors.cyan}Auto-download:${colors.reset}    ${autoDownload ? colors.green + 'Enabled' : colors.yellow + 'Disabled'}${colors.reset}`)
  console.log(`${colors.cyan}Auto-install:${colors.reset}     ${autoInstall ? colors.green + 'Enabled' : colors.yellow + 'Disabled'}${colors.reset}`)
  console.log(`${colors.cyan}Check interval:${colors.reset}   ${Math.round(checkInterval / 60000)} minutes`)
  console.log(`${colors.cyan}Allow downgrade:${colors.reset}  ${allowDowngrade ? 'Yes' : 'No'}`)

  if (feedUrl) {
    console.log(`${colors.cyan}Custom feed URL:${colors.reset}  ${feedUrl}`)
  }

  if (skipVersion) {
    console.log(`${colors.cyan}Skipped version:${colors.reset}  ${skipVersion}`)
  }
}

/**
 * Note about check/install limitations in CLI
 */
function showCliLimitation(): void {
  console.log(`
${colors.yellow}Note:${colors.reset} The 'check' and 'install' commands require the NERV GUI application.

To check for updates:
  1. Open the NERV application
  2. Go to Help > Check for Updates

Or configure automatic updates in your settings:
  ${colors.gray}nerv config set updates_auto_check true${colors.reset}

To manually download an update, visit:
  ${colors.cyan}https://github.com/nerv-project/nerv/releases${colors.reset}
`)
}

/**
 * Check for updates (requires GUI)
 */
function checkForUpdates(jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify({
      error: 'Update check requires the NERV GUI application',
      hint: 'Open NERV app and go to Help > Check for Updates'
    }))
    return
  }

  console.log(`\n${colors.yellow}Update check requires the NERV GUI application${colors.reset}`)
  showCliLimitation()
}

/**
 * Install update (requires GUI)
 */
function installUpdate(jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify({
      error: 'Update installation requires the NERV GUI application',
      hint: 'Open NERV app and use the update notification'
    }))
    return
  }

  console.log(`\n${colors.yellow}Update installation requires the NERV GUI application${colors.reset}`)
  showCliLimitation()
}

/**
 * Show release notes (requires network access)
 */
function showNotes(jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify({
      error: 'Release notes require the NERV GUI application',
      hint: 'Check https://github.com/nerv-project/nerv/releases for release notes'
    }))
    return
  }

  console.log(`
${colors.bold}Release Notes${colors.reset}

Release notes are available at:
  ${colors.cyan}https://github.com/nerv-project/nerv/releases${colors.reset}

For the latest release notes, open the NERV application and
check for updates via Help > Check for Updates.
`)
}

/**
 * Configure update settings
 */
function configureUpdates(setting: string, value: string, jsonOutput: boolean): void {
  const validSettings = [
    'auto_check',
    'auto_download',
    'auto_install',
    'channel',
    'allow_downgrade'
  ]

  const settingName = setting.replace(/-/g, '_')

  if (!validSettings.includes(settingName)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Unknown setting: ${setting}` }))
    } else {
      console.error(`${colors.red}Unknown setting: ${setting}${colors.reset}`)
      console.log(`\nValid settings: ${validSettings.join(', ')}`)
    }
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const fullKey = `updates_${settingName}` as keyof NervSettings

  // Parse the value based on setting type
  let parsedValue: boolean | string

  if (['auto_check', 'auto_download', 'auto_install', 'allow_downgrade'].includes(settingName)) {
    parsedValue = value === 'true' || value === '1' || value === 'yes'
    getSettingsService().setGlobal(fullKey, parsedValue as never)
  } else if (settingName === 'channel') {
    if (!['stable', 'beta', 'alpha'].includes(value)) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'Channel must be: stable, beta, or alpha' }))
      } else {
        console.error(`${colors.red}Channel must be: stable, beta, or alpha${colors.reset}`)
      }
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
    }
    getSettingsService().setGlobal(fullKey, value as never)
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ success: true, setting: fullKey, value }))
  } else {
    console.log(`${colors.green}Updated ${setting} = ${value}${colors.reset}`)
  }
}

/**
 * Show command help
 */
function showHelp(): void {
  console.log(`
${colors.bold}NERV Update${colors.reset} - Application update management

${colors.bold}USAGE${colors.reset}
  nerv update <subcommand> [options]

${colors.bold}SUBCOMMANDS${colors.reset}
  status        Show current update status and settings
  check         Check for available updates (requires GUI)
  install       Install available update (requires GUI)
  notes         Show release notes for available update
  configure     Configure update settings (e.g. auto_check, channel)

${colors.bold}OPTIONS${colors.reset}
  --json        Output in JSON format

${colors.bold}SETTINGS${colors.reset}
  Configure update behavior with 'nerv config set':

  ${colors.gray}# Enable/disable auto-check on startup${colors.reset}
  nerv config set updates_auto_check true

  ${colors.gray}# Enable/disable auto-download${colors.reset}
  nerv config set updates_auto_download true

  ${colors.gray}# Enable/disable auto-install on quit${colors.reset}
  nerv config set updates_auto_install false

  ${colors.gray}# Set update channel (stable, beta, alpha)${colors.reset}
  nerv config set updates_channel beta

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# Check update status${colors.reset}
  nerv update status

  ${colors.gray}# Switch to beta channel${colors.reset}
  nerv config set updates_channel beta

  ${colors.gray}# Disable auto-updates${colors.reset}
  nerv config set updates_auto_check false
`)
}

/**
 * Main update command handler
 */
export async function updateCommand(args: string[], _db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const hasJsonFlag = args.includes('--json')

  switch (subcommand) {
    case undefined:
    case 'status':
      showStatus(hasJsonFlag)
      break

    case 'check':
      checkForUpdates(hasJsonFlag)
      break

    case 'install':
      installUpdate(hasJsonFlag)
      break

    case 'notes':
      showNotes(hasJsonFlag)
      break

    case 'configure':
    case 'config': {
      const setting = args[1]
      const value = args[2]
      if (!setting || !value) {
        if (hasJsonFlag) {
          console.log(JSON.stringify({ error: 'Setting name and value required' }))
        } else {
          console.error(`${colors.red}Setting name and value required${colors.reset}`)
          console.log(`Usage: nerv update configure <setting> <value>`)
        }
        process.exit(CLI_EXIT_CODES.INVALID_ARGS)
      }
      configureUpdates(setting, value, hasJsonFlag)
      break
    }

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
