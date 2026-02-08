import { spawn, IPty } from 'node-pty'
import { ipcMain } from 'electron'
import * as os from 'os'
import * as fs from 'fs'
import { PTY_DEFAULTS, getBuiltInProfilesForPlatform, BUILT_IN_TERMINAL_PROFILES } from '../shared/constants'
import type { TerminalProfile, TerminalCreateResult } from '../shared/types/terminal'
import { broadcastToRenderers } from './utils'
import { saveCustomTerminalProfiles } from './settings-loader'

// Map of terminal ID to PTY instance
const terminals: Map<string, IPty> = new Map()

// Map of terminal ID to profile ID used
const terminalProfiles: Map<string, string> = new Map()

// User-defined custom profiles (loaded from config)
let customProfiles: TerminalProfile[] = []

// Organization-defined profiles (loaded from org config)
let orgProfiles: TerminalProfile[] = []

// Get the default shell for the platform
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

// Generate a unique terminal ID
function generateTerminalId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get all available terminal profiles (built-in + org + custom)
 * Priority: built-in < org < custom (later entries override earlier)
 */
export function getAvailableProfiles(): TerminalProfile[] {
  const builtIn = getBuiltInProfilesForPlatform()
  // Org profiles come after built-in, custom profiles last (highest priority)
  return [...builtIn, ...orgProfiles, ...customProfiles]
}

/**
 * Get a profile by ID
 * Priority: custom > org > built-in (custom overrides org overrides built-in)
 */
export function getProfileById(profileId: string): TerminalProfile | undefined {
  // Check custom profiles first (highest priority)
  const custom = customProfiles.find(p => p.id === profileId)
  if (custom) return custom

  // Then check org profiles
  const org = orgProfiles.find(p => p.id === profileId)
  if (org) return org

  // Finally check built-in profiles
  return BUILT_IN_TERMINAL_PROFILES.find(p => p.id === profileId)
}

/**
 * Set custom profiles (called when loading from config)
 * Automatically sets source to 'custom'
 */
export function setCustomProfiles(profiles: TerminalProfile[]): void {
  customProfiles = profiles.map(p => ({ ...p, source: 'custom' as const }))
}

/**
 * Set organization profiles (called when loading from org config)
 * Automatically sets source to 'organization'
 */
export function setOrgProfiles(profiles: TerminalProfile[]): void {
  orgProfiles = profiles.map(p => ({ ...p, source: 'organization' as const }))
}

/**
 * Get organization profiles (for display/debugging)
 */
export function getOrgProfiles(): TerminalProfile[] {
  return [...orgProfiles]
}

/**
 * Add a custom terminal profile and persist to config
 */
export function addCustomProfile(profile: TerminalProfile): void {
  const existing = customProfiles.findIndex(p => p.id === profile.id)
  if (existing >= 0) {
    throw new Error(`Profile with id '${profile.id}' already exists`)
  }
  customProfiles.push({ ...profile, source: 'custom' as const })
  saveCustomTerminalProfiles(customProfiles)
}

/**
 * Update an existing custom terminal profile and persist
 */
export function updateCustomProfile(profile: TerminalProfile): void {
  const idx = customProfiles.findIndex(p => p.id === profile.id)
  if (idx < 0) {
    throw new Error(`Profile '${profile.id}' not found in custom profiles`)
  }
  customProfiles[idx] = { ...profile, source: 'custom' as const }
  saveCustomTerminalProfiles(customProfiles)
}

/**
 * Remove a custom terminal profile and persist
 */
export function removeCustomProfile(profileId: string): void {
  const idx = customProfiles.findIndex(p => p.id === profileId)
  if (idx < 0) {
    throw new Error(`Profile '${profileId}' not found in custom profiles`)
  }
  customProfiles.splice(idx, 1)
  saveCustomTerminalProfiles(customProfiles)
}

/**
 * Set a profile as the default terminal profile
 * Clears isDefault from all profiles, then sets it on the specified one
 */
export function setDefaultProfile(profileId: string): void {
  // Verify the profile exists somewhere
  const profile = getProfileById(profileId)
  if (!profile) {
    throw new Error(`Profile '${profileId}' not found`)
  }

  // Clear default from all custom profiles
  for (const p of customProfiles) {
    p.isDefault = p.id === profileId
  }
  saveCustomTerminalProfiles(customProfiles)
}

/**
 * Check if a shell executable exists
 */
function shellExists(shell: string): boolean {
  if (!shell) return true // Empty means system default
  try {
    fs.accessSync(shell, fs.constants.X_OK)
    return true
  } catch {
    // On Windows, also check if it's in PATH
    if (process.platform === 'win32') {
      // Simple check - if it ends with .exe and doesn't have path separators,
      // assume it can be found in PATH
      if (shell.endsWith('.exe') && !shell.includes('\\') && !shell.includes('/')) {
        return true
      }
    }
    return false
  }
}

/**
 * Expand variables in a string
 * Supports: ${projectRoot}, ${repoRoot}, ${home}
 */
function expandVariables(value: string, context: { projectRoot?: string; repoRoot?: string }): string {
  return value
    .replace(/\$\{projectRoot\}/g, context.projectRoot || process.cwd())
    .replace(/\$\{repoRoot\}/g, context.repoRoot || process.cwd())
    .replace(/\$\{home\}/g, os.homedir())
}

/**
 * Expand variables in profile args array
 */
function expandArgsVariables(args: string[], context: { projectRoot?: string; repoRoot?: string }): string[] {
  return args.map(arg => expandVariables(arg, context))
}

/**
 * Resolve shell and args from a profile
 */
function resolveShellFromProfile(profile: TerminalProfile): { shell: string; args: string[] } {
  let shell = profile.shell
  let args = profile.args || []

  // If shell is empty or profile is system-default, use system default
  if (!shell || profile.id === 'system-default') {
    shell = getDefaultShell()
    args = []
  }

  // Check if the shell exists, fall back to system default if not
  if (!shellExists(shell)) {
    console.warn(`Terminal profile shell not found: ${shell}, falling back to system default`)
    shell = getDefaultShell()
    args = []
  }

  return { shell, args }
}

// Create a new terminal with optional profile
function createTerminal(cwd?: string, profileId?: string): TerminalCreateResult {
  const terminalId = generateTerminalId()

  // Get profile (default to system-default)
  const resolvedProfileId = profileId || 'system-default'
  const profile = getProfileById(resolvedProfileId) || {
    id: 'system-default',
    name: 'System Default',
    shell: '',
    isBuiltIn: true,
  }

  const { shell, args } = resolveShellFromProfile(profile)

  // Build variable expansion context
  const projectRoot = cwd || process.cwd()
  const variableContext = { projectRoot, repoRoot: projectRoot }

  // Expand variables in args
  const expandedArgs = args.length > 0 ? expandArgsVariables(args, variableContext) : args

  // Expand variables in cwd
  const profileCwd = profile.cwd ? expandVariables(profile.cwd, variableContext) : undefined

  // Merge environment variables
  const env = {
    ...process.env,
    ...(profile.env || {}),
  } as { [key: string]: string }

  const ptyProcess = spawn(shell, expandedArgs, {
    name: 'xterm-256color',
    cols: PTY_DEFAULTS.cols,
    rows: PTY_DEFAULTS.rows,
    cwd: cwd || profileCwd || os.homedir(),
    env
  })

  terminals.set(terminalId, ptyProcess)
  terminalProfiles.set(terminalId, resolvedProfileId)

  // Forward data from PTY to renderer
  ptyProcess.onData((data: string) => {
    broadcastToRenderers('terminal:data', terminalId, data)
  })

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    terminals.delete(terminalId)
    terminalProfiles.delete(terminalId)
    broadcastToRenderers('terminal:exit', terminalId, exitCode)
  })

  return {
    terminalId,
    profileId: resolvedProfileId,
    shell,
  }
}

// Write data to terminal
function writeToTerminal(terminalId: string, data: string): void {
  const pty = terminals.get(terminalId)
  if (pty) {
    pty.write(data)
  }
}

// Resize terminal
function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  const pty = terminals.get(terminalId)
  if (pty) {
    pty.resize(cols, rows)
  }
}

// Kill terminal with optional signal
function killTerminal(terminalId: string, signal: string = 'SIGTERM'): void {
  const pty = terminals.get(terminalId)
  if (pty) {
    try {
      pty.kill(signal)
    } catch {
      // Process may already be dead
    }
    terminals.delete(terminalId)
  }
}

// Kill all terminals - use SIGKILL for forceful cleanup
function killAllTerminals(): void {
  terminals.forEach((pty, id) => {
    try {
      // On Windows, SIGTERM may not work well, use SIGKILL directly
      const signal = process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM'
      pty.kill(signal)
      // Also try SIGKILL immediately for faster cleanup
      try {
        pty.kill('SIGKILL')
      } catch {
        // Process already dead
      }
    } catch {
      // Process may already be dead
    }
    terminals.delete(id)
  })
}

// Check if terminal exists
function hasTerminal(terminalId: string): boolean {
  return terminals.has(terminalId)
}

// Register IPC handlers for terminal operations
export function registerTerminalIpcHandlers(): void {
  ipcMain.handle('terminal:create', (_event, cwd?: string, profileId?: string) => {
    return createTerminal(cwd, profileId)
  })

  ipcMain.handle('terminal:write', (_event, terminalId: string, data: string) => {
    writeToTerminal(terminalId, data)
  })

  ipcMain.handle('terminal:resize', (_event, terminalId: string, cols: number, rows: number) => {
    resizeTerminal(terminalId, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, terminalId: string) => {
    killTerminal(terminalId)
  })

  ipcMain.handle('terminal:exists', (_event, terminalId: string) => {
    return hasTerminal(terminalId)
  })

  // Terminal profile handlers (PRD Section 21)
  ipcMain.handle('terminal:profiles:list', () => {
    return getAvailableProfiles()
  })

  ipcMain.handle('terminal:profiles:get', (_event, profileId: string) => {
    return getProfileById(profileId)
  })

  ipcMain.handle('terminal:profiles:setCustom', (_event, profiles: TerminalProfile[]) => {
    setCustomProfiles(profiles)
  })

  ipcMain.handle('terminal:profiles:setOrg', (_event, profiles: TerminalProfile[]) => {
    setOrgProfiles(profiles)
  })

  ipcMain.handle('terminal:profiles:getOrg', () => {
    return getOrgProfiles()
  })

  ipcMain.handle('terminal:profiles:add', (_event, profile: TerminalProfile) => {
    addCustomProfile(profile)
  })

  ipcMain.handle('terminal:profiles:update', (_event, profile: TerminalProfile) => {
    updateCustomProfile(profile)
  })

  ipcMain.handle('terminal:profiles:remove', (_event, profileId: string) => {
    removeCustomProfile(profileId)
  })

  ipcMain.handle('terminal:profiles:setDefault', (_event, profileId: string) => {
    setDefaultProfile(profileId)
  })
}

// Cleanup on app quit
export function cleanupTerminals(): void {
  killAllTerminals()
}
