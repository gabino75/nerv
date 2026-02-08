/**
 * NERV Core Database - Project and Settings operations
 */

import type { Project } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class ProjectOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string
  ) {}

  getAllProjects(): Project[] {
    return this.getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[]
  }

  getProject(id: string): Project | undefined {
    return this.getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
  }

  createProject(name: string, goal?: string): Project {
    const id = this.generateId()
    this.getDb().prepare('INSERT INTO projects (id, name, goal) VALUES (?, ?, ?)').run(id, name, goal || null)
    return this.getProject(id)!
  }

  updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'goal' | 'custom_agents'>>): Project | undefined {
    const sets: string[] = []
    const values: (string | null)[] = []

    if (updates.name !== undefined) {
      sets.push('name = ?')
      values.push(updates.name)
    }
    if (updates.goal !== undefined) {
      sets.push('goal = ?')
      values.push(updates.goal)
    }
    if (updates.custom_agents !== undefined) {
      sets.push('custom_agents = ?')
      values.push(updates.custom_agents)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getProject(id)
  }

  deleteProject(id: string): void {
    this.getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  getSetting(key: string): string | undefined {
    const result = this.getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return result?.value
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) {
      this.getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
    } else {
      this.getDb().prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
      ).run(key, value, value)
    }
  }

  getCurrentProjectId(): string | undefined {
    return this.getSetting('current_project_id')
  }

  setCurrentProjectId(projectId: string | null): void {
    this.setSetting('current_project_id', projectId)
  }

  getCurrentProject(): Project | undefined {
    const currentId = this.getCurrentProjectId()
    if (currentId) {
      const project = this.getProject(currentId)
      if (project) return project
    }
    const projects = this.getAllProjects()
    return projects[0]
  }
}
