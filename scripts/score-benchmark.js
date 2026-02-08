#!/usr/bin/env node
/**
 * NERV Benchmark Scoring Script
 *
 * Analyzes benchmark output and generates scores using Claude Code CLI.
 * A separate Claude Code session evaluates the results for unbiased grading.
 * Uses Claude Code subscription (not API SDK) - consistent with NERV's architecture.
 *
 * PRD Section 27: Benchmark Scoring System
 *
 * Score categories (1-10):
 * 1. Implementation Quality - Code cleanliness, organization, types
 * 2. Workflow Quality - Worktrees, commits, branching
 * 3. Efficiency - Token usage, time, loops
 * 4. User Experience - App works, intuitive, responsive
 * 5. Overall - Weighted combination + holistic adjustment
 *
 * Usage:
 *   node scripts/score-benchmark.js <benchmark-dir> [--spec <spec-file>]
 *   node scripts/score-benchmark.js test-results/benchmark-20260203 --spec specs/todo-app.md
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
// NERV Ops Deterministic Scoring (from summary.json metrics)
// ============================================================================

const NERV_OPS_WEIGHTS = {
  worktreeUsage: 25,
  parallelism: 15,
  cycleManagement: 20,
  reviewProcess: 15,
  errorHandling: 10,
  costEfficiency: 15,
}

function scoreNervOps(summary) {
  if (!summary) return null

  const breakdown = {
    worktreeUsage: scoreWorktreeUsage(summary),
    parallelism: scoreParallelism(summary),
    cycleManagement: scoreCycleManagement(summary),
    reviewProcess: scoreReviewProcess(summary),
    errorHandling: scoreErrorHandling(summary),
    costEfficiency: scoreCostEfficiency(summary),
  }

  const totalScore =
    (breakdown.worktreeUsage.score / breakdown.worktreeUsage.max) * NERV_OPS_WEIGHTS.worktreeUsage +
    (breakdown.parallelism.score / breakdown.parallelism.max) * NERV_OPS_WEIGHTS.parallelism +
    (breakdown.cycleManagement.score / breakdown.cycleManagement.max) * NERV_OPS_WEIGHTS.cycleManagement +
    (breakdown.reviewProcess.score / breakdown.reviewProcess.max) * NERV_OPS_WEIGHTS.reviewProcess +
    (breakdown.errorHandling.score / breakdown.errorHandling.max) * NERV_OPS_WEIGHTS.errorHandling +
    (breakdown.costEfficiency.score / breakdown.costEfficiency.max) * NERV_OPS_WEIGHTS.costEfficiency

  return { score: Math.round(totalScore), breakdown }
}

function scoreWorktreeUsage(summary) {
  const wf = summary.workflow || {}
  let score = 0
  const max = 10
  const details = []

  if (wf.worktreesCreated > 0) { score += 3; details.push(`${wf.worktreesCreated} worktrees created`) }
  else { details.push('No worktrees created (0/3)') }

  if (wf.worktreesMerged > 0) { score += 3; details.push(`${wf.worktreesMerged} worktrees merged`) }
  else { details.push('No worktrees merged (0/3)') }

  const tasksCompleted = summary.tasks?.completed || 0
  if (tasksCompleted > 0 && (wf.worktreesCreated || 0) >= tasksCompleted) { score += 2; details.push('Per-task worktree isolation') }
  else if ((wf.worktreesCreated || 0) > 0) { score += 1; details.push('Partial worktree isolation') }

  if ((wf.worktreesCreated || 0) > 0 && (wf.worktreesDiscarded || 0) === 0) { score += 2; details.push('No worktrees discarded') }
  else if ((wf.worktreesCreated || 0) > 0) { score += 1; details.push(`${wf.worktreesDiscarded} worktrees discarded`) }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

function scoreParallelism(summary) {
  const wf = summary.workflow || {}
  let score = 0
  const max = 10
  const details = []

  if ((wf.parallelTasksRun || 0) > 0) { score += 5; details.push(`${wf.parallelTasksRun} parallel tasks ran`) }
  else { details.push('No parallel tasks (0/5)') }

  if ((wf.parallelTasksRun || 0) >= 4) { score += 3; details.push('Strong parallelism (4+)') }
  else if ((wf.parallelTasksRun || 0) >= 2) { score += 2; details.push('Moderate parallelism (2-3)') }
  else if ((wf.parallelTasksRun || 0) === 1) { score += 1; details.push('Minimal parallelism (1)') }

  if ((summary.tasks?.total || 0) > 1 && (wf.parallelTasksRun || 0) >= (summary.tasks.total || 0) * 0.5) {
    score += 2; details.push('50%+ tasks ran in parallel')
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

function scoreCycleManagement(summary) {
  let score = 0
  const max = 10
  const details = []

  const totalCycles = summary.cycles?.total || 0
  if (totalCycles >= 3) { score += 4; details.push(`${totalCycles} cycles completed (good progression)`) }
  else if (totalCycles >= 2) { score += 2; details.push(`${totalCycles} cycles completed`) }
  else if (totalCycles === 1) { score += 1; details.push('Single cycle only') }
  else { details.push('No cycles completed (0/4)') }

  const specCompletion = summary.spec?.completionPercent || 0
  if (specCompletion >= 80) { score += 3; details.push(`${specCompletion}% spec completion`) }
  else if (specCompletion >= 50) { score += 2; details.push(`${specCompletion}% spec completion`) }
  else if (specCompletion > 0) { score += 1; details.push(`${specCompletion}% spec completion`) }

  if ((summary.tasks?.total || 0) > 0 && summary.tasks.completed === summary.tasks.total) { score += 2; details.push('All tasks completed') }
  else if ((summary.tasks?.completed || 0) > 0) { score += 1; details.push(`${summary.tasks.completed}/${summary.tasks.total} tasks completed`) }

  if ((summary.cycles?.auditsRun || 0) > 0) { score += 1; details.push(`${summary.cycles.auditsRun} audits ran`) }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

function scoreReviewProcess(summary) {
  let score = 0
  const max = 10
  const details = []

  const wf = summary.workflow || {}
  const reviewsRun = wf.reviewsRun || 0
  const reviewsApproved = wf.reviewsApproved || 0

  if (reviewsRun > 0) { score += 5; details.push(`${reviewsRun} reviews ran`) }
  else { details.push('No reviews ran (0/5)') }

  if (reviewsApproved > 0) { score += 3; details.push(`${reviewsApproved} reviews approved`) }

  if (reviewsRun >= (summary.tasks?.completed || 0) && (summary.tasks?.completed || 0) > 0) {
    score += 2; details.push('Full review coverage')
  }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

function scoreErrorHandling(summary) {
  let score = 10
  const max = 10
  const details = []

  const issues = summary.issues || {}
  if ((issues.toolErrors || 0) > 20) { score -= 4; details.push(`${issues.toolErrors} tool errors (high)`) }
  else if ((issues.toolErrors || 0) > 10) { score -= 2; details.push(`${issues.toolErrors} tool errors (moderate)`) }
  else if ((issues.toolErrors || 0) > 0) { score -= 1; details.push(`${issues.toolErrors} tool errors (low)`) }
  else { details.push('No tool errors') }

  if ((issues.loopsDetected || 0) > 0) { score -= 3; details.push(`${issues.loopsDetected} loops detected`) }
  if ((issues.stuckDetections || 0) > 0) { score -= 2; details.push(`${issues.stuckDetections} stuck detections`) }
  if ((issues.compactions || 0) > 3) { score -= 1; details.push(`${issues.compactions} compactions (high context usage)`) }

  if (score >= 9) { details.push('Clean execution') }

  return { score: Math.max(0, Math.min(score, max)), max, details: details.join('; ') }
}

function scoreCostEfficiency(summary) {
  let score = 0
  const max = 10
  const details = []

  const costUsd = summary.cost?.totalUsd || 0
  const specItems = summary.spec?.totalItems || 1
  const costPerItem = costUsd / specItems

  if (costUsd <= 0.50) { score += 4; details.push(`Total cost $${costUsd.toFixed(2)} (very efficient)`) }
  else if (costUsd <= 2.00) { score += 3; details.push(`Total cost $${costUsd.toFixed(2)} (efficient)`) }
  else if (costUsd <= 5.00) { score += 2; details.push(`Total cost $${costUsd.toFixed(2)} (moderate)`) }
  else { score += 1; details.push(`Total cost $${costUsd.toFixed(2)} (expensive)`) }

  if (costPerItem <= 0.10) { score += 3; details.push(`$${costPerItem.toFixed(3)}/item (very efficient)`) }
  else if (costPerItem <= 0.25) { score += 2; details.push(`$${costPerItem.toFixed(3)}/item (efficient)`) }
  else if (costPerItem <= 0.50) { score += 1; details.push(`$${costPerItem.toFixed(3)}/item (moderate)`) }

  const durationMin = (summary.duration?.totalMs || 0) / 60000
  if (durationMin > 0 && durationMin <= 5) { score += 3; details.push(`${durationMin.toFixed(1)}min duration (fast)`) }
  else if (durationMin <= 15) { score += 2; details.push(`${durationMin.toFixed(1)}min duration (moderate)`) }
  else if (durationMin <= 30) { score += 1; details.push(`${durationMin.toFixed(1)}min duration (slow)`) }

  return { score: Math.min(score, max), max, details: details.join('; ') }
}

// ============================================================================
// Scoring Prompt (PRD Section 27) - Code Quality Only
// ============================================================================

const SCORING_PROMPT = `You are evaluating the CODE QUALITY of a NERV benchmark run. NERV is a system that orchestrates Claude Code to implement features from a spec.

Your job is to analyze the produced source code and assign objective scores. Be critical but fair. Look for specific evidence.

NOTE: Workflow metrics (worktrees, parallelism, cycles, reviews) are scored SEPARATELY by a deterministic system. You are ONLY scoring the quality of the produced code and application.

## Scoring Categories

### 1. Implementation Quality (1-10)
Evaluate the resulting code:
- Code organization and structure
- Documentation quality
- Naming conventions and consistency
- Test coverage and quality
- DRY violations and code smells
- Type safety and error handling
- Security considerations

| Score | Criteria |
|-------|----------|
| 9-10 | Exceptional: Clean, well-documented, follows all conventions, excellent test coverage |
| 7-8 | Good: Readable, documented, follows most conventions, adequate tests |
| 5-6 | Acceptable: Works but has issues - missing docs, inconsistent style |
| 3-4 | Poor: Hard to read, undocumented, violates conventions |
| 1-2 | Failing: Broken, unmaintainable, major issues |

### 2. Functionality (1-10)
Evaluate whether the application works:
- Does it implement the spec requirements?
- Do API endpoints work correctly?
- Does the app start and run without errors?
- Are edge cases handled?
- Does error handling work properly?
- Are there any critical bugs?

### 3. User Experience (1-10)
Evaluate the running application (you may receive screenshots and interaction results):
- Does the app load and work correctly?
- Is navigation intuitive and clear?
- Do forms work with proper validation?
- Is feedback clear (loading, success, error states)?
- Does it look reasonable (functional, not necessarily beautiful)?
- Does it match what the README describes?

## Output Format

Respond with ONLY a JSON object (no markdown fences, no extra text):
{
  "implementation": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific examples from the code"
  },
  "functionality": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific examples of what works/doesn't"
  },
  "ux": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific observations from testing or code review"
  },
  "progression": {
    "narrative": "3-5 sentence summary of how the project was built across cycles. What was completed in each cycle? Were there hiccups? How did the review agent help?",
    "cycleHighlights": ["Cycle 1: ...", "Cycle 2: ...", "..."],
    "hiccups": ["Any errors, retries, stuck states, review rejections..."],
    "reviewAgentFindings": ["What the review agent caught and suggested"]
  },
  "summary": "2-3 sentence overall code quality assessment",
  "recommendations": ["...", "..."]
}`

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
- Duration: ${s.duration?.totalMs ? (s.duration.totalMs / 60000).toFixed(1) + ' minutes' : s.totalDuration ? (s.totalDuration / 1000).toFixed(1) + 's' : s.metrics?.durationMs ? (s.metrics.durationMs / 1000).toFixed(1) + 's' : 'unknown'}
- Cost: ${s.cost?.totalUsd ? '$' + s.cost.totalUsd.toFixed(2) : s.totalCostUsd ? '$' + s.totalCostUsd.toFixed(4) : s.metrics?.costUsd ? '$' + s.metrics.costUsd.toFixed(4) : 'unknown'}
- Tokens: ${s.tokens?.total ? s.tokens.total.toLocaleString() : s.metrics?.tokens ? `${s.metrics.tokens.inputTokens?.toLocaleString() || 0} in / ${s.metrics.tokens.outputTokens?.toLocaleString() || 0} out` : 'unknown'}
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
- Git Log: ${s.workflow.gitLog ? 'available (see below)' : 'not captured'}
`)
    }

    if (s.issues) {
      sections.push(`## Issues Detected
- Tool Errors: ${s.issues.toolErrors}
- Tool Retries: ${s.issues.toolRetries}
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
 * Uses `claude --print -p <prompt>` for subscription-based billing.
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
 * Score a benchmark run using Claude Code CLI for objective evaluation.
 * PRD: "A separate Claude instance analyzes the output and assigns objective scores"
 */
async function scoreWithClaude(resultsDir, specContent, skipVisual) {
  const data = loadBenchmarkData(resultsDir)
  const formattedData = formatDataForScoring(data, specContent)

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

  // Build the grading prompt with all data
  let gradingPrompt = `${SCORING_PROMPT}\n\n## Benchmark Data\n${formattedData}`

  // Add visual test results
  if (visualResults?.success) {
    const visualDir = path.dirname(visualResults.screenshotsDir)

    let interactionLog = ''
    let uxAssessment = ''
    let readmeAccuracy = ''

    if (visualResults.hasInteractionLog) {
      interactionLog = fs.readFileSync(path.join(visualDir, 'interaction-log.md'), 'utf-8')
    }
    if (visualResults.hasUxAssessment) {
      uxAssessment = fs.readFileSync(path.join(visualDir, 'ux-assessment.md'), 'utf-8')
    }
    if (visualResults.hasReadmeAccuracy) {
      readmeAccuracy = fs.readFileSync(path.join(visualDir, 'readme-accuracy.md'), 'utf-8')
    }

    gradingPrompt += `\n\n## Visual/UX Test Results\n` +
      `A Claude instance tested the running application:\n\n` +
      `### Interaction Log\n${interactionLog || '(not recorded)'}\n\n` +
      `### README Accuracy\n${readmeAccuracy || '(not evaluated)'}\n\n` +
      `### UX Assessment\n${uxAssessment || '(not evaluated)'}`
  } else if (visualResults && !visualResults.success) {
    gradingPrompt += `\n\n## Visual Test Results\nVisual testing failed: ${visualResults.error}\n\nScore UX based on code review only.`
  } else {
    gradingPrompt += '\n\n## Visual Test Results\nVisual testing was not performed. Score UX based on code review and available data only.'
  }

  // Call Claude Code CLI for scoring
  console.log('Spawning Claude Code CLI for objective grading...')
  const claudeOutput = await spawnClaudeForGrading(gradingPrompt)

  // Parse the JSON response (code quality scores from Claude)
  let codeQuality
  try {
    codeQuality = JSON.parse(claudeOutput.trim())
  } catch {
    // Extract JSON from response (may have markdown fences or extra text)
    const jsonMatch = claudeOutput.match(/\{[\s\S]*"implementation"[\s\S]*\}/m)
    if (!jsonMatch) {
      throw new Error(`Could not parse Claude scoring response:\n${claudeOutput.slice(0, 500)}`)
    }
    codeQuality = JSON.parse(jsonMatch[0])
  }

  // Compute deterministic NERV ops score from summary.json
  const nervOps = scoreNervOps(data.summary)

  // Compute combined scores
  const nervOpsScore10 = nervOps ? Math.round((nervOps.score / 10) * 10) / 10 : 0
  const codeQualityScore10 = Math.round(
    ((codeQuality.implementation?.score || 0) * 0.35 +
     (codeQuality.functionality?.score || 0) * 0.35 +
     (codeQuality.ux?.score || 0) * 0.30) * 10
  ) / 10
  const overallScore = Math.round(((nervOpsScore10 + codeQualityScore10) / 2) * 10) / 10

  const scores = {
    nervOps: nervOps || { score: 0, breakdown: {} },
    codeQuality: {
      implementation: codeQuality.implementation || { score: 0, strengths: [], weaknesses: [], evidence: '' },
      functionality: codeQuality.functionality || { score: 0, strengths: [], weaknesses: [], evidence: '' },
      ux: codeQuality.ux || { score: 0, strengths: [], weaknesses: [], evidence: '' },
    },
    combined: {
      nervOpsScore: nervOpsScore10,
      codeQualityScore: codeQualityScore10,
      overallScore,
    },
    progression: codeQuality.progression || null,
    overall: {
      score: Math.round(overallScore),
      summary: codeQuality.summary || '',
      recommendations: codeQuality.recommendations || []
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
      nervOps: scores.nervOps?.score || 0,
      codeQualityImplementation: scores.codeQuality?.implementation?.score || 0,
      codeQualityFunctionality: scores.codeQuality?.functionality?.score || 0,
      codeQualityUx: scores.codeQuality?.ux?.score || 0,
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
      nervOps: scores.nervOps?.score || 0,
      codeQuality: scores.combined?.codeQualityScore || 0,
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
  console.log('  \x1b[1mNERV Benchmark Scores\x1b[0m')
  console.log('='.repeat(60))

  // NERV Ops (deterministic from summary.json)
  if (scores.nervOps && scores.nervOps.score !== undefined) {
    console.log()
    console.log('  \x1b[1m--- NERV Operations (Deterministic) ---\x1b[0m')
    console.log(`  ${'NERV Ops Total'.padEnd(24)} ${bar(scores.nervOps.score, 100)} ${scores.nervOps.score}/100`)
    console.log()

    const breakdown = scores.nervOps.breakdown
    if (breakdown) {
      const dims = [
        ['worktreeUsage', 'Worktree Usage (25%)'],
        ['parallelism', 'Parallelism (15%)'],
        ['cycleManagement', 'Cycle Mgmt (20%)'],
        ['reviewProcess', 'Review Process (15%)'],
        ['errorHandling', 'Error Handling (10%)'],
        ['costEfficiency', 'Cost Efficiency (15%)'],
      ]
      for (const [key, name] of dims) {
        const d = breakdown[key]
        if (d) {
          console.log(`    ${name.padEnd(22)} ${bar(d.score, d.max)} ${d.score}/${d.max}`)
          if (d.details) console.log(`      \x1b[90m${d.details}\x1b[0m`)
        }
      }
    }
  }

  // Code Quality (Claude-graded)
  console.log()
  console.log('  \x1b[1m--- Code Quality (Claude Graded) ---\x1b[0m')
  console.log()

  const cqCategories = [
    ['implementation', 'Implementation (35%)'],
    ['functionality', 'Functionality (35%)'],
    ['ux', 'User Experience (30%)'],
  ]

  const cq = scores.codeQuality || {}
  for (const [key, name] of cqCategories) {
    const s = cq[key]
    if (!s) continue
    console.log(`    ${name.padEnd(22)} ${bar(s.score)} ${s.score}/10`)
    if (s.strengths?.length) {
      console.log(`      \x1b[32m+\x1b[0m ${s.strengths.slice(0, 2).join(', ')}`)
    }
    if (s.weaknesses?.length) {
      console.log(`      \x1b[31m-\x1b[0m ${s.weaknesses.slice(0, 2).join(', ')}`)
    }
  }

  // Combined scores
  console.log()
  console.log('-'.repeat(60))

  const c = scores.combined || {}
  console.log(`  ${'NERV Ops Score'.padEnd(24)} ${c.nervOpsScore || 0}/10`)
  console.log(`  ${'Code Quality Score'.padEnd(24)} ${c.codeQualityScore || 0}/10`)
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

  // Progression narrative (comes from Claude grading response)
  const p = scores.progression || scores.overall?.progression
  if (p) {
    console.log()
    console.log('  \x1b[1m--- Build Progression ---\x1b[0m')
    if (p.narrative) console.log(`  ${p.narrative}`)
    if (p.cycleHighlights?.length) {
      console.log()
      p.cycleHighlights.forEach(h => console.log(`    ${h}`))
    }
    if (p.hiccups?.length) {
      console.log()
      console.log('  \x1b[33mHiccups:\x1b[0m')
      p.hiccups.forEach(h => console.log(`    - ${h}`))
    }
    if (p.reviewAgentFindings?.length) {
      console.log()
      console.log('  \x1b[36mReview Agent Findings:\x1b[0m')
      p.reviewAgentFindings.forEach(f => console.log(`    - ${f}`))
    }
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
NERV Benchmark Scoring Script (Claude Code Graded)

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

Requires: Claude Code CLI installed and authenticated (subscription).
No API key needed - uses your Claude Code subscription.

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
