#!/usr/bin/env node
/**
 * NERV Benchmark Scoring Script
 *
 * All 3 scoring categories are Claude-graded (non-deterministic):
 *   1. Planning (15%) — cycle progression, task decomposition, spec coverage
 *   2. Code Quality (50%) — implementation, functionality, UX
 *   3. NERV Ops (35%) — workflow patterns compared against PRD
 *
 * Mock mode: When NERV_MOCK_CLAUDE=1 or NERV_TEST_MODE=1, returns fixed
 * passing scores without calling Claude.
 *
 * Usage:
 *   node scripts/score-benchmark.js <benchmark-dir> [--spec <spec-file>]
 *
 * Requires: Claude Code CLI installed and authenticated (subscription)
 *
 * Output:
 *   - Prints scores to console
 *   - Writes score-report.json to benchmark directory
 *   - Appends to ~/.nerv/benchmarks/history.jsonl
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Mock Mode
// ============================================================================

function isMockMode() {
  return process.env.NERV_MOCK_CLAUDE === '1' ||
    process.env.NERV_MOCK_CLAUDE === 'true' ||
    process.env.NERV_TEST_MODE === '1' ||
    process.env.NERV_TEST_MODE === 'true'
}

function mockScoreDetail() {
  return {
    score: 8,
    strengths: ['Mock mode'],
    weaknesses: [],
    evidence: 'Mock',
  }
}

// ============================================================================
// PRD Workflow Excerpt (embedded for .js compatibility)
// ============================================================================

const PRD_WORKFLOW_EXCERPT = `
## NERV Workflow Patterns (from PRD)

### Single-App Experience
NERV presents one unified dashboard. Users open NERV, create a project,
add repositories, define tasks, and let Claude Code handle implementation.
The user's role is planning, reviewing, and approving — not coding.

### Test-Driven Iterative Development
Each cycle follows: plan → implement → test → review → merge.
Tasks are scoped so Claude can complete them in one session.
"Only plan one cycle ahead — learn from results, then plan more."

### Worktree Isolation
"NERV creates git worktrees — your main repo is never modified directly."
Every task gets its own worktree branched from the base repo.
On approval, the worktree branch is merged back. On rejection, it is discarded.
This ensures the main branch always contains reviewed, approved code.

### Cycle Management
Cycles group related tasks into an iteration.
Each cycle has a goal derived from the spec.
Spec completion should increase across cycles.
Audits can run at the end of a cycle to verify progress.

### Permission System
"All dangerous commands require your explicit approval."
NERV's hook system intercepts tool calls and presents them for review.
The benchmark should show permissions being requested and resolved,
not bypassed entirely. Always-allow rules can reduce friction
while still exercising the permission pipeline.

### Review Gates
Before merging, completed work goes through review.
The review agent (or human) checks code quality, test results,
and spec compliance. Rejected work gets feedback and iterates.
Approved work is merged into the base branch.

### Error Recovery
Loop detection catches Claude spinning on the same error.
Stuck detection identifies stalled sessions.
Compaction handles context window limits.
The system should recover gracefully, not crash or hang.

### Cost Tracking
Token usage and cost are tracked per task and per cycle.
Efficient runs complete specs with reasonable token budgets.
Cost relative to complexity (spec items) matters more than absolute cost.
`

// ============================================================================
// Scoring Prompts — 3 categories, all Claude-graded
// ============================================================================

const PLANNING_PROMPT = `You are evaluating the PLANNING quality of a NERV benchmark run.
NERV orchestrates Claude Code to build applications from a spec across multiple cycles.

Score how well the project was planned and decomposed (1-10):
- Were cycles well-scoped and progressive?
- Were tasks appropriately decomposed?
- Did spec coverage increase across cycles?
- Were decisions and learnings captured?
- Was there evidence of adaptive planning (adjusting based on results)?

| Score | Criteria |
|-------|----------|
| 9-10 | Exceptional: Multiple well-scoped cycles, clear progression, adaptive planning |
| 7-8 | Good: 2+ cycles, reasonable task scoping, spec completion improves |
| 5-6 | Acceptable: Some cycle structure but issues (single cycle, poor scoping) |
| 3-4 | Poor: Minimal planning, tasks too large or too small |
| 1-2 | Failing: No discernible planning, chaotic execution |

Respond with ONLY a JSON object (no markdown fences, no extra text):
{"score": <1-10>, "strengths": ["...", "..."], "weaknesses": ["...", "..."], "evidence": "Specific observations about planning quality"}`

const CODE_QUALITY_PROMPT = `You are evaluating the CODE QUALITY of a NERV benchmark run.
NERV orchestrates Claude Code to build applications from a spec.

Score the produced source code (1-10):
- Code organization, structure, naming
- Test coverage and quality
- Type safety and error handling
- Functionality — does it match the spec?
- UX — does the app work, is it intuitive?

| Score | Criteria |
|-------|----------|
| 9-10 | Exceptional: Clean, well-tested, follows all conventions, spec fully met |
| 7-8 | Good: Readable, adequate tests, follows most conventions, spec mostly met |
| 5-6 | Acceptable: Works but has issues — missing docs, inconsistent style |
| 3-4 | Poor: Hard to read, undocumented, violates conventions |
| 1-2 | Failing: Broken, unmaintainable, major issues |

Respond with ONLY a JSON object (no markdown fences, no extra text):
{"score": <1-10>, "strengths": ["...", "..."], "weaknesses": ["...", "..."], "evidence": "Specific examples from the code"}`

const NERV_OPS_PROMPT = `You are evaluating how well this benchmark used NERV's orchestration features.
Compare the observed workflow against the NERV PRD (provided below).

Score (1-10) how well the build followed NERV's intended patterns:
- Worktree isolation: separate worktrees per task, merged on approval
- Cycle-based iteration: progressive cycles with increasing spec completion
- Permission management: permissions requested and resolved (not bypassed)
- Review gates: review before merge, feedback acted upon
- Error recovery and loop handling: graceful recovery from issues
- Cost efficiency relative to complexity

| Score | Criteria |
|-------|----------|
| 9-10 | Exceptional: All PRD patterns followed, clean workflow |
| 7-8 | Good: Most patterns followed, minor deviations |
| 5-6 | Acceptable: Some patterns followed, notable gaps |
| 3-4 | Poor: Few PRD patterns observed |
| 1-2 | Failing: No PRD patterns observed, chaotic workflow |

## NERV PRD Reference
${PRD_WORKFLOW_EXCERPT}

Respond with ONLY a JSON object (no markdown fences, no extra text):
{"score": <1-10>, "strengths": ["...", "..."], "weaknesses": ["...", "..."], "evidence": "Specific observations about workflow compliance"}`

// ============================================================================
// Stream Summarization
// ============================================================================

/**
 * Summarize a stream.jsonl file into a compact narrative.
 * Extracts: tool calls (count by type), errors, text snippets, thinking blocks.
 * Keeps it under 2000 chars to avoid blowing up the grading prompt.
 */
function summarizeStream(streamPath) {
  try {
    const lines = fs.readFileSync(streamPath, 'utf-8').split('\n').filter(Boolean)
    const toolCounts = {}
    const errors = []
    const textSnippets = []
    let thinkingCount = 0

    for (const line of lines) {
      let msg
      try { msg = JSON.parse(line) } catch { continue }

      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && block.name) {
            toolCounts[block.name] = (toolCounts[block.name] || 0) + 1
          }
          if (block.type === 'thinking') {
            thinkingCount++
          }
          if (block.type === 'text' && block.text && textSnippets.length < 3) {
            const snippet = block.text.slice(0, 150).replace(/\n/g, ' ')
            if (snippet.length > 20) textSnippets.push(snippet)
          }
        }
      }

      if (msg.type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            const text = block.text || (typeof block.content === 'string' ? block.content : '')
            if (text && (text.includes('Error') || text.includes('FAILED'))) {
              if (errors.length < 5) errors.push(text.slice(0, 100))
            }
          }
        }
      }
    }

    return {
      totalEvents: lines.length,
      toolCalls: toolCounts,
      totalToolCalls: Object.values(toolCounts).reduce((a, b) => a + b, 0),
      errors,
      thinkingBlocks: thinkingCount,
      textSnippets,
    }
  } catch {
    return null
  }
}

// ============================================================================
// Data Loading
// ============================================================================

/**
 * Load all available benchmark data from the results directory.
 * Gracefully handles missing files since not all runs produce every file.
 */
function loadBenchmarkData(resultsDir) {
  const data = {
    summary: null,
    spec: null,
    timeline: [],
    tasks: {},
    cycles: {},
    config: null,
    worktrees: {},
    permissions: { requests: [], decisions: [] },
  }

  // Load summary.json
  const summaryPath = path.join(resultsDir, 'summary.json')
  if (fs.existsSync(summaryPath)) {
    data.summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
  }

  // Load config.json
  const configPath = path.join(resultsDir, 'config.json')
  if (fs.existsSync(configPath)) {
    data.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }

  // Load spec.md
  const specPath = path.join(resultsDir, 'spec.md')
  if (fs.existsSync(specPath)) {
    data.spec = fs.readFileSync(specPath, 'utf-8')
  }

  // Load timeline.jsonl
  const timelinePath = path.join(resultsDir, 'timeline.jsonl')
  if (fs.existsSync(timelinePath)) {
    data.timeline = fs.readFileSync(timelinePath, 'utf-8')
      .split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
  }

  // Load per-task data
  const tasksDir = path.join(resultsDir, 'tasks')
  if (fs.existsSync(tasksDir) && fs.statSync(tasksDir).isDirectory()) {
    for (const taskId of fs.readdirSync(tasksDir)) {
      const taskDir = path.join(tasksDir, taskId)
      if (!fs.statSync(taskDir).isDirectory()) continue

      const task = {}
      const metricsPath = path.join(taskDir, 'metrics.json')
      if (fs.existsSync(metricsPath)) task.metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))

      const toolsPath = path.join(taskDir, 'tools.jsonl')
      if (fs.existsSync(toolsPath)) {
        task.tools = fs.readFileSync(toolsPath, 'utf-8')
          .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      }

      const errorsPath = path.join(taskDir, 'errors.json')
      if (fs.existsSync(errorsPath)) task.errors = JSON.parse(fs.readFileSync(errorsPath, 'utf-8'))

      const diffPath = path.join(taskDir, 'git-diff.patch')
      if (fs.existsSync(diffPath)) task.gitDiff = fs.readFileSync(diffPath, 'utf-8')

      const streamPath = path.join(taskDir, 'stream.jsonl')
      if (fs.existsSync(streamPath)) {
        task.hasStream = true
        // Summarize stream: extract tool calls, text blocks, errors
        task.streamSummary = summarizeStream(streamPath)
      }

      const reviewPath = path.join(taskDir, 'review-decision.json')
      if (fs.existsSync(reviewPath)) {
        try { task.reviewDecision = JSON.parse(fs.readFileSync(reviewPath, 'utf-8')) } catch { /* skip */ }
      }

      data.tasks[taskId] = task
    }
  }

  // Load pipeline-result.json (new pipeline format)
  const pipelinePath = path.join(resultsDir, 'pipeline-result.json')
  if (fs.existsSync(pipelinePath)) {
    try { data.pipelineResult = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8')) } catch { /* skip */ }
  }

  // Load cycle data
  const cyclesDir = path.join(resultsDir, 'cycles')
  if (fs.existsSync(cyclesDir) && fs.statSync(cyclesDir).isDirectory()) {
    for (const cycleId of fs.readdirSync(cyclesDir)) {
      const cycleDir = path.join(cyclesDir, cycleId)
      if (!fs.statSync(cycleDir).isDirectory()) continue
      const cycle = {}

      const auditPath = path.join(cycleDir, 'audit-report.json')
      if (fs.existsSync(auditPath)) cycle.auditReport = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))

      const reviewPath = path.join(cycleDir, 'review-report.json')
      if (fs.existsSync(reviewPath)) cycle.reviewReport = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))

      data.cycles[cycleId] = cycle
    }
  }

  // Load benchmark-results-*.json files (legacy format)
  const legacyResults = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('benchmark-results') && f.endsWith('.json'))
  if (legacyResults.length > 0 && !data.summary) {
    data.summary = JSON.parse(fs.readFileSync(path.join(resultsDir, legacyResults[0]), 'utf-8'))
  }

  // Load stream.jsonl from root (single-task runs via CLI benchmark)
  const rootStreamPath = path.join(resultsDir, 'stream.jsonl')
  if (fs.existsSync(rootStreamPath)) {
    data.rootStream = fs.readFileSync(rootStreamPath, 'utf-8')
    data.rootStreamLines = data.rootStream.split('\n').filter(Boolean).length
  }

  // Load git-log.txt and git-diff.patch from root
  const gitLogPath = path.join(resultsDir, 'git-log.txt')
  if (fs.existsSync(gitLogPath)) {
    data.gitLog = fs.readFileSync(gitLogPath, 'utf-8')
  }
  const rootDiffPath = path.join(resultsDir, 'git-diff.patch')
  if (fs.existsSync(rootDiffPath)) {
    data.rootDiff = fs.readFileSync(rootDiffPath, 'utf-8')
  }

  // Load cycle subdirectories (YOLO mode format: cycle-001, cycle-002, etc.)
  const cycleDirs = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('cycle-') && fs.statSync(path.join(resultsDir, f)).isDirectory())
  if (cycleDirs.length > 0) {
    data.yoloCycles = cycleDirs.map(dir => {
      const cycleStreamPath = path.join(resultsDir, dir, 'stream.jsonl')
      return {
        name: dir,
        hasStream: fs.existsSync(cycleStreamPath),
        streamLines: fs.existsSync(cycleStreamPath)
          ? fs.readFileSync(cycleStreamPath, 'utf-8').split('\n').filter(Boolean).length
          : 0,
      }
    })
  }

  return data
}

/**
 * Format benchmark data into a concise text summary for Claude to evaluate
 */
function formatDataForScoring(data, specContent) {
  const sections = []

  if (data.summary) {
    const s = data.summary
    sections.push(`## Benchmark Summary
- Outcome: ${s.outcome || (s.allPassed ? 'success' : s.passed !== false ? 'success' : 'failed')}
- Duration: ${s.duration?.totalMs ? (s.duration.totalMs / 60000).toFixed(1) + ' minutes' : s.totalDuration ? (s.totalDuration / 1000).toFixed(1) + 's' : s.metrics?.durationMs ? (s.metrics.durationMs / 1000).toFixed(1) + 's' : 'unknown'}${s.duration?.perCycle?.length ? '\n- Duration per cycle: ' + s.duration.perCycle.map((ms, i) => `C${i}: ${(ms / 1000).toFixed(1)}s`).join(', ') : ''}${s.duration?.perTask && Object.keys(s.duration.perTask).length ? '\n- Duration per task: ' + Object.entries(s.duration.perTask).map(([id, ms]) => `${id.slice(-6)}: ${(ms / 1000).toFixed(1)}s`).join(', ') : ''}
- Cost: ${s.cost?.totalUsd ? '$' + s.cost.totalUsd.toFixed(2) : s.totalCostUsd ? '$' + s.totalCostUsd.toFixed(4) : s.metrics?.costUsd ? '$' + s.metrics.costUsd.toFixed(4) : 'unknown'}
- Tokens: ${s.tokens?.total ? s.tokens.total.toLocaleString() + (s.tokens.cached ? ` (${s.tokens.cached.toLocaleString()} cached)` : '') : s.metrics?.tokens ? `${s.metrics.tokens.inputTokens?.toLocaleString() || 0} in / ${s.metrics.tokens.outputTokens?.toLocaleString() || 0} out` : 'unknown'}
- All Tests Passed: ${s.allPassed ?? s.passed ?? 'unknown'}`)

    if (s.spec) {
      sections.push(`## Spec Completion
- Items Passed: ${s.spec.itemsPassed}/${s.spec.totalItems} (${s.spec.completionPercent}%)`)
    }

    if (s.tasks) {
      sections.push(`## Tasks
- Total: ${s.tasks.total}
- Completed: ${s.tasks.completed}
- Failed: ${s.tasks.failed}`)
    }

    if (s.workflow) {
      sections.push(`## Workflow
- Worktrees Created: ${s.workflow.worktreesCreated}
- Worktrees Merged: ${s.workflow.worktreesMerged}
- Worktrees Discarded: ${s.workflow.worktreesDiscarded}
- Parallel Tasks: ${s.workflow.parallelTasksRun}
- Commits Created: ${s.workflow.commitsCreated || 'unknown'}
- Reviews Run: ${s.workflow.reviewsRun || 0}
- Reviews Approved: ${s.workflow.reviewsApproved || 0}
- Permissions Requested: ${s.workflow.permissionsRequested || 0}
- Permissions Approved: ${s.workflow.permissionsApproved || 0}
- Permissions Always-Allowed: ${s.workflow.permissionsAlwaysAllowed || 0}
`)
    }

    if (s.cycles) {
      sections.push(`## Cycles
- Total: ${s.cycles.total}
- Audits Run: ${s.cycles.auditsRun}
- Audits Passed: ${s.cycles.auditsPassed}`)
    }

    if (s.issues) {
      sections.push(`## Issues Detected
- Tool Errors: ${s.issues.toolErrors}
- Tool Retries: ${s.issues.toolRetries}
- Permission Timeouts: ${s.issues.permissionTimeouts}
- Loops Detected: ${s.issues.loopsDetected}
- Compactions: ${s.issues.compactions}
- Stuck Detections: ${s.issues.stuckDetections}`)
    }

    if (s.tests) {
      sections.push(`## Tests
- Passed: ${s.tests.passed}/${s.tests.total}
- Failed: ${s.tests.failed}`)
    }

    if (s.results) {
      sections.push(`## Test Results (Legacy Format)
${Object.entries(s.results).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
    }
  }

  if (data.yoloCycles) {
    sections.push(`## YOLO Cycles
- Total cycles: ${data.yoloCycles.length}
${data.yoloCycles.map(c => `- ${c.name}: ${c.streamLines} stream events`).join('\n')}`)
  }

  if (data.rootStreamLines) {
    sections.push(`## Stream Data
- Root stream: ${data.rootStreamLines} events captured`)
  }

  if (data.timeline.length > 0) {
    sections.push(`## Timeline (key events)
${data.timeline.slice(0, 50).map(e => `- [${e.timestamp}] ${e.event}: ${JSON.stringify(e).slice(0, 120)}`).join('\n')}
${data.timeline.length > 50 ? `\n... and ${data.timeline.length - 50} more events` : ''}`)
  }

  // Include git log if available
  if (data.gitLog) {
    sections.push(`## Git History\n\`\`\`\n${data.gitLog.slice(0, 2000)}\n\`\`\``)
  }

  // Include code diffs - use root diff first, then per-task diffs
  if (data.rootDiff) {
    sections.push(`## Code Changes (Full Diff)\n\`\`\`diff\n${data.rootDiff.slice(0, 8000)}\n\`\`\`${data.rootDiff.length > 8000 ? `\n... (${data.rootDiff.length} chars total, truncated)` : ''}`)
  } else {
    const taskDiffs = Object.entries(data.tasks)
      .filter(([, task]) => task.gitDiff)
      .map(([taskId, task]) => `### Task ${taskId}\n\`\`\`diff\n${task.gitDiff.slice(0, 6000)}\n\`\`\``)
    if (taskDiffs.length > 0) {
      sections.push(`## Code Changes\n${taskDiffs.join('\n')}`)
    }
  }

  const taskTools = Object.entries(data.tasks)
    .filter(([, task]) => task.tools)
    .map(([taskId, task]) => {
      const toolCounts = {}
      const errors = task.tools.filter(t => !t.success)
      task.tools.forEach(t => { toolCounts[t.tool] = (toolCounts[t.tool] || 0) + 1 })
      return `### Task ${taskId}
- Tools: ${Object.entries(toolCounts).map(([t, c]) => `${t}(${c})`).join(', ')}
- Errors: ${errors.length}${errors.length > 0 ? ': ' + errors.map(e => e.error).slice(0, 3).join('; ') : ''}`
    })
  if (taskTools.length > 0) {
    sections.push(`## Tool Usage\n${taskTools.join('\n')}`)
  }

  // Pipeline progression narrative (cycle-by-cycle from pipeline-result.json)
  if (data.pipelineResult) {
    const pr = data.pipelineResult
    const cycleNarrative = (pr.cycles || []).map(cycle => {
      const taskSummaries = (cycle.tasks || []).map(t => {
        let line = `  - ${t.taskId}: ${t.merged ? 'MERGED' : 'NOT MERGED'}`
        line += `, ${t.testsPassed} tests passed, ${t.testsFailed} failed`
        line += `, $${(t.costUsd || 0).toFixed(3)}, ${((t.durationMs || 0) / 1000).toFixed(0)}s`
        if (t.reviewDecision) {
          line += `, review: ${t.reviewDecision.decision}`
          if (t.reviewDecision.concerns?.length) line += ` (concerns: ${t.reviewDecision.concerns.slice(0, 2).join('; ')})`
        }
        return line
      }).join('\n')
      return `### Cycle ${cycle.cycleNumber}: ${cycle.title}
- Duration: ${((cycle.durationMs || 0) / 1000).toFixed(0)}s, Cost: $${(cycle.costUsd || 0).toFixed(3)}
- Spec completion: ${cycle.specCompletionPercent || 0}%
- Tasks:
${taskSummaries}`
    }).join('\n\n')

    sections.push(`## Pipeline Progression (Cycle-by-Cycle)
- Total cycles: ${(pr.cycles || []).length}
- Worktrees created: ${pr.worktreesCreated || 0}, merged: ${pr.worktreesMerged || 0}
- Parallel tasks: ${pr.parallelTasksRun || 0}
- Reviews run: ${pr.reviewsRun || 0}
- Overall outcome: ${pr.outcome || 'unknown'}

${cycleNarrative}`)
  }

  // Per-task review decisions
  const reviewSummaries = Object.entries(data.tasks)
    .filter(([, task]) => task.reviewDecision)
    .map(([taskId, task]) => {
      const rd = task.reviewDecision
      let line = `- **${taskId}**: ${rd.decision} (confidence: ${rd.confidence || 'N/A'})`
      if (rd.justification) line += `\n  Justification: ${rd.justification.slice(0, 200)}`
      if (rd.concerns?.length) line += `\n  Concerns: ${rd.concerns.slice(0, 3).join('; ')}`
      if (rd.suggestions?.length) line += `\n  Suggestions: ${rd.suggestions.slice(0, 3).join('; ')}`
      return line
    })
  if (reviewSummaries.length > 0) {
    sections.push(`## Review Agent Decisions\n${reviewSummaries.join('\n')}`)
  }

  // Per-task Claude session summaries (from stream.jsonl)
  const streamSummaries = Object.entries(data.tasks)
    .filter(([, task]) => task.streamSummary)
    .map(([taskId, task]) => {
      const ss = task.streamSummary
      let line = `### ${taskId} (${ss.totalEvents} events, ${ss.totalToolCalls} tool calls, ${ss.thinkingBlocks} thinking blocks)`
      if (ss.toolCalls && Object.keys(ss.toolCalls).length > 0) {
        line += `\n- Tools: ${Object.entries(ss.toolCalls).map(([t, c]) => `${t}(${c})`).join(', ')}`
      }
      if (ss.errors.length > 0) {
        line += `\n- Errors: ${ss.errors.join('; ')}`
      }
      if (ss.textSnippets.length > 0) {
        line += `\n- Claude said: "${ss.textSnippets[0]}..."`
      }
      return line
    })
  if (streamSummaries.length > 0) {
    sections.push(`## Claude Session Logs (per task)\n${streamSummaries.join('\n\n')}`)
  }

  const spec = specContent || data.spec
  if (spec) {
    sections.push(`## Original Spec
${spec.slice(0, 4000)}${spec.length > 4000 ? '\n... (truncated)' : ''}`)
  }

  return sections.join('\n\n')
}

// ============================================================================
// Visual Testing (PRD Section 27) - Uses Claude Code CLI
// ============================================================================

/**
 * Run visual/UX testing using Claude Code CLI.
 * Spawns a Claude Code session that reads the README, starts the app,
 * interacts with it, and writes assessment files.
 */
async function runVisualTests(resultsDir, worktreePath) {
  const visualDir = path.join(resultsDir, 'visual-test')
  const screenshotsDir = path.join(visualDir, 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const visualTestPrompt = `You are evaluating a web application that was just built. Your task is to:

1. **Read the README.md** to understand how to run and use the application
2. **Start the application** using the commands from the README
3. **Open a browser** and navigate to the application (usually http://localhost:3000)
4. **Explore the application as a real user would:**
   - Try all the main features
   - Fill out any forms with test data
   - Test error handling (invalid inputs, edge cases)
   - Check if the UI is intuitive and responsive
5. **Take screenshots** at key moments:
   - Initial homepage
   - After interacting with main features
   - Any error states or issues you find
6. **Write your assessment** to these files:
   - ${path.join(visualDir, 'interaction-log.md')}: What you tried and what happened
   - ${path.join(visualDir, 'readme-accuracy.md')}: Does the README accurately describe the app?
   - ${path.join(visualDir, 'ux-assessment.md')}: Your UX evaluation (what works, what doesn't, suggestions)

Save all screenshots to: ${screenshotsDir}/

Be thorough but efficient. Focus on:
- Does it work as documented?
- Is it intuitive to use?
- Are there any bugs or issues?
- Would a real user be satisfied?

Start by reading the README, then proceed with testing.`

  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'

  try {
    console.log('Starting Claude Code for visual/UX testing...')

    const claudeProcess = spawn(claudeCommand, [
      '--print',
      '--output-format', 'stream-json',
      '--max-turns', '30',
      '--dangerously-skip-permissions',
      '-p', visualTestPrompt
    ], {
      cwd: worktreePath,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    claudeProcess.stdout.on('data', (chunk) => { output += chunk.toString() })
    claudeProcess.stderr.on('data', (chunk) => { /* suppress stderr noise */ })

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        claudeProcess.kill()
        reject(new Error('Visual testing timed out after 10 minutes'))
      }, 10 * 60 * 1000)

      claudeProcess.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })

      claudeProcess.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    const screenshots = fs.existsSync(screenshotsDir)
      ? fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'))
      : []

    console.log(`Visual testing complete: ${screenshots.length} screenshots`)

    return {
      screenshotsDir,
      screenshots,
      hasInteractionLog: fs.existsSync(path.join(visualDir, 'interaction-log.md')),
      hasUxAssessment: fs.existsSync(path.join(visualDir, 'ux-assessment.md')),
      hasReadmeAccuracy: fs.existsSync(path.join(visualDir, 'readme-accuracy.md')),
      success: true
    }
  } catch (error) {
    console.error('Visual testing failed:', error.message)
    fs.writeFileSync(
      path.join(visualDir, 'ux-assessment.md'),
      `# UX Assessment\n\n**Error:** Visual testing failed.\n\n${error.message}`
    )
    return { screenshotsDir, screenshots: [], success: false, error: error.message }
  }
}

// ============================================================================
// Claude Code CLI Scoring
// ============================================================================

/**
 * Spawn Claude Code CLI to grade benchmark results.
 * Uses `claude --print` for subscription-based billing.
 * Returns the raw text output from Claude.
 */
function spawnClaudeForGrading(prompt) {
  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'

  return new Promise((resolve, reject) => {
    // Pipe prompt via stdin to avoid OS argument length limits
    const claudeProcess = spawn(claudeCommand, [
      '--print',
      '--output-format', 'text',
      '--model', 'sonnet',
      '--max-turns', '1',
    ], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    })

    let stdout = ''
    let stderr = ''

    claudeProcess.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    claudeProcess.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    // Write prompt to stdin and close it
    claudeProcess.stdin.write(prompt)
    claudeProcess.stdin.end()

    const timeout = setTimeout(() => {
      claudeProcess.kill()
      reject(new Error('Claude grading timed out after 10 minutes'))
    }, 10 * 60 * 1000)

    claudeProcess.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 || stdout.length > 0) {
        resolve(stdout)
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 200)}`))
      }
    })

    claudeProcess.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start Claude Code CLI: ${err.message}\nMake sure Claude Code is installed and authenticated.`))
    })
  })
}

/**
 * Parse a Claude response into a score detail object.
 * Handles JSON with or without markdown fences.
 */
function parseScoreResponse(output, category) {
  try {
    return JSON.parse(output.trim())
  } catch {
    const jsonMatch = output.match(/\{[\s\S]*"score"[\s\S]*\}/m)
    if (!jsonMatch) {
      throw new Error(`Could not parse Claude ${category} response:\n${output.slice(0, 500)}`)
    }
    return JSON.parse(jsonMatch[0])
  }
}

/**
 * Score a benchmark run using Claude Code CLI for objective evaluation.
 * Makes 3 separate Claude calls: Planning, Code Quality, NERV Ops.
 * In mock mode, returns fixed passing scores.
 */
async function scoreWithClaude(resultsDir, specContent, skipVisual) {
  const data = loadBenchmarkData(resultsDir)
  const formattedData = formatDataForScoring(data, specContent)

  // Mock mode: return fixed scores
  if (isMockMode()) {
    console.log('Mock mode: returning fixed benchmark scores')
    const scores = {
      planning: mockScoreDetail(),
      codeQuality: mockScoreDetail(),
      nervOps: mockScoreDetail(),
      progression: null,
      combined: {
        planningScore: 8,
        codeScore: 8,
        nervOpsScore: 8,
        overallScore: 8,
      },
      overall: {
        score: 8,
        adjustment: 0,
        adjustmentReason: '',
        summary: 'Mock mode — fixed scores',
        recommendations: [],
      },
    }
    return { scores, visualResults: null, data }
  }

  // Run visual tests if possible
  let visualResults = null
  if (!skipVisual) {
    const worktreePath = data.summary?.worktreePath ||
      (data.summary?.specFile ? path.dirname(path.resolve(data.summary.specFile)) : null)

    const possiblePaths = [
      worktreePath,
      path.join(resultsDir, '..', '..', 'worktrees'),
      resultsDir,
    ].filter(Boolean)

    for (const p of possiblePaths) {
      const pkgPath = path.join(p, 'package.json')
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
          if (pkg.scripts && (pkg.scripts.start || pkg.scripts.dev)) {
            console.log(`Found runnable app at: ${p}`)
            visualResults = await runVisualTests(resultsDir, p)
            break
          }
        } catch { /* skip */ }
      }
    }

    if (!visualResults) {
      console.log('No runnable application found, skipping visual testing')
    }
  }

  // Add visual test context to data for code quality grading
  let visualContext = ''
  if (visualResults?.success) {
    const visualDir = path.dirname(visualResults.screenshotsDir)
    const parts = []
    if (visualResults.hasInteractionLog) {
      parts.push(`### Interaction Log\n${fs.readFileSync(path.join(visualDir, 'interaction-log.md'), 'utf-8')}`)
    }
    if (visualResults.hasUxAssessment) {
      parts.push(`### UX Assessment\n${fs.readFileSync(path.join(visualDir, 'ux-assessment.md'), 'utf-8')}`)
    }
    if (visualResults.hasReadmeAccuracy) {
      parts.push(`### README Accuracy\n${fs.readFileSync(path.join(visualDir, 'readme-accuracy.md'), 'utf-8')}`)
    }
    visualContext = `\n\n## Visual/UX Test Results\n${parts.join('\n\n')}`
  } else if (visualResults && !visualResults.success) {
    visualContext = `\n\n## Visual Test Results\nVisual testing failed: ${visualResults.error}\nScore based on code review only.`
  }

  // Make 3 Claude calls
  console.log('Spawning Claude Code CLI for Planning grading...')
  const planningOutput = await spawnClaudeForGrading(
    `${PLANNING_PROMPT}\n\n## Benchmark Data\n${formattedData}`
  )
  const planningResult = parseScoreResponse(planningOutput, 'Planning')

  console.log('Spawning Claude Code CLI for Code Quality grading...')
  const codeOutput = await spawnClaudeForGrading(
    `${CODE_QUALITY_PROMPT}\n\n## Benchmark Data\n${formattedData}${visualContext}`
  )
  const codeResult = parseScoreResponse(codeOutput, 'Code Quality')

  console.log('Spawning Claude Code CLI for NERV Ops grading...')
  const nervOpsOutput = await spawnClaudeForGrading(
    `${NERV_OPS_PROMPT}\n\n## Observed Workflow Metrics\n${formattedData}`
  )
  const nervOpsResult = parseScoreResponse(nervOpsOutput, 'NERV Ops')

  // Extract scores
  const planningScore = Math.max(1, Math.min(10, planningResult.score || 5))
  const codeScore = Math.max(1, Math.min(10, codeResult.score || 5))
  const nervOpsScore = Math.max(1, Math.min(10, nervOpsResult.score || 5))

  // Weighted overall: Planning 15%, Code 50%, NERV Ops 35%
  const overallScore = Math.round(
    (planningScore * 0.15 + codeScore * 0.50 + nervOpsScore * 0.35) * 10
  ) / 10

  const toDetail = (result) => ({
    score: Math.max(1, Math.min(10, result.score || 5)),
    strengths: result.strengths || [],
    weaknesses: result.weaknesses || [],
    evidence: result.evidence || '',
  })

  const scores = {
    planning: toDetail(planningResult),
    codeQuality: toDetail(codeResult),
    nervOps: toDetail(nervOpsResult),
    progression: null,
    combined: {
      planningScore,
      codeScore,
      nervOpsScore,
      overallScore,
    },
    overall: {
      score: Math.round(overallScore),
      adjustment: 0,
      adjustmentReason: '',
      summary: `Planning: ${planningScore}/10, Code: ${codeScore}/10, NERV Ops: ${nervOpsScore}/10`,
      recommendations: [
        ...(planningResult.weaknesses || []).slice(0, 1),
        ...(codeResult.weaknesses || []).slice(0, 1),
        ...(nervOpsResult.weaknesses || []).slice(0, 1),
      ],
    },
  }

  return { scores, visualResults, data }
}

// ============================================================================
// Output
// ============================================================================

function saveScoringResults(resultsDir, scores, visualResults) {
  const reportPath = path.join(resultsDir, 'score-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(scores, null, 2))

  const summaryPath = path.join(resultsDir, 'summary.json')
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
    summary.scores = {
      planning: scores.planning?.score || 0,
      codeQuality: scores.codeQuality?.score || 0,
      nervOps: scores.nervOps?.score || 0,
      overall: scores.overall?.score || 0,
    }
    summary.scoreDetails = scores
    if (visualResults) {
      summary.visualTestResults = {
        success: visualResults.success,
        screenshots: visualResults.screenshots?.length || 0,
        error: visualResults.error || null,
      }
    }
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
  }

  return reportPath
}

function appendHistory(resultsDir, scores, data) {
  const nervDir = path.join(os.homedir(), '.nerv', 'benchmarks')
  fs.mkdirSync(nervDir, { recursive: true })

  const historyPath = path.join(nervDir, 'history.jsonl')
  const entry = {
    timestamp: new Date().toISOString(),
    benchmarkDir: path.resolve(resultsDir),
    nervVersion: data.summary?.nervVersion || 'unknown',
    spec: data.summary?.specFile || data.spec ? 'provided' : 'none',
    outcome: data.summary?.outcome || (data.summary?.allPassed ? 'success' : 'unknown'),
    scores: {
      planning: scores.combined?.planningScore || 0,
      codeQuality: scores.combined?.codeScore || 0,
      nervOps: scores.combined?.nervOpsScore || 0,
      overall: scores.combined?.overallScore || 0,
    },
    duration: data.summary?.duration?.totalMs || data.summary?.totalDuration || data.summary?.metrics?.durationMs || null,
    cost: data.summary?.cost?.totalUsd || data.summary?.totalCostUsd || data.summary?.metrics?.costUsd || null,
  }

  fs.appendFileSync(historyPath, JSON.stringify(entry) + '\n')
  return historyPath
}

function printScores(scores) {
  const bar = (score, maxVal = 10) => {
    const filled = Math.round((score / maxVal) * 10)
    return '\x1b[32m' + '\u2588'.repeat(Math.min(filled, 10)) + '\x1b[90m' + '\u2591'.repeat(10 - Math.min(filled, 10)) + '\x1b[0m'
  }

  console.log('\n' + '='.repeat(60))
  console.log('  \x1b[1mNERV Benchmark Scores (All Claude Graded)\x1b[0m')
  console.log('='.repeat(60))

  const categories = [
    ['planning', 'Planning (15%)'],
    ['codeQuality', 'Code Quality (50%)'],
    ['nervOps', 'NERV Ops (35%)'],
  ]

  for (const [key, name] of categories) {
    const s = scores[key]
    if (!s) continue
    console.log()
    console.log(`  ${name.padEnd(22)} ${bar(s.score)} ${s.score}/10`)
    if (s.strengths?.length) {
      console.log(`    \x1b[32m+\x1b[0m ${s.strengths.slice(0, 2).join(', ')}`)
    }
    if (s.weaknesses?.length) {
      console.log(`    \x1b[31m-\x1b[0m ${s.weaknesses.slice(0, 2).join(', ')}`)
    }
    if (s.evidence) {
      console.log(`    \x1b[90m${s.evidence.slice(0, 120)}\x1b[0m`)
    }
  }

  // Combined scores
  console.log()
  console.log('-'.repeat(60))

  const c = scores.combined || {}
  console.log(`  ${'Planning Score'.padEnd(24)} ${c.planningScore || 0}/10`)
  console.log(`  ${'Code Quality Score'.padEnd(24)} ${c.codeScore || 0}/10`)
  console.log(`  ${'NERV Ops Score'.padEnd(24)} ${c.nervOpsScore || 0}/10`)
  console.log(`  \x1b[1m${'Overall Score'.padEnd(24)} ${bar(c.overallScore || 0)} ${c.overallScore || 0}/10\x1b[0m`)

  const o = scores.overall
  if (o?.summary) {
    console.log()
    console.log(`  ${o.summary}`)
  }

  if (o?.recommendations?.length) {
    console.log()
    console.log('  \x1b[1mRecommendations:\x1b[0m')
    o.recommendations.forEach((r, i) => console.log(`    ${i + 1}. ${r}`))
  }

  console.log()
  console.log('='.repeat(60))
  console.log()
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
NERV Benchmark Scoring Script (All Claude Graded)

Usage:
  node scripts/score-benchmark.js <benchmark-dir> [options]

Arguments:
  benchmark-dir    Directory containing benchmark output

Options:
  --spec <file>    Path to spec file for requirement checking
  --no-history     Don't append to history file
  --no-visual      Skip visual/UX testing
  --json           Output JSON only (no formatted display)
  --help, -h       Show this help

Scoring Categories:
  Planning (15%)     — cycle progression, task decomposition, spec coverage
  Code Quality (50%) — implementation, functionality, UX
  NERV Ops (35%)     — workflow patterns compared against PRD

Mock mode: Set NERV_MOCK_CLAUDE=1 or NERV_TEST_MODE=1 to skip Claude calls.

Requires: Claude Code CLI installed and authenticated (subscription).

Examples:
  node scripts/score-benchmark.js test-results/benchmark-20260203
  node scripts/score-benchmark.js test-results/docker/benchmark --spec specs/todo-app.md
  node scripts/score-benchmark.js test-results/benchmark-latest --json --no-visual
`)
    process.exit(0)
  }

  const benchmarkDir = args[0]
  const specIndex = args.indexOf('--spec')
  const specPath = specIndex !== -1 ? args[specIndex + 1] : null
  const noHistory = args.includes('--no-history')
  const noVisual = args.includes('--no-visual')
  const jsonOnly = args.includes('--json')

  if (!fs.existsSync(benchmarkDir)) {
    console.error(`Error: Benchmark directory not found: ${benchmarkDir}`)
    process.exit(1)
  }

  let specContent = null
  if (specPath) {
    if (!fs.existsSync(specPath)) {
      console.error(`Error: Spec file not found: ${specPath}`)
      process.exit(1)
    }
    specContent = fs.readFileSync(specPath, 'utf-8')
  }

  try {
    const { scores, visualResults, data } = await scoreWithClaude(
      benchmarkDir, specContent, noVisual
    )

    if (jsonOnly) {
      console.log(JSON.stringify(scores, null, 2))
    } else {
      printScores(scores)

      const reportPath = saveScoringResults(benchmarkDir, scores, visualResults)
      console.log(`Score report saved: ${reportPath}`)

      if (!noHistory) {
        const historyPath = appendHistory(benchmarkDir, scores, data)
        console.log(`History updated: ${historyPath}`)
      }
    }

    // Exit code: 0 if overall >= 7 (passing benchmark), 1 if below
    const overallScore = scores.combined?.overallScore || scores.overall?.score || 0
    process.exit(overallScore >= 7 ? 0 : 1)
  } catch (error) {
    console.error(`Error scoring benchmark: ${error.message}`)
    process.exit(1)
  }
}

main()
