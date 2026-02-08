import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  InstanceInfo,
  ProjectLock,
  LockAcquisitionResult,
  ResourceLimits
} from '../../shared/types'

/**
 * Instance Management Operations (PRD Section 11)
 *
 * Handles multi-instance coordination including:
 * - Instance registration and tracking
 * - Project locking for exclusive access
 * - Resource limits (Claude session count)
 * - Heartbeat and stale instance cleanup
 */
export class InstanceOperations {
  private getDb: () => Database.Database
  private instanceId: string
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  /** Heartbeat interval in milliseconds (10 seconds) */
  private static HEARTBEAT_INTERVAL = 10000

  /** Stale threshold in seconds (30 seconds without heartbeat) */
  private static STALE_THRESHOLD_SECONDS = 30

  constructor(getDb: () => Database.Database) {
    this.getDb = getDb
    this.instanceId = randomUUID()
  }

  /** Get the unique instance ID for this NERV process */
  getInstanceId(): string {
    return this.instanceId
  }

  /** Register this instance on startup */
  registerInstance(): void {
    const db = this.getDb()
    const processId = process.pid

    db.prepare(`
      INSERT INTO nerv_instances (instance_id, process_id, project_id, started_at, last_heartbeat)
      VALUES (?, ?, NULL, datetime('now'), datetime('now'))
    `).run(this.instanceId, processId)

    // Start heartbeat
    this.startHeartbeat()
  }

  /** Unregister this instance on shutdown */
  unregisterInstance(): void {
    this.stopHeartbeat()

    try {
      const db = this.getDb()

      // Release any project locks held by this instance
      db.prepare(`
        DELETE FROM project_locks WHERE instance_id = ?
      `).run(this.instanceId)

      // Remove instance registration
      db.prepare(`
        DELETE FROM nerv_instances WHERE instance_id = ?
      `).run(this.instanceId)
    } catch {
      // Database may be closed during shutdown
    }
  }

  /** Start the heartbeat interval */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat()
    }, InstanceOperations.HEARTBEAT_INTERVAL)
  }

  /** Stop the heartbeat interval */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /** Update heartbeat to indicate instance is still alive */
  updateHeartbeat(): void {
    try {
      const db = this.getDb()
      db.prepare(`
        UPDATE nerv_instances
        SET last_heartbeat = datetime('now')
        WHERE instance_id = ?
      `).run(this.instanceId)

      // Also update any project lock heartbeats
      db.prepare(`
        UPDATE project_locks
        SET last_heartbeat = datetime('now')
        WHERE instance_id = ?
      `).run(this.instanceId)
    } catch {
      // Database may be closed
    }
  }

  /** Acquire exclusive lock on a project */
  acquireProjectLock(projectId: string): LockAcquisitionResult {
    const db = this.getDb()
    const processId = process.pid

    // First, clean up stale instances
    this.cleanupStaleInstances()

    // Check if project is already locked
    const existingLock = db.prepare(`
      SELECT pl.*, ni.project_id as locked_project_name
      FROM project_locks pl
      LEFT JOIN nerv_instances ni ON pl.instance_id = ni.instance_id
      WHERE pl.project_id = ?
    `).get(projectId) as (ProjectLock & { locked_project_name: string | null }) | undefined

    if (existingLock) {
      // Check if it's our own lock
      if (existingLock.instance_id === this.instanceId) {
        return { success: true }
      }

      // Check if the lock holder is stale
      const isStale = this.isInstanceStale(existingLock.instance_id)
      if (isStale) {
        // Remove stale lock and acquire
        db.prepare(`DELETE FROM project_locks WHERE project_id = ?`).run(projectId)
      } else {
        // Return info about who holds the lock
        const lockedBy = this.getInstanceInfo(existingLock.instance_id)
        return {
          success: false,
          lockedBy: lockedBy || undefined,
          isStale: false
        }
      }
    }

    // Acquire the lock
    db.prepare(`
      INSERT INTO project_locks (project_id, instance_id, process_id, acquired_at, last_heartbeat)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(projectId, this.instanceId, processId)

    // Update instance with current project
    db.prepare(`
      UPDATE nerv_instances
      SET project_id = ?
      WHERE instance_id = ?
    `).run(projectId, this.instanceId)

    return { success: true }
  }

  /** Release lock when switching projects or closing */
  releaseProjectLock(projectId: string): void {
    const db = this.getDb()

    db.prepare(`
      DELETE FROM project_locks
      WHERE project_id = ? AND instance_id = ?
    `).run(projectId, this.instanceId)

    // Clear project from instance
    db.prepare(`
      UPDATE nerv_instances
      SET project_id = NULL
      WHERE instance_id = ? AND project_id = ?
    `).run(this.instanceId, projectId)
  }

  /** Check if project is open in another instance */
  isProjectLocked(projectId: string): boolean {
    const db = this.getDb()

    const lock = db.prepare(`
      SELECT instance_id FROM project_locks WHERE project_id = ?
    `).get(projectId) as { instance_id: string } | undefined

    if (!lock) return false

    // Not locked if we hold the lock
    if (lock.instance_id === this.instanceId) return false

    // Check if holder is stale
    return !this.isInstanceStale(lock.instance_id)
  }

  /** Get information about the instance holding a lock */
  getLockHolder(projectId: string): InstanceInfo | null {
    const db = this.getDb()

    const lock = db.prepare(`
      SELECT instance_id FROM project_locks WHERE project_id = ?
    `).get(projectId) as { instance_id: string } | undefined

    if (!lock || lock.instance_id === this.instanceId) return null

    return this.getInstanceInfo(lock.instance_id)
  }

  /** Get all running NERV instances */
  getRunningInstances(): InstanceInfo[] {
    const db = this.getDb()

    // Clean up stale instances first
    this.cleanupStaleInstances()

    const instances = db.prepare(`
      SELECT
        ni.instance_id,
        ni.process_id,
        ni.project_id,
        p.name as project_name,
        ni.started_at,
        ni.last_heartbeat
      FROM nerv_instances ni
      LEFT JOIN projects p ON ni.project_id = p.id
      ORDER BY ni.started_at DESC
    `).all() as Array<{
      instance_id: string
      process_id: number
      project_id: string | null
      project_name: string | null
      started_at: string
      last_heartbeat: string
    }>

    return instances.map(row => ({
      instanceId: row.instance_id,
      processId: row.process_id,
      projectId: row.project_id,
      projectName: row.project_name,
      startedAt: row.started_at,
      lastHeartbeat: row.last_heartbeat
    }))
  }

  /** Get info about a specific instance */
  private getInstanceInfo(instanceId: string): InstanceInfo | null {
    const db = this.getDb()

    const row = db.prepare(`
      SELECT
        ni.instance_id,
        ni.process_id,
        ni.project_id,
        p.name as project_name,
        ni.started_at,
        ni.last_heartbeat
      FROM nerv_instances ni
      LEFT JOIN projects p ON ni.project_id = p.id
      WHERE ni.instance_id = ?
    `).get(instanceId) as {
      instance_id: string
      process_id: number
      project_id: string | null
      project_name: string | null
      started_at: string
      last_heartbeat: string
    } | undefined

    if (!row) return null

    return {
      instanceId: row.instance_id,
      processId: row.process_id,
      projectId: row.project_id,
      projectName: row.project_name,
      startedAt: row.started_at,
      lastHeartbeat: row.last_heartbeat
    }
  }

  /** Check if an instance is stale (no heartbeat) */
  private isInstanceStale(instanceId: string): boolean {
    const db = this.getDb()

    const row = db.prepare(`
      SELECT
        (julianday('now') - julianday(last_heartbeat)) * 86400 as seconds_since_heartbeat
      FROM nerv_instances
      WHERE instance_id = ?
    `).get(instanceId) as { seconds_since_heartbeat: number } | undefined

    if (!row) return true

    return row.seconds_since_heartbeat > InstanceOperations.STALE_THRESHOLD_SECONDS
  }

  /** Clean up stale instances (no heartbeat for > 30 seconds) */
  cleanupStaleInstances(): number {
    const db = this.getDb()

    // Find stale instances
    const staleInstances = db.prepare(`
      SELECT instance_id FROM nerv_instances
      WHERE (julianday('now') - julianday(last_heartbeat)) * 86400 > ?
    `).all(InstanceOperations.STALE_THRESHOLD_SECONDS) as { instance_id: string }[]

    if (staleInstances.length === 0) return 0

    const staleIds = staleInstances.map(r => r.instance_id)

    // Remove locks held by stale instances
    db.prepare(`
      DELETE FROM project_locks
      WHERE instance_id IN (${staleIds.map(() => '?').join(',')})
    `).run(...staleIds)

    // Remove stale instances
    const result = db.prepare(`
      DELETE FROM nerv_instances
      WHERE instance_id IN (${staleIds.map(() => '?').join(',')})
    `).run(...staleIds)

    return result.changes
  }

  /** Check resource limits before spawning Claude session */
  canSpawnClaudeSession(): boolean {
    const db = this.getDb()

    const resource = db.prepare(`
      SELECT current_count, max_limit FROM resource_usage
      WHERE resource_key = 'claude_sessions'
    `).get() as { current_count: number; max_limit: number } | undefined

    if (!resource) return true // No limit configured

    return resource.current_count < resource.max_limit
  }

  /** Increment active Claude session count */
  incrementClaudeSessions(): void {
    const db = this.getDb()

    db.prepare(`
      UPDATE resource_usage
      SET current_count = current_count + 1, last_updated = datetime('now')
      WHERE resource_key = 'claude_sessions'
    `).run()
  }

  /** Decrement active Claude session count */
  decrementClaudeSessions(): void {
    const db = this.getDb()

    db.prepare(`
      UPDATE resource_usage
      SET current_count = MAX(0, current_count - 1), last_updated = datetime('now')
      WHERE resource_key = 'claude_sessions'
    `).run()
  }

  /** Get current resource usage */
  getResourceUsage(): ResourceLimits {
    const db = this.getDb()

    const resource = db.prepare(`
      SELECT current_count, max_limit FROM resource_usage
      WHERE resource_key = 'claude_sessions'
    `).get() as { current_count: number; max_limit: number } | undefined

    return {
      maxClaudeSessions: resource?.max_limit ?? 8,
      activeClaudeSessions: resource?.current_count ?? 0
    }
  }

  /** Force acquire lock (for "Force Open" option) */
  forceAcquireProjectLock(projectId: string): void {
    const db = this.getDb()
    const processId = process.pid

    // Remove existing lock regardless of owner
    db.prepare(`DELETE FROM project_locks WHERE project_id = ?`).run(projectId)

    // Acquire the lock
    db.prepare(`
      INSERT INTO project_locks (project_id, instance_id, process_id, acquired_at, last_heartbeat)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(projectId, this.instanceId, processId)

    // Update instance with current project
    db.prepare(`
      UPDATE nerv_instances
      SET project_id = ?
      WHERE instance_id = ?
    `).run(projectId, this.instanceId)
  }
}
