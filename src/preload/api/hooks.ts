/**
 * Hooks API for permission management
 */

import { ipcRenderer } from 'electron'
import type { PermissionConfig, HookConfig } from '../../shared/types'

export const hooks = {
  ensureBinary: (): Promise<string> => ipcRenderer.invoke('hooks:ensureBinary'),
  generateConfig: (projectId: string, taskId: string, permissions?: PermissionConfig): Promise<HookConfig> =>
    ipcRenderer.invoke('hooks:generateConfig', projectId, taskId, permissions),
  writeProjectConfig: (
    projectPath: string,
    projectId: string,
    taskId: string,
    permissions?: PermissionConfig
  ): Promise<string> => ipcRenderer.invoke('hooks:writeProjectConfig', projectPath, projectId, taskId, permissions),
  loadPermissions: (): Promise<PermissionConfig> => ipcRenderer.invoke('hooks:loadPermissions'),
  savePermissions: (permissions: PermissionConfig): Promise<void> =>
    ipcRenderer.invoke('hooks:savePermissions', permissions),
  addAllowRule: (pattern: string): Promise<void> => ipcRenderer.invoke('hooks:addAllowRule', pattern),
  addDenyRule: (pattern: string): Promise<void> => ipcRenderer.invoke('hooks:addDenyRule', pattern),
  removeAllowRule: (pattern: string): Promise<void> => ipcRenderer.invoke('hooks:removeAllowRule', pattern),
  removeDenyRule: (pattern: string): Promise<void> => ipcRenderer.invoke('hooks:removeDenyRule', pattern),
  generatePatterns: (toolName: string, toolInput: Record<string, unknown>): Promise<string[]> =>
    ipcRenderer.invoke('hooks:generatePatterns', toolName, toolInput),
  getDefaultPermissions: (): Promise<PermissionConfig> => ipcRenderer.invoke('hooks:getDefaultPermissions')
}
