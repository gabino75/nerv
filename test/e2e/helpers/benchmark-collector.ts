/**
 * NERV Benchmark Collector
 *
 * Collects and writes comprehensive benchmark output as specified in PRD Section 26.
 * Produces structured output for scoring and analysis.
 *
 * Output directory structure:
 *   test-results/benchmark-{timestamp}/
 *   ├── summary.json                    # Overall run metadata and scores
 *   ├── config.json                     # NERV config used for this run
 *   ├── spec.md                         # The spec that was being implemented
 *   ├── tasks/
 *   │   └── {taskId}/
 *   │       ├── stream.jsonl            # Raw Claude stream-json output
 *   │       ├── terminal.log            # Human-readable terminal output
 *   │       ├── tools.jsonl             # All MCP tool calls
 *   │       ├── subagents.jsonl         # Subagent spawn/complete events
 *   │       ├── metrics.json            # Per-task token/cost/time breakdown
 *   │       ├── errors.json             # Any exceptions, retries, or failures
 *   │       └── git-diff.patch          # All git changes made during this task
 *   ├── cycles/
 *   │   └── {cycleId}/
 *   │       ├── audit-report.json       # Audit results if audit ran
 *   │       ├── review-report.json      # Review agent output (YOLO mode)
 *   │       └── learnings.json          # Learnings recorded this cycle
 *   ├── worktrees/
 *   │   └── {worktreeName}/
 *   │       ├── final-state.tar.gz      # Snapshot of worktree at completion
 *   │       └── commit-log.json         # All commits with messages and hashes
 *   ├── permissions/
 *   │   ├── requests.jsonl              # All permission requests with timing
 *   │   └── decisions.jsonl             # All permission decisions
 *   └── timeline.jsonl                  # Ordered event log for entire run
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import type {
  BenchmarkConfig,
  BenchmarkSummary,
  BenchmarkOutcome,
  BenchmarkStreamEntry,
  BenchmarkToolEntry,
  BenchmarkSubagentEntry,
  BenchmarkTimelineEntry,
  BenchmarkPermissionRequest,
  BenchmarkPermissionDecision,
  BenchmarkScores,
} from '../../../src/shared/types'

// Get NERV version from package.json
function getNervVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../../package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export interface TaskMetrics {
  taskId: string
  startTime: number
  endTime?: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
  numTurns: number
  toolCalls: number
  toolErrors: number
  toolRetries: number
  status: string
}

export interface CycleMetrics {
  cycleId: string
  cycleNumber: number
  startTime: number
  endTime?: number
  tasksCompleted: number
  auditRan: boolean
  auditPassed: boolean
  learnings: string[]
}

/**
 * BenchmarkCollector - Collects and writes comprehensive benchmark data
 */
export class BenchmarkCollector {
  private benchmarkId: string
  private outputDir: string
  private startTime: number
  private config: BenchmarkConfig
  private specContent: string

  // Tracking state
  private tasks: Map<string, TaskMetrics> = new Map()
  private cycles: Map<string, CycleMetrics> = new Map()
  private timeline: BenchmarkTimelineEntry[] = []
  private permissionRequests: BenchmarkPermissionRequest[] = []
  private permissionDecisions: BenchmarkPermissionDecision[] = []

  // Task-level streams (written incrementally)
  private taskStreams: Map<string, fs.WriteStream> = new Map()
  private taskToolsStreams: Map<string, fs.WriteStream> = new Map()
  private taskSubagentsStreams: Map<string, fs.WriteStream> = new Map()
  private taskTerminalLogs: Map<string, fs.WriteStream> = new Map()
  private taskErrors: Map<string, unknown[]> = new Map()

  // Workflow tracking
  private worktreesCreated = 0
  private worktreesMerged = 0
  private worktreesDiscarded = 0
  private branchesCreated = 0
  private parallelTasksRun = 0
  private loopsDetected = 0
  private compactions = 0
  private stuckDetections = 0

  // Test/spec tracking
  private specItems = 0
  private specItemsPassed = 0
  private specItemsFailed = 0
  private testsPassed = 0
  private testsFailed = 0
  private testsSkipped = 0

  constructor(
    baseDir: string,
    config: BenchmarkConfig,
    specContent: string = ''
  ) {
    this.startTime = Date.now()
    this.benchmarkId = `bench-${new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)}`
    this.outputDir = path.join(baseDir, `benchmark-${this.benchmarkId.replace('bench-', '')}`)
    this.config = config
    this.specContent = specContent

    // Create directory structure
    this.createDirectoryStructure()

    // Write initial files
    this.writeConfigFile()
    this.writeSpecFile()

    // Log benchmark start
    this.addTimelineEvent('benchmark_start', {
      benchmarkId: this.benchmarkId,
      spec: config.specFile,
    })
  }

  /**
   * Create the output directory structure
   */
  private createDirectoryStructure(): void {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'tasks'),
      path.join(this.outputDir, 'cycles'),
      path.join(this.outputDir, 'worktrees'),
      path.join(this.outputDir, 'permissions'),
    ]

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  /**
   * Write config.json
   */
  private writeConfigFile(): void {
    const configPath = path.join(this.outputDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2))
  }

  /**
   * Write spec.md
   */
  private writeSpecFile(): void {
    const specPath = path.join(this.outputDir, 'spec.md')
    fs.writeFileSync(specPath, this.specContent || `# Benchmark Spec\n\nSpec: ${this.config.specFile}`)
  }

  /**
   * Get output directory path
   */
  getOutputDir(): string {
    return this.outputDir
  }

  /**
   * Get benchmark ID
   */
  getBenchmarkId(): string {
    return this.benchmarkId
  }

  /**
   * Check if a task is being tracked
   */
  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId)
  }

  // =========================================================================
  // Timeline Events
  // =========================================================================

  /**
   * Add an event to the timeline
   */
  addTimelineEvent(event: string, data: Record<string, unknown> = {}): void {
    const entry: BenchmarkTimelineEntry = {
      timestamp: Date.now(),
      event,
      ...data,
    }
    this.timeline.push(entry)

    // Append to timeline.jsonl immediately
    const timelinePath = path.join(this.outputDir, 'timeline.jsonl')
    fs.appendFileSync(timelinePath, JSON.stringify(entry) + '\n')
  }

  // =========================================================================
  // Task Tracking
  // =========================================================================

  /**
   * Start tracking a task
   */
  startTask(taskId: string, title: string, worktree?: string): void {
    const taskDir = path.join(this.outputDir, 'tasks', taskId)
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true })
    }

    this.tasks.set(taskId, {
      taskId,
      startTime: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      numTurns: 0,
      toolCalls: 0,
      toolErrors: 0,
      toolRetries: 0,
      status: 'in_progress',
    })

    // Initialize streams
    this.taskStreams.set(taskId, fs.createWriteStream(path.join(taskDir, 'stream.jsonl')))
    this.taskToolsStreams.set(taskId, fs.createWriteStream(path.join(taskDir, 'tools.jsonl')))
    this.taskSubagentsStreams.set(taskId, fs.createWriteStream(path.join(taskDir, 'subagents.jsonl')))
    this.taskTerminalLogs.set(taskId, fs.createWriteStream(path.join(taskDir, 'terminal.log')))
    this.taskErrors.set(taskId, [])

    this.addTimelineEvent('task_start', {
      taskId,
      title,
      worktree,
    })
  }

  /**
   * Record a stream entry for a task
   */
  recordStreamEntry(taskId: string, entry: BenchmarkStreamEntry): void {
    const stream = this.taskStreams.get(taskId)
    if (stream) {
      stream.write(JSON.stringify(entry) + '\n')
    }

    // Update metrics from result entries
    if (entry.type === 'result' && entry.result) {
      const metrics = this.tasks.get(taskId)
      if (metrics) {
        if (entry.result.cost_usd) metrics.costUsd = entry.result.cost_usd
        if (entry.result.num_turns) metrics.numTurns = entry.result.num_turns
        if (entry.result.duration_ms) metrics.endTime = metrics.startTime + entry.result.duration_ms
      }
    }
  }

  /**
   * Record a tool call for a task
   */
  recordToolCall(taskId: string, entry: BenchmarkToolEntry): void {
    const stream = this.taskToolsStreams.get(taskId)
    if (stream) {
      stream.write(JSON.stringify(entry) + '\n')
    }

    const metrics = this.tasks.get(taskId)
    if (metrics) {
      metrics.toolCalls++
      if (!entry.success) metrics.toolErrors++
      if (entry.retryOf) metrics.toolRetries++
    }

    this.addTimelineEvent(entry.success ? 'tool_call' : 'tool_error', {
      taskId,
      tool: entry.tool,
      success: entry.success,
      error: entry.error,
    })
  }

  /**
   * Record a subagent event for a task
   */
  recordSubagentEvent(taskId: string, entry: BenchmarkSubagentEntry): void {
    const stream = this.taskSubagentsStreams.get(taskId)
    if (stream) {
      stream.write(JSON.stringify(entry) + '\n')
    }

    this.addTimelineEvent(`subagent_${entry.event}`, {
      taskId,
      subagentId: entry.subagentId,
      type: entry.type,
      success: entry.success,
    })
  }

  /**
   * Record terminal output for a task
   */
  recordTerminalOutput(taskId: string, output: string): void {
    const log = this.taskTerminalLogs.get(taskId)
    if (log) {
      log.write(output)
    }
  }

  /**
   * Record an error for a task
   */
  recordError(taskId: string, error: unknown): void {
    const errors = this.taskErrors.get(taskId)
    if (errors) {
      errors.push({
        timestamp: Date.now(),
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      })
    }
  }

  /**
   * Update token usage for a task
   */
  updateTokenUsage(
    taskId: string,
    inputTokens: number,
    outputTokens: number,
    cachedTokens: number = 0
  ): void {
    const metrics = this.tasks.get(taskId)
    if (metrics) {
      metrics.inputTokens = inputTokens
      metrics.outputTokens = outputTokens
      metrics.cachedTokens = cachedTokens
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, status: 'done' | 'failed', worktreePath?: string): void {
    const metrics = this.tasks.get(taskId)
    if (metrics) {
      metrics.endTime = Date.now()
      metrics.status = status
    }

    // Close streams
    this.taskStreams.get(taskId)?.end()
    this.taskToolsStreams.get(taskId)?.end()
    this.taskSubagentsStreams.get(taskId)?.end()
    this.taskTerminalLogs.get(taskId)?.end()

    // Write metrics.json
    const taskDir = path.join(this.outputDir, 'tasks', taskId)
    if (metrics) {
      fs.writeFileSync(
        path.join(taskDir, 'metrics.json'),
        JSON.stringify(metrics, null, 2)
      )
    }

    // Write errors.json
    const errors = this.taskErrors.get(taskId) || []
    fs.writeFileSync(
      path.join(taskDir, 'errors.json'),
      JSON.stringify(errors, null, 2)
    )

    // Capture git diff if worktree exists
    if (worktreePath && fs.existsSync(worktreePath)) {
      try {
        const diff = execSync('git diff HEAD', { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
        fs.writeFileSync(path.join(taskDir, 'git-diff.patch'), diff)
      } catch {
        // Git diff may fail if not in a repo
      }

      // Capture worktree final state per PRD Section 27
      const worktreeName = `${taskId}-${path.basename(worktreePath)}`
      this.captureWorktreeFinalState(worktreeName, worktreePath)
    }

    this.addTimelineEvent('task_complete', {
      taskId,
      status,
      tokensUsed: metrics ? metrics.inputTokens + metrics.outputTokens : 0,
    })
  }

  // =========================================================================
  // Cycle Tracking
  // =========================================================================

  /**
   * Start tracking a cycle
   */
  startCycle(cycleId: string, cycleNumber: number): void {
    const cycleDir = path.join(this.outputDir, 'cycles', cycleId)
    if (!fs.existsSync(cycleDir)) {
      fs.mkdirSync(cycleDir, { recursive: true })
    }

    this.cycles.set(cycleId, {
      cycleId,
      cycleNumber,
      startTime: Date.now(),
      tasksCompleted: 0,
      auditRan: false,
      auditPassed: false,
      learnings: [],
    })

    this.addTimelineEvent('cycle_start', {
      cycleId,
      cycleNumber,
    })
  }

  /**
   * Record audit results for a cycle
   */
  recordAuditResult(cycleId: string, passed: boolean, report: unknown): void {
    const cycle = this.cycles.get(cycleId)
    if (cycle) {
      cycle.auditRan = true
      cycle.auditPassed = passed
    }

    const cycleDir = path.join(this.outputDir, 'cycles', cycleId)
    fs.writeFileSync(
      path.join(cycleDir, 'audit-report.json'),
      JSON.stringify(report, null, 2)
    )

    this.addTimelineEvent(passed ? 'audit_passed' : 'audit_failed', {
      cycleId,
      passed,
    })
  }

  /**
   * Record review results for a cycle (YOLO mode)
   */
  recordReviewResult(cycleId: string, decision: string, report: unknown): void {
    const cycleDir = path.join(this.outputDir, 'cycles', cycleId)
    fs.writeFileSync(
      path.join(cycleDir, 'review-report.json'),
      JSON.stringify({ decision, ...report as object }, null, 2)
    )

    this.addTimelineEvent('review_complete', {
      cycleId,
      decision,
    })
  }

  /**
   * Record learnings for a cycle
   */
  recordLearnings(cycleId: string, learnings: string[]): void {
    const cycle = this.cycles.get(cycleId)
    if (cycle) {
      cycle.learnings = learnings
    }

    const cycleDir = path.join(this.outputDir, 'cycles', cycleId)
    fs.writeFileSync(
      path.join(cycleDir, 'learnings.json'),
      JSON.stringify({ learnings }, null, 2)
    )
  }

  /**
   * Complete a cycle
   */
  completeCycle(cycleId: string, tasksCompleted: number): void {
    const cycle = this.cycles.get(cycleId)
    if (cycle) {
      cycle.endTime = Date.now()
      cycle.tasksCompleted = tasksCompleted
    }

    this.addTimelineEvent('cycle_complete', {
      cycleId,
      tasksCompleted,
    })
  }

  // =========================================================================
  // Permission Tracking
  // =========================================================================

  /**
   * Record a permission request
   */
  recordPermissionRequest(request: BenchmarkPermissionRequest): void {
    this.permissionRequests.push(request)

    const requestsPath = path.join(this.outputDir, 'permissions', 'requests.jsonl')
    fs.appendFileSync(requestsPath, JSON.stringify(request) + '\n')

    this.addTimelineEvent('permission_request', {
      tool: request.tool,
      command: request.command,
      taskId: request.taskId,
    })
  }

  /**
   * Record a permission decision
   */
  recordPermissionDecision(decision: BenchmarkPermissionDecision): void {
    this.permissionDecisions.push(decision)

    const decisionsPath = path.join(this.outputDir, 'permissions', 'decisions.jsonl')
    fs.appendFileSync(decisionsPath, JSON.stringify(decision) + '\n')

    this.addTimelineEvent('permission_decision', {
      decision: decision.decision,
      pattern: decision.pattern,
      taskId: decision.taskId,
    })
  }

  // =========================================================================
  // Workflow Tracking
  // =========================================================================

  recordWorktreeCreated(): void {
    this.worktreesCreated++
    this.addTimelineEvent('worktree_created', {})
  }

  recordWorktreeMerged(): void {
    this.worktreesMerged++
    this.addTimelineEvent('worktree_merged', {})
  }

  recordWorktreeDiscarded(): void {
    this.worktreesDiscarded++
    this.addTimelineEvent('worktree_discarded', {})
  }

  /**
   * Capture worktree final state per PRD Section 27
   * Creates worktrees/{worktreeName}/ with:
   * - final-state.tar.gz (snapshot of worktree)
   * - commit-log.json (all commits with messages and hashes)
   */
  captureWorktreeFinalState(worktreeName: string, worktreePath: string): void {
    if (!worktreePath || !fs.existsSync(worktreePath)) {
      return
    }

    const worktreeDir = path.join(this.outputDir, 'worktrees', worktreeName)
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true })
    }

    // Capture commit log
    try {
      const gitLogOutput = execSync(
        'git log --format={"hash":"%H","shortHash":"%h","author":"%an","date":"%aI","message":"%s"}, --no-walk --all',
        { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      )

      // Parse git log JSON entries (they're comma-separated, need to wrap in array)
      const commits: Array<{ hash: string; shortHash: string; author: string; date: string; message: string }> = []
      const logLines = gitLogOutput.trim().split('\n').filter(l => l.trim())
      for (const line of logLines) {
        try {
          // Remove trailing comma if present
          const cleanLine = line.trim().replace(/,\s*$/, '')
          commits.push(JSON.parse(cleanLine))
        } catch {
          // Skip malformed entries
        }
      }

      fs.writeFileSync(
        path.join(worktreeDir, 'commit-log.json'),
        JSON.stringify({ commits, worktreePath }, null, 2)
      )
    } catch {
      // Git log may fail, write empty commit log
      fs.writeFileSync(
        path.join(worktreeDir, 'commit-log.json'),
        JSON.stringify({ commits: [], worktreePath, error: 'Failed to capture git log' }, null, 2)
      )
    }

    // Capture final state tarball (best effort - tar may not be available on Windows)
    try {
      const tarPath = path.join(worktreeDir, 'final-state.tar.gz')
      // Use git archive if available (works on all platforms with git)
      execSync(`git archive --format=tar.gz -o "${tarPath}" HEAD`, {
        cwd: worktreePath,
        encoding: 'utf-8'
      })
    } catch {
      // If tar fails, just note it in a marker file
      fs.writeFileSync(
        path.join(worktreeDir, 'final-state.txt'),
        `Worktree snapshot not captured (tar/archive not available)\nPath: ${worktreePath}\nTimestamp: ${new Date().toISOString()}`
      )
    }

    this.addTimelineEvent('worktree_snapshot_captured', { worktreeName, worktreePath })
  }

  recordBranchCreated(): void {
    this.branchesCreated++
    this.addTimelineEvent('branch_created', {})
  }

  recordParallelTasksStarted(count: number): void {
    this.parallelTasksRun += count
    this.addTimelineEvent('parallel_tasks_started', { count })
  }

  recordLoopDetected(): void {
    this.loopsDetected++
    this.addTimelineEvent('loop_detected', {})
  }

  recordCompaction(taskId: string): void {
    this.compactions++
    this.addTimelineEvent('compaction', { taskId })
  }

  recordStuckDetection(taskId: string): void {
    this.stuckDetections++
    this.addTimelineEvent('stuck_detected', { taskId })
  }

  // =========================================================================
  // YOLO Metrics Integration
  // =========================================================================

  /**
   * Apply YOLO benchmark result metrics to the collector
   * This pulls metrics from YOLO's internal tracking into the BenchmarkCollector summary
   */
  applyYoloMetrics(yoloResult: {
    totalCostUsd?: number
    cyclesCompleted?: number
    tasksCompleted?: number
    testsPassed?: number
    testsFailed?: number
    specCompletionPct?: number
    totalDurationMs?: number
  }): void {
    // If YOLO tracked cost, distribute it across tasks (or set on first task if single)
    if (yoloResult.totalCostUsd && yoloResult.totalCostUsd > 0) {
      const tasks = Array.from(this.tasks.values())
      if (tasks.length > 0) {
        const costPerTask = yoloResult.totalCostUsd / tasks.length
        for (const task of tasks) {
          task.costUsd = costPerTask
        }
      }
    }

    // Update test counts from YOLO
    if (yoloResult.testsPassed !== undefined) {
      this.testsPassed = yoloResult.testsPassed
    }
    if (yoloResult.testsFailed !== undefined) {
      this.testsFailed = yoloResult.testsFailed
    }

    // Update spec completion from YOLO's tracking
    if (yoloResult.specCompletionPct !== undefined && yoloResult.specCompletionPct > 0) {
      // Calculate how many items passed based on percentage
      const passed = Math.round((yoloResult.specCompletionPct / 100) * this.specItems)
      this.specItemsPassed = Math.min(passed, this.specItems)
      this.specItemsFailed = 0 // Assume rest are not failed, just not done
    }
  }

  /**
   * Apply session metrics (tokens, cost) from database query results
   */
  applySessionMetrics(taskId: string, metrics: {
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    numTurns?: number
    durationMs?: number
  }): void {
    const task = this.tasks.get(taskId)
    if (task) {
      if (metrics.inputTokens !== undefined) task.inputTokens = metrics.inputTokens
      if (metrics.outputTokens !== undefined) task.outputTokens = metrics.outputTokens
      if (metrics.costUsd !== undefined) task.costUsd = metrics.costUsd
      if (metrics.numTurns !== undefined) task.numTurns = metrics.numTurns
      if (metrics.durationMs !== undefined && task.startTime) {
        task.endTime = task.startTime + metrics.durationMs
      }
    }
  }

  // =========================================================================
  // Test/Spec Tracking
  // =========================================================================

  setSpecItems(total: number): void {
    this.specItems = total
  }

  recordSpecItemResult(passed: boolean): void {
    if (passed) {
      this.specItemsPassed++
    } else {
      this.specItemsFailed++
    }
  }

  recordTestResult(result: 'passed' | 'failed' | 'skipped'): void {
    switch (result) {
      case 'passed':
        this.testsPassed++
        break
      case 'failed':
        this.testsFailed++
        break
      case 'skipped':
        this.testsSkipped++
        break
    }
  }

  // =========================================================================
  // Finalization
  // =========================================================================

  /**
   * Determine the benchmark outcome
   */
  private determineOutcome(): BenchmarkOutcome {
    const failedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'failed').length
    const totalTasks = this.tasks.size

    if (failedTasks === 0 && totalTasks > 0) {
      return 'success'
    } else if (failedTasks < totalTasks) {
      return 'partial'
    } else {
      return 'failed'
    }
  }

  /**
   * Calculate total tokens across all tasks
   */
  private calculateTotalTokens(): { total: number; input: number; output: number; cached: number } {
    let total = 0, input = 0, output = 0, cached = 0

    for (const metrics of this.tasks.values()) {
      input += metrics.inputTokens
      output += metrics.outputTokens
      cached += metrics.cachedTokens
      total += metrics.inputTokens + metrics.outputTokens
    }

    return { total, input, output, cached }
  }

  /**
   * Calculate total cost across all tasks
   */
  private calculateTotalCost(): number {
    let total = 0
    for (const metrics of this.tasks.values()) {
      total += metrics.costUsd
    }
    return total
  }

  /**
   * Build the summary.json structure
   */
  private buildSummary(scores: BenchmarkScores | null = null): BenchmarkSummary {
    const endTime = Date.now()
    const tokens = this.calculateTotalTokens()
    const totalCost = this.calculateTotalCost()

    // Build per-task and per-cycle breakdowns
    const perTask: Record<string, number> = {}
    const perTaskCost: Record<string, number> = {}
    const perTaskDuration: Record<string, number> = {}
    const byStatus: Record<string, number> = {}

    for (const [taskId, metrics] of this.tasks) {
      perTask[taskId] = metrics.inputTokens + metrics.outputTokens
      perTaskCost[taskId] = metrics.costUsd
      perTaskDuration[taskId] = (metrics.endTime || endTime) - metrics.startTime
      byStatus[metrics.status] = (byStatus[metrics.status] || 0) + 1
    }

    const perCycle: number[] = []
    const perCycleCost: number[] = []

    for (const cycle of this.cycles.values()) {
      // Estimate tokens per cycle (simplified)
      perCycle.push(0)
      perCycleCost.push(0)
    }

    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'done').length
    const failedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'failed').length

    const auditsRun = Array.from(this.cycles.values()).filter(c => c.auditRan).length
    const auditsPassed = Array.from(this.cycles.values()).filter(c => c.auditPassed).length

    // Calculate tool errors/retries
    let totalToolErrors = 0
    let totalToolRetries = 0
    for (const metrics of this.tasks.values()) {
      totalToolErrors += metrics.toolErrors
      totalToolRetries += metrics.toolRetries
    }

    return {
      benchmarkId: this.benchmarkId,
      timestamp: this.startTime,
      nervVersion: getNervVersion(),
      specFile: this.config.specFile,
      model: this.config.model,
      config: this.config,
      outcome: this.determineOutcome(),
      duration: {
        totalMs: endTime - this.startTime,
        perCycle: Array.from(this.cycles.values()).map(c => (c.endTime || endTime) - c.startTime),
        perTask: perTaskDuration,
      },
      tokens: {
        total: tokens.total,
        input: tokens.input,
        output: tokens.output,
        cached: tokens.cached,
        perTask,
        perCycle,
      },
      cost: {
        totalUsd: totalCost,
        perTask: perTaskCost,
        perCycle: perCycleCost,
      },
      tasks: {
        total: this.tasks.size,
        completed: completedTasks,
        failed: failedTasks,
        byStatus,
      },
      cycles: {
        total: this.cycles.size,
        auditsRun,
        auditsPassed,
      },
      workflow: {
        worktreesCreated: this.worktreesCreated,
        worktreesMerged: this.worktreesMerged,
        worktreesDiscarded: this.worktreesDiscarded,
        branchesCreated: this.branchesCreated,
        parallelTasksRun: this.parallelTasksRun,
      },
      issues: {
        loopsDetected: this.loopsDetected,
        compactions: this.compactions,
        toolErrors: totalToolErrors,
        toolRetries: totalToolRetries,
        permissionTimeouts: 0, // TODO: track this
        stuckDetections: this.stuckDetections,
      },
      spec: {
        totalItems: this.specItems,
        itemsPassed: this.specItemsPassed,
        itemsFailed: this.specItemsFailed,
        completionPercent: this.specItems > 0 ? (this.specItemsPassed / this.specItems) * 100 : 0,
      },
      tests: {
        total: this.testsPassed + this.testsFailed + this.testsSkipped,
        passed: this.testsPassed,
        failed: this.testsFailed,
        skipped: this.testsSkipped,
      },
      scores,
    }
  }

  /**
   * Finalize the benchmark and write summary.json
   */
  finalize(scores: BenchmarkScores | null = null): BenchmarkSummary {
    this.addTimelineEvent('benchmark_complete', {
      outcome: this.determineOutcome(),
      duration: Date.now() - this.startTime,
    })

    const summary = this.buildSummary(scores)

    // Write summary.json
    const summaryPath = path.join(this.outputDir, 'summary.json')
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

    return summary
  }

  /**
   * Update summary with scores (called by scoring script)
   */
  updateScores(scores: BenchmarkScores): void {
    const summaryPath = path.join(this.outputDir, 'summary.json')
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as BenchmarkSummary
      summary.scores = scores
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    }
  }
}

export default BenchmarkCollector
