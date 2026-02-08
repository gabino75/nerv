/**
 * NERV Programmatic API
 *
 * A fluent API for programmatic control of NERV.
 * See PRD Section 12: CLI-First Architecture - Programmatic API
 *
 * Usage:
 *   import { Nerv } from '@anthropic/nerv';
 *   const nerv = new Nerv({ projectPath: './my-project' });
 *   const task = await nerv.tasks.create({ title: 'Implement auth' });
 *   await nerv.claude.start({ taskId: task.id });
 *   const result = await nerv.yolo.run({ maxCycles: 5 });
 */

import { DatabaseService, createDatabaseService } from './database.js'
import type { Task, Project, Cycle, Learning, Decision, LearningCategory, LearningSource } from '../shared/types.js'

export interface NervConfig {
  projectPath?: string
  dbPath?: string
}

export interface TaskCreateOptions {
  title: string
  description?: string
  cycleId?: string
}

export interface ClaudeStartOptions {
  taskId?: string
  agent?: string
}

export interface YoloRunOptions {
  maxCycles?: number
  stopOnFailure?: boolean
  maxCost?: number
}

export interface YoloRunResult {
  tasksCompleted: number
  tasksFailed: number
  totalCost: number
  duration: number
}

/**
 * Tasks API
 */
class TasksApi {
  constructor(private db: DatabaseService) {}

  async create(options: TaskCreateOptions): Promise<Task> {
    const currentProject = this.db.getCurrentProject()
    if (!currentProject) {
      throw new Error('No project selected')
    }

    const activeCycle = this.db.getActiveCycle(currentProject.id)
    const cycleId = options.cycleId || activeCycle?.id
    if (!cycleId) {
      throw new Error('No active cycle')
    }

    return this.db.createTask(
      currentProject.id,
      options.title,
      options.description || '',
      cycleId,
    )
  }

  async list(projectId?: string): Promise<Task[]> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.getTasksForProject(pid)
  }

  async get(taskId: string): Promise<Task | undefined> {
    return this.db.getTask(taskId)
  }

  async update(taskId: string, updates: Partial<Task>): Promise<void> {
    if (updates.status) {
      this.db.updateTaskStatus(taskId, updates.status)
    }
    if (updates.description !== undefined) {
      this.db.updateTaskDescription(taskId, updates.description || '')
    }
    if (updates.session_id) {
      this.db.updateTaskSession(taskId, updates.session_id)
    }
    if (updates.worktree_path) {
      this.db.updateTaskWorktree(taskId, updates.worktree_path)
    }
  }

  async updateStatus(taskId: string, status: Task['status']): Promise<void> {
    this.db.updateTaskStatus(taskId, status)
  }
}

/**
 * Projects API
 */
class ProjectsApi {
  constructor(private db: DatabaseService) {}

  async create(name: string, goal?: string): Promise<Project> {
    return this.db.createProject(name, goal || '')
  }

  async list(): Promise<Project[]> {
    return this.db.getAllProjects()
  }

  async get(projectId: string): Promise<Project | undefined> {
    return this.db.getProject(projectId)
  }

  current(): Project | undefined {
    return this.db.getCurrentProject()
  }

  async setActive(projectId: string): Promise<void> {
    this.db.setCurrentProjectId(projectId)
  }
}

/**
 * Cycles API
 */
class CyclesApi {
  constructor(private db: DatabaseService) {}

  async create(goal: string, projectId?: string): Promise<Cycle> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    const cycleNumber = this.db.getNextCycleNumber(pid)
    return this.db.createCycle(pid, cycleNumber, goal)
  }

  async list(projectId?: string): Promise<Cycle[]> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.getCyclesForProject(pid)
  }

  async get(cycleId: string): Promise<Cycle | undefined> {
    return this.db.getCycle(cycleId)
  }

  async complete(cycleId: string, summary?: string): Promise<void> {
    this.db.completeCycle(cycleId, summary)
  }

  active(projectId?: string): Cycle | undefined {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      return undefined
    }
    return this.db.getActiveCycle(pid)
  }
}

/**
 * Learnings API
 */
class LearningsApi {
  constructor(private db: DatabaseService) {}

  async record(content: string, projectId?: string): Promise<Learning> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.createLearning(
      pid,
      content,
      'other' as LearningCategory,
      'manual' as LearningSource,
    )
  }

  async list(projectId?: string): Promise<Learning[]> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.getLearningsForProject(pid)
  }
}

/**
 * Decisions API
 */
class DecisionsApi {
  constructor(private db: DatabaseService) {}

  async record(title: string, rationale?: string, projectId?: string): Promise<Decision> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.createDecision(
      pid,
      title,
      rationale || '',
    )
  }

  async list(projectId?: string): Promise<Decision[]> {
    const pid = projectId || this.db.getCurrentProject()?.id
    if (!pid) {
      throw new Error('No project selected')
    }
    return this.db.getDecisionsForProject(pid)
  }
}

/**
 * Claude Sessions API
 */
class ClaudeApi {
  constructor(private db: DatabaseService) {}

  async start(options: ClaudeStartOptions = {}): Promise<void> {
    // This is a placeholder - actual Claude spawning is handled
    // by the CLI/Electron main process. This API stores the intent.
    console.log('Claude start requested:', options)
    // In a real implementation, this would communicate with the
    // main process to spawn a Claude session
  }

  async resume(sessionId?: string): Promise<void> {
    console.log('Claude resume requested:', sessionId)
  }
}

/**
 * YOLO Mode API
 */
class YoloApi {
  constructor(private db: DatabaseService) {}

  async run(options: YoloRunOptions = {}): Promise<YoloRunResult> {
    // This is a placeholder - actual YOLO execution is handled
    // by the CLI/Electron main process. This API stores the intent.
    console.log('YOLO run requested:', options)

    // In a real implementation, this would:
    // 1. Create a benchmark config
    // 2. Spawn Claude sessions for each task
    // 3. Monitor progress and return results

    return {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalCost: 0,
      duration: 0,
    }
  }

  async status(): Promise<{ running: boolean; currentTask?: string }> {
    // Check if YOLO is currently running
    return { running: false }
  }
}

/**
 * NERV Programmatic API
 *
 * Provides a fluent interface for all NERV operations.
 */
export class Nerv {
  private db: DatabaseService

  public readonly tasks: TasksApi
  public readonly projects: ProjectsApi
  public readonly cycles: CyclesApi
  public readonly learnings: LearningsApi
  public readonly decisions: DecisionsApi
  public readonly claude: ClaudeApi
  public readonly yolo: YoloApi

  constructor(config: NervConfig = {}) {
    this.db = createDatabaseService({
      dbPath: config.dbPath,
    })
    this.db.initialize()

    // Initialize sub-APIs
    this.tasks = new TasksApi(this.db)
    this.projects = new ProjectsApi(this.db)
    this.cycles = new CyclesApi(this.db)
    this.learnings = new LearningsApi(this.db)
    this.decisions = new DecisionsApi(this.db)
    this.claude = new ClaudeApi(this.db)
    this.yolo = new YoloApi(this.db)
  }

  /**
   * Close the database connection.
   * Call this when done using the API.
   */
  close(): void {
    this.db.close()
  }
}

/**
 * Factory function to create a Nerv instance
 */
export function createNerv(config: NervConfig = {}): Nerv {
  return new Nerv(config)
}
