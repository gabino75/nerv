// NERV App State Store
// Using Svelte stores with SQLite database persistence via IPC

import { writable, derived, get } from 'svelte/store'

// Use global types from env.d.ts (Project, Task, Approval, etc. are defined globally)

// Available models for selection
export const AVAILABLE_MODELS = ['sonnet', 'opus', 'haiku'] as const
export type ModelName = typeof AVAILABLE_MODELS[number]

// Model display info
export const MODEL_INFO: Record<ModelName, { name: string; description: string; color: string }> = {
  sonnet: { name: 'Sonnet', description: 'Balanced performance and cost', color: '#ff6b35' },
  opus: { name: 'Opus', description: 'Maximum capability', color: '#c77dff' },
  haiku: { name: 'Haiku', description: 'Fast and efficient', color: '#6bcb77' },
}

// Active subagent info for UI display
export interface ActiveSubagent {
  id: string
  agentType: string
  startedAt: number
}

// Session metrics interface for UI display (camelCase version of database type)
// PRD Section 6: Context Awareness - tracks token usage and compaction counts
export interface SessionMetrics {
  inputTokens: number
  outputTokens: number
  compactionCount: number
  compactionsSinceClear: number  // PRD Section 6: "Since last /clear" counter
  model: string
  costUsd: number
  durationMs: number
  numTurns: number
}

// Local state interface (combines DB data with runtime state)
export interface AppState {
  projects: Project[]
  selectedProjectId: string | null
  isReadOnly: boolean  // True when project is opened read-only (locked by another instance)
  tasks: Task[]
  approvals: Approval[]
  sessionMetrics: SessionMetrics | null
  isTaskRunning: boolean
  currentTaskId: string | null
  selectedModel: ModelName
  isLoading: boolean
  error: string | null
  activeSubagents: ActiveSubagent[]
}

// Initial state
const initialState: AppState = {
  projects: [],
  selectedProjectId: null,
  isReadOnly: false,
  tasks: [],
  approvals: [],
  sessionMetrics: null,
  isTaskRunning: false,
  currentTaskId: null,
  selectedModel: 'sonnet',
  isLoading: false,
  error: null,
  activeSubagents: []
}

// Helper to get the database API
function getDb() {
  return window.api.db
}

// Type for store update function
type UpdateFn = (updater: (state: AppState) => AppState) => void

// Project-related actions
function createProjectActions(subscribe: typeof writable<AppState>['prototype']['subscribe'], update: UpdateFn) {
  // Helper to check if current project is read-only
  const checkReadOnly = (): boolean => {
    const state = get({ subscribe })
    if (state.isReadOnly) {
      update(s => ({ ...s, error: 'Cannot modify project in read-only mode' }))
      return true
    }
    return false
  }

  return {
    addProject: async (name: string, goal?: string): Promise<string | null> => {
      update(state => ({ ...state, isLoading: true, error: null }))
      try {
        const project = await getDb().projects.create(name, goal)
        update(state => ({
          ...state,
          projects: [project, ...state.projects],
          selectedProjectId: project.id,
          tasks: [],
          isLoading: false
        }))
        return project.id
      } catch (err) {
        update(state => ({
          ...state,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to create project'
        }))
        return null
      }
    },

    selectProject: async (projectId: string | null, readOnly: boolean = false) => {
      update(state => ({ ...state, selectedProjectId: projectId, isReadOnly: readOnly, isLoading: true }))
      if (projectId) {
        try {
          const tasks = await getDb().tasks.getForProject(projectId)
          update(state => ({ ...state, tasks, isLoading: false }))

          // Auto-fetch repos on project open (PRD Section 25)
          // Run in background - don't block project selection
          window.api.worktree.autoFetchProject(projectId).then(result => {
            if (result.fetched.length > 0) {
              console.log(`[NERV] Auto-fetched repos: ${result.fetched.join(', ')}`)
            }
            if (result.errors.length > 0) {
              console.warn(`[NERV] Auto-fetch errors: ${result.errors.join(', ')}`)
            }
          }).catch(err => {
            console.warn('[NERV] Auto-fetch failed:', err)
          })
        } catch (err) {
          update(state => ({
            ...state,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load tasks'
          }))
        }
      } else {
        update(state => ({ ...state, tasks: [], isReadOnly: false, isLoading: false }))
      }
    },

    deleteProject: async (projectId: string) => {
      // Only block if trying to delete the currently selected read-only project
      const state = get({ subscribe })
      if (state.selectedProjectId === projectId && checkReadOnly()) return
      try {
        await getDb().projects.delete(projectId)
        update(s => {
          const newProjects = s.projects.filter(p => p.id !== projectId)
          return {
            ...s,
            projects: newProjects,
            selectedProjectId: s.selectedProjectId === projectId
              ? (newProjects.length > 0 ? newProjects[0].id : null)
              : s.selectedProjectId,
            tasks: s.selectedProjectId === projectId ? [] : s.tasks,
            isReadOnly: s.selectedProjectId === projectId ? false : s.isReadOnly
          }
        })
      } catch (err) {
        update(s => ({
          ...s,
          error: err instanceof Error ? err.message : 'Failed to delete project'
        }))
      }
    },

    loadTasks: async (projectId: string) => {
      try {
        const tasks = await getDb().tasks.getForProject(projectId)
        update(state => ({ ...state, tasks }))
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to load tasks'
        }))
      }
    }
  }
}

// Task-related actions
function createTaskActions(subscribe: typeof writable<AppState>['prototype']['subscribe'], update: UpdateFn) {
  // Helper to check if project is read-only
  const checkReadOnly = (): boolean => {
    const state = get({ subscribe })
    if (state.isReadOnly) {
      update(s => ({ ...s, error: 'Cannot modify project in read-only mode' }))
      return true
    }
    return false
  }

  return {
    addTask: async (title: string, description?: string, cycleId?: string): Promise<string | null> => {
      const state = get({ subscribe })
      if (!state.selectedProjectId) return null
      if (checkReadOnly()) return null

      try {
        const task = await getDb().tasks.create(state.selectedProjectId, title, description, cycleId)
        update(s => ({ ...s, tasks: [...s.tasks, task] }))
        return task.id
      } catch (err) {
        update(s => ({
          ...s,
          error: err instanceof Error ? err.message : 'Failed to create task'
        }))
        return null
      }
    },

    updateTaskStatus: async (taskId: string, status: Task['status']) => {
      if (checkReadOnly()) return
      try {
        const task = await getDb().tasks.updateStatus(taskId, status)
        if (task) {
          update(state => ({
            ...state,
            tasks: state.tasks.map(t => t.id === taskId ? task : t)
          }))
        }
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to update task'
        }))
      }
    },

    startTask: async (taskId: string) => {
      if (checkReadOnly()) return
      try {
        const task = await getDb().tasks.updateStatus(taskId, 'in_progress')
        if (task) {
          update(state => ({
            ...state,
            isTaskRunning: true,
            currentTaskId: taskId,
            tasks: state.tasks.map(t => t.id === taskId ? task : t)
          }))
        }
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to start task'
        }))
      }
    },

    stopTask: async () => {
      if (checkReadOnly()) return
      const state = get({ subscribe })
      if (state.currentTaskId) {
        try {
          const task = await getDb().tasks.updateStatus(state.currentTaskId, 'interrupted')
          update(s => ({
            ...s,
            isTaskRunning: false,
            currentTaskId: null,
            tasks: task ? s.tasks.map(t => t.id === task.id ? task : t) : s.tasks
          }))
        } catch (err) {
          update(s => ({
            ...s,
            isTaskRunning: false,
            currentTaskId: null,
            error: err instanceof Error ? err.message : 'Failed to stop task'
          }))
        }
      }
    },

    deleteTask: async (taskId: string) => {
      if (checkReadOnly()) return
      try {
        await getDb().tasks.delete(taskId)
        update(state => ({ ...state, tasks: state.tasks.filter(t => t.id !== taskId) }))
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to delete task'
        }))
      }
    }
  }
}

// Approval-related actions
function createApprovalActions(update: UpdateFn) {
  return {
    addApproval: async (taskId: string, toolName: string, toolInput?: string, context?: string) => {
      try {
        const approval = await getDb().approvals.create(taskId, toolName, toolInput, context)
        update(state => ({ ...state, approvals: [...state.approvals, approval] }))
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to create approval'
        }))
      }
    },

    resolveApproval: async (id: number, status: 'approved' | 'denied', denyReason?: string) => {
      try {
        const approval = await getDb().approvals.resolve(id, status, denyReason)
        if (approval) {
          update(state => ({
            ...state,
            approvals: state.approvals.map(a => a.id === id ? approval : a)
          }))
        }
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to resolve approval'
        }))
      }
    },

    refreshApprovals: async () => {
      try {
        const approvals = await getDb().approvals.getPending()
        update(state => ({ ...state, approvals }))
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to refresh approvals'
        }))
      }
    }
  }
}

// Metrics and model actions
function createMetricsActions(update: UpdateFn) {
  return {
    updateSessionMetrics: async (taskId: string, metrics: {
      inputTokens?: number
      outputTokens?: number
      compactionCount?: number
      compactionsSinceClear?: number  // PRD Section 6: "Since last /clear" counter
      model?: string
      sessionId?: string
      costUsd?: number
      durationMs?: number
      numTurns?: number
    }) => {
      try {
        // Save to database
        await getDb().metrics.update(taskId, metrics)
        // Update state with camelCase values (database returns snake_case)
        update(state => ({
          ...state,
          sessionMetrics: {
            inputTokens: metrics.inputTokens ?? state.sessionMetrics?.inputTokens ?? 0,
            outputTokens: metrics.outputTokens ?? state.sessionMetrics?.outputTokens ?? 0,
            compactionCount: metrics.compactionCount ?? state.sessionMetrics?.compactionCount ?? 0,
            compactionsSinceClear: metrics.compactionsSinceClear ?? state.sessionMetrics?.compactionsSinceClear ?? 0,
            model: metrics.model ?? state.sessionMetrics?.model ?? '',
            costUsd: metrics.costUsd ?? state.sessionMetrics?.costUsd ?? 0,
            durationMs: metrics.durationMs ?? state.sessionMetrics?.durationMs ?? 0,
            numTurns: metrics.numTurns ?? state.sessionMetrics?.numTurns ?? 0
          }
        }))
      } catch (err) {
        update(state => ({
          ...state,
          error: err instanceof Error ? err.message : 'Failed to update metrics'
        }))
      }
    },

    loadSessionMetrics: async (taskId: string) => {
      try {
        const dbMetrics = await getDb().metrics.get(taskId)
        if (dbMetrics) {
          // Convert from database snake_case to UI camelCase
          update(state => ({
            ...state,
            sessionMetrics: {
              inputTokens: dbMetrics.input_tokens,
              outputTokens: dbMetrics.output_tokens,
              compactionCount: dbMetrics.compaction_count,
              compactionsSinceClear: dbMetrics.compactions_since_clear,
              model: dbMetrics.model || '',
              costUsd: dbMetrics.cost_usd ?? 0,
              durationMs: dbMetrics.duration_ms ?? 0,
              numTurns: dbMetrics.num_turns ?? 0
            }
          }))
        } else {
          update(state => ({ ...state, sessionMetrics: null }))
        }
      } catch {
        // Metrics may not exist yet, that's OK
      }
    },

    setModel: (model: ModelName) => {
      update(state => ({ ...state, selectedModel: model }))
    }
  }
}

// Subagent tracking actions
function createSubagentActions(update: UpdateFn) {
  return {
    addSubagent: (id: string, agentType: string) => {
      update(state => ({
        ...state,
        activeSubagents: [...state.activeSubagents, { id, agentType, startedAt: Date.now() }]
      }))
    },
    removeSubagent: (id: string) => {
      update(state => ({
        ...state,
        activeSubagents: state.activeSubagents.filter(s => s.id !== id)
      }))
    },
    clearSubagents: () => {
      update(state => ({ ...state, activeSubagents: [] }))
    }
  }
}

// Create the main store
function createAppStore() {
  const { subscribe, set, update } = writable<AppState>(initialState)

  const projectActions = createProjectActions(subscribe, update)
  const taskActions = createTaskActions(subscribe, update)
  const approvalActions = createApprovalActions(update)
  const metricsActions = createMetricsActions(update)
  const subagentActions = createSubagentActions(update)

  return {
    subscribe,

    // Initialize store from database
    init: async () => {
      update(state => ({ ...state, isLoading: true, error: null }))
      try {
        const projects = await getDb().projects.getAll()
        const approvals = await getDb().approvals.getPending()

        update(state => ({ ...state, projects, approvals, isLoading: false }))

        // If there's a project, select the first one and load its tasks
        if (projects.length > 0) {
          const firstProject = projects[0]
          const tasks = await getDb().tasks.getForProject(firstProject.id)
          update(state => ({ ...state, selectedProjectId: firstProject.id, tasks }))
        }
      } catch (err) {
        update(state => ({
          ...state,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to initialize'
        }))
      }
    },

    // Project actions
    ...projectActions,

    // Task actions
    ...taskActions,

    // Approval actions
    ...approvalActions,

    // Metrics actions
    ...metricsActions,

    // Subagent tracking
    ...subagentActions,

    // Utility actions
    clearError: () => update(state => ({ ...state, error: null })),
    reset: () => set(initialState)
  }
}

export const appStore = createAppStore()

// Derived stores
export const selectedProject = derived(
  appStore,
  $state => $state.projects.find(p => p.id === $state.selectedProjectId) || null
)

export const projectTasks = derived(
  appStore,
  $state => $state.tasks.filter(t => t.project_id === $state.selectedProjectId)
)

export const pendingApprovals = derived(
  appStore,
  $state => $state.approvals.filter(a => a.status === 'pending')
)

export const currentTask = derived(
  appStore,
  $state => $state.tasks.find(t => t.id === $state.currentTaskId) || null
)

export const isLoading = derived(
  appStore,
  $state => $state.isLoading
)

export const appError = derived(
  appStore,
  $state => $state.error
)

export const selectedModel = derived(
  appStore,
  $state => $state.selectedModel
)

export const isProjectReadOnly = derived(
  appStore,
  $state => $state.isReadOnly
)
