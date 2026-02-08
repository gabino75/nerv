/**
 * Benchmark commands
 *
 * nerv benchmark <spec>              - Run benchmark with spec file
 * nerv benchmark score <dir>         - Score a benchmark result
 * nerv benchmark history             - View benchmark history
 * nerv benchmark compare <run1> <run2> - Compare two benchmark runs
 * nerv yolo                          - Run in YOLO mode
 * nerv yolo --cycles N               - Run N cycles
 * nerv yolo --max-cost <usd>         - Stop at cost limit
 * nerv yolo --stop-on-failure        - Stop on first failure
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn, execSync } from 'child_process'
import type { DatabaseService } from '../../core/database.js'
import { parseStreamMessage, extractResult, extractTokenUsage, extractSessionId, estimateCost } from '../../core/claude-config.js'
import type { TokenUsage, StreamMessage } from '../../core/claude-config.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'
import { parseSpec } from '../../core/spec-parser.js'
import { createTaskWorktree, mergeWorktree, getWorktreeDiff } from '../../core/benchmark-worktree.js'
import { runReviewAgent } from '../../core/benchmark-review.js'
import { scoreNervOps, nervOpsScoreTo10 } from '../../core/benchmark-scoring.js'
import type {
  ParsedCycle,
  ParsedSubtask,
  BenchmarkTaskResult,
  BenchmarkCycleResult,
  BenchmarkPipelineResult,
  BenchmarkSummary,
} from '../../shared/types/benchmark.js'

// ============================================================================
// Types
// ============================================================================

interface BenchmarkArgs {
  specFile: string | undefined
  maxCycles: number
  maxCostUsd: number
  scoringDir: string | undefined
  jsonOutput: boolean
  stopOnFailure: boolean
  gradeClaude: boolean
  dangerouslySkipPermissions: boolean
  subcommand: string | undefined
  compareArgs: string[]
  maxConcurrent: number
  uiMode: boolean
}

interface BenchmarkResults {
  allPassed?: boolean
  totalDuration?: number
  results?: Record<string, boolean | number | string>
}

interface ScoreResult {
  timestamp: string
  benchmarkDir: string
  scores: Record<string, number>
  weightedTotal: number
  passed: boolean
  summary: Record<string, string>
}

interface RunMetrics {
  sessionId: string | null
  totalCostUsd: number
  durationMs: number
  numTurns: number
  tokens: TokenUsage
  exitCode: number
}

interface HistoryEntry {
  timestamp: string
  benchmarkDir: string
  scores: Record<string, number>
  weightedTotal: number
  passed: boolean
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseBenchmarkArgs(args: string[], isYolo: boolean): BenchmarkArgs {
  const result: BenchmarkArgs = {
    specFile: undefined,
    maxCycles: 10,
    maxCostUsd: 5.0,
    scoringDir: undefined,
    jsonOutput: args.includes('--json'),
    stopOnFailure: args.includes('--stop-on-failure'),
    gradeClaude: args.includes('--grade-claude'),
    dangerouslySkipPermissions: isYolo || args.includes('--dangerously-skip-permissions'),
    subcommand: undefined,
    compareArgs: [],
    maxConcurrent: 3,
    uiMode: args.includes('--ui'),
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--cycles') {
      result.maxCycles = parseInt(args[++i], 10) || 10
    } else if (arg === '--max-cost') {
      result.maxCostUsd = parseFloat(args[++i]) || 5.0
    } else if (arg === '--max-concurrent') {
      result.maxConcurrent = parseInt(args[++i], 10) || 3
    } else if (arg === 'score' && !isYolo) {
      result.subcommand = 'score'
      result.scoringDir = args[++i]
    } else if (arg === 'history' && !isYolo) {
      result.subcommand = 'history'
    } else if (arg === 'compare' && !isYolo) {
      result.subcommand = 'compare'
      result.compareArgs = args.slice(i + 1).filter(a => !a.startsWith('-'))
      break
    } else if (arg === '--json' || arg === '--stop-on-failure' || arg === '--grade-claude' || arg === '--dangerously-skip-permissions' || arg === '--ui') {
      // already handled above
    } else if (!arg.startsWith('-') && !result.specFile && !result.scoringDir) {
      result.specFile = arg
    }
  }

  return result
}

// ============================================================================
// Score Categories (PRD Section 27)
// ============================================================================

const CATEGORIES: Record<string, { name: string; weight: number }> = {
  implementationQuality: { name: 'Implementation Quality', weight: 0.30 },
  workflowQuality: { name: 'Workflow Quality', weight: 0.20 },
  efficiency: { name: 'Efficiency', weight: 0.20 },
  userExperience: { name: 'User Experience', weight: 0.30 },
}

// ============================================================================
// Scoring
// ============================================================================

function loadBenchmarkResults(benchmarkDir: string): BenchmarkResults {
  const files = fs.readdirSync(benchmarkDir)
  const resultsFile = files.find(f => f.startsWith('benchmark-results') && f.endsWith('.json'))

  if (!resultsFile) {
    throw new Error(`No benchmark-results-*.json found in ${benchmarkDir}`)
  }

  const resultsPath = path.join(benchmarkDir, resultsFile)
  return JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as BenchmarkResults
}

function scoreCategory(results: BenchmarkResults, category: string): number {
  let score = 5
  const r = results.results || {}

  switch (category) {
    case 'implementationQuality':
      if (r.projectCreated) score += 1
      if (r.taskCreated) score += 1
      if (r.contextMonitorActive) score += 1
      if (r.terminalHasOutput) score += 1
      if (results.allPassed) score += 1
      break
    case 'workflowQuality':
      if (r.worktreeExists) score += 2
      if (r.hasSessionId) score += 1
      if (r.taskInProgress) score += 1
      if (results.allPassed) score += 1
      break
    case 'efficiency': {
      const durationMs = results.totalDuration || 0
      if (durationMs < 10000) score += 3
      else if (durationMs < 30000) score += 2
      else if (durationMs < 60000) score += 1
      if (results.allPassed && durationMs < 30000) score += 2
      break
    }
    case 'userExperience':
      if (r.projectCreated) score += 1
      if (r.taskCreated) score += 1
      if (r.terminalHasOutput) score += 1
      if (r.contextMonitorActive) score += 1
      if (results.allPassed) score += 1
      break
  }

  return Math.min(10, Math.max(0, score))
}

function scoreBenchmarkResults(benchmarkDir: string): ScoreResult {
  const results = loadBenchmarkResults(benchmarkDir)

  const scores: Record<string, number> = {}
  for (const key of Object.keys(CATEGORIES)) {
    scores[key] = scoreCategory(results, key)
  }

  const weightedScore =
    scores.implementationQuality * 0.3 +
    scores.workflowQuality * 0.2 +
    scores.efficiency * 0.2 +
    scores.userExperience * 0.3

  let holisticAdjustment = 0
  if (results.allPassed) holisticAdjustment += 0.5
  if (results.results?.projectCreated === false) holisticAdjustment -= 0.5
  if (results.results?.taskCreated === false) holisticAdjustment -= 0.3
  holisticAdjustment = Math.max(-1, Math.min(1, holisticAdjustment))

  scores.overall = Math.min(10, Math.max(0, Math.round((weightedScore + holisticAdjustment) * 10) / 10))

  const summary: Record<string, string> = {}
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    summary[cat.name] = `${scores[key]}/10`
  }
  summary['Overall'] = `${scores.overall}/10`

  return {
    timestamp: new Date().toISOString(),
    benchmarkDir: path.resolve(benchmarkDir),
    scores,
    weightedTotal: scores.overall,
    passed: results.allPassed || false,
    summary,
  }
}

// ============================================================================
// Output Directory
// ============================================================================

function createOutputDir(resultId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outputDir = path.join(process.cwd(), 'test-results', 'benchmark', `run-${timestamp}-${resultId.slice(0, 8)}`)
  fs.mkdirSync(outputDir, { recursive: true })
  return outputDir
}

// ============================================================================
// Post-Processing: Extract Rich Audit Data from stream.jsonl
// ============================================================================

interface ToolCallEntry {
  timestamp: number
  tool: string
  success: boolean
  error?: string
  retryOf?: string
}

interface TimelineEntry {
  timestamp: number
  event: string
  [key: string]: unknown
}

function postProcessStreamData(outputDir: string): {
  toolCalls: ToolCallEntry[]
  errors: unknown[]
  timeline: TimelineEntry[]
  toolErrors: number
  toolRetries: number
  loopsDetected: number
  compactions: number
} {
  const streamPath = path.join(outputDir, 'stream.jsonl')
  const toolCalls: ToolCallEntry[] = []
  const errors: unknown[] = []
  const timeline: TimelineEntry[] = []
  let toolErrors = 0
  const toolRetries = 0
  const loopsDetected = 0
  let compactions = 0
  let previousInputTokens = 0

  if (!fs.existsSync(streamPath)) {
    return { toolCalls, errors, timeline, toolErrors, toolRetries, loopsDetected, compactions }
  }

  const lines = fs.readFileSync(streamPath, 'utf-8').split('\n').filter(Boolean)

  for (const line of lines) {
    const msg = parseStreamMessage(line)
    if (!msg) continue

    const now = Date.now()

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.name) {
          const entry: ToolCallEntry = {
            timestamp: now,
            tool: block.name,
            success: true,
          }
          toolCalls.push(entry)
          timeline.push({ timestamp: now, event: 'tool_call', tool: block.name })
        }
      }
    }

    if (msg.type === 'user' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          const text = block.text || (typeof (block as Record<string, unknown>).content === 'string' ? (block as Record<string, unknown>).content as string : '')
          if (text && (text.includes('Error') || text.includes('error') || text.includes('FAILED'))) {
            toolErrors++
            errors.push({ timestamp: now, message: text.slice(0, 200) })
            timeline.push({ timestamp: now, event: 'tool_error', error: text.slice(0, 100) })
          }
        }
      }
    }

    const usage = msg.usage || (msg.message as Record<string, unknown> | undefined)?.usage as { input_tokens?: number } | undefined
    if (usage) {
      const currentInputTokens = usage.input_tokens || 0
      if (previousInputTokens > 0 && currentInputTokens < previousInputTokens * 0.5) {
        compactions++
        timeline.push({ timestamp: now, event: 'compaction' })
      }
      previousInputTokens = currentInputTokens
    }

    if (msg.type === 'result') {
      timeline.push({ timestamp: now, event: 'session_complete', result: msg.result })
    }

    if (msg.type === 'system' && msg.session_id) {
      timeline.push({ timestamp: now, event: 'session_start', sessionId: msg.session_id })
    }
  }

  return { toolCalls, errors, timeline, toolErrors, toolRetries, loopsDetected, compactions }
}

// ============================================================================
// Git Helpers
// ============================================================================

function captureGitDiff(cwd: string): string {
  try {
    let result = execSync(
      'git diff HEAD 2>/dev/null || git diff 2>/dev/null || echo ""',
      { cwd, encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024 }
    )
    if (!result.trim()) {
      result = execSync(
        'git diff $(git rev-list --max-parents=0 HEAD 2>/dev/null)..HEAD 2>/dev/null || git log -p --reverse 2>/dev/null || echo ""',
        { cwd, encoding: 'utf-8', timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
      )
    }
    return result || ''
  } catch {
    return ''
  }
}

function captureGitLog(cwd: string): string {
  try {
    const result = execSync(
      'git log --oneline --stat --no-decorate -30 2>/dev/null || echo ""',
      { cwd, encoding: 'utf-8', timeout: 10000, maxBuffer: 512 * 1024 }
    )
    return result || ''
  } catch {
    return ''
  }
}

function countGitCommits(cwd: string): number {
  try {
    const result = execSync(
      'git rev-list --count HEAD 2>/dev/null || echo "0"',
      { cwd, encoding: 'utf-8', timeout: 5000 }
    )
    return parseInt(result.trim(), 10) || 0
  } catch {
    return 0
  }
}

function initGitRepo(dir: string, specContent?: string): void {
  execSync('git init', { cwd: dir, encoding: 'utf-8', timeout: 10000 })

  // Write CLAUDE.md so Claude Code has workspace context in the worktree
  const claudeMd = `# Benchmark Project

## Commands
- \`npm run dev\` - Start dev server
- \`npm run build\` - Build for production
- \`npm test\` - Run tests

## Code Style
- TypeScript strict mode
- No \`any\` types
- Named exports
- async/await over callbacks
`
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd)

  // Write spec.md if provided so it's available in every worktree
  if (specContent) {
    fs.writeFileSync(path.join(dir, 'spec.md'), specContent)
  }

  execSync('git add -A', { cwd: dir, encoding: 'utf-8', timeout: 10000 })
  execSync('git commit -m "Initial benchmark commit"', {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 10000,
  })
}

function runTestsInDir(cwd: string): { passed: number; failed: number } {
  const testCommands = ['npm test', 'npx vitest run', 'npx jest']
  for (const testCmd of testCommands) {
    try {
      const testOutput = execSync(
        `${testCmd} 2>&1 || true`,
        { cwd, encoding: 'utf-8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
      )
      const passMatch = testOutput.match(/(\d+)\s+pass(?:ed)?/i)
      const failMatch = testOutput.match(/(\d+)\s+fail(?:ed)?/i)
      const vitestTestMatch = testOutput.match(/Tests\s+(\d+)\s+passed/i)
      let passed = 0
      let failed = 0
      if (vitestTestMatch) {
        passed = parseInt(vitestTestMatch[1], 10)
      } else if (passMatch) {
        passed = parseInt(passMatch[1], 10)
      }
      if (failMatch) failed = parseInt(failMatch[1], 10)
      if (passed > 0 || failed > 0) return { passed, failed }
    } catch {
      continue
    }
  }
  return { passed: 0, failed: 0 }
}

// ============================================================================
// Claude Execution with Stream Capture
// ============================================================================

function spawnClaudeWithCapture(
  prompt: string,
  outputDir: string,
  model: string,
  maxTurns: number,
  dangerouslySkipPermissions: boolean,
  workspaceCwd?: string,
): Promise<RunMetrics> {
  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const cwd = workspaceCwd || process.cwd()

  const claudeArgs = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--max-turns', String(maxTurns),
  ]

  if (dangerouslySkipPermissions) {
    claudeArgs.push('--dangerously-skip-permissions')
  }

  claudeArgs.push('-p', prompt)

  const streamPath = path.join(outputDir, 'stream.jsonl')
  const streamFd = fs.openSync(streamPath, 'w')

  console.log(`${colors.gray}Running: ${claudeCommand} ${claudeArgs.slice(0, 6).join(' ')}...${colors.reset}`)
  console.log(`${colors.gray}Workspace: ${cwd}${colors.reset}`)
  console.log(`${colors.gray}Stream output: ${streamPath}${colors.reset}\n`)

  const claude = spawn(claudeCommand, claudeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    cwd,
  })

  const metrics: RunMetrics = {
    sessionId: null,
    totalCostUsd: 0,
    durationMs: 0,
    numTurns: 0,
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    exitCode: 1,
  }

  const startTime = Date.now()

  let turnCount = 0

  function displayStreamEvent(msg: StreamMessage): void {
    if (msg.type === 'system') {
      if (msg.session_id) {
        console.log(`  ${colors.gray}session: ${msg.session_id}${colors.reset}`)
      }
      return
    }

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'thinking' && block.text) {
          // Show first line of thinking, truncated
          const firstLine = block.text.split('\n')[0].slice(0, 120)
          console.log(`  ${colors.gray}[think] ${firstLine}${block.text.length > 120 ? '...' : ''}${colors.reset}`)
        }

        if (block.type === 'text' && block.text) {
          // Show Claude's text output (what it says to the user)
          const lines = block.text.split('\n').filter((l: string) => l.trim())
          for (const l of lines.slice(0, 3)) {
            console.log(`  ${colors.cyan}[text]${colors.reset} ${l.slice(0, 150)}${l.length > 150 ? '...' : ''}`)
          }
          if (lines.length > 3) {
            console.log(`  ${colors.gray}  ... +${lines.length - 3} more lines${colors.reset}`)
          }
        }

        if (block.type === 'tool_use' && block.name) {
          const input = block.input as Record<string, unknown> | undefined
          let detail = ''

          // Show relevant details for common tools
          if (block.name === 'Write' || block.name === 'Edit' || block.name === 'Read') {
            const fp = input?.file_path || input?.path || ''
            detail = ` ${fp}`
          } else if (block.name === 'Bash') {
            const cmd = String(input?.command || '').slice(0, 100)
            detail = ` ${cmd}`
          } else if (block.name === 'Task') {
            const desc = input?.description || ''
            const agentType = input?.subagent_type || ''
            detail = ` [${agentType}] ${desc}`
          } else if (block.name === 'Grep' || block.name === 'Glob') {
            const pat = input?.pattern || ''
            detail = ` ${pat}`
          }

          console.log(`  ${colors.magenta}[tool]${colors.reset} ${colors.bold}${block.name}${colors.reset}${detail}`)
        }
      }
    }

    if (msg.type === 'user' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          // Extract text from tool result (may be in text or content field)
          let text = block.text || ''
          if (!text && typeof block.content === 'string') text = block.content
          if (!text && Array.isArray(block.content)) {
            text = block.content.map(c => c.text || '').join('\n')
          }
          if (text && (text.includes('Error') || text.includes('FAILED') || text.includes('error'))) {
            const errLine = text.split('\n').find((l: string) => /error|fail/i.test(l)) || text.slice(0, 120)
            console.log(`  ${colors.red}[error]${colors.reset} ${errLine.slice(0, 150)}`)
          }
        }
      }
    }

    if (msg.type === 'result') {
      const r = msg.result
      if (r) {
        console.log(`  ${colors.green}[done]${colors.reset} turns=${r.num_turns} cost=$${(r.cost_usd || 0).toFixed(3)} duration=${((r.duration_ms || 0) / 1000).toFixed(0)}s`)
      }
    }

    // Track turns (each assistant message = a turn)
    if (msg.type === 'assistant') {
      turnCount++
      if (msg.usage) {
        const tokensK = ((msg.usage.input_tokens + msg.usage.output_tokens) / 1000).toFixed(0)
        if (turnCount % 5 === 0) {
          console.log(`  ${colors.gray}--- turn ${turnCount}, ~${tokensK}k tokens ---${colors.reset}`)
        }
      }
    }
  }

  function processLine(line: string): void {
    fs.writeSync(streamFd, line + '\n')
    const msg = parseStreamMessage(line)
    if (!msg) return

    // Display stream event in real-time
    displayStreamEvent(msg)

    const sid = extractSessionId(msg)
    if (sid) metrics.sessionId = sid
    const usage = extractTokenUsage(msg)
    if (usage) {
      metrics.tokens.inputTokens += usage.inputTokens
      metrics.tokens.outputTokens += usage.outputTokens
      metrics.tokens.cacheReadTokens += usage.cacheReadTokens
      metrics.tokens.cacheCreationTokens += usage.cacheCreationTokens
    }
    const result = extractResult(msg)
    if (result) {
      if (result.costUsd !== undefined) metrics.totalCostUsd = result.costUsd
      if (result.durationMs !== undefined) metrics.durationMs = result.durationMs
      if (result.numTurns !== undefined) metrics.numTurns = result.numTurns
    }
  }

  let stdoutBuffer = ''
  let stderrBuffer = ''
  let allStderr = ''

  if (claude.stdout) {
    claude.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) {
        processLine(line)
      }
    })
  }

  if (claude.stderr) {
    claude.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      allStderr += text
      stderrBuffer += text
      const lines = stderrBuffer.split('\n')
      stderrBuffer = lines.pop() || ''
      for (const line of lines) {
        fs.writeSync(streamFd, line + '\n')
      }
    })
  }

  return new Promise<RunMetrics>((resolve) => {
    claude.on('close', (code) => {
      if (stdoutBuffer) processLine(stdoutBuffer)
      if (stderrBuffer) fs.writeSync(streamFd, stderrBuffer + '\n')
      fs.closeSync(streamFd)
      metrics.exitCode = code ?? 1
      if (metrics.durationMs === 0) {
        metrics.durationMs = Date.now() - startTime
      }
      if (metrics.totalCostUsd === 0 && metrics.tokens.inputTokens > 0) {
        metrics.totalCostUsd = estimateCost(metrics.tokens, model)
      }
      // Log diagnostic info when Claude exits quickly with no work done
      if (metrics.numTurns === 0 && metrics.tokens.inputTokens === 0) {
        console.error(`${colors.yellow}Warning: Claude exited with no output (code=${code}, duration=${metrics.durationMs}ms)${colors.reset}`)
        if (allStderr) {
          console.error(`${colors.gray}stderr: ${allStderr.slice(0, 500)}${colors.reset}`)
        }
      }
      resolve(metrics)
    })

    claude.on('error', (err) => {
      console.error(`${colors.red}Failed to start Claude:${colors.reset} ${err.message}`)
      console.log(`${colors.gray}Make sure Claude Code is installed and in your PATH${colors.reset}`)
      fs.closeSync(streamFd)
      metrics.durationMs = Date.now() - startTime
      resolve(metrics)
    })
  })
}

// ============================================================================
// Pipeline: Multi-Cycle Benchmark with Worktrees
// ============================================================================

async function runBenchmarkPipeline(
  specFile: string,
  specContent: string,
  outputDir: string,
  opts: {
    model: string
    maxCycles: number
    maxCostUsd: number
    maxConcurrent: number
    dangerouslySkipPermissions: boolean
    jsonOutput: boolean
    maxTurnsPerTask: number
  },
): Promise<BenchmarkPipelineResult> {
  const parsedSpec = parseSpec(specContent)
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-bench-'))

  if (!opts.jsonOutput) {
    console.log(`${colors.blue}Parsed spec: ${parsedSpec.title}${colors.reset}`)
    console.log(`  Cycles: ${parsedSpec.cycles.length}`)
    console.log(`  Total acceptance criteria: ${parsedSpec.totalAcceptanceCriteria}`)
    console.log(`  Workspace: ${colors.gray}${workspaceDir}${colors.reset}\n`)
  }

  // 1. Initialize git repo in workspace with CLAUDE.md and spec
  initGitRepo(workspaceDir, specContent)

  // Benchmark pipeline always requires --dangerously-skip-permissions because
  // Claude is spawned with stdin='ignore' (no interactive approval possible).
  // Without this flag, Claude exits immediately on first tool call permission prompt.
  if (!opts.dangerouslySkipPermissions) {
    if (!opts.jsonOutput) {
      console.log(`${colors.yellow}Note: Enabling --dangerously-skip-permissions for benchmark pipeline (stdin not connected)${colors.reset}`)
    }
    opts.dangerouslySkipPermissions = true
  }

  const pipelineResult: BenchmarkPipelineResult = {
    config: {
      specFile,
      workspaceDir,
      model: opts.model,
      maxConcurrent: opts.maxConcurrent,
      maxCostUsd: opts.maxCostUsd,
      dangerouslySkipPermissions: opts.dangerouslySkipPermissions,
      maxTurnsPerTask: opts.maxTurnsPerTask,
    },
    spec: parsedSpec,
    cycles: [],
    totalDurationMs: 0,
    totalCostUsd: 0,
    worktreesCreated: 0,
    worktreesMerged: 0,
    parallelTasksRun: 0,
    reviewsRun: 0,
    outcome: 'failed',
  }

  const pipelineStart = Date.now()
  let totalCost = 0

  // 2. For each cycle
  for (const cycle of parsedSpec.cycles) {
    if (cycle.cycleNumber > opts.maxCycles) break
    if (totalCost >= opts.maxCostUsd) break

    if (!opts.jsonOutput) {
      console.log(`\n${colors.bold}${colors.blue}=== Cycle ${cycle.cycleNumber}: ${cycle.title} ===${colors.reset}`)
      console.log(`  Subtasks: ${cycle.subtasks.length}`)
    }

    const cycleStart = Date.now()
    const cycleResult: BenchmarkCycleResult = {
      cycleNumber: cycle.cycleNumber,
      title: cycle.title,
      tasks: [],
      durationMs: 0,
      costUsd: 0,
      specCompletionPercent: 0,
    }

    // 3. Group subtasks by parallelGroup
    const parallelGroups = new Map<string, ParsedSubtask[]>()
    for (const subtask of cycle.subtasks) {
      const group = parallelGroups.get(subtask.parallelGroup) || []
      group.push(subtask)
      parallelGroups.set(subtask.parallelGroup, group)
    }

    // Determine if we can run tasks in parallel
    const allSubtasks = cycle.subtasks
    const canParallelize = allSubtasks.length > 1

    if (canParallelize) {
      // Run subtasks in parallel with max concurrency
      if (!opts.jsonOutput) {
        console.log(`  ${colors.cyan}Running ${allSubtasks.length} tasks in parallel (max ${opts.maxConcurrent})${colors.reset}`)
      }

      // Create lazy factory functions — each one starts the task only when invoked
      const taskFactories = allSubtasks.map(subtask =>
        () => runSubtaskInWorktree(subtask, cycle, workspaceDir, outputDir, opts, specContent)
      )

      // Use allSettled with concurrency limit
      const results = await promiseAllSettledWithConcurrency(
        taskFactories,
        opts.maxConcurrent,
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          cycleResult.tasks.push(result.value)
          pipelineResult.worktreesCreated++
          if (result.value.merged) pipelineResult.worktreesMerged++
          if (result.value.reviewDecision) pipelineResult.reviewsRun++
        }
      }

      pipelineResult.parallelTasksRun += allSubtasks.length
    } else {
      // Single task: run sequentially
      for (const subtask of allSubtasks) {
        const taskResult = await runSubtaskInWorktree(subtask, cycle, workspaceDir, outputDir, opts, specContent)
        cycleResult.tasks.push(taskResult)
        pipelineResult.worktreesCreated++
        if (taskResult.merged) pipelineResult.worktreesMerged++
        if (taskResult.reviewDecision) pipelineResult.reviewsRun++
      }
    }

    // Calculate cycle cost and duration
    cycleResult.durationMs = Date.now() - cycleStart
    cycleResult.costUsd = cycleResult.tasks.reduce((sum, t) => sum + t.costUsd, 0)
    totalCost += cycleResult.costUsd

    // Run tests on merged main after cycle
    const testResults = runTestsInDir(workspaceDir)
    if (!opts.jsonOutput) {
      console.log(`  Tests: ${colors.green}${testResults.passed} passed${colors.reset}, ${colors.red}${testResults.failed} failed${colors.reset}`)
    }

    pipelineResult.cycles.push(cycleResult)

    if (!opts.jsonOutput) {
      console.log(`  Cycle cost: $${cycleResult.costUsd.toFixed(4)}`)
      console.log(`  Cycle duration: ${(cycleResult.durationMs / 1000).toFixed(1)}s`)
    }
  }

  pipelineResult.totalDurationMs = Date.now() - pipelineStart
  pipelineResult.totalCostUsd = totalCost
  pipelineResult.outcome = pipelineResult.worktreesMerged > 0 ? 'success' : 'partial'

  // Write pipeline results to output
  writePipelineOutput(outputDir, pipelineResult, specFile, specContent, workspaceDir)

  return pipelineResult
}

/**
 * Run a single subtask in its own worktree.
 */
async function runSubtaskInWorktree(
  subtask: ParsedSubtask,
  cycle: ParsedCycle,
  workspaceDir: string,
  outputDir: string,
  opts: {
    model: string
    dangerouslySkipPermissions: boolean
    maxTurnsPerTask: number
  },
  specContent?: string,
): Promise<BenchmarkTaskResult> {
  const taskResult: BenchmarkTaskResult = {
    taskId: subtask.id,
    subtask,
    cycleNumber: cycle.cycleNumber,
    worktreePath: '',
    branchName: '',
    exitCode: 1,
    durationMs: 0,
    costUsd: 0,
    tokens: { input: 0, output: 0, cached: 0 },
    reviewDecision: null,
    merged: false,
    testsPassed: 0,
    testsFailed: 0,
  }

  try {
    // Create worktree
    const wt = await createTaskWorktree(workspaceDir, subtask.id)
    taskResult.worktreePath = wt.worktreePath
    taskResult.branchName = wt.branchName

    // Create task output dir
    const taskOutputDir = path.join(outputDir, 'tasks', subtask.id)
    fs.mkdirSync(taskOutputDir, { recursive: true })

    // Build prompt for this subtask
    const prompt = buildSubtaskPrompt(subtask, cycle, specContent, wt.worktreePath)

    // Spawn Claude
    const metrics = await spawnClaudeWithCapture(
      prompt,
      taskOutputDir,
      opts.model,
      opts.maxTurnsPerTask,
      opts.dangerouslySkipPermissions,
      wt.worktreePath,
    )

    taskResult.exitCode = metrics.exitCode
    taskResult.durationMs = metrics.durationMs
    taskResult.costUsd = metrics.totalCostUsd
    taskResult.tokens = {
      input: metrics.tokens.inputTokens,
      output: metrics.tokens.outputTokens,
      cached: metrics.tokens.cacheReadTokens,
    }

    // Run tests in worktree
    const tests = runTestsInDir(wt.worktreePath)
    taskResult.testsPassed = tests.passed
    taskResult.testsFailed = tests.failed

    // Run review agent
    const diff = await getWorktreeDiff(wt.worktreePath)
    const reviewResult = await runReviewAgent(
      wt.worktreePath,
      `${cycle.title}: ${subtask.title}`,
      diff,
      tests.failed === 0 && tests.passed > 0,
      opts.model,
    )

    if (reviewResult.success && reviewResult.decision) {
      taskResult.reviewDecision = reviewResult.decision
      taskResult.costUsd += reviewResult.costUsd

      // Write review decision
      fs.writeFileSync(
        path.join(taskOutputDir, 'review-decision.json'),
        JSON.stringify(reviewResult.decision, null, 2),
      )
    }

    // Merge if approved
    if (taskResult.reviewDecision?.decision === 'approve' || metrics.exitCode === 0) {
      const merged = await mergeWorktree(workspaceDir, wt.branchName)
      taskResult.merged = merged
    }

    // Write task metrics
    fs.writeFileSync(path.join(taskOutputDir, 'metrics.json'), JSON.stringify({
      taskId: subtask.id,
      cycleNumber: cycle.cycleNumber,
      exitCode: metrics.exitCode,
      durationMs: metrics.durationMs,
      costUsd: taskResult.costUsd,
      tokens: taskResult.tokens,
      testsPassed: taskResult.testsPassed,
      testsFailed: taskResult.testsFailed,
      reviewDecision: taskResult.reviewDecision?.decision || null,
      merged: taskResult.merged,
    }, null, 2))

    // Post-process stream to write tools.jsonl, errors.json, git-diff.patch
    // (PRD requires these per-task files for the scoring script)
    const streamData = postProcessStreamData(taskOutputDir)
    if (streamData.toolCalls.length > 0) {
      fs.writeFileSync(
        path.join(taskOutputDir, 'tools.jsonl'),
        streamData.toolCalls.map(t => JSON.stringify(t)).join('\n') + '\n',
      )
    }
    fs.writeFileSync(path.join(taskOutputDir, 'errors.json'), JSON.stringify(streamData.errors, null, 2))

    if (diff.length > 0) {
      fs.writeFileSync(path.join(taskOutputDir, 'git-diff.patch'), diff)
    }

  } catch (error) {
    console.error(`${colors.red}Task ${subtask.id} failed: ${(error as Error).message}${colors.reset}`)
  }

  return taskResult
}

/**
 * List files in a directory (non-recursive, shallow) for workspace context.
 */
function listWorkspaceFiles(dir: string): string {
  try {
    const output = execSync(
      'find . -not -path "./.git/*" -not -path "./.git" -not -name "." -type f | head -50',
      { cwd: dir, encoding: 'utf-8', timeout: 5000 },
    )
    return output.trim()
  } catch {
    return '(empty workspace)'
  }
}

/**
 * Build prompt for a subtask.
 */
function buildSubtaskPrompt(
  subtask: ParsedSubtask,
  cycle: ParsedCycle,
  specContent?: string,
  worktreePath?: string,
): string {
  const criteriaList = subtask.acceptanceCriteria.length > 0
    ? subtask.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n')
    : '(No specific criteria)'

  // Get current workspace state so Claude knows what already exists
  const existingFiles = worktreePath ? listWorkspaceFiles(worktreePath) : '(unknown)'

  // Extract spec overview (tech stack, structure) — everything before the cycle breakdown
  let specContext = ''
  if (specContent) {
    // Get the overview/tech stack section (everything before first ### cycle header)
    const firstCycleIdx = specContent.search(/^###\s+\d+\./m)
    if (firstCycleIdx > 0) {
      specContext = specContent.slice(0, firstCycleIdx).trim()
    } else {
      specContext = specContent.slice(0, 2000).trim()
    }
  }

  let prompt = ''

  // Include the full spec context so Claude understands the project
  if (specContext) {
    prompt += `## Full Project Specification (Overview)
${specContext}

---

`
  }

  prompt += `## Your Current Task

You are implementing **Cycle ${cycle.cycleNumber}: ${cycle.title}**
Specifically, your task is: **${subtask.title}**

### Task Description
${subtask.description}

### Acceptance Criteria
${criteriaList}

### Existing Files in Workspace
\`\`\`
${existingFiles}
\`\`\`

## Workflow
1. ${cycle.cycleNumber === 1 ? 'Initialize the project: create package.json, install dependencies, set up TypeScript config' : 'Review existing code and understand current state'}
2. Implement the feature incrementally, committing after each logical unit
3. Write tests covering the acceptance criteria
4. Ensure the build succeeds (\`npm run build\` or \`npx tsc --noEmit\`)
5. Final commit with all changes

## Important
- You are working in a fresh workspace. ${cycle.cycleNumber === 1 ? 'You MUST set up the project from scratch (package.json, tsconfig.json, etc.) before implementing features.' : 'Previous cycles may have set up the project structure already.'}
- Commit your work frequently so it can be merged.
- TypeScript preferred; no \`any\` types
- Clean file organization matching the project structure from the spec
- Small focused functions, meaningful names
- Handle edge cases (empty states, invalid input, loading states)

Start implementing now.`

  return prompt
}

/**
 * Run an array of async factories with concurrency limit.
 */
async function promiseAllSettledWithConcurrency<T>(
  factories: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(factories.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < factories.length) {
      const index = nextIndex++
      try {
        const value = await factories[index]()
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, factories.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Aggregate tool errors, retries, loops, and compactions from per-task stream data.
 */
function aggregateIssuesFromTasks(
  outputDir: string,
  result: BenchmarkPipelineResult,
): { loopsDetected: number; compactions: number; toolErrors: number; toolRetries: number; permissionTimeouts: number; stuckDetections: number } {
  let toolErrors = 0
  let toolRetries = 0
  let loopsDetected = 0
  let compactions = 0

  for (const cycle of result.cycles) {
    for (const task of cycle.tasks) {
      const taskDir = path.join(outputDir, 'tasks', task.taskId)
      const streamData = postProcessStreamData(taskDir)
      toolErrors += streamData.toolErrors
      toolRetries += streamData.toolRetries
      loopsDetected += streamData.loopsDetected
      compactions += streamData.compactions
    }
  }

  return { loopsDetected, compactions, toolErrors, toolRetries, permissionTimeouts: 0, stuckDetections: 0 }
}

/**
 * Write the full pipeline output to disk.
 */
function writePipelineOutput(
  outputDir: string,
  result: BenchmarkPipelineResult,
  specFile: string,
  specContent: string,
  workspaceDir: string,
): void {
  // Write spec.md
  fs.writeFileSync(path.join(outputDir, 'spec.md'), specContent)

  // Write config.json
  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(result.config, null, 2))

  // Write pipeline-result.json
  fs.writeFileSync(path.join(outputDir, 'pipeline-result.json'), JSON.stringify(result, null, 2))

  // Count spec items
  let specTotalItems = 0
  let specPassedItems = 0
  const checkboxes = specContent.match(/- \[[ x]\]/g) || []
  specTotalItems = checkboxes.length

  // Estimate spec completion from test results
  let totalTestsPassed = 0
  let totalTestsFailed = 0
  for (const cycle of result.cycles) {
    for (const task of cycle.tasks) {
      totalTestsPassed += task.testsPassed
      totalTestsFailed += task.testsFailed
    }
  }
  if (specTotalItems > 0 && totalTestsPassed > 0) {
    const testPassRate = totalTestsPassed / Math.max(totalTestsPassed + totalTestsFailed, 1)
    specPassedItems = Math.round(specTotalItems * testPassRate)
  }

  // Git data from workspace
  const commitCount = countGitCommits(workspaceDir)
  const gitLog = captureGitLog(workspaceDir)
  const gitDiff = captureGitDiff(workspaceDir)

  if (gitDiff.length > 0) {
    fs.writeFileSync(path.join(outputDir, 'git-diff.patch'), gitDiff)
  }
  if (gitLog.length > 0) {
    fs.writeFileSync(path.join(outputDir, 'git-log.txt'), gitLog)
  }

  // Count total reviews
  let reviewsApproved = 0
  for (const cycle of result.cycles) {
    for (const task of cycle.tasks) {
      if (task.reviewDecision?.decision === 'approve') reviewsApproved++
    }
  }

  // Total tokens
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCachedTokens = 0
  for (const cycle of result.cycles) {
    for (const task of cycle.tasks) {
      totalInputTokens += task.tokens.input
      totalOutputTokens += task.tokens.output
      totalCachedTokens += task.tokens.cached
    }
  }

  // Build summary.json matching BenchmarkSummary format
  const summary: Record<string, unknown> = {
    benchmarkId: `bench-${Date.now().toString(36)}`,
    timestamp: Date.now() - result.totalDurationMs,
    nervVersion: '1.0.0',
    specFile,
    worktreePath: workspaceDir,
    model: result.config.model,
    config: {
      reviewMode: 'normal',
      maxCycles: result.config.maxCostUsd,
      auditFrequency: 1,
      model: result.config.model,
      specFile,
    },
    outcome: result.outcome,
    duration: {
      totalMs: result.totalDurationMs,
      perCycle: result.cycles.map(c => c.durationMs),
      perTask: Object.fromEntries(
        result.cycles.flatMap(c => c.tasks.map(t => [t.taskId, t.durationMs]))
      ),
    },
    tokens: {
      total: totalInputTokens + totalOutputTokens,
      input: totalInputTokens,
      output: totalOutputTokens,
      cached: totalCachedTokens,
      perTask: Object.fromEntries(
        result.cycles.flatMap(c => c.tasks.map(t => [t.taskId, t.tokens.input + t.tokens.output]))
      ),
      perCycle: result.cycles.map(c =>
        c.tasks.reduce((sum, t) => sum + t.tokens.input + t.tokens.output, 0)
      ),
    },
    cost: {
      totalUsd: result.totalCostUsd,
      perTask: Object.fromEntries(
        result.cycles.flatMap(c => c.tasks.map(t => [t.taskId, t.costUsd]))
      ),
      perCycle: result.cycles.map(c => c.costUsd),
    },
    tasks: {
      total: result.cycles.reduce((sum, c) => sum + c.tasks.length, 0),
      completed: result.cycles.reduce((sum, c) => sum + c.tasks.filter(t => t.merged).length, 0),
      failed: result.cycles.reduce((sum, c) => sum + c.tasks.filter(t => !t.merged).length, 0),
      byStatus: {},
    },
    cycles: {
      total: result.cycles.length,
      auditsRun: 0,
      auditsPassed: 0,
    },
    workflow: {
      worktreesCreated: result.worktreesCreated,
      worktreesMerged: result.worktreesMerged,
      worktreesDiscarded: result.worktreesCreated - result.worktreesMerged,
      branchesCreated: result.worktreesCreated,
      parallelTasksRun: result.parallelTasksRun,
      reviewsRun: result.reviewsRun,
      reviewsApproved,
      commitsCreated: commitCount,
      gitLog,
    },
    issues: aggregateIssuesFromTasks(outputDir, result),
    spec: {
      totalItems: specTotalItems,
      itemsPassed: specPassedItems,
      itemsFailed: specTotalItems - specPassedItems,
      completionPercent: specTotalItems > 0 ? Math.round((specPassedItems / specTotalItems) * 100) : 0,
    },
    tests: {
      total: totalTestsPassed + totalTestsFailed,
      passed: totalTestsPassed,
      failed: totalTestsFailed,
      skipped: 0,
    },
    scores: null,
  }

  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))

  // Also compute and write NERV ops score
  try {
    const nervOpsScore = scoreNervOps(summary as unknown as BenchmarkSummary)
    fs.writeFileSync(path.join(outputDir, 'nerv-ops-score.json'), JSON.stringify({
      nervOps: nervOpsScore,
      nervOpsScore10: nervOpsScoreTo10(nervOpsScore.score),
    }, null, 2))
  } catch {
    // Non-critical
  }

  // Write per-cycle output files (PRD Section 4940-4948)
  for (const cycle of result.cycles) {
    const cycleId = `cycle-${String(cycle.cycleNumber).padStart(3, '0')}`
    const cycleDir = path.join(outputDir, 'cycles', cycleId)
    fs.mkdirSync(cycleDir, { recursive: true })

    // audit-report.json — cycle-level metrics summary
    const cycleTestsPassed = cycle.tasks.reduce((s, t) => s + t.testsPassed, 0)
    const cycleTestsFailed = cycle.tasks.reduce((s, t) => s + t.testsFailed, 0)
    const cycleMerged = cycle.tasks.filter(t => t.merged).length
    fs.writeFileSync(path.join(cycleDir, 'audit-report.json'), JSON.stringify({
      cycleNumber: cycle.cycleNumber,
      title: cycle.title,
      tasksTotal: cycle.tasks.length,
      tasksMerged: cycleMerged,
      tasksFailed: cycle.tasks.length - cycleMerged,
      testsPassed: cycleTestsPassed,
      testsFailed: cycleTestsFailed,
      durationMs: cycle.durationMs,
      costUsd: cycle.costUsd,
    }, null, 2))

    // review-report.json — all review decisions for this cycle
    const reviews = cycle.tasks
      .filter(t => t.reviewDecision)
      .map(t => ({
        taskId: t.taskId,
        decision: t.reviewDecision!.decision,
        justification: t.reviewDecision!.justification,
        concerns: t.reviewDecision!.concerns,
        suggestions: t.reviewDecision!.suggestions,
        confidence: t.reviewDecision!.confidence,
      }))
    fs.writeFileSync(path.join(cycleDir, 'review-report.json'), JSON.stringify({
      cycleNumber: cycle.cycleNumber,
      reviewsRun: reviews.length,
      reviewsApproved: reviews.filter(r => r.decision === 'approve').length,
      reviews,
    }, null, 2))

    // learnings.json — placeholder for cycle learnings
    fs.writeFileSync(path.join(cycleDir, 'learnings.json'), JSON.stringify({
      cycleNumber: cycle.cycleNumber,
      learnings: [],
    }, null, 2))
  }

  // Write timeline
  const timelineEntries: TimelineEntry[] = [
    { timestamp: Date.now() - result.totalDurationMs, event: 'benchmark_start' },
  ]
  for (const cycle of result.cycles) {
    timelineEntries.push({ timestamp: Date.now() - cycle.durationMs, event: 'cycle_start', cycle: cycle.cycleNumber })
    for (const task of cycle.tasks) {
      timelineEntries.push({
        timestamp: Date.now() - task.durationMs,
        event: 'task_complete',
        taskId: task.taskId,
        merged: task.merged,
        review: task.reviewDecision?.decision || null,
      })
    }
    timelineEntries.push({ timestamp: Date.now(), event: 'cycle_complete', cycle: cycle.cycleNumber })
  }
  timelineEntries.push({ timestamp: Date.now(), event: 'benchmark_complete' })
  fs.writeFileSync(
    path.join(outputDir, 'timeline.jsonl'),
    timelineEntries.map(e => JSON.stringify(e)).join('\n') + '\n',
  )

  // Permissions dir (empty)
  const permDir = path.join(outputDir, 'permissions')
  fs.mkdirSync(permDir, { recursive: true })
  fs.writeFileSync(path.join(permDir, 'requests.jsonl'), '')
}

// ============================================================================
// Write Rich Benchmark Output (for legacy single-session mode)
// ============================================================================

function writeRichBenchmarkOutput(
  outputDir: string,
  options: {
    specFile?: string
    specContent?: string
    configId: string
    resultId: string
    model: string
    maxCycles: number
    maxCostUsd: number
    metrics: RunMetrics
    streamData: ReturnType<typeof postProcessStreamData>
    cwd?: string
  }
): void {
  if (options.specContent) {
    fs.writeFileSync(path.join(outputDir, 'spec.md'), options.specContent)
  }

  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
    reviewMode: 'normal',
    maxCycles: options.maxCycles,
    auditFrequency: 1,
    model: options.model,
    specFile: options.specFile || null,
  }, null, 2))

  const timelinePath = path.join(outputDir, 'timeline.jsonl')
  const startEntry: TimelineEntry = { timestamp: Date.now() - options.metrics.durationMs, event: 'benchmark_start' }
  const endEntry: TimelineEntry = { timestamp: Date.now(), event: 'benchmark_complete', exitCode: options.metrics.exitCode }
  const allTimeline = [startEntry, ...options.streamData.timeline, endEntry]
  fs.writeFileSync(timelinePath, allTimeline.map(e => JSON.stringify(e)).join('\n') + '\n')

  const taskId = options.resultId.slice(0, 16)
  const taskDir = path.join(outputDir, 'tasks', taskId)
  fs.mkdirSync(taskDir, { recursive: true })

  fs.writeFileSync(path.join(taskDir, 'metrics.json'), JSON.stringify({
    taskId,
    startTime: Date.now() - options.metrics.durationMs,
    endTime: Date.now(),
    inputTokens: options.metrics.tokens.inputTokens,
    outputTokens: options.metrics.tokens.outputTokens,
    cachedTokens: options.metrics.tokens.cacheReadTokens,
    costUsd: options.metrics.totalCostUsd,
    numTurns: options.metrics.numTurns,
    toolCalls: options.streamData.toolCalls.length,
    toolErrors: options.streamData.toolErrors,
    toolRetries: options.streamData.toolRetries,
    status: options.metrics.exitCode === 0 ? 'done' : 'failed',
  }, null, 2))

  if (options.streamData.toolCalls.length > 0) {
    fs.writeFileSync(
      path.join(taskDir, 'tools.jsonl'),
      options.streamData.toolCalls.map(t => JSON.stringify(t)).join('\n') + '\n'
    )
  }

  fs.writeFileSync(path.join(taskDir, 'errors.json'), JSON.stringify(options.streamData.errors, null, 2))

  const rootStream = path.join(outputDir, 'stream.jsonl')
  const taskStream = path.join(taskDir, 'stream.jsonl')
  if (fs.existsSync(rootStream) && !fs.existsSync(taskStream)) {
    try {
      fs.copyFileSync(rootStream, taskStream)
    } catch {
      // Copy may fail on some platforms
    }
  }

  if (options.cwd) {
    const diff = captureGitDiff(options.cwd)
    if (diff.length > 0) {
      fs.writeFileSync(path.join(taskDir, 'git-diff.patch'), diff)
      fs.writeFileSync(path.join(outputDir, 'git-diff.patch'), diff)
    }
    const gitLogForFile = captureGitLog(options.cwd)
    if (gitLogForFile.length > 0) {
      fs.writeFileSync(path.join(outputDir, 'git-log.txt'), gitLogForFile)
    }
  }

  const cycleId = `cycle-${options.configId.slice(0, 12)}`
  const cycleDir = path.join(outputDir, 'cycles', cycleId)
  fs.mkdirSync(cycleDir, { recursive: true })
  fs.writeFileSync(path.join(cycleDir, 'learnings.json'), JSON.stringify({ learnings: [] }, null, 2))

  const permDir = path.join(outputDir, 'permissions')
  fs.mkdirSync(permDir, { recursive: true })
  if (!fs.existsSync(path.join(permDir, 'requests.jsonl'))) {
    fs.writeFileSync(path.join(permDir, 'requests.jsonl'), '')
  }

  const commitCount = options.cwd ? countGitCommits(options.cwd) : 0
  const gitLog = options.cwd ? captureGitLog(options.cwd) : ''

  let testsPassed = 0
  let testsFailed = 0
  if (options.cwd) {
    const testResults = runTestsInDir(options.cwd)
    testsPassed = testResults.passed
    testsFailed = testResults.failed
  }

  let specTotalItems = 0
  let specPassedItems = 0
  if (options.specContent) {
    const checkboxes = options.specContent.match(/- \[[ x]\]/g) || []
    specTotalItems = checkboxes.length
    const checkedItems = (options.specContent.match(/- \[x\]/gi) || []).length
    if (checkedItems === 0 && specTotalItems > 0 && testsPassed > 0) {
      const testPassRate = testsPassed / Math.max(testsPassed + testsFailed, 1)
      specPassedItems = Math.round(specTotalItems * testPassRate)
    } else {
      specPassedItems = checkedItems
    }
  }

  const richSummary = {
    benchmarkId: `bench-${options.resultId.slice(0, 14)}`,
    timestamp: Date.now() - options.metrics.durationMs,
    nervVersion: '1.0.0',
    specFile: options.specFile || null,
    worktreePath: options.cwd || null,
    model: options.model,
    config: {
      reviewMode: 'normal',
      maxCycles: options.maxCycles,
      auditFrequency: 1,
      model: options.model,
      specFile: options.specFile || null,
    },
    outcome: options.metrics.exitCode === 0 ? 'success' : 'failed',
    duration: {
      totalMs: options.metrics.durationMs,
      perCycle: [options.metrics.durationMs],
      perTask: { [taskId]: options.metrics.durationMs },
    },
    tokens: {
      total: options.metrics.tokens.inputTokens + options.metrics.tokens.outputTokens,
      input: options.metrics.tokens.inputTokens,
      output: options.metrics.tokens.outputTokens,
      cached: options.metrics.tokens.cacheReadTokens,
      perTask: { [taskId]: options.metrics.tokens.inputTokens + options.metrics.tokens.outputTokens },
      perCycle: [options.metrics.tokens.inputTokens + options.metrics.tokens.outputTokens],
    },
    cost: {
      totalUsd: options.metrics.totalCostUsd,
      perTask: { [taskId]: options.metrics.totalCostUsd },
      perCycle: [options.metrics.totalCostUsd],
    },
    tasks: {
      total: 1,
      completed: options.metrics.exitCode === 0 ? 1 : 0,
      failed: options.metrics.exitCode === 0 ? 0 : 1,
      byStatus: { [options.metrics.exitCode === 0 ? 'done' : 'failed']: 1 },
    },
    cycles: {
      total: 1,
      auditsRun: 0,
      auditsPassed: 0,
    },
    workflow: {
      worktreesCreated: 0,
      worktreesMerged: 0,
      worktreesDiscarded: 0,
      branchesCreated: 0,
      parallelTasksRun: 0,
      commitsCreated: commitCount,
      gitLog,
    },
    issues: {
      loopsDetected: options.streamData.loopsDetected,
      compactions: options.streamData.compactions,
      toolErrors: options.streamData.toolErrors,
      toolRetries: options.streamData.toolRetries,
      permissionTimeouts: 0,
      stuckDetections: 0,
    },
    spec: {
      totalItems: specTotalItems,
      itemsPassed: specPassedItems,
      itemsFailed: specTotalItems - specPassedItems,
      completionPercent: specTotalItems > 0 ? Math.round((specPassedItems / specTotalItems) * 100) : 0,
    },
    tests: {
      total: testsPassed + testsFailed,
      passed: testsPassed,
      failed: testsFailed,
      skipped: 0,
    },
    scores: null,
  }

  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(richSummary, null, 2))
}

// ============================================================================
// Handle Score/History/Compare Subcommands
// ============================================================================

function getHistoryPath(): string {
  return path.join(os.homedir(), '.nerv', 'benchmarks', 'history.jsonl')
}

function appendToHistory(entry: HistoryEntry): void {
  const nervDir = path.join(os.homedir(), '.nerv', 'benchmarks')
  fs.mkdirSync(nervDir, { recursive: true })
  fs.appendFileSync(getHistoryPath(), JSON.stringify(entry) + '\n')
}

function handleScoring(scoringDir: string, jsonOutput: boolean, gradeClaude: boolean): void {
  if (!fs.existsSync(scoringDir)) {
    console.error(`${colors.red}Error: Directory not found: ${scoringDir}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  if (gradeClaude) {
    handleClaudeGrading(scoringDir, jsonOutput)
    return
  }

  try {
    const scoreResult = scoreBenchmarkResults(scoringDir)

    if (jsonOutput) {
      console.log(JSON.stringify(scoreResult, null, 2))
      return
    }

    console.log(`\n${'='.repeat(50)}`)
    console.log(`  ${colors.bold}NERV Benchmark Score${colors.reset}`)
    console.log(`${'='.repeat(50)}\n`)

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const score = scoreResult.scores[key]
      const filled = Math.round(score)
      const bar = `${colors.green}${'█'.repeat(filled)}${colors.gray}${'░'.repeat(10 - filled)}${colors.reset}`
      console.log(`  ${cat.name.padEnd(24)} ${bar} ${score}/10`)
    }

    console.log()
    console.log(`${'-'.repeat(50)}`)

    const overall = scoreResult.scores.overall
    const overallFilled = Math.round(overall)
    const overallBar = `${colors.cyan}${'█'.repeat(overallFilled)}${colors.gray}${'░'.repeat(10 - overallFilled)}${colors.reset}`
    console.log(`  ${'Overall Score'.padEnd(24)} ${overallBar} ${overall}/10`)
    console.log(`  Status: ${scoreResult.passed ? `${colors.green}PASSED${colors.reset}` : `${colors.red}FAILED${colors.reset}`}`)
    console.log(`${'='.repeat(50)}\n`)

    const summaryPath = path.join(scoringDir, 'summary.json')
    fs.writeFileSync(summaryPath, JSON.stringify(scoreResult, null, 2))
    console.log(`${colors.gray}Summary saved: ${summaryPath}${colors.reset}`)

    appendToHistory({
      timestamp: scoreResult.timestamp,
      benchmarkDir: scoreResult.benchmarkDir,
      scores: scoreResult.scores,
      weightedTotal: scoreResult.weightedTotal,
      passed: scoreResult.passed,
    })
    console.log(`${colors.gray}History updated: ${getHistoryPath()}${colors.reset}`)
  } catch (err) {
    console.error(`${colors.red}Error scoring benchmark: ${err instanceof Error ? err.message : err}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.BENCHMARK_FAILED)
  }
}

function handleClaudeGrading(scoringDir: string, jsonOutput: boolean): void {
  const scriptPath = path.join(process.cwd(), 'scripts', 'score-benchmark.js')

  if (!fs.existsSync(scriptPath)) {
    console.error(`${colors.red}Error: Scoring script not found: ${scriptPath}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
  }

  const args = [scriptPath, scoringDir]
  if (jsonOutput) args.push('--json')

  const specFiles = ['spec.md', '../spec.md'].map(f => path.join(scoringDir, f))
  for (const specFile of specFiles) {
    if (fs.existsSync(specFile)) {
      args.push('--spec', specFile)
      break
    }
  }

  console.log(`${colors.blue}Running Claude-based grading...${colors.reset}`)
  console.log(`${colors.gray}This calls Claude API to objectively evaluate benchmark results${colors.reset}\n`)

  const scorer = spawn('node', args, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  })

  scorer.on('close', (code) => {
    process.exit(code ?? 1)
  })

  scorer.on('error', (err) => {
    console.error(`${colors.red}Failed to run scoring script: ${err.message}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.BENCHMARK_FAILED)
  })
}

function handleHistory(jsonOutput: boolean): void {
  const historyPath = getHistoryPath()

  if (!fs.existsSync(historyPath)) {
    if (jsonOutput) {
      console.log(JSON.stringify([]))
    } else {
      console.log(`${colors.gray}No benchmark history found.${colors.reset}`)
      console.log(`${colors.gray}Run a benchmark and score it to populate history.${colors.reset}`)
    }
    return
  }

  const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n').filter(Boolean)
  const entries: HistoryEntry[] = []

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as HistoryEntry)
    } catch {
      // skip malformed lines
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(entries, null, 2))
    return
  }

  if (entries.length === 0) {
    console.log(`${colors.gray}No benchmark history entries found.${colors.reset}`)
    return
  }

  console.log(`\n${colors.bold}Benchmark History${colors.reset} (${entries.length} runs)\n`)
  console.log(`  ${'#'.padEnd(4)} ${'Date'.padEnd(20)} ${'Score'.padEnd(10)} ${'Status'.padEnd(10)} Directory`)
  console.log(`  ${'-'.repeat(80)}`)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const date = new Date(entry.timestamp).toLocaleString()
    const score = `${entry.weightedTotal}/10`
    const status = entry.passed
      ? `${colors.green}PASSED${colors.reset}`
      : `${colors.red}FAILED${colors.reset}`
    const dir = path.basename(entry.benchmarkDir)
    console.log(`  ${String(i + 1).padEnd(4)} ${date.padEnd(20)} ${score.padEnd(10)} ${status.padEnd(20)} ${colors.gray}${dir}${colors.reset}`)
  }
  console.log()
}

function handleCompare(compareArgs: string[], jsonOutput: boolean): void {
  if (compareArgs.length < 2) {
    console.error(`${colors.red}Error: Two benchmark directories required for comparison${colors.reset}`)
    console.log('Usage: nerv benchmark compare <dir1> <dir2>')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const [dir1, dir2] = compareArgs

  for (const dir of [dir1, dir2]) {
    if (!fs.existsSync(dir)) {
      console.error(`${colors.red}Error: Directory not found: ${dir}${colors.reset}`)
      process.exit(CLI_EXIT_CODES.GENERAL_ERROR)
    }
  }

  try {
    const score1 = scoreBenchmarkResults(dir1)
    const score2 = scoreBenchmarkResults(dir2)

    if (jsonOutput) {
      console.log(JSON.stringify({
        run1: { dir: dir1, scores: score1.scores, passed: score1.passed },
        run2: { dir: dir2, scores: score2.scores, passed: score2.passed },
        diff: Object.fromEntries(
          Object.keys(score1.scores).map(key => [
            key,
            Math.round(((score2.scores[key] || 0) - (score1.scores[key] || 0)) * 10) / 10,
          ])
        ),
      }, null, 2))
      return
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  ${colors.bold}NERV Benchmark Comparison${colors.reset}`)
    console.log(`${'='.repeat(60)}\n`)

    console.log(`  Run 1: ${colors.gray}${path.basename(dir1)}${colors.reset}`)
    console.log(`  Run 2: ${colors.gray}${path.basename(dir2)}${colors.reset}\n`)

    console.log(`  ${'Category'.padEnd(24)} ${'Run 1'.padEnd(8)} ${'Run 2'.padEnd(8)} ${'Diff'}`)
    console.log(`  ${'-'.repeat(52)}`)

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const s1 = score1.scores[key] || 0
      const s2 = score2.scores[key] || 0
      const diff = Math.round((s2 - s1) * 10) / 10
      const diffStr = diff > 0
        ? `${colors.green}+${diff}${colors.reset}`
        : diff < 0
          ? `${colors.red}${diff}${colors.reset}`
          : `${colors.gray}0${colors.reset}`
      console.log(`  ${cat.name.padEnd(24)} ${String(s1).padEnd(8)} ${String(s2).padEnd(8)} ${diffStr}`)
    }

    console.log(`  ${'-'.repeat(52)}`)
    const o1 = score1.scores.overall || 0
    const o2 = score2.scores.overall || 0
    const overallDiff = Math.round((o2 - o1) * 10) / 10
    const overallDiffStr = overallDiff > 0
      ? `${colors.green}+${overallDiff}${colors.reset}`
      : overallDiff < 0
        ? `${colors.red}${overallDiff}${colors.reset}`
        : `${colors.gray}0${colors.reset}`
    console.log(`  ${'Overall'.padEnd(24)} ${String(o1).padEnd(8)} ${String(o2).padEnd(8)} ${overallDiffStr}`)
    console.log(`${'='.repeat(60)}\n`)
  } catch (err) {
    console.error(`${colors.red}Error comparing benchmarks: ${err instanceof Error ? err.message : err}${colors.reset}`)
    process.exit(CLI_EXIT_CODES.BENCHMARK_FAILED)
  }
}

// ============================================================================
// Print Run Summary
// ============================================================================

function printRunSummary(metrics: RunMetrics): void {
  const durationSec = (metrics.durationMs / 1000).toFixed(1)
  const costStr = `$${metrics.totalCostUsd.toFixed(4)}`

  console.log(`\n${'-'.repeat(40)}`)
  console.log(`  ${colors.bold}Run Summary${colors.reset}`)
  console.log(`${'-'.repeat(40)}`)
  if (metrics.sessionId) {
    console.log(`  Session:  ${colors.cyan}${metrics.sessionId}${colors.reset}`)
  }
  console.log(`  Duration: ${durationSec}s`)
  console.log(`  Turns:    ${metrics.numTurns}`)
  console.log(`  Cost:     ${costStr}`)
  console.log(`  Tokens:   ${metrics.tokens.inputTokens.toLocaleString()} in / ${metrics.tokens.outputTokens.toLocaleString()} out`)
  if (metrics.tokens.cacheReadTokens > 0) {
    console.log(`  Cache:    ${metrics.tokens.cacheReadTokens.toLocaleString()} read / ${metrics.tokens.cacheCreationTokens.toLocaleString()} created`)
  }
  console.log(`${'-'.repeat(40)}`)
}

function printPipelineSummary(result: BenchmarkPipelineResult): void {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`  ${colors.bold}Benchmark Pipeline Summary${colors.reset}`)
  console.log(`${'='.repeat(50)}`)
  console.log(`  Cycles:           ${result.cycles.length}`)
  console.log(`  Worktrees:        ${result.worktreesCreated} created, ${result.worktreesMerged} merged`)
  console.log(`  Parallel Tasks:   ${result.parallelTasksRun}`)
  console.log(`  Reviews:          ${result.reviewsRun}`)
  console.log(`  Duration:         ${(result.totalDurationMs / 1000).toFixed(1)}s`)
  console.log(`  Cost:             $${result.totalCostUsd.toFixed(4)}`)
  console.log(`  Outcome:          ${result.outcome === 'success' ? `${colors.green}SUCCESS${colors.reset}` : result.outcome === 'partial' ? `${colors.yellow}PARTIAL${colors.reset}` : `${colors.red}FAILED${colors.reset}`}`)
  console.log(`${'='.repeat(50)}\n`)
}

// ============================================================================
// Main Benchmark Command
// ============================================================================

export async function benchmarkCommand(
  args: string[],
  db: DatabaseService,
  isYolo: boolean = false,
): Promise<void> {
  const parsed = parseBenchmarkArgs(args, isYolo)

  // Handle subcommands that don't need a project
  if (parsed.subcommand === 'history') {
    handleHistory(parsed.jsonOutput)
    return
  }

  if (parsed.subcommand === 'compare') {
    handleCompare(parsed.compareArgs, parsed.jsonOutput)
    return
  }

  if (parsed.subcommand === 'score' && parsed.scoringDir) {
    handleScoring(parsed.scoringDir, parsed.jsonOutput, parsed.gradeClaude)
    return
  }

  // --ui mode: launch Playwright UI benchmark
  if (parsed.uiMode) {
    const specArg = parsed.specFile || 'specs/todo-app.md'
    console.log(`${colors.bold}${colors.blue}NERV UI Benchmark${colors.reset}`)
    console.log(`  Spec: ${specArg}`)
    console.log(`  Running Playwright E2E UI benchmark...`)
    console.log()

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NERV_MOCK_CLAUDE: process.env.NERV_MOCK_CLAUDE || 'true',
    }
    if (process.env.NERV_RECORD_ALL) {
      env.NERV_RECORD_ALL = process.env.NERV_RECORD_ALL
    }

    const playwright = spawn('npx', ['playwright', 'test', 'test/e2e/ui-benchmark.spec.ts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env,
    })

    const exitCode = await new Promise<number>((resolve) => {
      playwright.on('close', (code) => resolve(code ?? 1))
      playwright.on('error', () => resolve(1))
    })

    process.exit(exitCode)
  }

  // Need a project for benchmark/yolo execution - auto-create if none exists
  let projects = db.getAllProjects()
  if (projects.length === 0) {
    console.log(`${colors.yellow}No project found. Auto-creating benchmark project...${colors.reset}`)
    db.createProject('Benchmark', 'Auto-created project for benchmark runs')
    projects = db.getAllProjects()
  }
  const currentProject = projects[0]

  const { specFile, maxCycles, maxCostUsd, jsonOutput, stopOnFailure, dangerouslySkipPermissions, maxConcurrent } = parsed

  // Create benchmark config and result in DB
  const config = db.createYoloBenchmarkConfig({
    projectId: currentProject.id,
    model: 'sonnet',
    maxCycles,
    maxCostUsd,
    maxDurationMs: 30 * 60 * 1000,
    autoApproveReview: isYolo,
    autoApproveDangerousTools: false,
    testCommand: 'npm test',
    specFile: specFile || null,
  })

  const result = db.createYoloBenchmarkResult(config.id)
  const outputDir = createOutputDir(result.id)

  if (jsonOutput) {
    console.log(JSON.stringify({
      configId: config.id,
      resultId: result.id,
      mode: isYolo ? 'yolo' : 'benchmark',
      outputDir,
      specFile,
      maxCycles,
      maxCostUsd,
      stopOnFailure,
    }, null, 2))
  } else {
    console.log(`${colors.bold}${colors.blue}NERV ${isYolo ? 'YOLO' : 'Benchmark'} Mode${colors.reset}`)
    console.log()
    console.log(`  Project:    ${colors.cyan}${currentProject.name}${colors.reset}`)
    if (specFile) {
      console.log(`  Spec:       ${colors.gray}${specFile}${colors.reset}`)
    }
    console.log(`  Max Cycles: ${maxCycles}`)
    console.log(`  Max Cost:   $${maxCostUsd.toFixed(2)}`)
    if (stopOnFailure) {
      console.log(`  Stop:       ${colors.yellow}on first failure${colors.reset}`)
    }
    console.log(`  Config:     ${colors.cyan}${config.id.slice(0, 8)}${colors.reset}`)
    console.log(`  Result:     ${colors.cyan}${result.id.slice(0, 8)}${colors.reset}`)
    console.log(`  Output:     ${colors.gray}${outputDir}${colors.reset}`)
    console.log()
  }

  if (specFile) {
    if (!fs.existsSync(specFile)) {
      console.error(`${colors.red}Error: Spec file not found: ${specFile}${colors.reset}`)
      db.updateYoloBenchmarkResult(result.id, {
        status: 'failed',
        stopReason: `Spec file not found: ${specFile}`,
      })
      process.exit(CLI_EXIT_CODES.INVALID_ARGS)
    }

    const specContent = fs.readFileSync(specFile, 'utf-8')

    // Use the new pipeline for multi-cycle specs
    const pipelineResult = await runBenchmarkPipeline(specFile, specContent, outputDir, {
      model: 'sonnet',
      maxCycles,
      maxCostUsd,
      maxConcurrent,
      dangerouslySkipPermissions,
      jsonOutput,
      maxTurnsPerTask: maxCycles * 10,
    })

    db.updateYoloBenchmarkResult(result.id, {
      totalCostUsd: pipelineResult.totalCostUsd,
      totalDurationMs: pipelineResult.totalDurationMs,
      completedAt: new Date().toISOString(),
      ...(pipelineResult.outcome === 'success'
        ? { status: 'success' as const, stopReason: 'Pipeline completed successfully' }
        : pipelineResult.outcome === 'partial'
          ? { status: 'success' as const, stopReason: 'Pipeline completed partially' }
          : { status: 'failed' as const, stopReason: 'Pipeline failed' }),
    })

    if (!jsonOutput) {
      printPipelineSummary(pipelineResult)
      console.log(`${colors.gray}Output: ${outputDir}${colors.reset}`)
      console.log(`${colors.gray}Workspace: ${pipelineResult.config.workspaceDir}${colors.reset}`)
    }

    if (pipelineResult.outcome === 'failed') {
      process.exit(CLI_EXIT_CODES.BENCHMARK_FAILED)
    }
  } else if (isYolo) {
    // YOLO mode - run Claude autonomously with stream capture
    if (!jsonOutput) {
      console.log(`${colors.blue}Launching Claude Code in YOLO mode...${colors.reset}`)
      console.log(`${colors.gray}Claude will work autonomously on the current project${colors.reset}\n`)
    }

    let totalCost = 0
    let cyclesRun = 0

    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      if (!jsonOutput) {
        console.log(`${colors.bold}--- Cycle ${cycle}/${maxCycles} ---${colors.reset}`)
      }

      const cycleDir = path.join(outputDir, `cycle-${String(cycle).padStart(3, '0')}`)
      fs.mkdirSync(cycleDir, { recursive: true })

      const prompt = `You are in YOLO mode (cycle ${cycle}/${maxCycles}). Work autonomously on the current project. Review open tasks, pick the most important one, and complete it. After completing a task, move to the next. Remaining budget: $${(maxCostUsd - totalCost).toFixed(2)}.`

      const metrics = await spawnClaudeWithCapture(
        prompt,
        cycleDir,
        'sonnet',
        50,
        dangerouslySkipPermissions,
      )

      totalCost += metrics.totalCostUsd
      cyclesRun++

      if (!jsonOutput) {
        printRunSummary(metrics)
      }

      db.updateYoloBenchmarkResult(result.id, {
        cyclesCompleted: cyclesRun,
        totalCostUsd: totalCost,
        totalDurationMs: metrics.durationMs,
      })

      if (stopOnFailure && metrics.exitCode !== 0) {
        if (!jsonOutput) {
          console.log(`\n${colors.yellow}Stopping: --stop-on-failure triggered (exit code ${metrics.exitCode})${colors.reset}`)
        }
        db.updateYoloBenchmarkResult(result.id, {
          status: 'failed',
          stopReason: `Stopped on failure at cycle ${cycle} (exit code ${metrics.exitCode})`,
          completedAt: new Date().toISOString(),
        })
        break
      }

      if (totalCost >= maxCostUsd) {
        if (!jsonOutput) {
          console.log(`\n${colors.yellow}Stopping: cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd.toFixed(2)})${colors.reset}`)
        }
        db.updateYoloBenchmarkResult(result.id, {
          status: 'limit_reached',
          stopReason: `Cost limit reached at cycle ${cycle} ($${totalCost.toFixed(2)})`,
          completedAt: new Date().toISOString(),
        })
        break
      }

      if (cycle === maxCycles) {
        db.updateYoloBenchmarkResult(result.id, {
          status: 'success',
          stopReason: `Completed all ${maxCycles} cycles`,
          completedAt: new Date().toISOString(),
        })
      }
    }

    fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
      reviewMode: 'yolo',
      maxCycles,
      auditFrequency: 1,
      model: 'sonnet',
      mode: 'yolo',
    }, null, 2))
    const permDir = path.join(outputDir, 'permissions')
    fs.mkdirSync(permDir, { recursive: true })
    if (!fs.existsSync(path.join(permDir, 'requests.jsonl'))) {
      fs.writeFileSync(path.join(permDir, 'requests.jsonl'), '')
    }

    const summaryData = {
      configId: config.id,
      resultId: result.id,
      mode: 'yolo',
      outcome: 'completed',
      cyclesRun,
      totalCost,
      maxCycles,
      maxCostUsd,
      stopOnFailure,
      cost: { totalUsd: totalCost },
      timestamp: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summaryData, null, 2))

    if (!jsonOutput) {
      console.log(`\n${colors.green}✓${colors.reset} YOLO mode completed (${cyclesRun} cycles, $${totalCost.toFixed(4)})`)
      console.log(`${colors.gray}Output: ${outputDir}${colors.reset}`)
    }
  } else {
    // No spec file provided for benchmark mode - show help
    if (!jsonOutput) {
      console.log(`${colors.yellow}No spec file provided.${colors.reset}`)
      console.log()
      console.log(`${colors.gray}Usage:${colors.reset}`)
      console.log(`  nerv benchmark <spec-file>                     Run benchmark with spec`)
      console.log(`  nerv benchmark <spec> --dangerously-skip-permissions  Autonomous (no prompts)`)
      console.log(`  nerv benchmark score <dir>                     Score (deterministic)`)
      console.log(`  nerv benchmark score <dir> --grade-claude      Score (Claude Code grading)`)
      console.log(`  nerv benchmark history                         View benchmark history`)
      console.log(`  nerv benchmark compare <dir1> <dir2>           Compare two runs`)
      console.log(`  nerv yolo                                      Run YOLO mode (autonomous)`)
      console.log()
    }

    db.updateYoloBenchmarkResult(result.id, {
      status: 'failed',
      stopReason: 'No spec file provided',
    })
  }
}
