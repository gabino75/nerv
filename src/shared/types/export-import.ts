/**
 * Export/Import types
 */

import type { Project, Task, Cycle, Decision, Repo, DocumentationSource } from './database'

export interface ProjectExport {
  project: Project
  tasks: Task[]
  cycles: Cycle[]
  decisions: Decision[]
  repos: Repo[]
  docSources: DocumentationSource[]
}

export interface ProjectImport {
  project: { name: string; goal: string | null }
  tasks?: Array<{ title: string; description: string | null; task_type: string; status: string }>
  cycles?: Array<{ cycle_number: number; goal: string | null; status: string; learnings: string | null }>
  decisions?: Array<{ title: string; rationale: string | null; alternatives: string | null }>
  repos?: Array<{ name: string; path: string; stack: string | null }>
  docSources?: Array<{ name: string; url_pattern: string }>
}
