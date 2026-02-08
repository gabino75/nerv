/**
 * Hooks IPC Handlers
 *
 * Handles all permission hooks related IPC messages.
 */

import { safeHandle } from './safe-handle'
import {
  ensureHookBinary,
  generateHookConfig,
  writeProjectHookConfig,
  loadGlobalPermissions,
  saveGlobalPermissions,
  addAllowRule,
  addDenyRule,
  removeAllowRule,
  removeDenyRule,
  generatePatternSuggestions,
  DEFAULT_PERMISSIONS,
  type PermissionConfig,
} from '../hooks'

export function registerHooksHandlers(): void {
  safeHandle('hooks:ensureBinary', (): string => {
    return ensureHookBinary()
  })

  safeHandle('hooks:generateConfig', (_event, projectId: string, taskId: string, permissions?: PermissionConfig) => {
    return generateHookConfig(projectId, taskId, permissions)
  })

  safeHandle('hooks:writeProjectConfig', (_event, projectPath: string, projectId: string, taskId: string, permissions?: PermissionConfig): string => {
    return writeProjectHookConfig(projectPath, projectId, taskId, permissions)
  })

  safeHandle('hooks:loadPermissions', (): PermissionConfig => {
    return loadGlobalPermissions()
  })

  safeHandle('hooks:savePermissions', (_event, permissions: PermissionConfig): void => {
    saveGlobalPermissions(permissions)
  })

  safeHandle('hooks:addAllowRule', (_event, pattern: string): void => {
    addAllowRule(pattern)
  })

  safeHandle('hooks:addDenyRule', (_event, pattern: string): void => {
    addDenyRule(pattern)
  })

  safeHandle('hooks:removeAllowRule', (_event, pattern: string): void => {
    removeAllowRule(pattern)
  })

  safeHandle('hooks:removeDenyRule', (_event, pattern: string): void => {
    removeDenyRule(pattern)
  })

  safeHandle('hooks:generatePatterns', (_event, toolName: string, toolInput: Record<string, unknown>): string[] => {
    return generatePatternSuggestions(toolName, toolInput)
  })

  safeHandle('hooks:getDefaultPermissions', (): PermissionConfig => {
    return DEFAULT_PERMISSIONS
  })
}
