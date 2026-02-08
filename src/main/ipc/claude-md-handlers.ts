/**
 * CLAUDE.md IPC Handlers
 *
 * Handles all CLAUDE.md file operations IPC messages.
 */

import { safeHandle } from './safe-handle'
import {
  getClaudeMdPath,
  claudeMdExists,
  readClaudeMd,
  saveClaudeMd,
  initializeClaudeMd,
  parseClaudeMd,
  updateClaudeMdSection,
  appendToNotes,
  getSuggestions,
  type ClaudeMdSection
} from '../claude-md'

export function registerClaudeMdHandlers(): void {
  safeHandle('claudeMd:getPath', (_event, projectId: string): string => {
    return getClaudeMdPath(projectId)
  })

  safeHandle('claudeMd:exists', (_event, projectId: string): boolean => {
    return claudeMdExists(projectId)
  })

  safeHandle('claudeMd:read', (_event, projectId: string): string | null => {
    return readClaudeMd(projectId)
  })

  safeHandle('claudeMd:save', (_event, projectId: string, content: string): string => {
    return saveClaudeMd(projectId, content)
  })

  safeHandle('claudeMd:initialize', (_event, projectId: string): string => {
    return initializeClaudeMd(projectId)
  })

  safeHandle('claudeMd:parse', (_event, content: string): ClaudeMdSection[] => {
    return parseClaudeMd(content)
  })

  safeHandle('claudeMd:updateSection', (_event, projectId: string, sectionName: string, newContent: string): string => {
    return updateClaudeMdSection(projectId, sectionName, newContent)
  })

  safeHandle('claudeMd:appendNote', (_event, projectId: string, note: string): void => {
    appendToNotes(projectId, note)
  })

  safeHandle('claudeMd:getSuggestions', (_event, projectId: string): {
    detected: string[]
    suggestions: {
      commands: Record<string, string>
      environment: string[]
      architecture: string[]
      codeStyle: string[]
      constraints: string[]
    }
  } => {
    return getSuggestions(projectId)
  })
}
