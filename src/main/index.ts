import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { databaseService } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { registerTerminalIpcHandlers, cleanupTerminals, setCustomProfiles } from './terminal'
import { loadCustomTerminalProfiles } from './settings-loader'
import { registerClaudeIpcHandlers, cleanupClaudeSessions } from './claude'
import {
  registerRecoveryIpcHandlers,
  runStartupIntegrityChecks,
  cleanupAllMonitors,
  getActiveTaskIds,
  markTaskInterrupted
} from './recovery'
import { registerBranchingIpcHandlers } from './branching'
import { registerWorktreeIpcHandlers } from './worktree'
import { registerYoloBenchmarkIpcHandlers, cleanupYoloBenchmarks } from './yolo-benchmark'
import { registerAuditIpcHandlers, initializeAuditSystem } from './audit'
import { refreshOrgTerminalProfiles } from './ipc/org-handlers'
import { initializeAutoUpdater, cleanupAutoUpdater, registerAutoUpdateIpcHandlers } from './auto-update'
import {
  initializeCrashReporter,
  reportException,
  reportRejection,
  reportRendererCrash
} from './crash-reporter'
import { WINDOW_DEFAULTS } from '../shared/constants'
import { isAppShuttingDown, setAppShuttingDown } from './app-state'

// Initialize crash reporter early (PRD Section 24 - Phase 8)
initializeCrashReporter()

// Suppress error dialogs during shutdown - errors during cleanup are expected
// and should be logged, not shown to users
process.on('uncaughtException', (error) => {
  if (isAppShuttingDown()) {
    console.error('[NERV] Suppressed error during shutdown:', error.message)
    return
  }
  console.error('[NERV] Uncaught exception:', error)
  // Write crash report to disk for later analysis
  reportException(error, { source: 'uncaughtException' })
  // Only show dialog if not shutting down and in production
  if (!is.dev) {
    dialog.showErrorBox('NERV Error', `An unexpected error occurred: ${error.message}`)
  }
})

process.on('unhandledRejection', (reason) => {
  if (isAppShuttingDown()) {
    console.error('[NERV] Suppressed unhandled rejection during shutdown:', reason)
    return
  }
  console.error('[NERV] Unhandled rejection:', reason)
  // Write crash report to disk for later analysis
  reportRejection(reason, { source: 'unhandledRejection' })
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    show: false,
    title: 'NERV',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Handle renderer process crashes (PRD Section 24 - Phase 8)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[NERV] Renderer process crashed:', details.reason, 'exitCode:', details.exitCode)
    reportRendererCrash(details.reason, details.exitCode, {
      source: 'render-process-gone'
    })
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Initialize database
  databaseService.initialize()

  // Register this instance (PRD Section 11 - Multi-Instance Support)
  databaseService.registerInstance()

  // Register IPC handlers for database operations
  registerIpcHandlers()

  // Register IPC handlers for terminal operations
  registerTerminalIpcHandlers()

  // Register IPC handlers for Claude Code operations
  registerClaudeIpcHandlers()

  // Register IPC handlers for recovery operations
  registerRecoveryIpcHandlers()

  // Register IPC handlers for branching operations
  registerBranchingIpcHandlers()

  // Register IPC handlers for worktree operations
  registerWorktreeIpcHandlers()

  // Register IPC handlers for YOLO benchmark operations
  registerYoloBenchmarkIpcHandlers()

  // Register IPC handlers for Audit System operations and initialize
  registerAuditIpcHandlers()
  initializeAuditSystem()

  // Load custom terminal profiles from ~/.nerv/config.json (PRD Section 10)
  const customProfiles = loadCustomTerminalProfiles()
  if (customProfiles.length > 0) {
    setCustomProfiles(customProfiles)
  }

  // Load org-defined terminal profiles at startup (PRD Section 21)
  refreshOrgTerminalProfiles()

  // Initialize auto-update system (PRD Section 22)
  registerAutoUpdateIpcHandlers()
  initializeAutoUpdater()

  // Run startup integrity checks (PRD Section 22 - State Corruption Prevention)
  const integrityReport = runStartupIntegrityChecks()
  if (integrityReport.hasInterruptedTasks) {
    console.log(`[NERV] Startup integrity: ${integrityReport.issues.length} issue(s) found`)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.nerv')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Set shutdown flag to suppress errors during cleanup
  setAppShuttingDown(true)

  // Wrap all cleanup in try-catch to prevent error popups on shutdown
  try {
    // Mark any in-progress tasks as interrupted for graceful shutdown
    const activeTaskIds = getActiveTaskIds()
    for (const taskId of activeTaskIds) {
      try {
        markTaskInterrupted(taskId)
      } catch (err) {
        console.error(`[NERV] Failed to mark task ${taskId} as interrupted:`, err)
      }
    }
  } catch (err) {
    console.error('[NERV] Failed to get active task IDs:', err)
  }

  // Clean up session monitors (clears intervals)
  try {
    cleanupAllMonitors()
  } catch (err) {
    console.error('[NERV] Failed to cleanup monitors:', err)
  }

  // Clean up Claude sessions (kills PTY processes)
  try {
    cleanupClaudeSessions()
  } catch (err) {
    console.error('[NERV] Failed to cleanup Claude sessions:', err)
  }

  // Clean up terminals (kills PTY processes)
  try {
    cleanupTerminals()
  } catch (err) {
    console.error('[NERV] Failed to cleanup terminals:', err)
  }

  // Clean up YOLO benchmarks (uses database, must be before db close)
  try {
    cleanupYoloBenchmarks()
  } catch (err) {
    console.error('[NERV] Failed to cleanup YOLO benchmarks:', err)
  }

  // Clean up auto-update (clears interval)
  try {
    cleanupAutoUpdater()
  } catch (err) {
    console.error('[NERV] Failed to cleanup auto-updater:', err)
  }

  // Unregister this instance (PRD Section 11 - Multi-Instance Support)
  // Must be before database close
  try {
    databaseService.unregisterInstance()
  } catch (err) {
    console.error('[NERV] Failed to unregister instance:', err)
  }

  // Close database connection gracefully (must be last)
  try {
    databaseService.close()
  } catch (err) {
    console.error('[NERV] Failed to close database:', err)
  }
})
