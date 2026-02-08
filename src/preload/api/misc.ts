/**
 * Miscellaneous APIs: versions, export/import, dialog, MCP, subagents, skills
 */

import { ipcRenderer } from 'electron'
import type { Project, ProjectExport, ProjectImport, Subagent, SubagentStatus, SubagentUsage, BuiltInSkill, SkillDefinition, MarketplaceSkill, CrashReport } from '../../shared/types'
import type { Recommendation } from '../../shared/prompts/recommend'

interface ExecuteResult {
  success: boolean
  action: string
  data?: Record<string, unknown>
  error?: string
}

export const versions = {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
}

export const projectIO = {
  export: (projectId: string): Promise<ProjectExport | null> =>
    ipcRenderer.invoke('export:project', projectId),
  import: (data: ProjectImport): Promise<Project> =>
    ipcRenderer.invoke('import:project', data)
}

export const dialog = {
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory')
}

export const mcp = {
  generateConfig: (projectId: string, allowedDomains: string[]): Promise<string> =>
    ipcRenderer.invoke('mcp:generateConfig', projectId, allowedDomains),
  getConfigPath: (projectId: string): Promise<string | null> =>
    ipcRenderer.invoke('mcp:getConfigPath', projectId),
  deleteConfig: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('mcp:deleteConfig', projectId),
  readConfig: (projectId: string): Promise<unknown> =>
    ipcRenderer.invoke('mcp:readConfig', projectId),
  updateDomains: (projectId: string, allowedDomains: string[]): Promise<string | null> =>
    ipcRenderer.invoke('mcp:updateDomains', projectId, allowedDomains),
  generateFromDocSources: (projectId: string, taskId?: string): Promise<string | null> =>
    ipcRenderer.invoke('mcp:generateFromDocSources', projectId, taskId)
}

export const subagents = {
  get: (id: string): Promise<Subagent | undefined> =>
    ipcRenderer.invoke('db:subagents:get', id),
  getForSession: (parentSessionId: string): Promise<Subagent[]> =>
    ipcRenderer.invoke('db:subagents:getForSession', parentSessionId),
  getForTask: (taskId: string): Promise<Subagent[]> =>
    ipcRenderer.invoke('db:subagents:getForTask', taskId),
  getActive: (taskId?: string): Promise<Subagent[]> =>
    ipcRenderer.invoke('db:subagents:getActive', taskId),
  create: (parentSessionId: string, taskId: string, agentType: string): Promise<Subagent> =>
    ipcRenderer.invoke('db:subagents:create', parentSessionId, taskId, agentType),
  updateMetrics: (id: string, updates: { inputTokens?: number; outputTokens?: number; costUsd?: number }): Promise<Subagent | undefined> =>
    ipcRenderer.invoke('db:subagents:updateMetrics', id, updates),
  complete: (id: string, status: SubagentStatus, metrics?: { inputTokens: number; outputTokens: number; costUsd: number }): Promise<Subagent | undefined> =>
    ipcRenderer.invoke('db:subagents:complete', id, status, metrics),
  getUsage: (taskId: string): Promise<SubagentUsage> =>
    ipcRenderer.invoke('db:subagents:getUsage', taskId)
}

export const skills = {
  discover: (): Promise<BuiltInSkill[]> =>
    ipcRenderer.invoke('skills:discover'),
  get: (name: string): Promise<BuiltInSkill | undefined> =>
    ipcRenderer.invoke('skills:get', name),
  generatePrompt: (skillName: string): Promise<string> =>
    ipcRenderer.invoke('skills:generatePrompt', skillName),
  // PRD Section 15: Custom skill management
  create: (skill: SkillDefinition): Promise<BuiltInSkill> =>
    ipcRenderer.invoke('skills:create', skill),
  edit: (skillName: string): Promise<boolean> =>
    ipcRenderer.invoke('skills:edit', skillName),
  delete: (skillName: string): Promise<boolean> =>
    ipcRenderer.invoke('skills:delete', skillName),
  // PRD Section 15: Skills marketplace
  searchMarketplace: (query: string): Promise<MarketplaceSkill[]> =>
    ipcRenderer.invoke('skills:searchMarketplace', query),
  installSkill: (skillId: string, scope: 'global' | 'project'): Promise<BuiltInSkill> =>
    ipcRenderer.invoke('skills:installSkill', skillId, scope)
}

// "What's Next?" recommendation
export const recommend = {
  getNext: (projectId: string): Promise<Recommendation | null> =>
    ipcRenderer.invoke('recommend:getNext', projectId),
  getNextWithDirection: (projectId: string, direction?: string): Promise<Recommendation[]> =>
    ipcRenderer.invoke('recommend:getNextWithDirection', projectId, direction),
  execute: (projectId: string, recommendation: Recommendation): Promise<ExecuteResult> =>
    ipcRenderer.invoke('recommend:execute', projectId, recommendation),
}

// PRD Section 24 Phase 8: Crash reporting
export const crashReporter = {
  report: (error: { name: string; message: string; stack?: string }): Promise<void> =>
    ipcRenderer.invoke('crash:report', error),
  getRecent: (limit?: number): Promise<CrashReport[]> =>
    ipcRenderer.invoke('crash:getRecent', limit),
  hadRecent: (withinMs?: number): Promise<boolean> =>
    ipcRenderer.invoke('crash:hadRecent', withinMs),
  getDumpsPath: (): Promise<string> =>
    ipcRenderer.invoke('crash:getDumpsPath')
}
