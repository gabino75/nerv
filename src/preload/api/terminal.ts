/**
 * Terminal API exposed to renderer
 */

import { ipcRenderer } from 'electron'
import type { TerminalProfile, TerminalCreateResult } from '../../shared/types/terminal'

export const terminal = {
  create: (cwd?: string, profileId?: string): Promise<TerminalCreateResult> =>
    ipcRenderer.invoke('terminal:create', cwd, profileId),
  write: (terminalId: string, data: string): Promise<void> => ipcRenderer.invoke('terminal:write', terminalId, data),
  resize: (terminalId: string, cols: number, rows: number): Promise<void> => ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
  kill: (terminalId: string): Promise<void> => ipcRenderer.invoke('terminal:kill', terminalId),
  exists: (terminalId: string): Promise<boolean> => ipcRenderer.invoke('terminal:exists', terminalId),
  onData: (callback: (terminalId: string, data: string) => void): void => {
    ipcRenderer.on('terminal:data', (_event, terminalId, data) => callback(terminalId, data))
  },
  onExit: (callback: (terminalId: string, exitCode: number) => void): void => {
    ipcRenderer.on('terminal:exit', (_event, terminalId, exitCode) => callback(terminalId, exitCode))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('terminal:data')
    ipcRenderer.removeAllListeners('terminal:exit')
  },
  // Terminal profiles (PRD Section 21)
  profiles: {
    list: (): Promise<TerminalProfile[]> => ipcRenderer.invoke('terminal:profiles:list'),
    get: (profileId: string): Promise<TerminalProfile | undefined> =>
      ipcRenderer.invoke('terminal:profiles:get', profileId),
    setCustom: (profiles: TerminalProfile[]): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:setCustom', profiles),
    setOrg: (profiles: TerminalProfile[]): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:setOrg', profiles),
    getOrg: (): Promise<TerminalProfile[]> =>
      ipcRenderer.invoke('terminal:profiles:getOrg'),
    add: (profile: TerminalProfile): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:add', profile),
    update: (profile: TerminalProfile): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:update', profile),
    remove: (profileId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:remove', profileId),
    setDefault: (profileId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:profiles:setDefault', profileId),
  },
}
