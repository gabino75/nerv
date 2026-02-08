/**
 * Platform utilities for NERV Core
 *
 * Provides platform-agnostic ways to get NERV directories.
 * These functions work in both CLI and Electron contexts.
 */

import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * Get the home directory in a platform-agnostic way.
 * Works in both Node.js (CLI) and Electron contexts.
 */
export function getHomeDir(): string {
  // Try Electron's app.getPath first if available
  try {
    // Dynamic import to avoid requiring Electron in CLI
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      return app.getPath('home')
    }
  } catch {
    // Electron not available, use Node.js homedir
  }

  return homedir()
}

/**
 * Get the NERV data directory (~/.nerv)
 */
export function getNervDir(): string {
  return join(getHomeDir(), '.nerv')
}

/**
 * Get the NERV projects directory (~/.nerv/projects)
 */
export function getNervProjectsDir(): string {
  return join(getNervDir(), 'projects')
}

/**
 * Get the database path for NERV
 */
export function getDatabasePath(): string {
  return join(getNervDir(), 'state.db')
}

/**
 * Ensure the NERV directory exists
 */
export function ensureNervDir(): void {
  const nervDir = getNervDir()
  if (!existsSync(nervDir)) {
    mkdirSync(nervDir, { recursive: true })
  }
}

/**
 * Ensure a project directory exists
 */
export function ensureProjectDir(projectId: string): string {
  const projectDir = join(getNervProjectsDir(), projectId)
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true })
  }
  return projectDir
}
