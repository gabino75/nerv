import type { Cycle, Task } from '../../shared/types'
import type Database from 'better-sqlite3'

// Callback for cycle completion hook (set by audit module)
let onCycleCompleteCallback: ((cycle: Cycle) => void) | null = null

/**
 * Set the callback function to be called when a cycle is completed
 * Used by the audit system to trigger audits on cycle completion
 */
export function setOnCycleCompleteCallback(callback: (cycle: Cycle) => void): void {
  onCycleCompleteCallback = callback
}

/**
 * Cycle database operations
 */
export class CycleOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  getCyclesForProject(projectId: string): Cycle[] {
    return this.getDb().prepare('SELECT * FROM cycles WHERE project_id = ? ORDER BY cycle_number ASC').all(projectId) as Cycle[]
  }

  getCycle(id: string): Cycle | undefined {
    return this.getDb().prepare('SELECT * FROM cycles WHERE id = ?').get(id) as Cycle | undefined
  }

  getActiveCycle(projectId: string): Cycle | undefined {
    return this.getDb().prepare(
      "SELECT * FROM cycles WHERE project_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1"
    ).get(projectId) as Cycle | undefined
  }

  getNextCycleNumber(projectId: string): number {
    const result = this.getDb().prepare(
      'SELECT MAX(cycle_number) as max_num FROM cycles WHERE project_id = ?'
    ).get(projectId) as { max_num: number | null }
    return (result?.max_num ?? -1) + 1
  }

  createCycle(projectId: string, cycleNumber: number, goal?: string): Cycle {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO cycles (id, project_id, cycle_number, goal) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, cycleNumber, goal || null)

    this.logAuditEvent(null, 'cycle_created', JSON.stringify({ id, projectId, cycleNumber, goal }))
    return this.getDb().prepare('SELECT * FROM cycles WHERE id = ?').get(id) as Cycle
  }

  updateCycle(id: string, updates: Partial<Pick<Cycle, 'goal' | 'learnings'>>): Cycle | undefined {
    const sets: string[] = []
    const values: (string | null)[] = []

    if (updates.goal !== undefined) {
      sets.push('goal = ?')
      values.push(updates.goal)
    }
    if (updates.learnings !== undefined) {
      sets.push('learnings = ?')
      values.push(updates.learnings)
    }

    if (sets.length > 0) {
      values.push(id)
      this.getDb().prepare(`UPDATE cycles SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getCycle(id)
  }

  completeCycle(id: string, learnings?: string): Cycle | undefined {
    const completedAt = new Date().toISOString()
    this.getDb().prepare(
      "UPDATE cycles SET status = 'completed', learnings = ?, completed_at = ? WHERE id = ?"
    ).run(learnings || null, completedAt, id)

    this.logAuditEvent(null, 'cycle_completed', JSON.stringify({ id, learnings }))

    const cycle = this.getDb().prepare('SELECT * FROM cycles WHERE id = ?').get(id) as Cycle

    // Trigger audit system hook if registered (PRD Section 5)
    if (onCycleCompleteCallback && cycle) {
      try {
        onCycleCompleteCallback(cycle)
      } catch (error) {
        console.error('[Cycles] Error in onCycleComplete callback:', error)
      }
    }

    return cycle
  }

  getTasksForCycle(cycleId: string): Task[] {
    return this.getDb().prepare('SELECT * FROM tasks WHERE cycle_id = ? ORDER BY created_at ASC').all(cycleId) as Task[]
  }
}
