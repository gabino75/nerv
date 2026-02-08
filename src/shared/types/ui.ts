/**
 * UI state types
 */

import type { Project, Task, Approval, SessionMetrics } from './database'

export interface AppState {
  projects: Project[]
  tasks: Task[]
  approvals: Approval[]
  selectedProjectId: string | null
  currentSessionMetrics: SessionMetrics | null
  isLoading: boolean
  error: string | null
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
