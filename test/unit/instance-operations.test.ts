/**
 * Unit tests for InstanceOperations (PRD Section 11)
 * src/main/database/instances.ts
 *
 * Tests multi-instance coordination:
 * - Instance registration/unregistration
 * - Project lock acquisition/release
 * - Stale instance cleanup
 * - Resource limits (Claude session counting)
 * - Force lock acquisition
 *
 * Uses a mock database since better-sqlite3 native module is not available
 * in the unit test environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InstanceOperations } from '../../src/main/database/instances'

// In-memory state for the mock database
interface MockState {
  instances: Map<string, { instance_id: string; process_id: number; project_id: string | null; started_at: string; last_heartbeat: string }>
  locks: Map<string, { project_id: string; instance_id: string; process_id: number; acquired_at: string; last_heartbeat: string }>
  resources: Map<string, { current_count: number; max_limit: number }>
}

function createMockDb(state: MockState) {
  const now = () => new Date().toISOString()

  return {
    prepare: vi.fn((sql: string) => {
      // INSERT INTO nerv_instances
      if (sql.includes('INSERT INTO nerv_instances')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId, processId] = args as [string, number]
            state.instances.set(instanceId, {
              instance_id: instanceId,
              process_id: processId,
              project_id: null,
              started_at: now(),
              last_heartbeat: now()
            })
          })
        }
      }

      // DELETE FROM project_locks WHERE instance_id = ?
      if (sql.includes('DELETE FROM project_locks WHERE instance_id')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            for (const [projId, lock] of state.locks) {
              if (lock.instance_id === instanceId) {
                state.locks.delete(projId)
              }
            }
          })
        }
      }

      // DELETE FROM project_locks WHERE project_id = ? AND instance_id = ?
      if (sql.includes('DELETE FROM project_locks') && sql.includes('AND instance_id')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [projectId, instanceId] = args as [string, string]
            const lock = state.locks.get(projectId)
            if (lock && lock.instance_id === instanceId) {
              state.locks.delete(projectId)
            }
          })
        }
      }

      // DELETE FROM project_locks WHERE project_id = ?  (force acquire / stale cleanup single)
      if (sql.includes('DELETE FROM project_locks WHERE project_id = ?') && !sql.includes('AND')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [projectId] = args as [string]
            state.locks.delete(projectId)
          })
        }
      }

      // DELETE FROM project_locks WHERE instance_id IN (...)
      if (sql.includes('DELETE FROM project_locks') && sql.includes('IN')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const staleIds = new Set(args as string[])
            for (const [projId, lock] of state.locks) {
              if (staleIds.has(lock.instance_id)) {
                state.locks.delete(projId)
              }
            }
          })
        }
      }

      // DELETE FROM nerv_instances WHERE instance_id = ?
      if (sql.includes('DELETE FROM nerv_instances WHERE instance_id = ?')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            state.instances.delete(instanceId)
          })
        }
      }

      // DELETE FROM nerv_instances WHERE instance_id IN (...)
      if (sql.includes('DELETE FROM nerv_instances') && sql.includes('IN')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const staleIds = args as string[]
            let changes = 0
            for (const id of staleIds) {
              if (state.instances.delete(id)) changes++
            }
            return { changes }
          })
        }
      }

      // DELETE FROM project_locks (bulk clear for test mode)
      if (sql.trim() === 'DELETE FROM project_locks') {
        return { run: vi.fn(() => state.locks.clear()) }
      }

      // DELETE FROM nerv_instances (bulk clear for test mode)
      if (sql.trim() === 'DELETE FROM nerv_instances') {
        return { run: vi.fn(() => state.instances.clear()) }
      }

      // SELECT from project_locks with JOIN (acquireProjectLock check)
      if (sql.includes('SELECT pl.*') && sql.includes('FROM project_locks pl')) {
        return {
          get: vi.fn((...args: unknown[]) => {
            const [projectId] = args as [string]
            const lock = state.locks.get(projectId)
            if (!lock) return undefined
            return { ...lock, locked_project_name: null }
          })
        }
      }

      // SELECT instance_id FROM project_locks WHERE project_id = ?
      if (sql.includes('SELECT instance_id FROM project_locks')) {
        return {
          get: vi.fn((...args: unknown[]) => {
            const [projectId] = args as [string]
            const lock = state.locks.get(projectId)
            if (!lock) return undefined
            return { instance_id: lock.instance_id }
          })
        }
      }

      // INSERT INTO project_locks
      if (sql.includes('INSERT INTO project_locks')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [projectId, instanceId, processId] = args as [string, string, number]
            state.locks.set(projectId, {
              project_id: projectId,
              instance_id: instanceId,
              process_id: processId,
              acquired_at: now(),
              last_heartbeat: now()
            })
          })
        }
      }

      // UPDATE nerv_instances SET project_id = ? WHERE instance_id = ?
      if (sql.includes('UPDATE nerv_instances') && sql.includes('SET project_id = ?') && sql.includes('WHERE instance_id = ?') && !sql.includes('AND')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [projectId, instanceId] = args as [string | null, string]
            const inst = state.instances.get(instanceId)
            if (inst) inst.project_id = projectId
          })
        }
      }

      // UPDATE nerv_instances SET project_id = NULL WHERE instance_id = ? AND project_id = ?
      if (sql.includes('SET project_id = NULL') && sql.includes('AND project_id')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId, projectId] = args as [string, string]
            const inst = state.instances.get(instanceId)
            if (inst && inst.project_id === projectId) inst.project_id = null
          })
        }
      }

      // UPDATE nerv_instances SET last_heartbeat (heartbeat update)
      if (sql.includes('UPDATE nerv_instances') && sql.includes('last_heartbeat')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            const inst = state.instances.get(instanceId)
            if (inst) inst.last_heartbeat = now()
          })
        }
      }

      // UPDATE project_locks SET last_heartbeat
      if (sql.includes('UPDATE project_locks') && sql.includes('last_heartbeat')) {
        return {
          run: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            for (const lock of state.locks.values()) {
              if (lock.instance_id === instanceId) lock.last_heartbeat = now()
            }
          })
        }
      }

      // SELECT for stale instances (julianday check)
      if (sql.includes('SELECT instance_id FROM nerv_instances') && sql.includes('julianday')) {
        return {
          all: vi.fn((..._args: unknown[]) => {
            // Return instances marked as stale in our mock
            const results: { instance_id: string }[] = []
            for (const inst of state.instances.values()) {
              if (inst.last_heartbeat === 'STALE') {
                results.push({ instance_id: inst.instance_id })
              }
            }
            return results
          })
        }
      }

      // SELECT for isInstanceStale (julianday on specific instance)
      if (sql.includes('julianday') && sql.includes('seconds_since_heartbeat')) {
        return {
          get: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            const inst = state.instances.get(instanceId)
            if (!inst) return undefined
            // If marked STALE, return large seconds
            if (inst.last_heartbeat === 'STALE') return { seconds_since_heartbeat: 60 }
            return { seconds_since_heartbeat: 0 }
          })
        }
      }

      // SELECT for getInstanceInfo
      if (sql.includes('ni.instance_id') && sql.includes('ni.process_id') && sql.includes('WHERE ni.instance_id')) {
        return {
          get: vi.fn((...args: unknown[]) => {
            const [instanceId] = args as [string]
            const inst = state.instances.get(instanceId)
            if (!inst) return undefined
            return {
              instance_id: inst.instance_id,
              process_id: inst.process_id,
              project_id: inst.project_id,
              project_name: null,
              started_at: inst.started_at,
              last_heartbeat: inst.last_heartbeat
            }
          })
        }
      }

      // SELECT for getRunningInstances
      if (sql.includes('FROM nerv_instances ni') && sql.includes('ORDER BY ni.started_at')) {
        return {
          all: vi.fn(() => {
            return [...state.instances.values()].map(inst => ({
              instance_id: inst.instance_id,
              process_id: inst.process_id,
              project_id: inst.project_id,
              project_name: null,
              started_at: inst.started_at,
              last_heartbeat: inst.last_heartbeat
            }))
          })
        }
      }

      // UPDATE resource_usage increment (must be before SELECT match)
      if (sql.includes('current_count = current_count + 1')) {
        return {
          run: vi.fn(() => {
            const res = state.resources.get('claude_sessions')
            if (res) res.current_count++
          })
        }
      }

      // UPDATE resource_usage decrement
      if (sql.includes('MAX(0, current_count - 1)')) {
        return {
          run: vi.fn(() => {
            const res = state.resources.get('claude_sessions')
            if (res) res.current_count = Math.max(0, res.current_count - 1)
          })
        }
      }

      // SELECT for canSpawnClaudeSession / getResourceUsage
      if (sql.includes('resource_usage') && sql.includes('claude_sessions')) {
        return {
          get: vi.fn(() => {
            const res = state.resources.get('claude_sessions')
            if (!res) return undefined
            return { current_count: res.current_count, max_limit: res.max_limit }
          })
        }
      }

      // Default fallback
      return { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) }
    })
  }
}

function createState(): MockState {
  return {
    instances: new Map(),
    locks: new Map(),
    resources: new Map([['claude_sessions', { current_count: 0, max_limit: 8 }]])
  }
}

describe('InstanceOperations', () => {
  let state: MockState

  beforeEach(() => {
    state = createState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('instance registration', () => {
    it('generates a unique UUID instance ID', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      const id = ops.getInstanceId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('two instances get different IDs', () => {
      const mockDb = createMockDb(state)
      const a = new InstanceOperations(() => mockDb as never)
      const b = new InstanceOperations(() => mockDb as never)
      expect(a.getInstanceId()).not.toBe(b.getInstanceId())
    })

    it('registers instance in database', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      expect(state.instances.has(ops.getInstanceId())).toBe(true)
      const inst = state.instances.get(ops.getInstanceId())!
      expect(inst.process_id).toBe(process.pid)
      expect(inst.project_id).toBeNull()
    })

    it('unregisters instance and cleans up locks', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      // Simulate having a lock
      state.locks.set('proj-1', {
        project_id: 'proj-1',
        instance_id: ops.getInstanceId(),
        process_id: process.pid,
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString()
      })

      ops.unregisterInstance()

      expect(state.instances.has(ops.getInstanceId())).toBe(false)
      expect(state.locks.has('proj-1')).toBe(false)
    })
  })

  describe('project locking', () => {
    it('acquires lock on unlocked project', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      const result = ops.acquireProjectLock('proj-1')
      expect(result.success).toBe(true)
      expect(state.locks.has('proj-1')).toBe(true)
      expect(state.locks.get('proj-1')!.instance_id).toBe(ops.getInstanceId())
    })

    it('re-acquiring own lock succeeds', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      ops.acquireProjectLock('proj-1')
      const result = ops.acquireProjectLock('proj-1')
      expect(result.success).toBe(true)
    })

    it('fails when another instance holds the lock', () => {
      const mockDb = createMockDb(state)
      const opsA = new InstanceOperations(() => mockDb as never)
      opsA.registerInstance()
      opsA.acquireProjectLock('proj-1')

      const opsB = new InstanceOperations(() => mockDb as never)
      opsB.registerInstance()
      const result = opsB.acquireProjectLock('proj-1')

      expect(result.success).toBe(false)
      expect(result.lockedBy).toBeTruthy()
      expect(result.lockedBy!.instanceId).toBe(opsA.getInstanceId())
    })

    it('succeeds when stale instance holds the lock', () => {
      const mockDb = createMockDb(state)
      const stale = new InstanceOperations(() => mockDb as never)
      stale.registerInstance()
      stale.acquireProjectLock('proj-1')

      // Mark the stale instance
      state.instances.get(stale.getInstanceId())!.last_heartbeat = 'STALE'

      const fresh = new InstanceOperations(() => mockDb as never)
      fresh.registerInstance()
      const result = fresh.acquireProjectLock('proj-1')

      expect(result.success).toBe(true)
      expect(state.locks.get('proj-1')!.instance_id).toBe(fresh.getInstanceId())
    })

    it('releases lock successfully', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')

      ops.releaseProjectLock('proj-1')
      expect(state.locks.has('proj-1')).toBe(false)
    })

    it('after release, another instance can acquire', () => {
      const mockDb = createMockDb(state)
      const opsA = new InstanceOperations(() => mockDb as never)
      opsA.registerInstance()
      opsA.acquireProjectLock('proj-1')
      opsA.releaseProjectLock('proj-1')

      const opsB = new InstanceOperations(() => mockDb as never)
      opsB.registerInstance()
      const result = opsB.acquireProjectLock('proj-1')
      expect(result.success).toBe(true)
    })

    it('updates instance project_id on lock acquisition', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')

      expect(state.instances.get(ops.getInstanceId())!.project_id).toBe('proj-1')
    })

    it('clears instance project_id on lock release', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')
      ops.releaseProjectLock('proj-1')

      expect(state.instances.get(ops.getInstanceId())!.project_id).toBeNull()
    })
  })

  describe('isProjectLocked', () => {
    it('returns false for unlocked project', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      expect(ops.isProjectLocked('proj-1')).toBe(false)
    })

    it('returns false when we hold the lock', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')
      expect(ops.isProjectLocked('proj-1')).toBe(false)
    })

    it('returns true when another fresh instance holds the lock', () => {
      const mockDb = createMockDb(state)
      const other = new InstanceOperations(() => mockDb as never)
      other.registerInstance()
      other.acquireProjectLock('proj-1')

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      expect(ops.isProjectLocked('proj-1')).toBe(true)
    })

    it('returns false when a stale instance holds the lock', () => {
      const mockDb = createMockDb(state)
      const stale = new InstanceOperations(() => mockDb as never)
      stale.registerInstance()
      stale.acquireProjectLock('proj-1')
      state.instances.get(stale.getInstanceId())!.last_heartbeat = 'STALE'

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      expect(ops.isProjectLocked('proj-1')).toBe(false)
    })
  })

  describe('getLockHolder', () => {
    it('returns null for unlocked project', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      expect(ops.getLockHolder('proj-1')).toBeNull()
    })

    it('returns null when we hold the lock', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')
      expect(ops.getLockHolder('proj-1')).toBeNull()
    })

    it('returns holder info when another instance has the lock', () => {
      const mockDb = createMockDb(state)
      const other = new InstanceOperations(() => mockDb as never)
      other.registerInstance()
      other.acquireProjectLock('proj-1')

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      const holder = ops.getLockHolder('proj-1')
      expect(holder).toBeTruthy()
      expect(holder!.instanceId).toBe(other.getInstanceId())
      expect(holder!.processId).toBe(process.pid)
    })
  })

  describe('stale instance cleanup', () => {
    it('cleans up stale instances', () => {
      const mockDb = createMockDb(state)
      const stale = new InstanceOperations(() => mockDb as never)
      stale.registerInstance()
      state.instances.get(stale.getInstanceId())!.last_heartbeat = 'STALE'

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      const cleaned = ops.cleanupStaleInstances()
      expect(cleaned).toBe(1)
      expect(state.instances.has(stale.getInstanceId())).toBe(false)
    })

    it('does not clean up fresh instances', () => {
      const mockDb = createMockDb(state)
      const fresh = new InstanceOperations(() => mockDb as never)
      fresh.registerInstance()

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      const cleaned = ops.cleanupStaleInstances()
      expect(cleaned).toBe(0)
    })

    it('removes locks held by stale instances', () => {
      const mockDb = createMockDb(state)
      const stale = new InstanceOperations(() => mockDb as never)
      stale.registerInstance()
      stale.acquireProjectLock('proj-1')
      state.instances.get(stale.getInstanceId())!.last_heartbeat = 'STALE'

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.cleanupStaleInstances()

      expect(state.locks.has('proj-1')).toBe(false)
    })
  })

  describe('heartbeat', () => {
    it('updateHeartbeat refreshes instance timestamp', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      // Manually set old heartbeat
      state.instances.get(ops.getInstanceId())!.last_heartbeat = '2020-01-01T00:00:00.000Z'

      ops.updateHeartbeat()

      const hb = state.instances.get(ops.getInstanceId())!.last_heartbeat
      expect(hb).not.toBe('2020-01-01T00:00:00.000Z')
    })

    it('updateHeartbeat also refreshes lock heartbeat', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.acquireProjectLock('proj-1')

      state.locks.get('proj-1')!.last_heartbeat = '2020-01-01T00:00:00.000Z'

      ops.updateHeartbeat()

      expect(state.locks.get('proj-1')!.last_heartbeat).not.toBe('2020-01-01T00:00:00.000Z')
    })
  })

  describe('resource limits', () => {
    it('canSpawnClaudeSession returns true when under limit', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      expect(ops.canSpawnClaudeSession()).toBe(true)
    })

    it('canSpawnClaudeSession returns false when at limit', () => {
      state.resources.get('claude_sessions')!.current_count = 8
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      expect(ops.canSpawnClaudeSession()).toBe(false)
    })

    it('incrementClaudeSessions increases count', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.incrementClaudeSessions()
      expect(state.resources.get('claude_sessions')!.current_count).toBe(1)
    })

    it('decrementClaudeSessions decreases count', () => {
      state.resources.get('claude_sessions')!.current_count = 3
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.decrementClaudeSessions()
      expect(state.resources.get('claude_sessions')!.current_count).toBe(2)
    })

    it('decrementClaudeSessions does not go below zero', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.decrementClaudeSessions()
      expect(state.resources.get('claude_sessions')!.current_count).toBe(0)
    })

    it('getResourceUsage returns correct values', () => {
      state.resources.get('claude_sessions')!.current_count = 3
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      const usage = ops.getResourceUsage()
      expect(usage.maxClaudeSessions).toBe(8)
      expect(usage.activeClaudeSessions).toBe(3)
    })
  })

  describe('forceAcquireProjectLock', () => {
    it('takes lock from another instance', () => {
      const mockDb = createMockDb(state)
      const other = new InstanceOperations(() => mockDb as never)
      other.registerInstance()
      other.acquireProjectLock('proj-1')

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.forceAcquireProjectLock('proj-1')

      expect(state.locks.get('proj-1')!.instance_id).toBe(ops.getInstanceId())
    })

    it('works on unlocked project', () => {
      const mockDb = createMockDb(state)
      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()
      ops.forceAcquireProjectLock('proj-1')

      expect(state.locks.has('proj-1')).toBe(true)
      expect(state.locks.get('proj-1')!.instance_id).toBe(ops.getInstanceId())
    })
  })

  describe('getRunningInstances', () => {
    it('returns all registered instances', () => {
      const mockDb = createMockDb(state)
      const a = new InstanceOperations(() => mockDb as never)
      a.registerInstance()
      const b = new InstanceOperations(() => mockDb as never)
      b.registerInstance()

      const running = a.getRunningInstances()
      expect(running.length).toBe(2)
      const ids = running.map(r => r.instanceId)
      expect(ids).toContain(a.getInstanceId())
      expect(ids).toContain(b.getInstanceId())
    })

    it('cleans up stale instances before returning', () => {
      const mockDb = createMockDb(state)
      const stale = new InstanceOperations(() => mockDb as never)
      stale.registerInstance()
      state.instances.get(stale.getInstanceId())!.last_heartbeat = 'STALE'

      const ops = new InstanceOperations(() => mockDb as never)
      ops.registerInstance()

      const running = ops.getRunningInstances()
      // Stale cleanup happens in getRunningInstances, but the stale one
      // is already removed from state by cleanupStaleInstances
      expect(running.every(r => r.instanceId !== stale.getInstanceId())).toBe(true)
    })
  })
})
