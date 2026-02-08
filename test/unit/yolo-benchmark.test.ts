/**
 * Unit tests for src/main/yolo-benchmark.ts
 *
 * Tests the YOLO benchmark grading and comparison logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { YoloBenchmarkResult, YoloBenchmarkGrade } from '../../src/shared/types'
import { YOLO_BENCHMARK_DEFAULTS, YOLO_BENCHMARK_GRADE_WEIGHTS } from '../../src/shared/constants'

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock database service
vi.mock('../../src/main/database', () => ({
  databaseService: {
    getYoloBenchmarkResult: vi.fn(),
    getYoloBenchmarkConfig: vi.fn(),
    createYoloBenchmarkResult: vi.fn(),
    updateYoloBenchmarkResult: vi.fn(),
    completeYoloBenchmark: vi.fn(),
    getRunningYoloBenchmarks: vi.fn(() => []),
    createCycle: vi.fn(() => ({ id: 'cycle-1' })),
    getNextCycleNumber: vi.fn(() => 1),
    createTaskWithType: vi.fn(() => ({ id: 'task-1' })),
    getProjectRepos: vi.fn(() => []),
    updateTaskWorktree: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTaskSession: vi.fn(),
    completeCycle: vi.fn(),
  },
}))

// Mock worktree
vi.mock('../../src/main/worktree', () => ({
  createWorktreesForTask: vi.fn(() => Promise.resolve([])),
  cleanupWorktrees: vi.fn(),
}))

// Mock claude
vi.mock('../../src/main/claude', () => ({
  spawnClaude: vi.fn(() => ({ success: false })),
  hasClaudeSession: vi.fn(() => false),
  getClaudeSessionInfo: vi.fn(() => null),
  killClaudeSession: vi.fn(),
}))

// Mock nerv-md
vi.mock('../../src/main/nerv-md', () => ({
  generateNervMd: vi.fn(() => ''),
}))

// Mock utils
vi.mock('../../src/main/utils', () => ({
  broadcastToRenderers: vi.fn(),
}))

// Now import the functions to test
import { calculateBenchmarkGrade, compareBenchmarks, calculateSpecCompletion } from '../../src/main/yolo-benchmark'
import { databaseService } from '../../src/main/database'
import * as fs from 'fs'
import * as path from 'path'

// Mock fs for spec completion tests
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn()
  }
})

describe('yolo-benchmark', () => {
  describe('calculateBenchmarkGrade', () => {
    /**
     * Create a mock benchmark result for testing
     */
    function createMockResult(overrides: Partial<YoloBenchmarkResult> = {}): YoloBenchmarkResult {
      return {
        id: 'result-1',
        configId: 'config-1',
        status: 'success',
        startedAt: Date.now(),
        completedAt: Date.now() + 60000,
        cyclesCompleted: 5,
        tasksCompleted: 5,
        totalCostUsd: 1.0,
        totalDurationMs: 60000,
        testsPassed: 10,
        testsFailed: 0,
        specCompletionPct: 100,
        stopReason: null,
        ...overrides,
      }
    }

    it('calculates perfect grade for ideal result', () => {
      const result = createMockResult({
        testsPassed: 10,
        testsFailed: 0,
        specCompletionPct: 100,
        totalCostUsd: 0, // Free = max efficiency
      })

      const grade = calculateBenchmarkGrade(result)

      expect(grade.specCompletion).toBe(100)
      expect(grade.testPassRate).toBe(100)
      expect(grade.costEfficiency).toBe(100)
      expect(grade.overallScore).toBe(100)
    })

    it('calculates grade with partial test pass rate', () => {
      const result = createMockResult({
        testsPassed: 8,
        testsFailed: 2,
        specCompletionPct: 100,
        totalCostUsd: 0,
      })

      const grade = calculateBenchmarkGrade(result)

      expect(grade.testPassRate).toBe(80) // 8/10 = 80%
      expect(grade.specCompletion).toBe(100)
    })

    it('calculates grade with zero tests', () => {
      const result = createMockResult({
        testsPassed: 0,
        testsFailed: 0,
        specCompletionPct: 50,
        totalCostUsd: 2.5,
      })

      const grade = calculateBenchmarkGrade(result)

      expect(grade.testPassRate).toBe(0) // No tests = 0 pass rate
    })

    it('calculates cost efficiency correctly', () => {
      // At max cost ($5), efficiency should be 0%
      const maxCostResult = createMockResult({
        totalCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd,
        testsPassed: 0,
        testsFailed: 0,
        specCompletionPct: 0,
      })
      const maxCostGrade = calculateBenchmarkGrade(maxCostResult)
      expect(maxCostGrade.costEfficiency).toBe(0)

      // At zero cost, efficiency should be 100%
      const zeroCostResult = createMockResult({
        totalCostUsd: 0,
        testsPassed: 0,
        testsFailed: 0,
        specCompletionPct: 0,
      })
      const zeroCostGrade = calculateBenchmarkGrade(zeroCostResult)
      expect(zeroCostGrade.costEfficiency).toBe(100)

      // At half cost ($2.50), efficiency should be 50%
      const halfCostResult = createMockResult({
        totalCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd / 2,
        testsPassed: 0,
        testsFailed: 0,
        specCompletionPct: 0,
      })
      const halfCostGrade = calculateBenchmarkGrade(halfCostResult)
      expect(halfCostGrade.costEfficiency).toBe(50)
    })

    it('clamps cost efficiency to 0-100 range', () => {
      // Cost over max should still be 0% efficiency (not negative)
      const overCostResult = createMockResult({
        totalCostUsd: 10.0, // Double the max
        testsPassed: 0,
        testsFailed: 0,
        specCompletionPct: 0,
      })
      const grade = calculateBenchmarkGrade(overCostResult)
      expect(grade.costEfficiency).toBe(0)
    })

    it('calculates weighted overall score correctly', () => {
      const result = createMockResult({
        specCompletionPct: 100,
        testsPassed: 10,
        testsFailed: 0,
        totalCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd / 2, // 50% efficiency
      })

      const grade = calculateBenchmarkGrade(result)

      // Expected: 100 * 0.4 + 100 * 0.4 + 50 * 0.2 = 40 + 40 + 10 = 90
      const expected =
        100 * YOLO_BENCHMARK_GRADE_WEIGHTS.specCompletion +
        100 * YOLO_BENCHMARK_GRADE_WEIGHTS.testPassRate +
        50 * YOLO_BENCHMARK_GRADE_WEIGHTS.costEfficiency

      expect(grade.overallScore).toBeCloseTo(expected)
    })

    it('handles all failures gracefully', () => {
      const result = createMockResult({
        specCompletionPct: 0,
        testsPassed: 0,
        testsFailed: 10,
        totalCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd,
      })

      const grade = calculateBenchmarkGrade(result)

      expect(grade.specCompletion).toBe(0)
      expect(grade.testPassRate).toBe(0)
      expect(grade.costEfficiency).toBe(0)
      expect(grade.overallScore).toBe(0)
    })
  })

  describe('compareBenchmarks', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    /**
     * Create a mock benchmark result for testing
     */
    function createMockResult(id: string, overrides: Partial<YoloBenchmarkResult> = {}): YoloBenchmarkResult {
      return {
        id,
        configId: 'config-1',
        status: 'success',
        startedAt: Date.now(),
        completedAt: Date.now() + 60000,
        cyclesCompleted: 5,
        tasksCompleted: 5,
        totalCostUsd: 1.0,
        totalDurationMs: 60000,
        testsPassed: 10,
        testsFailed: 0,
        specCompletionPct: 100,
        stopReason: null,
        ...overrides,
      }
    }

    it('compares multiple benchmark results', () => {
      const result1 = createMockResult('result-1', {
        specCompletionPct: 100,
        testsPassed: 10,
        testsFailed: 0,
        totalCostUsd: 1.0,
      })

      const result2 = createMockResult('result-2', {
        specCompletionPct: 50,
        testsPassed: 5,
        testsFailed: 5,
        totalCostUsd: 2.0,
      })

      vi.mocked(databaseService.getYoloBenchmarkResult).mockImplementation((id: string) => {
        if (id === 'result-1') return result1
        if (id === 'result-2') return result2
        return undefined
      })

      const comparison = compareBenchmarks(['result-1', 'result-2'])

      expect(comparison.results).toHaveLength(2)
      expect(comparison.grades['result-1']).toBeDefined()
      expect(comparison.grades['result-2']).toBeDefined()
      expect(comparison.winner).toBe('result-1') // result-1 has better scores
    })

    it('returns null winner when no results found', () => {
      vi.mocked(databaseService.getYoloBenchmarkResult).mockReturnValue(undefined)

      const comparison = compareBenchmarks(['nonexistent-1', 'nonexistent-2'])

      expect(comparison.results).toHaveLength(0)
      expect(comparison.winner).toBeNull()
    })

    it('handles single result comparison', () => {
      const result = createMockResult('result-1', {
        specCompletionPct: 75,
        testsPassed: 8,
        testsFailed: 2,
        totalCostUsd: 1.5,
      })

      vi.mocked(databaseService.getYoloBenchmarkResult).mockImplementation((id: string) => {
        if (id === 'result-1') return result
        return undefined
      })

      const comparison = compareBenchmarks(['result-1'])

      expect(comparison.results).toHaveLength(1)
      expect(comparison.winner).toBe('result-1')
    })

    it('correctly identifies winner among multiple close results', () => {
      const result1 = createMockResult('result-1', {
        specCompletionPct: 80,
        testsPassed: 8,
        testsFailed: 2,
        totalCostUsd: 2.0,
      })

      const result2 = createMockResult('result-2', {
        specCompletionPct: 85,
        testsPassed: 7,
        testsFailed: 3,
        totalCostUsd: 1.5,
      })

      const result3 = createMockResult('result-3', {
        specCompletionPct: 90,
        testsPassed: 9,
        testsFailed: 1,
        totalCostUsd: 3.0,
      })

      vi.mocked(databaseService.getYoloBenchmarkResult).mockImplementation((id: string) => {
        if (id === 'result-1') return result1
        if (id === 'result-2') return result2
        if (id === 'result-3') return result3
        return undefined
      })

      const comparison = compareBenchmarks(['result-1', 'result-2', 'result-3'])

      expect(comparison.results).toHaveLength(3)
      // result-3 has 90% spec + 90% tests but higher cost
      // The winner depends on weighted calculation
      expect(comparison.winner).toBeDefined()
      expect(['result-1', 'result-2', 'result-3']).toContain(comparison.winner)
    })

    it('handles empty input array', () => {
      const comparison = compareBenchmarks([])

      expect(comparison.results).toHaveLength(0)
      expect(comparison.grades).toEqual({})
      expect(comparison.winner).toBeNull()
    })
  })

  describe('test result parsing patterns', () => {
    /**
     * Test the regex patterns used for parsing test output
     * These are extracted from runTests() for isolated testing
     */

    it('parses Jest/Vitest format: "X passed, Y failed"', () => {
      const output = 'Tests: 47 passed, 3 failed, 50 total'
      const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/i)

      expect(jestMatch).not.toBeNull()
      expect(parseInt(jestMatch![1], 10)).toBe(47)
      expect(parseInt(jestMatch![2], 10)).toBe(3)
    })

    it('parses Mocha format: "X passing, Y failing"', () => {
      // Note: The regex uses .*? which doesn't match newlines,
      // so Mocha output needs to be on same logical line
      const output = '  42 passing (2s), 8 failing'
      const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/i)

      expect(mochaMatch).not.toBeNull()
      expect(parseInt(mochaMatch![1], 10)).toBe(42)
      expect(parseInt(mochaMatch![2], 10)).toBe(8)
    })

    it('matches Mocha format across multiple lines', () => {
      // The regex now uses 's' flag (dotall) so .*? matches newlines
      const output = '  42 passing (2s)\n  8 failing'
      const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/is)

      expect(mochaMatch).not.toBeNull()
      expect(parseInt(mochaMatch![1], 10)).toBe(42)
      expect(parseInt(mochaMatch![2], 10)).toBe(8)
    })

    it('handles Jest format with no failures', () => {
      const output = 'Tests: 10 passed, 0 failed'
      const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/i)

      expect(jestMatch).not.toBeNull()
      expect(parseInt(jestMatch![1], 10)).toBe(10)
      expect(parseInt(jestMatch![2], 10)).toBe(0)
    })

    it('handles output with extra whitespace', () => {
      const output = 'Tests:   25   passed,   5   failed'
      const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/i)

      expect(jestMatch).not.toBeNull()
      expect(parseInt(jestMatch![1], 10)).toBe(25)
      expect(parseInt(jestMatch![2], 10)).toBe(5)
    })

    it('handles multiline output', () => {
      const output = `
PASS src/test.spec.ts
FAIL src/other.spec.ts

Test Suites: 1 failed, 1 passed, 2 total
Tests:       3 passed, 2 failed, 5 total
Snapshots:   0 total
Time:        2.5 s
`
      const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/i)

      expect(jestMatch).not.toBeNull()
      expect(parseInt(jestMatch![1], 10)).toBe(3)
      expect(parseInt(jestMatch![2], 10)).toBe(2)
    })

    it('does not match unrelated numbers', () => {
      const output = 'Running 100 tests at port 8080'
      const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/is)
      const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/is)

      expect(jestMatch).toBeNull()
      expect(mochaMatch).toBeNull()
    })

    it('handles Mocha format with only passing tests', () => {
      const output = '  66 passing (1s)'
      const mochaPassOnlyMatch = output.match(/(\d+)\s*passing/i)
      const hasFailing = output.match(/failing/i)

      expect(mochaPassOnlyMatch).not.toBeNull()
      expect(parseInt(mochaPassOnlyMatch![1], 10)).toBe(66)
      expect(hasFailing).toBeNull()
    })

    it('handles Mocha format with blank lines between passing and failing', () => {
      const output = `
  66 passing (699ms)

  3 failing
`
      const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/is)

      expect(mochaMatch).not.toBeNull()
      expect(parseInt(mochaMatch![1], 10)).toBe(66)
      expect(parseInt(mochaMatch![2], 10)).toBe(3)
    })
  })

  describe('calculateSpecCompletion', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('calculates 100% when all checkboxes are checked', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(`
# Spec
- [x] Feature 1
- [x] Feature 2
- [x] Feature 3
`)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(100)
    })

    it('calculates 0% when no checkboxes are checked', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(`
# Spec
- [ ] Feature 1
- [ ] Feature 2
- [ ] Feature 3
`)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(0)
    })

    it('calculates correct percentage for mixed checkboxes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(`
# Spec
- [x] Feature 1
- [ ] Feature 2
- [x] Feature 3
- [ ] Feature 4
`)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(50) // 2 of 4 = 50%
    })

    it('returns 0 when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(0)
    })

    it('returns 0 when no checkboxes found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(`
# Spec
This is just plain text without checkboxes.
`)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(0)
    })

    it('handles uppercase X in checkboxes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(`
- [X] Feature 1
- [x] Feature 2
- [ ] Feature 3
`)

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBeCloseTo(66.67, 1) // 2 of 3 ≈ 66.67%
    })

    it('handles read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = calculateSpecCompletion('SPEC.md', '/project')

      expect(result).toBe(0)
    })
  })
})
