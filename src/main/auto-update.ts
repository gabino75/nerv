/**
 * Auto-Update Service (PRD Section 22)
 *
 * Handles automatic updates via electron-updater with GitHub Releases.
 * Supports:
 * - Update check on app start (configurable)
 * - Manual check via Help > Check for Updates
 * - Release channels (stable, beta, alpha)
 * - Org-controlled update policy
 * - Offline/air-gapped mode (custom feed URL)
 */

import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { is } from '@electron-toolkit/utils'
import type {
  AutoUpdateState,
  UpdateInfo,
  CheckUpdateResult,
  DownloadProgress,
  UpdateChannel,
  UpdateAction
} from '../shared/types/auto-update'
import { DEFAULT_SETTINGS } from '../shared/constants'
import { getSettingsService } from '../core/settings'
import { loadOrgSettings } from '../core/org-config'
import { broadcastToRenderers } from './utils'

// Try to import electron-updater - it may not be available in dev mode
let autoUpdater: typeof import('electron-updater').autoUpdater | null = null

try {
  // electron-updater is only available in production builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater: updater } = require('electron-updater')
  autoUpdater = updater
} catch {
  console.log('[Auto-Update] electron-updater not available (dev mode)')
}

// ============================================================================
// State
// ============================================================================

let updateState: AutoUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
}

let checkIntervalId: ReturnType<typeof setInterval> | null = null

// ============================================================================
// Helpers
// ============================================================================

function getEffectiveSettings() {
  const userAutoCheck = getSettingsService().get('updates_auto_check')
  const userAutoDownload = getSettingsService().get('updates_auto_download')
  const userAutoInstall = getSettingsService().get('updates_auto_install')
  const userCheckInterval = getSettingsService().get('updates_check_interval')
  const userChannel = getSettingsService().get('updates_channel')
  const userAllowDowngrade = getSettingsService().get('updates_allow_downgrade')
  const userFeedUrl = getSettingsService().get('updates_feed_url')
  const userSkipVersion = getSettingsService().get('updates_skip_version')

  // Load org policy (may override user settings)
  const orgSettings = loadOrgSettings()
  const orgPolicy = orgSettings?.updates

  return {
    autoCheck: userAutoCheck ?? DEFAULT_SETTINGS.updates_auto_check,
    autoDownload: userAutoDownload ?? DEFAULT_SETTINGS.updates_auto_download,
    // Org can force auto-install
    autoInstall: orgPolicy?.autoInstall ?? userAutoInstall ?? DEFAULT_SETTINGS.updates_auto_install,
    checkInterval: userCheckInterval ?? DEFAULT_SETTINGS.updates_check_interval,
    // Org can enforce channel
    channel: (orgPolicy?.enforceChannel ?? userChannel ?? DEFAULT_SETTINGS.updates_channel) as UpdateChannel,
    allowDowngrade: userAllowDowngrade ?? DEFAULT_SETTINGS.updates_allow_downgrade,
    // Org can override feed URL for internal mirrors
    feedUrl: orgPolicy?.feedUrl ?? userFeedUrl,
    skipVersion: userSkipVersion,
    // Org policy extras
    minimumVersion: orgPolicy?.minimumVersion,
    blockVersions: orgPolicy?.blockVersions ?? [],
  }
}

function isVersionBlocked(version: string): boolean {
  const { blockVersions, minimumVersion } = getEffectiveSettings()

  // Check if version is in the blocked list
  if (blockVersions.includes(version)) {
    return true
  }

  // Check if version is below minimum
  if (minimumVersion && compareVersions(version, minimumVersion) < 0) {
    return true
  }

  return false
}

function compareVersions(a: string, b: string): number {
  const aParts = a.replace(/^v/, '').split('.').map(Number)
  const bParts = b.replace(/^v/, '').split('.').map(Number)

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0
    const bVal = bParts[i] || 0
    if (aVal < bVal) return -1
    if (aVal > bVal) return 1
  }
  return 0
}

function updateAndBroadcast(newState: Partial<AutoUpdateState>): void {
  updateState = { ...updateState, ...newState }
  broadcastToRenderers('auto-update:state', updateState)
}

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

// ============================================================================
// Auto-Updater Setup
// ============================================================================

function setupAutoUpdater(): void {
  if (!autoUpdater) {
    console.log('[Auto-Update] Skipping setup - electron-updater not available')
    return
  }

  const settings = getEffectiveSettings()

  // Configure auto-updater
  autoUpdater.autoDownload = settings.autoDownload
  autoUpdater.autoInstallOnAppQuit = settings.autoInstall
  autoUpdater.allowDowngrade = settings.allowDowngrade

  // Set feed URL if custom one is configured
  if (settings.feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: settings.feedUrl })
  }

  // Set channel based on settings
  // Note: electron-updater uses 'latest' for stable, we map our channels
  if (settings.channel === 'beta') {
    autoUpdater.channel = 'beta'
  } else if (settings.channel === 'alpha') {
    autoUpdater.channel = 'alpha'
  }

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[Auto-Update] Checking for updates...')
    updateAndBroadcast({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[Auto-Update] Update available:', info.version)

    // Check if this version should be skipped
    if (settings.skipVersion === info.version) {
      console.log('[Auto-Update] Skipping version (user preference):', info.version)
      updateAndBroadcast({ status: 'idle' })
      return
    }

    // Check if update is mandatory (org policy)
    const isMandatory = isVersionMandatory(info.version)

    updateAndBroadcast({
      status: 'available',
      updateInfo: info,
      isMandatory,
    })

    // Show notification
    showNotification(
      'Update Available',
      `NERV ${info.version} is ready to download`
    )
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[Auto-Update] No update available')
    updateAndBroadcast({
      status: 'idle',
      lastCheck: new Date().toISOString(),
    })
  })

  autoUpdater.on('download-progress', (progress: DownloadProgress) => {
    updateAndBroadcast({
      status: 'downloading',
      downloadProgress: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[Auto-Update] Update downloaded:', info.version)

    const isMandatory = isVersionMandatory(info.version)

    updateAndBroadcast({
      status: 'downloaded',
      updateInfo: info,
      downloadProgress: 100,
      isMandatory,
    })

    // Show notification
    showNotification(
      'Update Ready',
      `NERV ${info.version} is ready to install. Restart to apply.`
    )
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('[Auto-Update] Error:', error.message)
    updateAndBroadcast({
      status: 'error',
      error: error.message,
    })
  })
}

function isVersionMandatory(version: string): boolean {
  const { minimumVersion } = getEffectiveSettings()

  if (!minimumVersion) return false

  // Current version is below minimum - update is mandatory
  return compareVersions(app.getVersion(), minimumVersion) < 0
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the auto-update system
 * Called from main process startup
 */
export function initializeAutoUpdater(): void {
  // Don't run auto-updater in dev mode
  if (is.dev) {
    console.log('[Auto-Update] Disabled in development mode')
    return
  }

  setupAutoUpdater()

  const settings = getEffectiveSettings()

  // Check for updates on startup if enabled
  if (settings.autoCheck) {
    // Delay the first check slightly to let the app initialize
    setTimeout(() => {
      checkForUpdates()
    }, 3000)
  }

  // Setup periodic check interval
  if (settings.autoCheck && settings.checkInterval > 0) {
    checkIntervalId = setInterval(() => {
      checkForUpdates()
    }, settings.checkInterval)
  }
}

/**
 * Clean up auto-update resources
 * Called from will-quit handler
 */
export function cleanupAutoUpdater(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }
}

/**
 * Check for updates manually
 */
export async function checkForUpdates(): Promise<CheckUpdateResult> {
  if (!autoUpdater) {
    return {
      updateAvailable: false,
      error: 'Auto-update not available in development mode',
    }
  }

  try {
    const result = await autoUpdater.checkForUpdates()

    if (result?.updateInfo) {
      const version = result.updateInfo.version

      // Check if version is blocked
      if (isVersionBlocked(version)) {
        return {
          updateAvailable: false,
          error: `Version ${version} is blocked by organization policy`,
        }
      }

      return {
        updateAvailable: true,
        updateInfo: result.updateInfo as UpdateInfo,
      }
    }

    return { updateAvailable: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      updateAvailable: false,
      error: message,
    }
  }
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<boolean> {
  if (!autoUpdater) {
    return false
  }

  try {
    await autoUpdater.downloadUpdate()
    return true
  } catch (error) {
    console.error('[Auto-Update] Download failed:', error)
    return false
  }
}

/**
 * Install update and restart the app
 */
export function installUpdate(): void {
  if (!autoUpdater) {
    return
  }

  // quitAndInstall will quit the app and install the update
  autoUpdater.quitAndInstall()
}

/**
 * Handle user's response to update notification
 */
export async function handleUpdateAction(action: UpdateAction): Promise<void> {
  switch (action) {
    case 'install-now':
      // If update is downloaded, install immediately
      if (updateState.status === 'downloaded') {
        installUpdate()
      } else if (updateState.status === 'available') {
        // Download then install
        const downloaded = await downloadUpdate()
        if (downloaded) {
          // Wait a moment for download to complete, then install
          setTimeout(() => installUpdate(), 1000)
        }
      }
      break

    case 'install-later':
      // Update will be installed on next quit (autoInstallOnAppQuit)
      if (autoUpdater) {
        autoUpdater.autoInstallOnAppQuit = true
      }
      break

    case 'skip':
      // Save the version to skip
      if (updateState.updateInfo?.version) {
        getSettingsService().setGlobal('updates_skip_version', updateState.updateInfo.version)
        updateAndBroadcast({ status: 'idle', updateInfo: undefined })
      }
      break

    case 'remind-later':
      // Do nothing, just close the notification
      break
  }
}

/**
 * Get the current auto-update state
 */
export function getUpdateState(): AutoUpdateState {
  return { ...updateState }
}

/**
 * Force refresh settings and reconfigure auto-updater
 */
export function refreshUpdateSettings(): void {
  if (!autoUpdater) return

  const settings = getEffectiveSettings()

  autoUpdater.autoDownload = settings.autoDownload
  autoUpdater.autoInstallOnAppQuit = settings.autoInstall
  autoUpdater.allowDowngrade = settings.allowDowngrade

  if (settings.feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: settings.feedUrl })
  }

  // Update check interval
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }

  if (settings.autoCheck && settings.checkInterval > 0) {
    checkIntervalId = setInterval(() => {
      checkForUpdates()
    }, settings.checkInterval)
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerAutoUpdateIpcHandlers(): void {
  ipcMain.handle('auto-update:getState', () => {
    return getUpdateState()
  })

  ipcMain.handle('auto-update:check', async () => {
    return await checkForUpdates()
  })

  ipcMain.handle('auto-update:download', async () => {
    return await downloadUpdate()
  })

  ipcMain.handle('auto-update:install', () => {
    installUpdate()
  })

  ipcMain.handle('auto-update:handleAction', async (_event, action: UpdateAction) => {
    await handleUpdateAction(action)
  })

  ipcMain.handle('auto-update:refreshSettings', () => {
    refreshUpdateSettings()
  })
}
