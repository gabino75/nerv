/**
 * Settings IPC Handlers
 *
 * Handles all settings and export/import related IPC messages.
 * PRD Section 13: Settings Hierarchy
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import { getSettingsService } from '../../core/settings.js'
import type { Project, Task, Cycle, Decision, Repo, DocumentationSource } from '../../shared/types'
import type {
  NervSettings,
  ResolvedSetting,
  RepoSettings,
  TaskSettings
} from '../../shared/types/settings'

export function registerSettingsHandlers(): void {
  // Database key-value settings (for simple persistence)
  safeHandle('db:settings:get', (_event, key: string): string | undefined => {
    return databaseService.getSetting(key)
  })

  safeHandle('db:settings:set', (_event, key: string, value: string | null): void => {
    databaseService.setSetting(key, value)
  })

  // PRD Section 13: Hierarchical Settings Service handlers
  // These provide proper resolution: Task → Environment → Project → Organization → Global → Default

  safeHandle(
    'settings:get',
    (_event, key: keyof NervSettings): NervSettings[keyof NervSettings] => {
      return getSettingsService().get(key)
    }
  )

  safeHandle(
    'settings:getWithSource',
    (_event, key: keyof NervSettings): ResolvedSetting<NervSettings[keyof NervSettings]> => {
      return getSettingsService().getWithSource(key)
    }
  )

  safeHandle('settings:getAll', (): NervSettings => {
    return getSettingsService().getAll()
  })

  safeHandle(
    'settings:getAllWithSources',
    (): Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>> => {
      return getSettingsService().getAllWithSources()
    }
  )

  safeHandle(
    'settings:setGlobal',
    <K extends keyof NervSettings>(
      _event: unknown,
      key: K,
      value: NervSettings[K]
    ): void => {
      getSettingsService().setGlobal(key, value)
    }
  )

  safeHandle(
    'settings:setProject',
    <K extends keyof NervSettings>(
      _event: unknown,
      key: K,
      value: NervSettings[K]
    ): void => {
      getSettingsService().setProject(key, value)
    }
  )

  safeHandle(
    'settings:unsetGlobal',
    (_event, key: keyof NervSettings): void => {
      getSettingsService().unsetGlobal(key)
    }
  )

  safeHandle(
    'settings:unsetProject',
    (_event, key: keyof NervSettings): void => {
      getSettingsService().unsetProject(key)
    }
  )

  // PRD Section 13: Repo-level settings
  safeHandle(
    'settings:getRepoSettings',
    (_event, repoPath: string): RepoSettings | null => {
      return getSettingsService().getRepoSettings(repoPath)
    }
  )

  safeHandle(
    'settings:setRepoSettings',
    (_event, repoPath: string, settings: RepoSettings): void => {
      getSettingsService().setRepoSettings(repoPath, settings)
    }
  )

  // PRD Section 13: Task-level settings (in-memory, highest priority)
  safeHandle('settings:getTaskSettings', (): TaskSettings | null => {
    return getSettingsService().getTaskSettings()
  })

  safeHandle('settings:setTaskSettings', (_event, settings: TaskSettings | null): void => {
    getSettingsService().setTaskSettings(settings)
  })

  // Get active environment variable overrides
  safeHandle(
    'settings:getActiveEnvOverrides',
    (): Array<{ key: keyof NervSettings; envVar: string; value: unknown }> => {
      return getSettingsService().getActiveEnvOverrides()
    }
  )

  // Reload settings from disk
  safeHandle('settings:reload', (): void => {
    getSettingsService().reload()
  })

  safeHandle('db:settings:getCurrentProjectId', (): string | undefined => {
    return databaseService.getCurrentProjectId()
  })

  safeHandle('db:settings:setCurrentProjectId', (_event, projectId: string | null): void => {
    databaseService.setCurrentProjectId(projectId)
  })

  safeHandle('db:settings:getCurrentProject', (): Project | undefined => {
    return databaseService.getCurrentProject()
  })

  // Export project data
  safeHandle('export:project', (_event, projectId: string): {
    project: Project
    tasks: Task[]
    cycles: Cycle[]
    decisions: Decision[]
    repos: Repo[]
    docSources: DocumentationSource[]
  } | null => {
    const project = databaseService.getProject(projectId)
    if (!project) return null

    return {
      project,
      tasks: databaseService.getTasksForProject(projectId),
      cycles: databaseService.getCyclesForProject(projectId),
      decisions: databaseService.getDecisionsForProject(projectId),
      repos: databaseService.getReposForProject(projectId),
      docSources: databaseService.getDocumentationSources(projectId)
    }
  })

  // Import project data
  safeHandle('import:project', (_event, data: {
    project: { name: string; goal: string | null }
    tasks?: Array<{ title: string; description: string | null; task_type: string; status: string }>
    cycles?: Array<{ cycle_number: number; goal: string | null; status: string; learnings: string | null }>
    decisions?: Array<{ title: string; rationale: string | null; alternatives: string | null }>
    repos?: Array<{ name: string; path: string; stack: string | null }>
    docSources?: Array<{ name: string; url_pattern: string }>
  }): Project => {
    const project = databaseService.createProject(data.project.name, data.project.goal || undefined)

    data.cycles?.forEach(c => {
      const created = databaseService.createCycle(project.id, c.cycle_number, c.goal || undefined)
      if (c.learnings) databaseService.updateCycle(created.id, { learnings: c.learnings })
    })

    data.tasks?.forEach(t => databaseService.createTaskWithType(
      project.id, t.title, (t.task_type as 'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug') || 'implementation', t.description || undefined
    ))

    data.decisions?.forEach(d => databaseService.createDecision(
      project.id, d.title, d.rationale || undefined, undefined, d.alternatives || undefined
    ))

    data.repos?.forEach(r => databaseService.createRepo(project.id, r.name, r.path, r.stack || undefined))

    data.docSources?.forEach(d => databaseService.createDocumentationSource(project.id, d.name, d.url_pattern))

    return project
  })
}
