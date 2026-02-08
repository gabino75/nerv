/**
 * NERV Core Database - Learning operations
 *
 * Manages project-wide learnings (PRD Section 11: nerv learn)
 */

import type { Learning, LearningCategory, LearningSource } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class LearningsOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  getLearningsForProject(projectId: string): Learning[] {
    return this.getDb().prepare(
      'SELECT * FROM learnings WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as Learning[]
  }

  getLearningsByCategory(projectId: string, category: LearningCategory): Learning[] {
    return this.getDb().prepare(
      'SELECT * FROM learnings WHERE project_id = ? AND category = ? ORDER BY created_at DESC'
    ).all(projectId, category) as Learning[]
  }

  createLearning(
    projectId: string,
    content: string,
    category?: LearningCategory,
    source?: LearningSource
  ): Learning {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO learnings (id, project_id, content, category, source) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, content, category || null, source || 'manual')

    this.logAuditEvent(null, 'learning_created', JSON.stringify({ id, projectId, content, category, source }))
    return this.getDb().prepare('SELECT * FROM learnings WHERE id = ?').get(id) as Learning
  }

  deleteLearning(id: string): void {
    this.getDb().prepare('DELETE FROM learnings WHERE id = ?').run(id)
    this.logAuditEvent(null, 'learning_deleted', JSON.stringify({ id }))
  }

  exportLearnings(projectId: string): string {
    const learnings = this.getLearningsForProject(projectId)
    const grouped: Record<string, Learning[]> = {}

    for (const learning of learnings) {
      const cat = learning.category || 'uncategorized'
      if (!grouped[cat]) {
        grouped[cat] = []
      }
      grouped[cat].push(learning)
    }

    let markdown = '# Project Learnings\n\n'
    for (const [category, items] of Object.entries(grouped)) {
      markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`
      for (const item of items) {
        markdown += `- ${item.content}\n`
      }
      markdown += '\n'
    }

    return markdown
  }
}
