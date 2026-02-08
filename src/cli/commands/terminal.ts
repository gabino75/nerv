/**
 * CLI terminal command for NERV
 *
 * Implements PRD Section 21: Custom Terminal Profiles
 *
 * Usage:
 *   nerv terminal profiles           - List available terminal profiles
 *   nerv terminal profiles --json    - List profiles as JSON
 *   nerv terminals add <name> --command <cmd>  - Add a custom profile
 *   nerv terminals remove <id>       - Remove a custom profile
 *   nerv terminal open <profileId>   - Open a terminal with profile
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { getBuiltInProfilesForPlatform, CLI_EXIT_CODES } from '../../shared/constants.js'
import { getNervDir } from '../../core/platform.js'
import type { TerminalProfile } from '../../shared/types/terminal.js'
import { colors } from '../colors.js'

/**
 * Get the path to custom terminal profiles config
 */
function getCustomProfilesPath(): string {
  return join(getNervDir(), 'terminal-profiles.json')
}

/**
 * Load custom terminal profiles from config file
 */
function loadCustomProfiles(): TerminalProfile[] {
  const configPath = getCustomProfilesPath()
  if (!existsSync(configPath)) {
    return []
  }
  try {
    const content = readFileSync(configPath, 'utf-8')
    const data = JSON.parse(content)
    return Array.isArray(data.profiles) ? data.profiles : []
  } catch {
    return []
  }
}

/**
 * Save custom terminal profiles to config file
 */
function saveCustomProfiles(profiles: TerminalProfile[]): void {
  const configPath = getCustomProfilesPath()
  const data = { profiles }
  writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Get all available profiles (built-in + custom)
 */
function getAllProfiles(): TerminalProfile[] {
  const builtIn = getBuiltInProfilesForPlatform()
  const custom = loadCustomProfiles()
  return [...builtIn, ...custom]
}

/**
 * List terminal profiles command
 */
function listProfiles(json: boolean = false): void {
  const builtInProfiles = getBuiltInProfilesForPlatform()
  const customProfiles = loadCustomProfiles()
  const allProfiles = [...builtInProfiles, ...customProfiles]

  if (json) {
    console.log(JSON.stringify(allProfiles, null, 2))
    return
  }

  console.log(`\n${colors.bold}Available Terminal Profiles${colors.reset}\n`)

  // Group profiles by type
  if (builtInProfiles.length > 0) {
    console.log(`${colors.gray}── Built-in ──${colors.reset}`)
    for (const profile of builtInProfiles) {
      printProfile(profile)
    }
  }

  if (customProfiles.length > 0) {
    console.log(`${colors.gray}── Custom ──${colors.reset}`)
    for (const profile of customProfiles) {
      printProfile(profile)
    }
  }

  console.log(`${colors.gray}Profiles can be selected when creating new shell terminals in the UI.${colors.reset}`)
  console.log(`${colors.gray}Use 'nerv terminals add' to create custom profiles.${colors.reset}\n`)
}

/**
 * Print a single profile
 */
function printProfile(profile: TerminalProfile): void {
  const defaultBadge = profile.isDefault ? ` ${colors.yellow}(default)${colors.reset}` : ''

  console.log(`  ${colors.cyan}${profile.id}${colors.reset}${defaultBadge}`)
  console.log(`    Name:  ${profile.name}`)
  console.log(`    Shell: ${profile.shell || '(system default)'}`)
  if (profile.args && profile.args.length > 0) {
    console.log(`    Args:  ${profile.args.join(' ')}`)
  }
  console.log()
}

/**
 * Add a custom terminal profile
 * Usage: nerv terminals add <name> --command <cmd> [--args <args>] [--icon <icon>]
 */
function addProfile(args: string[]): void {
  const name = args[0]
  if (!name) {
    console.error(`${colors.red}Error: Profile name is required${colors.reset}`)
    console.log(`Usage: nerv terminals add <name> --command <cmd> [--args <args>]`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  // Parse arguments
  let command: string | undefined
  let profileArgs: string[] = []
  let icon: string | undefined
  let cwd: string | undefined

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--command':
      case '-c':
        command = args[++i]
        break
      case '--args':
      case '-a':
        // Split args by space if provided as single string
        const argStr = args[++i]
        if (argStr) {
          profileArgs = argStr.split(' ').filter(Boolean)
        }
        break
      case '--icon':
        icon = args[++i]
        break
      case '--cwd':
        cwd = args[++i]
        break
    }
  }

  if (!command) {
    console.error(`${colors.red}Error: --command is required${colors.reset}`)
    console.log(`Usage: nerv terminals add <name> --command <cmd> [--args <args>]`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  // Generate ID from name
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  // Check for duplicates
  const existing = loadCustomProfiles()
  if (existing.some(p => p.id === id)) {
    console.error(`${colors.red}Error: Profile with ID '${id}' already exists${colors.reset}`)
    console.log(`Use 'nerv terminals remove ${id}' first to replace it.`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  // Check against built-in profiles
  const builtIn = getBuiltInProfilesForPlatform()
  if (builtIn.some(p => p.id === id)) {
    console.error(`${colors.red}Error: Cannot override built-in profile '${id}'${colors.reset}`)
    console.log(`Choose a different name.`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const newProfile: TerminalProfile = {
    id,
    name,
    shell: command,
    args: profileArgs.length > 0 ? profileArgs : undefined,
    icon,
    cwd,
    isBuiltIn: false,
  }

  existing.push(newProfile)
  saveCustomProfiles(existing)

  console.log(`${colors.green}✓${colors.reset} Added terminal profile: ${colors.cyan}${id}${colors.reset}`)
  console.log(`  Name:    ${name}`)
  console.log(`  Command: ${command}`)
  if (profileArgs.length > 0) {
    console.log(`  Args:    ${profileArgs.join(' ')}`)
  }
  console.log(`\nUse this profile in the UI or with 'nerv terminal open ${id}'`)
}

/**
 * Remove a custom terminal profile
 */
function removeProfile(profileId: string): void {
  if (!profileId) {
    console.error(`${colors.red}Error: Profile ID is required${colors.reset}`)
    console.log(`Usage: nerv terminals remove <id>`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const existing = loadCustomProfiles()
  const index = existing.findIndex(p => p.id === profileId)

  if (index === -1) {
    // Check if it's a built-in profile
    const builtIn = getBuiltInProfilesForPlatform()
    if (builtIn.some(p => p.id === profileId)) {
      console.error(`${colors.red}Error: Cannot remove built-in profile '${profileId}'${colors.reset}`)
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
    }
    console.error(`${colors.red}Error: Custom profile '${profileId}' not found${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const removed = existing.splice(index, 1)[0]
  saveCustomProfiles(existing)

  console.log(`${colors.green}✓${colors.reset} Removed terminal profile: ${colors.cyan}${profileId}${colors.reset}`)
  console.log(`  Name: ${removed.name}`)
}

/**
 * Open a terminal with a specific profile
 */
function openTerminal(profileId: string): void {
  if (!profileId) {
    console.error(`${colors.red}Error: Profile ID is required${colors.reset}`)
    console.log(`Usage: nerv terminal open <profileId>`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const allProfiles = getAllProfiles()
  const profile = allProfiles.find(p => p.id === profileId)

  if (!profile) {
    console.error(`${colors.red}Error: Profile '${profileId}' not found${colors.reset}`)
    console.log(`Use 'nerv terminal profiles' to see available profiles.`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const shell = profile.shell || process.env.SHELL || process.env.COMSPEC || 'sh'
  const args = profile.args || []
  const cwd = profile.cwd || process.cwd()

  console.log(`${colors.gray}Opening ${profile.name}...${colors.reset}`)

  // Spawn the terminal in the foreground
  const child = spawn(shell, args, {
    cwd,
    env: { ...process.env, ...(profile.env || {}) },
    stdio: 'inherit',
    detached: false,
  })

  child.on('error', (err) => {
    console.error(`${colors.red}Error: Failed to start terminal: ${err.message}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })
}

/**
 * Main terminal command handler
 */
export async function terminalCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'profiles':
      listProfiles(args.includes('--json'))
      break

    case 'open':
      openTerminal(args[1])
      break

    case undefined:
    case 'help':
      printTerminalHelp()
      break

    default:
      console.error(`${colors.yellow}Unknown subcommand: ${subcommand}${colors.reset}`)
      console.error(`Run 'nerv terminal help' for usage information.`)
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

/**
 * Handle 'nerv terminals' command (plural - for add/remove operations)
 */
export async function terminalsCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'list':
    case undefined:
      listProfiles(args.includes('--json'))
      break

    case 'add':
      addProfile(args.slice(1))
      break

    case 'remove':
      removeProfile(args[1])
      break

    case 'help':
      printTerminalHelp()
      break

    default:
      console.error(`${colors.yellow}Unknown subcommand: ${subcommand}${colors.reset}`)
      console.error(`Run 'nerv terminals help' for usage information.`)
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}

/**
 * Print help for terminal commands
 */
function printTerminalHelp(): void {
  console.log(`
${colors.bold}NERV Terminal${colors.reset}

${colors.bold}Usage:${colors.reset}
  nerv terminal profiles           List available terminal profiles
  nerv terminal profiles --json    List profiles as JSON
  nerv terminal open <id>          Open a terminal with specific profile

  nerv terminals list              List available terminal profiles
  nerv terminals add <name> ...    Add a custom terminal profile
  nerv terminals remove <id>       Remove a custom terminal profile

${colors.bold}Adding a Profile:${colors.reset}
  nerv terminals add <name> --command <cmd> [options]

  Options:
    --command, -c <cmd>   Shell command/executable (required)
    --args, -a <args>     Shell arguments (space-separated)
    --icon <icon>         Icon identifier for UI
    --cwd <path>          Default working directory

${colors.bold}Examples:${colors.reset}
  ${colors.gray}# List all available profiles${colors.reset}
  nerv terminal profiles

  ${colors.gray}# Add a Python REPL profile${colors.reset}
  nerv terminals add "Python REPL" --command python --args "-i"

  ${colors.gray}# Add IPython profile${colors.reset}
  nerv terminals add IPython --command ipython

  ${colors.gray}# Add WSL profile${colors.reset}
  nerv terminals add "WSL Ubuntu" --command wsl.exe --args "-d Ubuntu"

  ${colors.gray}# Remove a custom profile${colors.reset}
  nerv terminals remove python-repl

  ${colors.gray}# Open a terminal with specific profile${colors.reset}
  nerv terminal open ipython
`)
}
