/**
 * CLAUDE.md Management - File operations
 */

import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

/**
 * Get the path where CLAUDE.md is stored for a project
 */
export function getClaudeMdPath(projectId: string): string {
  const homeDir = app.getPath('home')
  return join(homeDir, '.nerv', 'projects', projectId, 'CLAUDE.md')
}

/**
 * Check if CLAUDE.md exists for a project
 */
export function claudeMdExists(projectId: string): boolean {
  return existsSync(getClaudeMdPath(projectId))
}

/**
 * Read CLAUDE.md content for a project
 */
export function readClaudeMd(projectId: string): string | null {
  const path = getClaudeMdPath(projectId)
  if (existsSync(path)) {
    return readFileSync(path, 'utf-8')
  }
  return null
}

/**
 * Save CLAUDE.md content for a project
 */
export function saveClaudeMd(projectId: string, content: string): string {
  const path = getClaudeMdPath(projectId)
  const dir = dirname(path)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(path, content, 'utf-8')
  return path
}
