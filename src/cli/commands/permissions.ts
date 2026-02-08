/**
 * CLI permissions command for NERV
 *
 * Implements PRD Section 8: Real-Time Permission Learning
 *
 * Usage:
 *   nerv permissions list              - List all permission rules
 *   nerv permissions learn             - Show suggested rules from approval history
 *   nerv permissions add <pattern>     - Add an allow rule
 *   nerv permissions deny <pattern>    - Add a deny rule
 *   nerv permissions remove <pattern>  - Remove a rule
 */

import type { DatabaseService } from '../../core/database.js'
import type { Approval } from '../../shared/types.js'
import { getNervDir } from '../../core/platform.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { colors } from '../colors.js'

// ============================================================================
// Permission Types and Constants
// ============================================================================

interface PermissionConfig {
  allow: string[]
  deny: string[]
}

const DEFAULT_PERMISSIONS: PermissionConfig = {
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
    'Bash(rm -rf /)',
    'Bash(sudo:*)',
    'Read(~/.ssh/*)',
    'Read(~/.nerv/*)',
    'Write(~/.nerv/*)',
    'Edit(~/.nerv/*)',
  ],
}

// ============================================================================
// Permission File Operations (CLI-compatible, no Electron dependency)
// ============================================================================

function getPermissionsPath(): string {
  return join(getNervDir(), 'permissions.json')
}

function loadPermissions(): PermissionConfig {
  const permPath = getPermissionsPath()

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

function savePermissions(permissions: PermissionConfig): void {
  const nervDir = getNervDir()

  if (!existsSync(nervDir)) {
    mkdirSync(nervDir, { recursive: true })
  }

  const permPath = getPermissionsPath()
  writeFileSync(permPath, JSON.stringify(permissions, null, 2))
}

// ============================================================================
// Pattern Generation (same logic as hooks.ts)
// ============================================================================

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

function generateFilePatterns(toolName: string, filePath: string): string[] {
  const patterns: string[] = [`${toolName}(${filePath})`]
  const dir = dirname(filePath)
  if (dir && dir !== '.') {
    patterns.push(`${toolName}(${dir}/*)`)
  }
  return patterns
}

function generatePatternSuggestions(
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

// ============================================================================
// CLI Commands
// ============================================================================

interface PatternSuggestion {
  pattern: string
  frequency: number
  approvals: Approval[]
  action: 'allow' | 'deny'
}

/**
 * Analyze approval history and generate pattern suggestions
 */
function analyzeApprovals(db: DatabaseService): PatternSuggestion[] {
  const approvals = db.getAllApprovals()
  const currentPerms = loadPermissions()
  const patternMap = new Map<string, PatternSuggestion>()

  for (const approval of approvals) {
    if (approval.status === 'pending') continue

    // Parse tool input
    let toolInput: Record<string, unknown> = {}
    if (approval.tool_input) {
      try {
        toolInput = JSON.parse(approval.tool_input)
      } catch {
        // If it's not JSON, treat as a command
        toolInput = { command: approval.tool_input }
      }
    }

    // Generate patterns for this approval
    const patterns = generatePatternSuggestions(approval.tool_name, toolInput)
    const action = approval.status === 'approved' ? 'allow' : 'deny'

    for (const pattern of patterns) {
      // Skip if already in rules
      if (currentPerms.allow.includes(pattern) || currentPerms.deny.includes(pattern)) {
        continue
      }

      const key = `${action}:${pattern}`
      const existing = patternMap.get(key)

      if (existing) {
        existing.frequency++
        existing.approvals.push(approval)
      } else {
        patternMap.set(key, {
          pattern,
          frequency: 1,
          approvals: [approval],
          action
        })
      }
    }
  }

  // Sort by frequency (most common first)
  return Array.from(patternMap.values())
    .sort((a, b) => b.frequency - a.frequency)
}

/**
 * List all permission rules
 */
function listPermissions(jsonOutput: boolean): void {
  const perms = loadPermissions()

  if (jsonOutput) {
    console.log(JSON.stringify(perms, null, 2))
    return
  }

  console.log(`\n${colors.bold}NERV Permission Rules${colors.reset}`)
  console.log(`${colors.gray}Config: ${getPermissionsPath()}${colors.reset}\n`)

  console.log(`${colors.green}${colors.bold}Allow Rules${colors.reset}`)
  if (perms.allow.length === 0) {
    console.log(`  ${colors.gray}(none)${colors.reset}`)
  } else {
    for (const rule of perms.allow) {
      console.log(`  ${colors.green}✓${colors.reset} ${rule}`)
    }
  }

  console.log(`\n${colors.red}${colors.bold}Deny Rules${colors.reset}`)
  if (perms.deny.length === 0) {
    console.log(`  ${colors.gray}(none)${colors.reset}`)
  } else {
    for (const rule of perms.deny) {
      console.log(`  ${colors.red}✗${colors.reset} ${rule}`)
    }
  }
  console.log('')
}

/**
 * Show suggested rules from approval history
 */
function learnPermissions(db: DatabaseService, jsonOutput: boolean): void {
  const suggestions = analyzeApprovals(db)

  if (suggestions.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ suggestions: [] }, null, 2))
    } else {
      console.log(`\n${colors.yellow}No new permission suggestions.${colors.reset}`)
      console.log(`${colors.gray}Approve or deny some tool requests first, then run this command again.${colors.reset}\n`)
    }
    return
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      suggestions: suggestions.map(s => ({
        pattern: s.pattern,
        action: s.action,
        frequency: s.frequency
      }))
    }, null, 2))
    return
  }

  console.log(`\n${colors.bold}Permission Suggestions${colors.reset}`)
  console.log(`${colors.gray}Based on ${db.getAllApprovals().length} approval history entries${colors.reset}\n`)

  const allowSuggestions = suggestions.filter(s => s.action === 'allow')
  const denySuggestions = suggestions.filter(s => s.action === 'deny')

  if (allowSuggestions.length > 0) {
    console.log(`${colors.green}${colors.bold}Suggested Allow Rules${colors.reset}`)
    for (const suggestion of allowSuggestions.slice(0, 10)) {
      const freq = suggestion.frequency > 1 ? ` ${colors.gray}(${suggestion.frequency}x)${colors.reset}` : ''
      console.log(`  ${colors.green}+${colors.reset} ${suggestion.pattern}${freq}`)
    }
    console.log('')
  }

  if (denySuggestions.length > 0) {
    console.log(`${colors.red}${colors.bold}Suggested Deny Rules${colors.reset}`)
    for (const suggestion of denySuggestions.slice(0, 10)) {
      const freq = suggestion.frequency > 1 ? ` ${colors.gray}(${suggestion.frequency}x)${colors.reset}` : ''
      console.log(`  ${colors.red}+${colors.reset} ${suggestion.pattern}${freq}`)
    }
    console.log('')
  }

  console.log(`${colors.cyan}To add a rule:${colors.reset}`)
  console.log(`  nerv permissions add "<pattern>"   # Allow rule`)
  console.log(`  nerv permissions deny "<pattern>"  # Deny rule`)
  console.log('')
}

/**
 * Add an allow rule
 */
function addAllowRule(pattern: string): void {
  const perms = loadPermissions()
  if (perms.allow.includes(pattern)) {
    console.log(`${colors.yellow}Rule already exists:${colors.reset} ${pattern}`)
    return
  }
  perms.allow.push(pattern)
  savePermissions(perms)
  console.log(`${colors.green}Added allow rule:${colors.reset} ${pattern}`)
}

/**
 * Add a deny rule
 */
function addDenyRule(pattern: string): void {
  const perms = loadPermissions()
  if (perms.deny.includes(pattern)) {
    console.log(`${colors.yellow}Rule already exists:${colors.reset} ${pattern}`)
    return
  }
  perms.deny.push(pattern)
  savePermissions(perms)
  console.log(`${colors.green}Added deny rule:${colors.reset} ${pattern}`)
}

/**
 * Remove a rule (from either allow or deny)
 */
function removeRule(pattern: string): void {
  const perms = loadPermissions()
  let removed = false

  if (perms.allow.includes(pattern)) {
    perms.allow = perms.allow.filter(r => r !== pattern)
    removed = true
  }

  if (perms.deny.includes(pattern)) {
    perms.deny = perms.deny.filter(r => r !== pattern)
    removed = true
  }

  if (removed) {
    savePermissions(perms)
    console.log(`${colors.green}Removed rule:${colors.reset} ${pattern}`)
  } else {
    console.log(`${colors.yellow}Rule not found:${colors.reset} ${pattern}`)
  }
}

/**
 * Show command help
 */
function showHelp(): void {
  console.log(`
${colors.bold}NERV Permissions${colors.reset} - Manage Claude Code permission rules

${colors.bold}USAGE${colors.reset}
  nerv permissions <subcommand> [options]

${colors.bold}SUBCOMMANDS${colors.reset}
  list              List all permission rules
  learn             Show suggested rules from approval history
  add <pattern>     Add an allow rule
  deny <pattern>    Add a deny rule
  remove <pattern>  Remove a rule from either list

${colors.bold}OPTIONS${colors.reset}
  --json            Output in JSON format

${colors.bold}PATTERN SYNTAX${colors.reset}
  <tool>            Match entire tool (e.g., "Read", "Grep")
  <tool>(<arg>)     Match tool with specific argument
  <tool>(<prefix>:*)  Match tool with wildcard prefix

${colors.bold}EXAMPLES${colors.reset}
  ${colors.gray}# List current rules${colors.reset}
  nerv permissions list

  ${colors.gray}# Show suggestions from approval history${colors.reset}
  nerv permissions learn

  ${colors.gray}# Allow all npm test commands${colors.reset}
  nerv permissions add "Bash(npm test:*)"

  ${colors.gray}# Deny access to .env files${colors.reset}
  nerv permissions deny "Read(*.env)"

  ${colors.gray}# Remove a rule${colors.reset}
  nerv permissions remove "Bash(npm test:*)"
`)
}

/**
 * Main permissions command handler
 */
export async function permissionsCommand(args: string[], db: DatabaseService): Promise<void> {
  const subcommand = args[0]
  const hasJsonFlag = args.includes('--json')

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
      listPermissions(hasJsonFlag)
      break

    case 'learn':
    case 'suggest':
    case 'suggestions':
      learnPermissions(db, hasJsonFlag)
      break

    case 'add':
    case 'allow':
      if (!filteredArgs[1]) {
        console.error(`${colors.red}Error: Missing pattern${colors.reset}`)
        console.log('Usage: nerv permissions add <pattern>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      addAllowRule(filteredArgs[1])
      break

    case 'deny':
    case 'block':
      if (!filteredArgs[1]) {
        console.error(`${colors.red}Error: Missing pattern${colors.reset}`)
        console.log('Usage: nerv permissions deny <pattern>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      addDenyRule(filteredArgs[1])
      break

    case 'remove':
    case 'delete':
    case 'rm':
      if (!filteredArgs[1]) {
        console.error(`${colors.red}Error: Missing pattern${colors.reset}`)
        console.log('Usage: nerv permissions remove <pattern>')
        process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
      }
      removeRule(filteredArgs[1])
      break

    default:
      console.error(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`)
      showHelp()
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }
}
