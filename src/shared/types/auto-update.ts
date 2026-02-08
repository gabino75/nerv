/**
 * Auto-Update types (PRD Section 22)
 * Types for electron-updater integration with GitHub Releases
 */

/**
 * Update channel for release management
 */
export type UpdateChannel = 'stable' | 'beta' | 'alpha'

/**
 * Update settings stored in user config
 */
export interface UpdateSettings {
  /** Check for updates on app startup */
  autoCheck: boolean
  /** Download updates automatically when found */
  autoDownload: boolean
  /** Install updates automatically on quit */
  autoInstall: boolean
  /** Interval between update checks in milliseconds */
  checkInterval: number
  /** Release channel to follow */
  channel: UpdateChannel
  /** Allow installing older versions (downgrade) */
  allowDowngrade: boolean
  /** Custom feed URL for offline/air-gapped environments */
  feedUrl?: string
  /** Version to skip (user chose "Skip This Version") */
  skipVersion?: string
}

/**
 * Organization-controlled update policy
 * When org policy conflicts with user settings, org policy wins
 */
export interface OrgUpdatePolicy {
  /** Force all users to a specific channel */
  enforceChannel?: UpdateChannel
  /** Block versions older than this */
  minimumVersion?: string
  /** Force auto-install on quit */
  autoInstall?: boolean
  /** Block specific versions (security issues) */
  blockVersions?: string[]
  /** Custom feed URL for internal mirror */
  feedUrl?: string
}

/**
 * Update status representing current state of the updater
 */
export type UpdateStatus =
  | 'idle'           // No update activity
  | 'checking'       // Checking for updates
  | 'available'      // Update available, not downloaded
  | 'downloading'    // Currently downloading
  | 'downloaded'     // Update downloaded, ready to install
  | 'error'          // An error occurred

/**
 * Information about an available update
 */
export interface UpdateInfo {
  /** Version number (e.g., "1.2.0") */
  version: string
  /** Release notes/changelog */
  releaseNotes?: string | null
  /** Release date */
  releaseDate: string
  /** Download URL for the release */
  releaseName?: string
  /** Files included in the release */
  files?: Array<{
    url: string
    size?: number
    sha512?: string
  }>
}

/**
 * Current state of the auto-updater
 */
export interface AutoUpdateState {
  /** Current status */
  status: UpdateStatus
  /** Available update info (when status is 'available' or 'downloaded') */
  updateInfo?: UpdateInfo
  /** Download progress (0-100) when downloading */
  downloadProgress?: number
  /** Error message when status is 'error' */
  error?: string
  /** Last time we checked for updates */
  lastCheck?: string
  /** Current app version */
  currentVersion: string
  /** Whether update is mandatory (org policy) */
  isMandatory?: boolean
}

/**
 * Download progress event data
 */
export interface DownloadProgress {
  /** Bytes downloaded so far */
  bytesPerSecond: number
  /** Percentage complete (0-100) */
  percent: number
  /** Total bytes to download */
  total: number
  /** Bytes transferred so far */
  transferred: number
}

/**
 * Result of checking for updates
 */
export interface CheckUpdateResult {
  /** Whether an update is available */
  updateAvailable: boolean
  /** Info about the update if available */
  updateInfo?: UpdateInfo
  /** Error message if check failed */
  error?: string
}

/**
 * User's response to an update notification
 */
export type UpdateAction =
  | 'install-now'    // Quit and install immediately
  | 'install-later'  // Install on next quit
  | 'skip'           // Skip this version
  | 'remind-later'   // Remind me later (do nothing)
