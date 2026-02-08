/**
 * Terminal profile types (PRD Section 21: Custom Terminal Profiles)
 *
 * Allows users to define custom shell configurations with:
 * - Shell executable and arguments
 * - Custom environment variables
 * - Working directory defaults
 * - Profile metadata
 */

/**
 * Terminal profile source (PRD Section 10: Custom Terminal Profiles)
 * Used to group profiles in the dropdown UI
 */
export type TerminalProfileSource = 'built-in' | 'custom' | 'organization'

/**
 * Terminal profile definition
 */
export interface TerminalProfile {
  id: string
  name: string
  shell: string // e.g., 'pwsh.exe', '/bin/zsh', 'cmd.exe'
  args?: string[] // Shell arguments
  env?: Record<string, string> // Additional environment variables
  cwd?: string // Default working directory (optional)
  icon?: string // Optional icon identifier
  isDefault?: boolean // Mark as default profile
  isBuiltIn?: boolean // System-provided profiles vs user-defined (deprecated: use source)
  source?: TerminalProfileSource // Where this profile came from (PRD Section 10)
}

/**
 * Built-in profile identifiers
 */
export type BuiltInProfileId = 'system-default' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'git-bash'

/**
 * Terminal profiles configuration in settings
 */
export interface TerminalProfilesConfig {
  profiles: TerminalProfile[]
  defaultProfileId: string | null
}

/**
 * Result of creating a terminal with a profile
 */
export interface TerminalCreateResult {
  terminalId: string
  profileId: string
  shell: string
}
