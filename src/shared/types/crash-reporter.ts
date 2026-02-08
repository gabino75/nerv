/**
 * Crash Reporter Types (PRD Section 24 - Phase 8)
 */

/**
 * Crash report structure
 */
export interface CrashReport {
  timestamp: string
  version: string
  platform: string
  arch: string
  nodeVersion: string
  electronVersion: string
  type: 'exception' | 'rejection' | 'native-crash' | 'renderer-crash'
  error: {
    name: string
    message: string
    stack?: string
  }
  context?: Record<string, unknown>
}
