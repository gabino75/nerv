/**
 * Organization Config API
 *
 * Preload API for organization configuration.
 * Implements PRD Section 20: Organization Configuration
 */

import { ipcRenderer } from 'electron'
import type { OrgSyncStatus, OrganizationConfig, OrganizationSettings } from '../../shared/types/settings'
import type { TerminalProfile } from '../../shared/types/terminal'

export const org = {
  getConfig: (): Promise<OrganizationConfig | null> =>
    ipcRenderer.invoke('org:getConfig'),

  getSyncStatus: (): Promise<OrgSyncStatus> =>
    ipcRenderer.invoke('org:getSyncStatus'),

  sync: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('org:sync'),

  loadSettings: (): Promise<OrganizationSettings | null> =>
    ipcRenderer.invoke('org:loadSettings'),

  listAgents: (): Promise<string[]> =>
    ipcRenderer.invoke('org:listAgents'),

  listSkills: (): Promise<string[]> =>
    ipcRenderer.invoke('org:listSkills'),

  listWorkflows: (): Promise<string[]> =>
    ipcRenderer.invoke('org:listWorkflows'),

  isConfigured: (): Promise<boolean> =>
    ipcRenderer.invoke('org:isConfigured'),

  listTerminalProfiles: (): Promise<TerminalProfile[]> =>
    ipcRenderer.invoke('org:listTerminalProfiles')
}
