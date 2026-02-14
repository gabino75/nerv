/**
 * Organization Config IPC Handlers
 *
 * Handles organization configuration related IPC messages.
 * Implements PRD Section 20: Organization Configuration
 */

import { safeHandle } from './safe-handle'
import {
  getOrgConfig,
  getOrgSyncStatus,
  syncOrgConfig,
  loadOrgSettings,
  listOrgAgents,
  listOrgSkills,
  listOrgWorkflows,
  listOrgTerminalProfiles,
  isOrgConfigured
} from '../../core/org-config'
import type { TerminalProfile } from '../../shared/types/terminal'
import type { OrgSyncStatus, OrganizationConfig, OrganizationSettings } from '../../shared/types/settings'
import { setOrgProfiles } from '../terminal'

/**
 * Refresh org terminal profiles in terminal module
 * Called after sync and at app startup
 */
export function refreshOrgTerminalProfiles(): void {
  const profiles = listOrgTerminalProfiles()
  const terminalProfiles: TerminalProfile[] = profiles.map(p => ({
    ...p,
    isBuiltIn: false,
    isDefault: false
  }))
  setOrgProfiles(terminalProfiles)
}

export function registerOrgHandlers(): void {
  safeHandle('org:getConfig', (): OrganizationConfig | null => {
    return getOrgConfig()
  })

  safeHandle('org:getSyncStatus', (): OrgSyncStatus => {
    return getOrgSyncStatus()
  })

  safeHandle('org:sync', async (): Promise<{ success: boolean; error?: string }> => {
    const result = syncOrgConfig()
    // After successful sync, refresh org terminal profiles
    if (result.success) {
      try {
        refreshOrgTerminalProfiles()
      } catch (err) {
        console.error('[NERV] Failed to refresh org terminal profiles after sync:', err)
        return { success: true, error: `Sync succeeded but profile refresh failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    return result
  })

  safeHandle('org:loadSettings', (): OrganizationSettings | null => {
    return loadOrgSettings()
  })

  safeHandle('org:listAgents', (): string[] => {
    return listOrgAgents()
  })

  safeHandle('org:listSkills', (): string[] => {
    return listOrgSkills()
  })

  safeHandle('org:listWorkflows', (): string[] => {
    return listOrgWorkflows()
  })

  safeHandle('org:isConfigured', (): boolean => {
    return isOrgConfigured()
  })

  safeHandle('org:listTerminalProfiles', (): TerminalProfile[] => {
    const profiles = listOrgTerminalProfiles()
    // Convert org profiles to TerminalProfile format with isBuiltIn: false
    return profiles.map(p => ({
      ...p,
      isBuiltIn: false,
      isDefault: false
    }))
  })
}
