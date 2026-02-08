/**
 * NERV.md and CLAUDE.md API exposed to renderer
 */

import { ipcRenderer } from 'electron'
import type { NervMdSizeCheck, ClaudeMdSection, ClaudeMdSuggestions } from '../../shared/types'

export const nervMd = {
  generate: (projectId: string, currentTaskId?: string): Promise<string> =>
    ipcRenderer.invoke('nervMd:generate', projectId, currentTaskId),
  save: (projectId: string, currentTaskId?: string): Promise<string> =>
    ipcRenderer.invoke('nervMd:save', projectId, currentTaskId),
  getPath: (projectId: string): Promise<string> =>
    ipcRenderer.invoke('nervMd:getPath', projectId),
  estimateTokens: (content: string): Promise<number> =>
    ipcRenderer.invoke('nervMd:estimateTokens', content),
  checkSize: (content: string): Promise<NervMdSizeCheck> =>
    ipcRenderer.invoke('nervMd:checkSize', content)
}

export const claudeMd = {
  getPath: (projectId: string): Promise<string> =>
    ipcRenderer.invoke('claudeMd:getPath', projectId),
  exists: (projectId: string): Promise<boolean> =>
    ipcRenderer.invoke('claudeMd:exists', projectId),
  read: (projectId: string): Promise<string | null> =>
    ipcRenderer.invoke('claudeMd:read', projectId),
  save: (projectId: string, content: string): Promise<string> =>
    ipcRenderer.invoke('claudeMd:save', projectId, content),
  initialize: (projectId: string): Promise<string> =>
    ipcRenderer.invoke('claudeMd:initialize', projectId),
  parse: (content: string): Promise<ClaudeMdSection[]> =>
    ipcRenderer.invoke('claudeMd:parse', content),
  updateSection: (projectId: string, sectionName: string, newContent: string): Promise<string> =>
    ipcRenderer.invoke('claudeMd:updateSection', projectId, sectionName, newContent),
  appendNote: (projectId: string, note: string): Promise<void> =>
    ipcRenderer.invoke('claudeMd:appendNote', projectId, note),
  getSuggestions: (projectId: string): Promise<ClaudeMdSuggestions> =>
    ipcRenderer.invoke('claudeMd:getSuggestions', projectId)
}
