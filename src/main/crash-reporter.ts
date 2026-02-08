/**
 * Crash Reporting Module (PRD Section 24 - Phase 8)
 *
 * Captures and logs crashes, errors, and exceptions for debugging.
 * Writes crash reports to ~/.nerv/crashes/ for local inspection.
 * Can be extended to submit to remote services if needed.
 */

import { crashReporter, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, readFileSync } from 'fs'
import { homedir } from 'os'
import type { CrashReport } from '../shared/types'

// Re-export the type so consumers don't need to import from two places
export type { CrashReport } from '../shared/types'

// Maximum number of crash reports to keep
const MAX_CRASH_REPORTS = 50
// Maximum age of crash reports in days
const MAX_CRASH_AGE_DAYS = 30

let crashReporterInitialized = false
let crashDir: string

/**
 * Get the crash reports directory
 */
function getCrashDir(): string {
  if (!crashDir) {
    crashDir = join(homedir(), '.nerv', 'crashes')
  }
  return crashDir
}

/**
 * Ensure crash directory exists
 */
function ensureCrashDir(): void {
  const dir = getCrashDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Clean up old crash reports
 */
function cleanupOldCrashReports(): void {
  const dir = getCrashDir()
  if (!existsSync(dir)) return

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fullPath = join(dir, f)
      const stat = statSync(fullPath)
      return { path: fullPath, name: f, mtime: stat.mtime.getTime() }
    })
    .sort((a, b) => b.mtime - a.mtime) // Sort by newest first

  const now = Date.now()
  const maxAge = MAX_CRASH_AGE_DAYS * 24 * 60 * 60 * 1000

  // Remove files older than max age or beyond max count
  files.forEach((file, index) => {
    const age = now - file.mtime
    if (age > maxAge || index >= MAX_CRASH_REPORTS) {
      try {
        unlinkSync(file.path)
      } catch {
        // Ignore deletion errors
      }
    }
  })
}

/**
 * Write a crash report to disk
 */
function writeCrashReport(report: CrashReport): void {
  ensureCrashDir()

  const filename = `crash-${report.timestamp.replace(/[:.]/g, '-')}.json`
  const filepath = join(getCrashDir(), filename)

  try {
    writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8')
    console.error(`[NERV] Crash report written to: ${filepath}`)
  } catch (err) {
    console.error('[NERV] Failed to write crash report:', err)
  }
}

/**
 * Create a crash report from an error
 */
function createCrashReport(
  type: CrashReport['type'],
  error: Error | unknown,
  context?: Record<string, unknown>
): CrashReport {
  const err = error instanceof Error ? error : new Error(String(error))

  return {
    timestamp: new Date().toISOString(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    type,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    },
    context
  }
}

/**
 * Report an exception
 */
export function reportException(error: Error, context?: Record<string, unknown>): void {
  const report = createCrashReport('exception', error, context)
  writeCrashReport(report)
}

/**
 * Report an unhandled rejection
 */
export function reportRejection(reason: unknown, context?: Record<string, unknown>): void {
  const report = createCrashReport('rejection', reason, context)
  writeCrashReport(report)
}

/**
 * Report a renderer crash
 */
export function reportRendererCrash(
  reason: string,
  exitCode: number,
  context?: Record<string, unknown>
): void {
  const report = createCrashReport('renderer-crash', new Error(`Renderer crashed: ${reason}`), {
    ...context,
    exitCode,
    reason
  })
  writeCrashReport(report)
}

/**
 * Initialize the crash reporter
 */
export function initializeCrashReporter(): void {
  if (crashReporterInitialized) return

  // Clean up old crash reports
  cleanupOldCrashReports()

  // Start Electron's native crash reporter
  // This captures native crashes (segfaults, etc.)
  crashReporter.start({
    productName: 'NERV',
    companyName: 'NERV',
    submitURL: '', // Empty = no remote submission, just local crash dumps
    uploadToServer: false,
    ignoreSystemCrashHandler: false
  })

  crashReporterInitialized = true
  console.log('[NERV] Crash reporter initialized')
}

/**
 * Get the path to crash dumps (native crashes)
 */
export function getCrashDumpsPath(): string {
  return crashReporter.getCrashesDirectory()
}

/**
 * Get recent crash reports
 */
export function getRecentCrashReports(limit = 10): CrashReport[] {
  const dir = getCrashDir()
  if (!existsSync(dir)) return []

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fullPath = join(dir, f)
      const stat = statSync(fullPath)
      return { path: fullPath, mtime: stat.mtime.getTime() }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)

  const reports: CrashReport[] = []
  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(file.path, 'utf-8')) as CrashReport
      reports.push(content)
    } catch {
      // Skip invalid files
    }
  }

  return reports
}

/**
 * Check if there were recent crashes (useful for startup warnings)
 */
export function hadRecentCrash(withinMs = 60 * 60 * 1000): boolean {
  const reports = getRecentCrashReports(1)
  if (reports.length === 0) return false

  const mostRecent = new Date(reports[0].timestamp).getTime()
  return Date.now() - mostRecent < withinMs
}
