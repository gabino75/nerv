/**
 * Crash Reporter IPC Handlers (PRD Section 24 - Phase 8)
 *
 * Provides IPC handlers for crash reporting from renderer process.
 */

import { safeHandle } from './safe-handle'
import {
  reportException,
  getRecentCrashReports,
  hadRecentCrash,
  getCrashDumpsPath,
  CrashReport
} from '../crash-reporter'

/**
 * Register all crash reporter IPC handlers
 */
export function registerCrashReporterHandlers(): void {
  // Report an error from renderer
  safeHandle('crash:report', (_event, error: { name: string; message: string; stack?: string }) => {
    const err = new Error(error.message)
    err.name = error.name
    err.stack = error.stack
    reportException(err, { source: 'renderer' })
  })

  // Get recent crash reports
  safeHandle('crash:getRecent', (_event, limit?: number): CrashReport[] => {
    return getRecentCrashReports(limit)
  })

  // Check if there was a recent crash (for startup warnings)
  safeHandle('crash:hadRecent', (_event, withinMs?: number): boolean => {
    return hadRecentCrash(withinMs)
  })

  // Get the path to native crash dumps
  safeHandle('crash:getDumpsPath', (): string => {
    return getCrashDumpsPath()
  })
}
