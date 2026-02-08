/**
 * NERV Core Database - Task operations
 */

import type { Task } from '../../shared/types.js'
import type Database from 'better-sqlite3'

export class TaskOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  getTasksForProject(projectId: string): Task[] {
    return this.getDb().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Task[]
  }

  getTask(id: string): Task | undefined {
    return this.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  }

  createTask(projectId: string, title: string, description?: string, cycleId?: string): Task {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO tasks (id, project_id, cycle_id, title, description) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, cycleId || null, title, description || null)

    this.logAuditEvent(id, 'task_created', JSON.stringify({ projectId, title }))
    return this.getTask(id)!
  }

  createTaskWithType(
    projectId: string,
    title: string,
    taskType: 'implementation' | 'research',
    description?: string,
    cycleId?: string
  ): Task {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO tasks (id, project_id, cycle_id, title, description, task_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, cycleId || null, title, description || null, taskType)

    this.logAuditEvent(id, 'task_created', JSON.stringify({ projectId, title, taskType }))
    return this.getTask(id)!
  }

  updateTaskStatus(id: string, status: Task['status']): Task | undefined {
    const completedAt = status === 'done' ? new Date().toISOString() : null
    this.getDb().prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt, id)

    this.logAuditEvent(id, 'task_status_changed', JSON.stringify({ status }))
    return this.getTask(id)
  }

  updateTaskSession(id: string, sessionId: string): Task | undefined {
    this.getDb().prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, id)
    return this.getTask(id)
  }

  updateTaskWorktree(id: string, worktreePath: string): Task | undefined {
    this.getDb().prepare('UPDATE tasks SET worktree_path = ? WHERE id = ?').run(worktreePath, id)
    return this.getTask(id)
  }

  updateTaskDescription(id: string, description: string): Task | undefined {
    this.getDb().prepare('UPDATE tasks SET description = ? WHERE id = ?').run(description, id)
    return this.getTask(id)
  }

  deleteTask(id: string): void {
    this.logAuditEvent(id, 'task_deleted', null)
    this.getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  getInterruptedTasks(): Task[] {
    return this.getDb().prepare(
      "SELECT * FROM tasks WHERE status IN ('in_progress', 'interrupted') ORDER BY created_at DESC"
    ).all() as Task[]
  }
}
