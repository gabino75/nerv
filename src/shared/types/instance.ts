/**
 * Multi-Instance Support Types (PRD Section 11)
 *
 * Types for managing multiple NERV instances running concurrently.
 * Each instance can manage a different project while sharing global state.
 */

/**
 * Information about a running NERV instance
 */
export interface InstanceInfo {
  instanceId: string
  processId: number
  projectId: string | null
  projectName: string | null
  startedAt: string
  lastHeartbeat: string
}

/**
 * Project lock information
 */
export interface ProjectLock {
  projectId: string
  instanceId: string
  processId: number
  acquiredAt: string
  lastHeartbeat: string
}

/**
 * Result of attempting to acquire a project lock
 */
export interface LockAcquisitionResult {
  success: boolean
  /** If lock failed, info about the instance holding the lock */
  lockedBy?: InstanceInfo
  /** If lock failed, whether the other instance is stale (no heartbeat) */
  isStale?: boolean
}

/**
 * Options when trying to open a locked project
 */
export type LockedProjectAction =
  | 'open-readonly'    // Open without lock (read-only mode)
  | 'focus-other'      // Focus the other NERV instance
  | 'force-open'       // Force acquire lock (risky - may corrupt data)
  | 'cancel'           // Cancel the operation

/**
 * Dialog state for locked project prompt
 */
export interface LockedProjectDialogState {
  isOpen: boolean
  projectId: string
  projectName: string
  lockedBy: InstanceInfo
  isStale: boolean
}

/**
 * Resource limits for multi-instance coordination
 */
export interface ResourceLimits {
  /** Maximum concurrent Claude sessions across all instances */
  maxClaudeSessions: number
  /** Current count of active Claude sessions (system-wide) */
  activeClaudeSessions: number
}

/**
 * Global state shared across instances (stored in ~/.nerv/)
 */
export interface SharedGlobalState {
  /** Global configuration (config.json) */
  config: Record<string, unknown>
  /** Default permission rules (permissions.json) */
  permissions: Record<string, unknown>
  /** Aggregated cost tracking (usage-stats.json) */
  usageStats: {
    monthlyTokens: number
    monthlyCost: number
    lastUpdated: string
  }
}

/**
 * Instance manager interface for multi-instance coordination
 */
export interface InstanceManager {
  /** Register this instance on startup */
  registerInstance(): Promise<void>

  /** Unregister this instance on shutdown */
  unregisterInstance(): Promise<void>

  /** Acquire exclusive lock on a project */
  acquireProjectLock(projectId: string): Promise<LockAcquisitionResult>

  /** Release lock when switching projects or closing */
  releaseProjectLock(projectId: string): Promise<void>

  /** Check if project is open in another instance */
  isProjectLocked(projectId: string): Promise<boolean>

  /** Get information about the instance holding a lock */
  getLockHolder(projectId: string): Promise<InstanceInfo | null>

  /** Get all running NERV instances */
  getRunningInstances(): Promise<InstanceInfo[]>

  /** Update heartbeat to indicate instance is still alive */
  updateHeartbeat(): Promise<void>

  /** Clean up stale instances (no heartbeat for > 30 seconds) */
  cleanupStaleInstances(): Promise<number>

  /** Check resource limits before spawning Claude session */
  canSpawnClaudeSession(): Promise<boolean>

  /** Increment active Claude session count */
  incrementClaudeSessions(): Promise<void>

  /** Decrement active Claude session count */
  decrementClaudeSessions(): Promise<void>

  /** Get current resource usage */
  getResourceUsage(): Promise<ResourceLimits>
}
