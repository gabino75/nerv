/**
 * Repo IPC Handlers
 *
 * Handles all repository-related IPC messages.
 */

import { databaseService } from '../database'
import { safeHandle } from './safe-handle'
import {
  scanRepository,
  scanResultToContextEntries,
  scanResultToSkillEntries
} from '../repo-scanner'
import type { Repo, DocumentationSource, RepoSourceType } from '../../shared/types'

export function registerRepoHandlers(): void {
  safeHandle('db:repos:getForProject', (_event, projectId: string): Repo[] => {
    return databaseService.getReposForProject(projectId)
  })

  safeHandle('db:repos:create', async (
    _event,
    projectId: string,
    name: string,
    path: string,
    options?: {
      stack?: string
      sourceType?: RepoSourceType
      baseBranch?: string
      fetchBeforeWorktree?: boolean
      autoFetchOnOpen?: boolean
    }
  ): Promise<Repo> => {
    const repo = databaseService.createRepo(projectId, name, path, options)

    // Scan repository for context (PRD Section 24)
    try {
      const scanResult = await scanRepository(path)
      const contextEntries = scanResultToContextEntries(repo.id, path, scanResult)
      const skillEntries = scanResultToSkillEntries(repo.id, scanResult)

      // Store context entries
      for (const entry of contextEntries) {
        databaseService.createRepoContext(entry)
      }

      // Store skill entries
      for (const skill of skillEntries) {
        databaseService.upsertRepoSkill(skill)
      }

      console.log(`[NERV] Scanned ${path}: claude_md=${!!scanResult.claudeMd}, skills=${scanResult.skills.length}, mcp=${!!scanResult.mcpConfig}`)
    } catch (error) {
      console.error(`[NERV] Failed to scan repository ${path}:`, error)
      // Don't fail repo creation if scanning fails
    }

    return repo
  })

  // Rescan repository context
  safeHandle('db:repos:rescan', async (_event, repoId: string): Promise<{ success: boolean; error?: string }> => {
    // Find repo across all projects
    const allProjects = databaseService.getAllProjects()
    let foundRepo: { id: string; path: string } | null = null

    for (const project of allProjects) {
      const repo = databaseService.getReposForProject(project.id).find(r => r.id === repoId)
      if (repo) {
        foundRepo = repo
        break
      }
    }

    if (!foundRepo) {
      return { success: false, error: 'Repository not found' }
    }

    try {
      databaseService.deleteRepoContext(repoId)
      databaseService.deleteRepoSkills(repoId)

      const scanResult = await scanRepository(foundRepo.path)
      const contextEntries = scanResultToContextEntries(repoId, foundRepo.path, scanResult)
      const skillEntries = scanResultToSkillEntries(repoId, scanResult)

      contextEntries.forEach(entry => databaseService.createRepoContext(entry))
      skillEntries.forEach(skill => databaseService.upsertRepoSkill(skill))

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Get repository context
  safeHandle('db:repos:getContext', (_event, repoId: string) => {
    return databaseService.getRepoContext(repoId)
  })

  // Get repository skills
  safeHandle('db:repos:getSkills', (_event, repoId: string) => {
    return databaseService.getRepoSkills(repoId)
  })

  // Get all skills for a project
  safeHandle('db:repos:getProjectSkills', (_event, projectId: string) => {
    return databaseService.getProjectSkills(projectId)
  })

  // Get all CLAUDE.md contexts for a project
  safeHandle('db:repos:getProjectClaudeMdContexts', (_event, projectId: string) => {
    return databaseService.getProjectClaudeMdContexts(projectId)
  })

  // Documentation Sources
  safeHandle('db:docSources:getForProject', (_event, projectId: string): DocumentationSource[] => {
    return databaseService.getDocumentationSources(projectId)
  })

  safeHandle('db:docSources:create', (_event, projectId: string, name: string, urlPattern: string): DocumentationSource => {
    return databaseService.createDocumentationSource(projectId, name, urlPattern)
  })

  safeHandle('db:docSources:update', (_event, id: string, updates: { name?: string; urlPattern?: string }): DocumentationSource | undefined => {
    return databaseService.updateDocumentationSource(id, updates)
  })

  safeHandle('db:docSources:delete', (_event, id: string): void => {
    databaseService.deleteDocumentationSource(id)
  })
}
