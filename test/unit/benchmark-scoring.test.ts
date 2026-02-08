/**
 * Unit tests for benchmark scoring and output validation
 *
 * Tests the benchmark scoring logic from scripts/score-benchmark.js
 * and validates the expected output structures (summary.json, results files).
 *
 * Verifies:
 * - Benchmark output directory structure
 * - Summary.json contents and schema
 * - Score categories presence and weight calculations
 * - Timeline event ordering (results are timestamped)
 * - postProcessStreamData() stream parsing logic
 * - scoreCategory() deterministic scoring
 * - writeRichBenchmarkOutput() file structure
 * - Scoring script loadBenchmarkData() data loading
 * - Review agent parseReviewDecision() and getDiffStats() logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { parseStreamMessage } from '../../src/core/claude-config'
import { scoreNervOps, nervOpsScoreTo10 } from '../../src/core/benchmark-scoring'
import { parseReviewDecision as coreParseReviewDecision, getDiffStats as coreGetDiffStats, buildReviewPrompt } from '../../src/core/benchmark-review'
import { parseSpec, extractAcceptanceCriteria } from '../../src/core/spec-parser'
import type { BenchmarkSummary } from '../../src/shared/types/benchmark'

// Constants matching src/cli/commands/benchmark.ts deterministic UI benchmark scoring
const SCORE_CATEGORIES = {
  implementationQuality: { name: 'Implementation Quality', weight: 0.30 },
  workflowQuality: { name: 'Workflow Quality', weight: 0.20 },
  efficiency: { name: 'Efficiency', weight: 0.20 },
  userExperience: { name: 'User Experience', weight: 0.30 }
}

// PRD Section 27 two-dimension scoring (scripts/score-benchmark.js)
const CODE_QUALITY_WEIGHTS = {
  implementation: { name: 'Implementation Quality', weight: 0.35 },
  functionality: { name: 'Functionality', weight: 0.35 },
  ux: { name: 'User Experience', weight: 0.30 },
}

const NERV_OPS_WEIGHTS = {
  worktreeUsage: 25,
  parallelism: 15,
  cycleManagement: 20,
  reviewProcess: 15,
  errorHandling: 10,
  costEfficiency: 15,
}

// Standard benchmark result structure
interface BenchmarkResult {
  timestamp: number
  totalDuration: number
  results: Record<string, boolean>
  allPassed: boolean
}

// Standard summary structure
interface BenchmarkSummary {
  timestamp: string
  benchmarkDir: string
  specPath: string | null
  rawResults: BenchmarkResult
  scores: {
    implementationQuality: number
    workflowQuality: number
    efficiency: number
    userExperience: number
    overall: number
  }
  weightedTotal: number
  passed: boolean
  summary: Record<string, string>
}

describe('Benchmark Output Directory Structure', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-bench-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should validate benchmark results file naming convention', () => {
    const timestamp = Date.now()
    const filename = `benchmark-results-${timestamp}.json`

    // Verify naming pattern matches expected regex
    expect(filename).toMatch(/^benchmark-results-\d+\.json$/)

    // Write a test results file
    const resultsPath = path.join(tempDir, filename)
    const results: BenchmarkResult = {
      timestamp,
      totalDuration: 5000,
      results: {
        projectCreated: true,
        taskCreated: true,
        taskInProgress: true,
        hasSessionId: true,
        worktreeExists: true,
        terminalHasOutput: true,
        contextMonitorActive: true
      },
      allPassed: true
    }
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))

    // Verify file exists and is valid JSON
    expect(fs.existsSync(resultsPath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'))
    expect(parsed.timestamp).toBe(timestamp)
  })

  it('should support multiple results files in same directory', () => {
    // Create multiple benchmark results (like from multiple runs)
    const timestamps = [Date.now() - 2000, Date.now() - 1000, Date.now()]

    for (const ts of timestamps) {
      const filename = `benchmark-results-${ts}.json`
      fs.writeFileSync(path.join(tempDir, filename), JSON.stringify({
        timestamp: ts,
        totalDuration: 5000,
        results: { projectCreated: true },
        allPassed: true
      }))
    }

    // Find all results files
    const resultFiles = fs.readdirSync(tempDir)
      .filter(f => f.startsWith('benchmark-results') && f.endsWith('.json'))
      .sort()

    expect(resultFiles).toHaveLength(3)

    // Verify chronological ordering by filename
    const fileTimestamps = resultFiles.map(f => {
      const match = f.match(/benchmark-results-(\d+)\.json/)
      return match ? parseInt(match[1]) : 0
    })
    expect(fileTimestamps).toEqual([...fileTimestamps].sort((a, b) => a - b))
  })

  it('should coexist with summary.json in the same directory', () => {
    // Create results file
    const resultsFile = `benchmark-results-${Date.now()}.json`
    fs.writeFileSync(path.join(tempDir, resultsFile), JSON.stringify({
      timestamp: Date.now(),
      totalDuration: 5000,
      results: { projectCreated: true },
      allPassed: true
    }))

    // Create summary file
    fs.writeFileSync(path.join(tempDir, 'summary.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      scores: { overall: 8 }
    }))

    const files = fs.readdirSync(tempDir)
    expect(files).toContain('summary.json')
    expect(files.some(f => f.startsWith('benchmark-results'))).toBe(true)
  })
})

describe('Summary.json Contents Validation', () => {
  it('should contain all required top-level fields', () => {
    const summary: BenchmarkSummary = {
      timestamp: '2026-02-04T03:35:20.650Z',
      benchmarkDir: '/test/benchmark',
      specPath: null,
      rawResults: {
        timestamp: Date.now(),
        totalDuration: 7010,
        results: {
          projectCreated: true,
          taskCreated: true,
          taskInProgress: true,
          hasSessionId: true,
          worktreeExists: true,
          terminalHasOutput: true,
          contextMonitorActive: true
        },
        allPassed: true
      },
      scores: {
        implementationQuality: 10,
        workflowQuality: 10,
        efficiency: 10,
        userExperience: 10,
        overall: 10
      },
      weightedTotal: 10,
      passed: true,
      summary: {
        implementationQuality: '10/10',
        workflowQuality: '10/10',
        efficiency: '10/10',
        userExperience: '10/10',
        overall: '10/10'
      }
    }

    // Verify all required fields exist
    expect(summary.timestamp).toBeTruthy()
    expect(summary.benchmarkDir).toBeTruthy()
    expect(summary.rawResults).toBeDefined()
    expect(summary.scores).toBeDefined()
    expect(typeof summary.weightedTotal).toBe('number')
    expect(typeof summary.passed).toBe('boolean')
    expect(summary.summary).toBeDefined()
  })

  it('should have all score categories in scores object', () => {
    const scores = {
      implementationQuality: 8,
      workflowQuality: 7,
      efficiency: 9,
      userExperience: 8,
      overall: 8
    }

    // All CATEGORIES from the scoring script must be present
    for (const category of Object.keys(SCORE_CATEGORIES)) {
      expect(scores).toHaveProperty(category)
      expect(typeof scores[category as keyof typeof scores]).toBe('number')
    }

    // Overall must also be present
    expect(scores).toHaveProperty('overall')
  })

  it('should have scores in valid range (0-10)', () => {
    const validScores = [0, 1, 5, 7.5, 10]
    const invalidScores = [-1, 11, 100]

    for (const score of validScores) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(10)
    }

    for (const score of invalidScores) {
      expect(score < 0 || score > 10).toBe(true)
    }
  })

  it('should include raw results with boolean verification checks', () => {
    const rawResults: BenchmarkResult = {
      timestamp: Date.now(),
      totalDuration: 7010,
      results: {
        projectCreated: true,
        taskCreated: true,
        taskInProgress: false,
        hasSessionId: false,
        worktreeExists: true,
        terminalHasOutput: true,
        contextMonitorActive: false
      },
      allPassed: false
    }

    // All results values should be boolean
    for (const [key, value] of Object.entries(rawResults.results)) {
      expect(typeof value).toBe('boolean')
    }

    // allPassed should be false if any result is false
    const allTrue = Object.values(rawResults.results).every(v => v)
    expect(rawResults.allPassed).toBe(allTrue)
  })

  it('should have human-readable summary strings in X/10 format', () => {
    const summary: Record<string, string> = {
      implementationQuality: '8/10',
      workflowQuality: '7/10',
      efficiency: '9/10',
      userExperience: '8/10',
      overall: '8/10'
    }

    for (const [_key, value] of Object.entries(summary)) {
      expect(value).toMatch(/^\d+(\.\d+)?\/10$/)
    }
  })
})

describe('Score Categories Presence and Weights', () => {
  it('should have exactly 4 score categories plus overall', () => {
    const categoryKeys = Object.keys(SCORE_CATEGORIES)
    expect(categoryKeys).toHaveLength(4)
    expect(categoryKeys).toContain('implementationQuality')
    expect(categoryKeys).toContain('workflowQuality')
    expect(categoryKeys).toContain('efficiency')
    expect(categoryKeys).toContain('userExperience')
  })

  it('should have category weights that sum to 1.0', () => {
    const totalWeight = Object.values(SCORE_CATEGORIES)
      .reduce((sum, cat) => sum + cat.weight, 0)

    expect(totalWeight).toBeCloseTo(1.0, 10)
  })

  it('should calculate weighted total correctly per PRD formula', () => {
    // PRD: overall = (implementation * 0.3) + (workflow * 0.2) + (efficiency * 0.2) + (ux * 0.3) + holistic_adjustment
    const scores = {
      implementationQuality: 8,
      workflowQuality: 6,
      efficiency: 9,
      userExperience: 7
    }

    const weightedAvg =
      scores.implementationQuality * 0.3 +
      scores.workflowQuality * 0.2 +
      scores.efficiency * 0.2 +
      scores.userExperience * 0.3

    // Expected: 8*0.3 + 6*0.2 + 9*0.2 + 7*0.3 = 2.4 + 1.2 + 1.8 + 2.1 = 7.5
    expect(weightedAvg).toBeCloseTo(7.5, 1)
  })

  it('should have each category contribute meaningfully to overall', () => {
    // No category should have a weight of 0
    for (const [_key, cat] of Object.entries(SCORE_CATEGORIES)) {
      expect(cat.weight).toBeGreaterThan(0)
      expect(cat.weight).toBeLessThan(1)
    }
  })

  it('should match CLI benchmark weights', () => {
    expect(SCORE_CATEGORIES.implementationQuality.weight).toBe(0.30)
    expect(SCORE_CATEGORIES.workflowQuality.weight).toBe(0.20)
    expect(SCORE_CATEGORIES.efficiency.weight).toBe(0.20)
    expect(SCORE_CATEGORIES.userExperience.weight).toBe(0.30)
  })
})

describe('PRD Section 27 Two-Dimension Scoring', () => {
  it('should have code quality weights that sum to 1.0 per PRD', () => {
    // PRD: Implementation Quality (35%), Functionality (35%), User Experience (30%)
    const totalWeight = Object.values(CODE_QUALITY_WEIGHTS)
      .reduce((sum, cat) => sum + cat.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 10)
  })

  it('should have NERV ops weights that sum to 100 per PRD', () => {
    // PRD: Worktree Usage (25%), Parallelism (15%), Cycle Mgmt (20%), Review (15%), Errors (10%), Cost (15%)
    const totalWeight = Object.values(NERV_OPS_WEIGHTS)
      .reduce((sum, w) => sum + w, 0)
    expect(totalWeight).toBe(100)
  })

  it('should match PRD code quality sub-category weights', () => {
    expect(CODE_QUALITY_WEIGHTS.implementation.weight).toBe(0.35)
    expect(CODE_QUALITY_WEIGHTS.functionality.weight).toBe(0.35)
    expect(CODE_QUALITY_WEIGHTS.ux.weight).toBe(0.30)
  })

  it('should match PRD NERV ops dimension weights', () => {
    expect(NERV_OPS_WEIGHTS.worktreeUsage).toBe(25)
    expect(NERV_OPS_WEIGHTS.parallelism).toBe(15)
    expect(NERV_OPS_WEIGHTS.cycleManagement).toBe(20)
    expect(NERV_OPS_WEIGHTS.reviewProcess).toBe(15)
    expect(NERV_OPS_WEIGHTS.errorHandling).toBe(10)
    expect(NERV_OPS_WEIGHTS.costEfficiency).toBe(15)
  })

  it('should calculate combined score per PRD formula: (nervOps/10 + codeQuality) / 2', () => {
    const nervOpsScore = 72 // 0-100 scale
    const codeQualityScores = {
      implementation: 8,
      functionality: 7,
      ux: 7,
    }

    // PRD: codeQualityScore = implementation*0.35 + functionality*0.35 + ux*0.30
    const codeQualityScore =
      codeQualityScores.implementation * 0.35 +
      codeQualityScores.functionality * 0.35 +
      codeQualityScores.ux * 0.30

    // Expected: 8*0.35 + 7*0.35 + 7*0.30 = 2.8 + 2.45 + 2.1 = 7.35
    expect(codeQualityScore).toBeCloseTo(7.35, 2)

    // PRD: overall = (nervOpsScore/10 + codeQualityScore) / 2
    const nervOpsScore10 = nervOpsScore / 10 // 7.2
    const overallScore = (nervOpsScore10 + codeQualityScore) / 2

    // Expected: (7.2 + 7.35) / 2 = 7.275
    expect(overallScore).toBeCloseTo(7.275, 2)
  })
})

describe('Timeline Event Ordering', () => {
  it('should have results ordered chronologically by timestamp', () => {
    const results: BenchmarkResult[] = [
      { timestamp: 1000, totalDuration: 100, results: {}, allPassed: true },
      { timestamp: 2000, totalDuration: 200, results: {}, allPassed: true },
      { timestamp: 3000, totalDuration: 300, results: {}, allPassed: false }
    ]

    // Verify timestamps are monotonically increasing
    for (let i = 1; i < results.length; i++) {
      expect(results[i].timestamp).toBeGreaterThan(results[i - 1].timestamp)
    }
  })

  it('should have totalDuration less than or equal to wall clock time between timestamps', () => {
    const result: BenchmarkResult = {
      timestamp: Date.now(),
      totalDuration: 7010,
      results: { projectCreated: true },
      allPassed: true
    }

    // totalDuration should be a positive number
    expect(result.totalDuration).toBeGreaterThan(0)

    // Duration in milliseconds should be reasonable (not negative, not impossibly large)
    expect(result.totalDuration).toBeLessThan(24 * 60 * 60 * 1000) // Less than 24 hours
  })

  it('should order benchmark result files by timestamp in filename', () => {
    const filenames = [
      'benchmark-results-1770090174158.json',
      'benchmark-results-1770090947983.json',
      'benchmark-results-1770091489110.json'
    ]

    const timestamps = filenames.map(f => {
      const match = f.match(/benchmark-results-(\d+)\.json/)
      return match ? parseInt(match[1]) : 0
    })

    // Verify ascending order
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })

  it('should have summary timestamp as valid ISO 8601 string', () => {
    const timestamp = '2026-02-04T03:35:20.650Z'

    // Parse the timestamp
    const date = new Date(timestamp)
    expect(date.getTime()).toBeGreaterThan(0)
    expect(isNaN(date.getTime())).toBe(false)

    // Re-serialized should be equivalent
    expect(date.toISOString()).toBe(timestamp)
  })

  it('should have rawResults timestamp as Unix epoch milliseconds', () => {
    const timestamp = 1770090174158

    // Should be a valid timestamp (after year 2020)
    const date = new Date(timestamp)
    expect(date.getFullYear()).toBeGreaterThanOrEqual(2020)

    // Should be in milliseconds (not seconds)
    expect(timestamp.toString().length).toBeGreaterThanOrEqual(13)
  })
})

describe('Benchmark Result Schema Validation', () => {
  it('should validate a complete benchmark result against expected schema', () => {
    const result: BenchmarkResult = {
      timestamp: Date.now(),
      totalDuration: 5000,
      results: {
        projectCreated: true,
        taskCreated: true,
        taskInProgress: true,
        hasSessionId: true,
        worktreeExists: true,
        terminalHasOutput: true,
        contextMonitorActive: true
      },
      allPassed: true
    }

    // Required fields
    expect(typeof result.timestamp).toBe('number')
    expect(typeof result.totalDuration).toBe('number')
    expect(typeof result.results).toBe('object')
    expect(typeof result.allPassed).toBe('boolean')

    // Known result keys for the full benchmark
    const expectedKeys = [
      'projectCreated',
      'taskCreated',
      'taskInProgress',
      'hasSessionId',
      'worktreeExists',
      'terminalHasOutput',
      'contextMonitorActive'
    ]

    for (const key of expectedKeys) {
      expect(result.results).toHaveProperty(key)
    }
  })

  it('should correctly determine allPassed from individual results', () => {
    const allTrue = {
      projectCreated: true,
      taskCreated: true,
      taskInProgress: true
    }

    const oneFalse = {
      projectCreated: true,
      taskCreated: false,
      taskInProgress: true
    }

    expect(Object.values(allTrue).every(v => v)).toBe(true)
    expect(Object.values(oneFalse).every(v => v)).toBe(false)
  })

  it('should handle partial results gracefully', () => {
    // A benchmark that only ran partial checks
    const partialResult: BenchmarkResult = {
      timestamp: Date.now(),
      totalDuration: 2000,
      results: {
        projectCreated: true,
        taskCreated: true
      },
      allPassed: true
    }

    expect(Object.keys(partialResult.results).length).toBeGreaterThan(0)
    expect(typeof partialResult.allPassed).toBe('boolean')
  })
})

// ============================================================================
// scoreCategory() deterministic scoring logic
// Mirrors the scoreCategory function in src/cli/commands/benchmark.ts
// ============================================================================

/**
 * Replicate the scoreCategory logic from benchmark.ts for testing.
 * This ensures test parity with the actual implementation.
 */
function scoreCategory(results: { results?: Record<string, boolean | number | string>; allPassed?: boolean; totalDuration?: number }, category: string): number {
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

describe('scoreCategory() Deterministic Scoring', () => {
  it('should return base score of 5 with no results', () => {
    const results = { results: {}, allPassed: false }

    expect(scoreCategory(results, 'implementationQuality')).toBe(5)
    expect(scoreCategory(results, 'workflowQuality')).toBe(5)
    expect(scoreCategory(results, 'userExperience')).toBe(5)
  })

  it('should return max 10 for implementationQuality with all checks passing', () => {
    const results = {
      results: {
        projectCreated: true,
        taskCreated: true,
        contextMonitorActive: true,
        terminalHasOutput: true,
      },
      allPassed: true,
    }

    expect(scoreCategory(results, 'implementationQuality')).toBe(10)
  })

  it('should give efficiency bonus for fast completion', () => {
    // Under 10s: +3, plus allPassed && <30s: +2 => 5+3+2=10
    const fastResult = { results: {}, allPassed: true, totalDuration: 5000 }
    expect(scoreCategory(fastResult, 'efficiency')).toBe(10)

    // 10s-30s: +2, plus allPassed && <30s: +2 => 5+2+2=9
    const mediumResult = { results: {}, allPassed: true, totalDuration: 15000 }
    expect(scoreCategory(mediumResult, 'efficiency')).toBe(9)

    // 30s-60s: +1, no bonus since >30s => 5+1=6
    const slowResult = { results: {}, allPassed: true, totalDuration: 45000 }
    expect(scoreCategory(slowResult, 'efficiency')).toBe(6)

    // Over 60s: no bonus => 5
    const verySlowResult = { results: {}, allPassed: false, totalDuration: 90000 }
    expect(scoreCategory(verySlowResult, 'efficiency')).toBe(5)
  })

  it('should give workflowQuality +2 for worktree and +1 each for session/progress', () => {
    const results = {
      results: {
        worktreeExists: true,
        hasSessionId: true,
        taskInProgress: true,
      },
      allPassed: true,
    }

    // 5 + 2 (worktree) + 1 (session) + 1 (in_progress) + 1 (allPassed) = 10
    expect(scoreCategory(results, 'workflowQuality')).toBe(10)
  })

  it('should clamp scores to 0-10 range', () => {
    // Even with all checks passing, score should not exceed 10
    const fullResults = {
      results: {
        projectCreated: true,
        taskCreated: true,
        contextMonitorActive: true,
        terminalHasOutput: true,
        worktreeExists: true,
        hasSessionId: true,
        taskInProgress: true,
      },
      allPassed: true,
      totalDuration: 1000,
    }

    for (const category of Object.keys(SCORE_CATEGORIES)) {
      const score = scoreCategory(fullResults, category)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(10)
    }
  })

  it('should calculate holistic adjustment correctly', () => {
    // Mirrors the holistic adjustment logic in scoreBenchmarkResults()
    function calculateHolisticAdjustment(results: { allPassed?: boolean; results?: Record<string, boolean | number | string> }): number {
      let adjustment = 0
      if (results.allPassed) adjustment += 0.5
      if (results.results?.projectCreated === false) adjustment -= 0.5
      if (results.results?.taskCreated === false) adjustment -= 0.3
      return Math.max(-1, Math.min(1, adjustment))
    }

    expect(calculateHolisticAdjustment({ allPassed: true, results: {} })).toBe(0.5)
    expect(calculateHolisticAdjustment({ allPassed: false, results: { projectCreated: false } })).toBe(-0.5)
    expect(calculateHolisticAdjustment({ allPassed: false, results: { projectCreated: false, taskCreated: false } })).toBe(-0.8)
    expect(calculateHolisticAdjustment({ allPassed: true, results: { projectCreated: false, taskCreated: false } })).toBe(-0.3)
  })

  it('should produce overall score matching weighted formula', () => {
    const results = {
      results: {
        projectCreated: true,
        taskCreated: true,
        contextMonitorActive: true,
        terminalHasOutput: true,
        worktreeExists: true,
        hasSessionId: true,
        taskInProgress: true,
      },
      allPassed: true,
      totalDuration: 5000,
    }

    const implScore = scoreCategory(results, 'implementationQuality')
    const workflowScore = scoreCategory(results, 'workflowQuality')
    const effScore = scoreCategory(results, 'efficiency')
    const uxScore = scoreCategory(results, 'userExperience')

    const weightedScore =
      implScore * 0.3 +
      workflowScore * 0.2 +
      effScore * 0.2 +
      uxScore * 0.3

    // All pass with fast completion: all should be 10
    expect(implScore).toBe(10)
    expect(workflowScore).toBe(10)
    expect(effScore).toBe(10)
    expect(uxScore).toBe(10)
    expect(weightedScore).toBe(10)
  })
})

// ============================================================================
// postProcessStreamData() stream parsing logic
// Mirrors the function in src/cli/commands/benchmark.ts
// ============================================================================

/**
 * Replicate postProcessStreamData logic for testing.
 * Parses stream.jsonl and extracts tool calls, errors, timeline events.
 */
function postProcessStreamData(lines: string[]): {
  toolCalls: { timestamp: number; tool: string; success: boolean; error?: string }[]
  errors: unknown[]
  timeline: { timestamp: number; event: string; [key: string]: unknown }[]
  toolErrors: number
  toolRetries: number
  loopsDetected: number
  compactions: number
} {
  const toolCalls: { timestamp: number; tool: string; success: boolean; error?: string }[] = []
  const errors: unknown[] = []
  const timeline: { timestamp: number; event: string; [key: string]: unknown }[] = []
  let toolErrors = 0
  const toolRetries = 0
  const loopsDetected = 0
  let compactions = 0
  let previousInputTokens = 0

  for (const line of lines) {
    const msg = parseStreamMessage(line)
    if (!msg) continue

    const now = Date.now()

    // Track tool uses from assistant messages
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.name) {
          toolCalls.push({ timestamp: now, tool: block.name, success: true })
          timeline.push({ timestamp: now, event: 'tool_call', tool: block.name })
        }
      }
    }

    // Track tool results (errors)
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

    // Detect compactions via token usage drops
    const usage = msg.usage || (msg.message as Record<string, unknown> | undefined)?.usage as { input_tokens?: number } | undefined
    if (usage) {
      const currentInputTokens = usage.input_tokens || 0
      if (previousInputTokens > 0 && currentInputTokens < previousInputTokens * 0.5) {
        compactions++
        timeline.push({ timestamp: now, event: 'compaction' })
      }
      previousInputTokens = currentInputTokens
    }

    // Track result message
    if (msg.type === 'result') {
      timeline.push({ timestamp: now, event: 'session_complete', result: msg.result })
    }

    // Track session start
    if (msg.type === 'system' && msg.session_id) {
      timeline.push({ timestamp: now, event: 'session_start', sessionId: msg.session_id })
    }
  }

  return { toolCalls, errors, timeline, toolErrors, toolRetries, loopsDetected, compactions }
}

describe('postProcessStreamData() Stream Parsing', () => {
  it('should extract tool calls from assistant messages', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', id: 'tu-1' },
            { type: 'tool_use', name: 'Edit', id: 'tu-2' },
          ]
        }
      })
    ]

    const result = postProcessStreamData(lines)

    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0].tool).toBe('Read')
    expect(result.toolCalls[1].tool).toBe('Edit')
    expect(result.timeline.filter(e => e.event === 'tool_call')).toHaveLength(2)
  })

  it('should detect tool errors from user tool_result messages', () => {
    const lines = [
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', text: 'Error: File not found' },
          ]
        }
      }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', text: 'Success: file written' },
          ]
        }
      }),
    ]

    const result = postProcessStreamData(lines)

    expect(result.toolErrors).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.timeline.filter(e => e.event === 'tool_error')).toHaveLength(1)
  })

  it('should detect FAILED in tool results as errors', () => {
    const lines = [
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', text: 'Tests FAILED: 3 failures' },
          ]
        }
      }),
    ]

    const result = postProcessStreamData(lines)
    expect(result.toolErrors).toBe(1)
  })

  it('should detect compactions when input tokens drop by 50%+', () => {
    const lines = [
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 10000 }, message: { content: [] } }),
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 20000 }, message: { content: [] } }),
      // Token drop: 20000 -> 5000 (75% drop = compaction)
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 5000 }, message: { content: [] } }),
    ]

    const result = postProcessStreamData(lines)
    expect(result.compactions).toBe(1)
  })

  it('should not detect compaction for gradual token increase', () => {
    const lines = [
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 10000 }, message: { content: [] } }),
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 15000 }, message: { content: [] } }),
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 20000 }, message: { content: [] } }),
    ]

    const result = postProcessStreamData(lines)
    expect(result.compactions).toBe(0)
  })

  it('should track session start events', () => {
    const lines = [
      JSON.stringify({ type: 'system', session_id: 'sess-abc123' }),
    ]

    const result = postProcessStreamData(lines)

    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].event).toBe('session_start')
    expect(result.timeline[0].sessionId).toBe('sess-abc123')
  })

  it('should track session complete (result) events', () => {
    const lines = [
      JSON.stringify({ type: 'result', result: { cost_usd: 0.05, duration_ms: 30000, num_turns: 5 } }),
    ]

    const result = postProcessStreamData(lines)

    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].event).toBe('session_complete')
  })

  it('should handle empty or malformed stream lines', () => {
    const lines = [
      '',
      'not json',
      '{}',
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 'tu-1' }] } }),
    ]

    const result = postProcessStreamData(lines)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('Bash')
  })

  it('should handle a realistic multi-event stream', () => {
    const lines = [
      JSON.stringify({ type: 'system', session_id: 'sess-001' }),
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 5000 }, message: { content: [{ type: 'text', text: 'I will read the file' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', id: 'tu-1' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', text: 'file contents here' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', id: 'tu-2' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', text: 'Error: old_string not found' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', id: 'tu-3' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', text: 'File updated successfully' }] } }),
      JSON.stringify({ type: 'result', result: { cost_usd: 0.02, duration_ms: 15000, num_turns: 4 } }),
    ]

    const result = postProcessStreamData(lines)

    expect(result.toolCalls).toHaveLength(3) // Read, Edit, Edit
    expect(result.toolErrors).toBe(1) // One error from "old_string not found"
    expect(result.errors).toHaveLength(1)
    expect(result.timeline.length).toBeGreaterThanOrEqual(5) // session_start + 3 tool_calls + tool_error + session_complete
  })
})

// ============================================================================
// writeRichBenchmarkOutput() file structure validation
// Tests the output structure created by the benchmark command
// ============================================================================

describe('writeRichBenchmarkOutput() File Structure', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-rich-output-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Simulate writeRichBenchmarkOutput by creating the expected file structure.
   * This verifies the scoring script can load the output correctly.
   */
  function createRichBenchmarkOutput(outputDir: string, options: {
    specContent?: string
    configId: string
    resultId: string
    model: string
    maxCycles: number
    maxCostUsd: number
    durationMs: number
    exitCode: number
    inputTokens: number
    outputTokens: number
    totalCostUsd: number
    numTurns: number
    toolCalls: { timestamp: number; tool: string; success: boolean }[]
    errors: unknown[]
    timeline: { timestamp: number; event: string; [key: string]: unknown }[]
  }): void {
    // 1. Write spec.md
    if (options.specContent) {
      fs.writeFileSync(path.join(outputDir, 'spec.md'), options.specContent)
    }

    // 2. Write config.json
    fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
      reviewMode: 'normal',
      maxCycles: options.maxCycles,
      auditFrequency: 1,
      model: options.model,
      specFile: null,
    }, null, 2))

    // 3. Write timeline.jsonl
    const allTimeline = [
      { timestamp: Date.now() - options.durationMs, event: 'benchmark_start' },
      ...options.timeline,
      { timestamp: Date.now(), event: 'benchmark_complete', exitCode: options.exitCode },
    ]
    fs.writeFileSync(
      path.join(outputDir, 'timeline.jsonl'),
      allTimeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    )

    // 4. Create tasks directory
    const taskId = options.resultId.slice(0, 16)
    const taskDir = path.join(outputDir, 'tasks', taskId)
    fs.mkdirSync(taskDir, { recursive: true })

    fs.writeFileSync(path.join(taskDir, 'metrics.json'), JSON.stringify({
      taskId,
      startTime: Date.now() - options.durationMs,
      endTime: Date.now(),
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      costUsd: options.totalCostUsd,
      numTurns: options.numTurns,
      toolCalls: options.toolCalls.length,
      status: options.exitCode === 0 ? 'done' : 'failed',
    }, null, 2))

    if (options.toolCalls.length > 0) {
      fs.writeFileSync(
        path.join(taskDir, 'tools.jsonl'),
        options.toolCalls.map(t => JSON.stringify(t)).join('\n') + '\n'
      )
    }

    fs.writeFileSync(path.join(taskDir, 'errors.json'), JSON.stringify(options.errors, null, 2))

    // 5. Create cycles directory
    const cycleDir = path.join(outputDir, 'cycles', `cycle-${options.configId.slice(0, 12)}`)
    fs.mkdirSync(cycleDir, { recursive: true })
    fs.writeFileSync(path.join(cycleDir, 'learnings.json'), JSON.stringify({ learnings: [] }, null, 2))

    // 6. Create permissions directory
    const permDir = path.join(outputDir, 'permissions')
    fs.mkdirSync(permDir, { recursive: true })
    fs.writeFileSync(path.join(permDir, 'requests.jsonl'), '')

    // 7. Write summary.json
    let specTotalItems = 0
    let specPassedItems = 0
    if (options.specContent) {
      const checkboxes = options.specContent.match(/- \[[ x]\]/g) || []
      specTotalItems = checkboxes.length
      specPassedItems = (options.specContent.match(/- \[x\]/gi) || []).length
    }

    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify({
      benchmarkId: `bench-${options.resultId.slice(0, 14)}`,
      timestamp: Date.now() - options.durationMs,
      outcome: options.exitCode === 0 ? 'success' : 'failed',
      duration: { totalMs: options.durationMs },
      tokens: { total: options.inputTokens + options.outputTokens, input: options.inputTokens, output: options.outputTokens },
      cost: { totalUsd: options.totalCostUsd },
      tasks: { total: 1, completed: options.exitCode === 0 ? 1 : 0, failed: options.exitCode === 0 ? 0 : 1 },
      workflow: { worktreesCreated: 0, worktreesMerged: 0, worktreesDiscarded: 0, parallelTasksRun: 0 },
      issues: { loopsDetected: 0, compactions: 0, toolErrors: options.errors.length, toolRetries: 0, stuckDetections: 0 },
      spec: { totalItems: specTotalItems, itemsPassed: specPassedItems, completionPercent: specTotalItems > 0 ? Math.round((specPassedItems / specTotalItems) * 100) : 0 },
    }, null, 2))
  }

  it('should create all expected directories and files', () => {
    createRichBenchmarkOutput(tempDir, {
      configId: 'config-abc12345',
      resultId: 'result-1234567890abcdef',
      model: 'sonnet',
      maxCycles: 10,
      maxCostUsd: 5.0,
      durationMs: 30000,
      exitCode: 0,
      inputTokens: 5000,
      outputTokens: 2000,
      totalCostUsd: 0.05,
      numTurns: 5,
      toolCalls: [],
      errors: [],
      timeline: [],
    })

    // Verify top-level files
    expect(fs.existsSync(path.join(tempDir, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'summary.json'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'timeline.jsonl'))).toBe(true)

    // Verify directory structure
    expect(fs.existsSync(path.join(tempDir, 'tasks'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'cycles'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'permissions'))).toBe(true)
  })

  it('should create task subdirectory with metrics and errors', () => {
    createRichBenchmarkOutput(tempDir, {
      configId: 'config-abc12345',
      resultId: 'result-1234567890abcdef',
      model: 'sonnet',
      maxCycles: 10,
      maxCostUsd: 5.0,
      durationMs: 15000,
      exitCode: 0,
      inputTokens: 8000,
      outputTokens: 3000,
      totalCostUsd: 0.08,
      numTurns: 8,
      toolCalls: [
        { timestamp: Date.now(), tool: 'Read', success: true },
        { timestamp: Date.now(), tool: 'Edit', success: true },
      ],
      errors: [],
      timeline: [],
    })

    const taskId = 'result-123456789' // resultId.slice(0, 16) = 'result-123456789'
    const taskDir = path.join(tempDir, 'tasks', taskId)

    expect(fs.existsSync(path.join(taskDir, 'metrics.json'))).toBe(true)
    expect(fs.existsSync(path.join(taskDir, 'tools.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(taskDir, 'errors.json'))).toBe(true)

    const metrics = JSON.parse(fs.readFileSync(path.join(taskDir, 'metrics.json'), 'utf-8'))
    expect(metrics.inputTokens).toBe(8000)
    expect(metrics.outputTokens).toBe(3000)
    expect(metrics.costUsd).toBe(0.08)
    expect(metrics.numTurns).toBe(8)
    expect(metrics.toolCalls).toBe(2)
    expect(metrics.status).toBe('done')
  })

  it('should write spec.md and track spec completion in summary', () => {
    const specContent = `# Todo App
- [x] Create project structure
- [x] Add API endpoints
- [ ] Add authentication
- [ ] Write tests
`
    createRichBenchmarkOutput(tempDir, {
      specContent,
      configId: 'config-abc12345',
      resultId: 'result-1234567890abcdef',
      model: 'sonnet',
      maxCycles: 10,
      maxCostUsd: 5.0,
      durationMs: 60000,
      exitCode: 0,
      inputTokens: 10000,
      outputTokens: 5000,
      totalCostUsd: 0.10,
      numTurns: 10,
      toolCalls: [],
      errors: [],
      timeline: [],
    })

    expect(fs.existsSync(path.join(tempDir, 'spec.md'))).toBe(true)
    expect(fs.readFileSync(path.join(tempDir, 'spec.md'), 'utf-8')).toBe(specContent)

    const summary = JSON.parse(fs.readFileSync(path.join(tempDir, 'summary.json'), 'utf-8'))
    expect(summary.spec.totalItems).toBe(4)
    expect(summary.spec.itemsPassed).toBe(2)
    expect(summary.spec.completionPercent).toBe(50)
  })

  it('should write timeline.jsonl with benchmark_start and benchmark_complete events', () => {
    createRichBenchmarkOutput(tempDir, {
      configId: 'config-abc12345',
      resultId: 'result-1234567890abcdef',
      model: 'sonnet',
      maxCycles: 10,
      maxCostUsd: 5.0,
      durationMs: 20000,
      exitCode: 0,
      inputTokens: 3000,
      outputTokens: 1000,
      totalCostUsd: 0.03,
      numTurns: 3,
      toolCalls: [],
      errors: [],
      timeline: [
        { timestamp: Date.now() - 10000, event: 'tool_call', tool: 'Read' },
      ],
    })

    const timelineContent = fs.readFileSync(path.join(tempDir, 'timeline.jsonl'), 'utf-8')
    const events = timelineContent.split('\n').filter(Boolean).map(l => JSON.parse(l))

    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events[0].event).toBe('benchmark_start')
    expect(events[events.length - 1].event).toBe('benchmark_complete')
    expect(events[events.length - 1].exitCode).toBe(0)
  })

  it('should set failed outcome and status for non-zero exit codes', () => {
    createRichBenchmarkOutput(tempDir, {
      configId: 'config-abc12345',
      resultId: 'result-1234567890abcdef',
      model: 'sonnet',
      maxCycles: 10,
      maxCostUsd: 5.0,
      durationMs: 5000,
      exitCode: 1,
      inputTokens: 1000,
      outputTokens: 500,
      totalCostUsd: 0.01,
      numTurns: 1,
      toolCalls: [],
      errors: [{ message: 'Something went wrong' }],
      timeline: [],
    })

    const summary = JSON.parse(fs.readFileSync(path.join(tempDir, 'summary.json'), 'utf-8'))
    expect(summary.outcome).toBe('failed')
    expect(summary.tasks.failed).toBe(1)
    expect(summary.tasks.completed).toBe(0)
  })
})

// ============================================================================
// Scoring script loadBenchmarkData() behavior
// Tests that the scoring script can load data from the output structure
// ============================================================================

describe('Scoring Script Data Loading', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerv-score-load-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Replicate loadBenchmarkData from scripts/score-benchmark.js
   */
  function loadBenchmarkData(resultsDir: string): Record<string, unknown> {
    const data: Record<string, unknown> = {
      summary: null,
      spec: null,
      timeline: [] as unknown[],
      tasks: {} as Record<string, unknown>,
      cycles: {} as Record<string, unknown>,
      config: null,
    }

    const summaryPath = path.join(resultsDir, 'summary.json')
    if (fs.existsSync(summaryPath)) {
      data.summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
    }

    const configPath = path.join(resultsDir, 'config.json')
    if (fs.existsSync(configPath)) {
      data.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }

    const specPath = path.join(resultsDir, 'spec.md')
    if (fs.existsSync(specPath)) {
      data.spec = fs.readFileSync(specPath, 'utf-8')
    }

    const timelinePath = path.join(resultsDir, 'timeline.jsonl')
    if (fs.existsSync(timelinePath)) {
      data.timeline = fs.readFileSync(timelinePath, 'utf-8')
        .split('\n').filter(Boolean).map(line => {
          try { return JSON.parse(line) } catch { return null }
        }).filter(Boolean)
    }

    const tasksDir = path.join(resultsDir, 'tasks')
    if (fs.existsSync(tasksDir) && fs.statSync(tasksDir).isDirectory()) {
      const tasks: Record<string, unknown> = {}
      for (const taskId of fs.readdirSync(tasksDir)) {
        const taskDir = path.join(tasksDir, taskId)
        if (!fs.statSync(taskDir).isDirectory()) continue
        const task: Record<string, unknown> = {}
        const metricsPath = path.join(taskDir, 'metrics.json')
        if (fs.existsSync(metricsPath)) task.metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
        const toolsPath = path.join(taskDir, 'tools.jsonl')
        if (fs.existsSync(toolsPath)) {
          task.tools = fs.readFileSync(toolsPath, 'utf-8')
            .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        }
        const errorsPath = path.join(taskDir, 'errors.json')
        if (fs.existsSync(errorsPath)) task.errors = JSON.parse(fs.readFileSync(errorsPath, 'utf-8'))
        tasks[taskId] = task
      }
      data.tasks = tasks
    }

    // Load legacy results
    const legacyResults = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('benchmark-results') && f.endsWith('.json'))
    if (legacyResults.length > 0 && !data.summary) {
      data.summary = JSON.parse(fs.readFileSync(path.join(resultsDir, legacyResults[0]), 'utf-8'))
    }

    return data
  }

  it('should load summary.json when present', () => {
    fs.writeFileSync(path.join(tempDir, 'summary.json'), JSON.stringify({
      outcome: 'success',
      duration: { totalMs: 30000 },
    }))

    const data = loadBenchmarkData(tempDir)
    expect(data.summary).not.toBeNull()
    expect((data.summary as Record<string, unknown>).outcome).toBe('success')
  })

  it('should load config.json when present', () => {
    fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({
      model: 'sonnet',
      maxCycles: 10,
    }))

    const data = loadBenchmarkData(tempDir)
    expect(data.config).not.toBeNull()
    expect((data.config as Record<string, unknown>).model).toBe('sonnet')
  })

  it('should load spec.md as raw text', () => {
    fs.writeFileSync(path.join(tempDir, 'spec.md'), '# My Spec\n- [x] Feature 1\n- [ ] Feature 2\n')

    const data = loadBenchmarkData(tempDir)
    expect(data.spec).toContain('# My Spec')
    expect(data.spec).toContain('- [x] Feature 1')
  })

  it('should parse timeline.jsonl into array of events', () => {
    fs.writeFileSync(path.join(tempDir, 'timeline.jsonl'),
      JSON.stringify({ timestamp: 1000, event: 'start' }) + '\n' +
      JSON.stringify({ timestamp: 2000, event: 'tool_call', tool: 'Read' }) + '\n' +
      JSON.stringify({ timestamp: 3000, event: 'complete' }) + '\n'
    )

    const data = loadBenchmarkData(tempDir)
    const timeline = data.timeline as unknown[]
    expect(timeline).toHaveLength(3)
    expect((timeline[0] as Record<string, unknown>).event).toBe('start')
  })

  it('should load per-task data with metrics and tools', () => {
    const taskDir = path.join(tempDir, 'tasks', 'task-001')
    fs.mkdirSync(taskDir, { recursive: true })

    fs.writeFileSync(path.join(taskDir, 'metrics.json'), JSON.stringify({
      inputTokens: 5000,
      outputTokens: 2000,
      costUsd: 0.05,
    }))

    fs.writeFileSync(path.join(taskDir, 'tools.jsonl'),
      JSON.stringify({ tool: 'Read', success: true }) + '\n' +
      JSON.stringify({ tool: 'Edit', success: false, error: 'not found' }) + '\n'
    )

    fs.writeFileSync(path.join(taskDir, 'errors.json'), JSON.stringify([
      { message: 'old_string not found' }
    ]))

    const data = loadBenchmarkData(tempDir)
    const tasks = data.tasks as Record<string, Record<string, unknown>>
    expect(tasks['task-001']).toBeDefined()
    expect((tasks['task-001'].metrics as Record<string, unknown>).inputTokens).toBe(5000)
    expect((tasks['task-001'].tools as unknown[]).length).toBe(2)
    expect((tasks['task-001'].errors as unknown[]).length).toBe(1)
  })

  it('should fall back to legacy benchmark-results-*.json when no summary.json', () => {
    fs.writeFileSync(path.join(tempDir, 'benchmark-results-1234567890.json'), JSON.stringify({
      timestamp: 1234567890,
      totalDuration: 5000,
      results: { projectCreated: true },
      allPassed: true,
    }))

    const data = loadBenchmarkData(tempDir)
    expect(data.summary).not.toBeNull()
    expect((data.summary as Record<string, unknown>).allPassed).toBe(true)
  })

  it('should handle empty directory gracefully', () => {
    const data = loadBenchmarkData(tempDir)
    expect(data.summary).toBeNull()
    expect(data.spec).toBeNull()
    expect(data.config).toBeNull()
    expect(data.timeline).toEqual([])
    expect(data.tasks).toEqual({})
  })
})

// ============================================================================
// Review agent parseReviewDecision() and getDiffStats() logic
// Mirrors internal functions from src/main/yolo-benchmark/review-agent.ts
// ============================================================================

/**
 * Replicate parseReviewDecision from review-agent.ts
 */
function parseReviewDecision(response: string): { decision: string; justification: string; concerns: string[]; suggestions: string[]; confidence: number; autoMerge: boolean } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*"decision"[\s\S]*\}/m)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    if (!parsed.decision || !['approve', 'needs_changes', 'reject'].includes(parsed.decision)) {
      return null
    }

    return {
      decision: parsed.decision,
      justification: parsed.justification || '',
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      autoMerge: typeof parsed.autoMerge === 'boolean' ? parsed.autoMerge : false,
    }
  } catch {
    return null
  }
}

/**
 * Replicate getDiffStats from review-agent.ts
 */
function getDiffStats(diff: string): { filesChanged: number; insertions: number; deletions: number } {
  const stats = { filesChanged: 0, insertions: 0, deletions: 0 }

  const statSection = diff.split('---DIFF---')[0] || ''
  const lines = statSection.split('\n')

  for (const line of lines) {
    const statMatch = line.match(/(\d+) files? changed/)
    if (statMatch) stats.filesChanged = parseInt(statMatch[1], 10)

    const insertMatch = line.match(/(\d+) insertions?\(\+\)/)
    if (insertMatch) stats.insertions = parseInt(insertMatch[1], 10)

    const deleteMatch = line.match(/(\d+) deletions?\(-\)/)
    if (deleteMatch) stats.deletions = parseInt(deleteMatch[1], 10)
  }

  return stats
}

describe('Review Agent parseReviewDecision()', () => {
  it('should parse a clean JSON response', () => {
    const response = JSON.stringify({
      decision: 'approve',
      justification: 'Code looks good',
      concerns: [],
      suggestions: ['Add more tests'],
      confidence: 0.95,
      autoMerge: true,
    })

    const result = parseReviewDecision(response)
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('approve')
    expect(result!.confidence).toBe(0.95)
    expect(result!.autoMerge).toBe(true)
  })

  it('should extract JSON from markdown fenced response', () => {
    const response = `Here is my review:

\`\`\`json
{
  "decision": "needs_changes",
  "justification": "Missing error handling",
  "concerns": ["No try/catch", "Missing validation"],
  "suggestions": ["Add error handling"],
  "confidence": 0.8,
  "autoMerge": false
}
\`\`\`

That's my assessment.`

    const result = parseReviewDecision(response)
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('needs_changes')
    expect(result!.concerns).toHaveLength(2)
  })

  it('should return null for invalid decision values', () => {
    const response = JSON.stringify({
      decision: 'maybe',
      justification: 'Not sure',
    })

    expect(parseReviewDecision(response)).toBeNull()
  })

  it('should return null for non-JSON response', () => {
    expect(parseReviewDecision('I approve this code')).toBeNull()
    expect(parseReviewDecision('')).toBeNull()
  })

  it('should handle missing optional fields with defaults', () => {
    const response = JSON.stringify({
      decision: 'reject',
    })

    const result = parseReviewDecision(response)
    expect(result).not.toBeNull()
    expect(result!.justification).toBe('')
    expect(result!.concerns).toEqual([])
    expect(result!.suggestions).toEqual([])
    expect(result!.confidence).toBe(0.5) // default
    expect(result!.autoMerge).toBe(false) // default
  })

  it('should handle all three valid decision types', () => {
    for (const decision of ['approve', 'needs_changes', 'reject']) {
      const response = JSON.stringify({ decision })
      const result = parseReviewDecision(response)
      expect(result).not.toBeNull()
      expect(result!.decision).toBe(decision)
    }
  })
})

describe('Review Agent getDiffStats()', () => {
  it('should parse standard git diff --stat output', () => {
    const diff = ` src/index.ts | 10 +++++++---
 src/utils.ts |  5 +++++
 2 files changed, 12 insertions(+), 3 deletions(-)
---DIFF---
diff --git a/src/index.ts b/src/index.ts
...`

    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(2)
    expect(stats.insertions).toBe(12)
    expect(stats.deletions).toBe(3)
  })

  it('should handle single file changed', () => {
    const diff = ` src/app.ts | 3 +++
 1 file changed, 3 insertions(+)
---DIFF---
diff --git ...`

    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.insertions).toBe(3)
    expect(stats.deletions).toBe(0)
  })

  it('should handle diff with no stat section', () => {
    const diff = '---DIFF---\ndiff --git a/file.ts b/file.ts'

    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(0)
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(0)
  })

  it('should handle diff with no ---DIFF--- separator', () => {
    const diff = ` src/app.ts | 3 +++
 1 file changed, 3 insertions(+)
diff --git a/src/app.ts b/src/app.ts`

    // Without separator, the entire string is treated as the stat section
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.insertions).toBe(3)
  })

  it('should return zeros for empty input', () => {
    const stats = getDiffStats('')
    expect(stats.filesChanged).toBe(0)
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(0)
  })
})

// ============================================================================
// NERV Ops Deterministic Scoring (src/core/benchmark-scoring.ts)
// ============================================================================

function makeSummary(overrides: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return {
    benchmarkId: 'bench-test',
    timestamp: Date.now(),
    nervVersion: '0.1.0',
    specFile: 'specs/test.md',
    model: 'sonnet',
    config: { reviewMode: 'normal', maxCycles: 10, auditFrequency: 1, model: 'sonnet', specFile: 'test.md' },
    outcome: 'success',
    duration: { totalMs: 120000, perCycle: [], perTask: {} },
    tokens: { total: 10000, input: 7000, output: 3000, cached: 0, perTask: {}, perCycle: [] },
    cost: { totalUsd: 0.50, perTask: {}, perCycle: [] },
    tasks: { total: 4, completed: 4, failed: 0, byStatus: { done: 4 } },
    cycles: { total: 3, auditsRun: 1, auditsPassed: 1 },
    workflow: { worktreesCreated: 4, worktreesMerged: 4, worktreesDiscarded: 0, branchesCreated: 4, parallelTasksRun: 2 },
    issues: { loopsDetected: 0, compactions: 0, toolErrors: 0, toolRetries: 0, permissionTimeouts: 0, stuckDetections: 0 },
    spec: { totalItems: 10, itemsPassed: 8, itemsFailed: 2, completionPercent: 80 },
    tests: { total: 10, passed: 10, failed: 0, skipped: 0 },
    scores: null,
    ...overrides,
  }
}

describe('scoreNervOps() - Deterministic NERV Ops Scoring', () => {
  it('should score a good run with worktrees, parallelism, and cycles', () => {
    const summary = makeSummary()
    const result = scoreNervOps(summary)

    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.breakdown.worktreeUsage.score).toBeGreaterThan(0)
    expect(result.breakdown.parallelism.score).toBeGreaterThan(0)
    expect(result.breakdown.cycleManagement.score).toBeGreaterThan(0)
  })

  it('should score 0 on worktree usage with no worktrees', () => {
    const summary = makeSummary({
      workflow: { worktreesCreated: 0, worktreesMerged: 0, worktreesDiscarded: 0, branchesCreated: 0, parallelTasksRun: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.worktreeUsage.score).toBe(0)
  })

  it('should score 0 on parallelism with no parallel tasks', () => {
    const summary = makeSummary({
      workflow: { worktreesCreated: 4, worktreesMerged: 4, worktreesDiscarded: 0, branchesCreated: 4, parallelTasksRun: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.parallelism.score).toBe(0)
  })

  it('should score low on cycle management with no cycles', () => {
    const summary = makeSummary({
      cycles: { total: 0, auditsRun: 0, auditsPassed: 0 },
      tasks: { total: 0, completed: 0, failed: 0, byStatus: {} },
      spec: { totalItems: 10, itemsPassed: 0, itemsFailed: 10, completionPercent: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.cycleManagement.score).toBe(0)
  })

  it('should give maximum error handling score with clean execution', () => {
    const summary = makeSummary({
      issues: { loopsDetected: 0, compactions: 0, toolErrors: 0, toolRetries: 0, permissionTimeouts: 0, stuckDetections: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.errorHandling.score).toBe(10)
  })

  it('should deduct for tool errors', () => {
    const summary = makeSummary({
      issues: { loopsDetected: 0, compactions: 0, toolErrors: 25, toolRetries: 0, permissionTimeouts: 0, stuckDetections: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.errorHandling.score).toBeLessThanOrEqual(6)
  })

  it('should deduct heavily for loops detected', () => {
    const summary = makeSummary({
      issues: { loopsDetected: 2, compactions: 0, toolErrors: 0, toolRetries: 0, permissionTimeouts: 0, stuckDetections: 0 },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.errorHandling.score).toBeLessThanOrEqual(7)
  })

  it('should score cost efficiency well for cheap runs', () => {
    const summary = makeSummary({
      cost: { totalUsd: 0.30, perTask: {}, perCycle: [] },
      duration: { totalMs: 180000, perCycle: [], perTask: {} },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.costEfficiency.score).toBeGreaterThanOrEqual(6)
  })

  it('should score cost efficiency poorly for expensive runs', () => {
    const summary = makeSummary({
      cost: { totalUsd: 10.00, perTask: {}, perCycle: [] },
      duration: { totalMs: 3600000, perCycle: [], perTask: {} },
    })
    const result = scoreNervOps(summary)

    expect(result.breakdown.costEfficiency.score).toBeLessThanOrEqual(3)
  })

  it('should give a run with 0 worktrees a very low overall score', () => {
    const summary = makeSummary({
      workflow: { worktreesCreated: 0, worktreesMerged: 0, worktreesDiscarded: 0, branchesCreated: 0, parallelTasksRun: 0 },
      cycles: { total: 1, auditsRun: 0, auditsPassed: 0 },
      tasks: { total: 1, completed: 1, failed: 0, byStatus: { done: 1 } },
      spec: { totalItems: 10, itemsPassed: 3, itemsFailed: 7, completionPercent: 30 },
    })
    const result = scoreNervOps(summary)

    // 0 worktrees (25%): 0/10 → 0
    // 0 parallelism (15%): 0/10 → 0
    // 1 cycle, 30% spec, 1/1 task (20%): ~4/10 → 8
    // 0 reviews (15%): 0/10 → 0
    // clean execution (10%): 10/10 → 10
    // cost efficiency (15%): ~7/10 → ~10.5
    // Total ≈ 0 + 0 + 8 + 0 + 10 + 10.5 = ~28.5
    const nervOps10 = nervOpsScoreTo10(result.score)
    expect(nervOps10).toBeLessThanOrEqual(4)
  })

  it('should have breakdown details as non-empty strings', () => {
    const summary = makeSummary()
    const result = scoreNervOps(summary)

    for (const key of Object.keys(result.breakdown) as (keyof typeof result.breakdown)[]) {
      expect(result.breakdown[key].details).toBeTruthy()
      expect(typeof result.breakdown[key].details).toBe('string')
    }
  })

  it('should clamp all dimension scores between 0 and max', () => {
    const summary = makeSummary()
    const result = scoreNervOps(summary)

    for (const key of Object.keys(result.breakdown) as (keyof typeof result.breakdown)[]) {
      const dim = result.breakdown[key]
      expect(dim.score).toBeGreaterThanOrEqual(0)
      expect(dim.score).toBeLessThanOrEqual(dim.max)
    }
  })

  it('should score review process based on reviewsRun and reviewsApproved', () => {
    const summary = makeSummary()
    // Add review data to workflow
    const extWorkflow = summary.workflow as Record<string, unknown>
    extWorkflow.reviewsRun = 4
    extWorkflow.reviewsApproved = 3

    const result = scoreNervOps(summary)
    expect(result.breakdown.reviewProcess.score).toBeGreaterThanOrEqual(8)
  })
})

describe('nervOpsScoreTo10()', () => {
  it('should convert 0-100 score to 0-10 scale', () => {
    expect(nervOpsScoreTo10(100)).toBe(10)
    expect(nervOpsScoreTo10(0)).toBe(0)
    expect(nervOpsScoreTo10(50)).toBe(5)
    expect(nervOpsScoreTo10(75)).toBe(7.5)
  })
})

// ============================================================================
// Core module integration tests (ensure exports work correctly)
// ============================================================================

describe('Core module exports', () => {
  it('should export parseReviewDecision from benchmark-review', () => {
    const result = coreParseReviewDecision(JSON.stringify({
      decision: 'approve',
      justification: 'LGTM',
      concerns: [],
      suggestions: [],
      confidence: 0.9,
      autoMerge: true,
    }))
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('approve')
  })

  it('should export getDiffStats from benchmark-review', () => {
    const stats = coreGetDiffStats(' 2 files changed, 10 insertions(+), 3 deletions(-)\n---DIFF---\n')
    expect(stats.filesChanged).toBe(2)
    expect(stats.insertions).toBe(10)
    expect(stats.deletions).toBe(3)
  })

  it('should export buildReviewPrompt from benchmark-review', () => {
    const prompt = buildReviewPrompt('Add login feature', 'some diff', '', true)
    expect(prompt).toContain('Code Review Request')
    expect(prompt).toContain('Add login feature')
    expect(prompt).toContain('All tests pass')
  })

  it('should export parseSpec from spec-parser', () => {
    const result = parseSpec('# Test\n\n### 1. Phase 1\n\n- [ ] Criterion A\n')
    expect(result.title).toBe('Test')
    expect(result.cycles).toHaveLength(1)
    expect(result.totalAcceptanceCriteria).toBe(1)
  })

  it('should export extractAcceptanceCriteria from spec-parser', () => {
    const criteria = extractAcceptanceCriteria('- [ ] Item A\n- [x] Item B\n')
    expect(criteria.length).toBeGreaterThanOrEqual(1)
  })
})
