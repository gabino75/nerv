import type { Repo, DocumentationSource, RepoContext, RepoSkill, RepoContextType, RepoSourceType } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Repository, documentation sources, and repo context database operations
 */
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

  createRepo(
    projectId: string,
    name: string,
    path: string,
    options?: {
      stack?: string
      sourceType?: RepoSourceType
      baseBranch?: string
      fetchBeforeWorktree?: boolean
      autoFetchOnOpen?: boolean
      autoCleanupWorktrees?: boolean
    }
  ): Repo {
    const id = this.generateId()
    const sourceType = options?.sourceType ?? 'local'
    const baseBranch = options?.baseBranch ?? 'main'
    const fetchBeforeWorktree = options?.fetchBeforeWorktree ?? true
    const autoFetchOnOpen = options?.autoFetchOnOpen ?? true
    const autoCleanupWorktrees = options?.autoCleanupWorktrees ?? false

    this.getDb().prepare(`
      INSERT INTO repos (id, project_id, name, path, stack, source_type, base_branch, fetch_before_worktree, auto_fetch_on_open, auto_cleanup_worktrees)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      name,
      path,
      options?.stack || null,
      sourceType,
      baseBranch,
      fetchBeforeWorktree ? 1 : 0,
      autoFetchOnOpen ? 1 : 0,
      autoCleanupWorktrees ? 1 : 0
    )
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

  updateDocumentationSource(id: string, updates: { name?: string; urlPattern?: string }): DocumentationSource | undefined {
    const sets: string[] = []
    const values: string[] = []

    if (updates.name !== undefined) {
      sets.push('name = ?')
      values.push(updates.name)
    }
    if (updates.urlPattern !== undefined) {
      sets.push('url_pattern = ?')
      values.push(updates.urlPattern)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE documentation_sources SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getDb().prepare('SELECT * FROM documentation_sources WHERE id = ?').get(id) as DocumentationSource | undefined
  }

  deleteDocumentationSource(id: string): void {
    this.getDb().prepare('DELETE FROM documentation_sources WHERE id = ?').run(id)
  }

  // =====================
  // Repository Context (PRD Section 24)
  // =====================

  getRepoContext(repoId: string): RepoContext[] {
    return this.getDb().prepare('SELECT * FROM repo_context WHERE repo_id = ?').all(repoId) as RepoContext[]
  }

  getRepoContextByType(repoId: string, contextType: RepoContextType): RepoContext | undefined {
    return this.getDb().prepare(
      'SELECT * FROM repo_context WHERE repo_id = ? AND context_type = ?'
    ).get(repoId, contextType) as RepoContext | undefined
  }

  createRepoContext(context: Omit<RepoContext, 'id'>): RepoContext {
    const id = this.generateId()
    this.getDb().prepare(`
      INSERT INTO repo_context (id, repo_id, context_type, file_path, content, parsed_sections, last_scanned_at, file_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      context.repo_id,
      context.context_type,
      context.file_path,
      context.content,
      context.parsed_sections,
      context.last_scanned_at,
      context.file_hash
    )
    return this.getDb().prepare('SELECT * FROM repo_context WHERE id = ?').get(id) as RepoContext
  }

  updateRepoContext(id: string, updates: Partial<Omit<RepoContext, 'id' | 'repo_id'>>): RepoContext | undefined {
    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (updates.content !== undefined) {
      sets.push('content = ?')
      values.push(updates.content)
    }
    if (updates.parsed_sections !== undefined) {
      sets.push('parsed_sections = ?')
      values.push(updates.parsed_sections)
    }
    if (updates.last_scanned_at !== undefined) {
      sets.push('last_scanned_at = ?')
      values.push(updates.last_scanned_at)
    }
    if (updates.file_hash !== undefined) {
      sets.push('file_hash = ?')
      values.push(updates.file_hash)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE repo_context SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getDb().prepare('SELECT * FROM repo_context WHERE id = ?').get(id) as RepoContext | undefined
  }

  deleteRepoContext(repoId: string): void {
    this.getDb().prepare('DELETE FROM repo_context WHERE repo_id = ?').run(repoId)
  }

  // =====================
  // Repository Skills (PRD Section 24)
  // =====================

  getRepoSkills(repoId: string): RepoSkill[] {
    return this.getDb().prepare('SELECT * FROM repo_skills WHERE repo_id = ?').all(repoId) as RepoSkill[]
  }

  getRepoSkill(repoId: string, skillName: string): RepoSkill | undefined {
    return this.getDb().prepare(
      'SELECT * FROM repo_skills WHERE repo_id = ? AND skill_name = ?'
    ).get(repoId, skillName) as RepoSkill | undefined
  }

  createRepoSkill(skill: Omit<RepoSkill, 'id'>): RepoSkill {
    const id = this.generateId()
    this.getDb().prepare(`
      INSERT INTO repo_skills (id, repo_id, skill_name, skill_path, description, trigger_pattern, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      skill.repo_id,
      skill.skill_name,
      skill.skill_path,
      skill.description,
      skill.trigger_pattern,
      skill.content
    )
    return this.getDb().prepare('SELECT * FROM repo_skills WHERE id = ?').get(id) as RepoSkill
  }

  upsertRepoSkill(skill: Omit<RepoSkill, 'id'>): RepoSkill {
    const existing = this.getRepoSkill(skill.repo_id, skill.skill_name)
    if (existing) {
      this.getDb().prepare(`
        UPDATE repo_skills SET skill_path = ?, description = ?, trigger_pattern = ?, content = ?
        WHERE repo_id = ? AND skill_name = ?
      `).run(skill.skill_path, skill.description, skill.trigger_pattern, skill.content, skill.repo_id, skill.skill_name)
      return this.getRepoSkill(skill.repo_id, skill.skill_name)!
    }
    return this.createRepoSkill(skill)
  }

  deleteRepoSkills(repoId: string): void {
    this.getDb().prepare('DELETE FROM repo_skills WHERE repo_id = ?').run(repoId)
  }

  getProjectSkills(projectId: string): RepoSkill[] {
    return this.getDb().prepare(`
      SELECT rs.* FROM repo_skills rs
      JOIN repos r ON rs.repo_id = r.id
      WHERE r.project_id = ?
    `).all(projectId) as RepoSkill[]
  }

  getProjectClaudeMdContexts(projectId: string): Array<RepoContext & { repo_name: string }> {
    return this.getDb().prepare(`
      SELECT rc.*, r.name as repo_name FROM repo_context rc
      JOIN repos r ON rc.repo_id = r.id
      WHERE r.project_id = ? AND rc.context_type = 'claude_md'
    `).all(projectId) as Array<RepoContext & { repo_name: string }>
  }
}
