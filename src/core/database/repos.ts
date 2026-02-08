/**
 * NERV Core Database - Repository and documentation operations
 */

import type { Repo, DocumentationSource, RepoContext, RepoSkill, RepoContextType } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class RepoOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string
  ) {}

  // =====================
  // Repos
  // =====================

  getReposForProject(projectId: string): Repo[] {
    return this.getDb().prepare('SELECT * FROM repos WHERE project_id = ?').all(projectId) as Repo[]
  }

  createRepo(projectId: string, name: string, path: string, stack?: string): Repo {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO repos (id, project_id, name, path, stack) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, name, path, stack || null)
    return this.getDb().prepare('SELECT * FROM repos WHERE id = ?').get(id) as Repo
  }

  // =====================
  // Documentation Sources
  // =====================

  getDocumentationSources(projectId: string): DocumentationSource[] {
    return this.getDb().prepare(
      'SELECT * FROM documentation_sources WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as DocumentationSource[]
  }

  createDocumentationSource(projectId: string, name: string, urlPattern: string): DocumentationSource {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO documentation_sources (id, project_id, name, url_pattern) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, name, urlPattern)
    return this.getDb().prepare('SELECT * FROM documentation_sources WHERE id = ?').get(id) as DocumentationSource
  }

  // =====================
  // Repository Context
  // =====================

  getRepoContextForRepo(repoId: string): RepoContext[] {
    return this.getDb().prepare('SELECT * FROM repo_context WHERE repo_id = ?').all(repoId) as RepoContext[]
  }

  getRepoContextByType(repoId: string, contextType: RepoContextType): RepoContext | undefined {
    return this.getDb().prepare(
      'SELECT * FROM repo_context WHERE repo_id = ? AND context_type = ?'
    ).get(repoId, contextType) as RepoContext | undefined
  }

  upsertRepoContext(opts: {
    repoId: string
    contextType: RepoContextType
    filePath: string
    content: string
    parsedSections?: string
    fileHash?: string
  }): RepoContext {
    const { repoId, contextType, filePath, content, parsedSections, fileHash } = opts
    const existing = this.getRepoContextByType(repoId, contextType)
    const lastScannedAt = Date.now()

    if (existing) {
      this.getDb().prepare(`
        UPDATE repo_context
        SET file_path = ?, content = ?, parsed_sections = ?, last_scanned_at = ?, file_hash = ?
        WHERE id = ?
      `).run(filePath, content, parsedSections || null, lastScannedAt, fileHash || null, existing.id)
      return this.getDb().prepare('SELECT * FROM repo_context WHERE id = ?').get(existing.id) as RepoContext
    } else {
      const id = this.generateId()
      this.getDb().prepare(`
        INSERT INTO repo_context (id, repo_id, context_type, file_path, content, parsed_sections, last_scanned_at, file_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, repoId, contextType, filePath, content, parsedSections || null, lastScannedAt, fileHash || null)
      return this.getDb().prepare('SELECT * FROM repo_context WHERE id = ?').get(id) as RepoContext
    }
  }

  // =====================
  // Repository Skills
  // =====================

  getRepoSkills(repoId: string): RepoSkill[] {
    return this.getDb().prepare('SELECT * FROM repo_skills WHERE repo_id = ?').all(repoId) as RepoSkill[]
  }

  upsertRepoSkill(opts: {
    repoId: string
    skillName: string
    skillPath: string
    content: string
    description?: string
    triggerPattern?: string
  }): RepoSkill {
    const { repoId, skillName, skillPath, content, description, triggerPattern } = opts
    const existing = this.getDb().prepare(
      'SELECT * FROM repo_skills WHERE repo_id = ? AND skill_name = ?'
    ).get(repoId, skillName) as RepoSkill | undefined

    if (existing) {
      this.getDb().prepare(`
        UPDATE repo_skills
        SET skill_path = ?, content = ?, description = ?, trigger_pattern = ?
        WHERE id = ?
      `).run(skillPath, content, description || null, triggerPattern || null, existing.id)
      return this.getDb().prepare('SELECT * FROM repo_skills WHERE id = ?').get(existing.id) as RepoSkill
    } else {
      const id = this.generateId()
      this.getDb().prepare(`
        INSERT INTO repo_skills (id, repo_id, skill_name, skill_path, content, description, trigger_pattern)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, repoId, skillName, skillPath, content, description || null, triggerPattern || null)
      return this.getDb().prepare('SELECT * FROM repo_skills WHERE id = ?').get(id) as RepoSkill
    }
  }
}
