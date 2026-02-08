/**
 * Unit tests for code health analysis (PRD Section 5)
 * Tests src/main/audit/code-health.ts static analysis functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

// Mock fs before importing the module
const mockExistsSync = vi.fn(() => false)
const mockReadFileSync = vi.fn(() => '')
const mockReaddirSync = vi.fn(() => [] as string[])
const mockStatSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}))

import {
  countAnyTypes,
  countComplexFunctions,
  estimateTestCoverage,
  countDeadExports,
  countDryViolations,
  analyzeRepoHealth,
  mergeHealthChecks,
} from '../../src/main/audit/code-health'
import type { CodeHealthCheck } from '../../src/shared/types'

// Helper to create mock source files
function makeFile(relativePath: string, content: string, isTest = false) {
  return {
    path: join('/repo', relativePath),
    relativePath,
    content,
    lines: content.split('\n'),
    isTest,
  }
}

describe('Code Health Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('countAnyTypes', () => {
    it('should count `: any` type annotations', () => {
      const files = [
        makeFile('src/foo.ts', 'const x: any = 5;\nconst y: string = "hi";'),
      ]
      expect(countAnyTypes(files)).toBe(1)
    })

    it('should count `as any` type assertions', () => {
      const files = [
        makeFile('src/foo.ts', 'const x = value as any;\nconst y = value as string;'),
      ]
      expect(countAnyTypes(files)).toBe(1)
    })

    it('should count multiple any usages on one line', () => {
      const files = [
        makeFile('src/foo.ts', 'function foo(a: any, b: any): any { return a; }'),
      ]
      // `: any,` and `: any)` and `: any ` (return type before {)
      expect(countAnyTypes(files)).toBeGreaterThanOrEqual(2)
    })

    it('should skip test files', () => {
      const files = [
        makeFile('test/foo.test.ts', 'const x: any = 5;', true),
      ]
      expect(countAnyTypes(files)).toBe(0)
    })

    it('should skip comments', () => {
      const files = [
        makeFile('src/foo.ts', '// const x: any = 5;\n* any type here\nconst y: string = "hi";'),
      ]
      expect(countAnyTypes(files)).toBe(0)
    })

    it('should skip non-TypeScript files', () => {
      const files = [
        makeFile('src/foo.js', 'const x: any = 5;'),
      ]
      expect(countAnyTypes(files)).toBe(0)
    })

    it('should return 0 for clean files', () => {
      const files = [
        makeFile('src/foo.ts', 'const x: string = "hi";\nconst y: number = 5;'),
      ]
      expect(countAnyTypes(files)).toBe(0)
    })
  })

  describe('countComplexFunctions', () => {
    it('should detect functions exceeding threshold', () => {
      const body = Array(55).fill('  console.log("line");').join('\n')
      const content = `function longFunction() {\n${body}\n}`
      const files = [makeFile('src/foo.ts', content)]
      expect(countComplexFunctions(files, 50)).toBe(1)
    })

    it('should not count short functions', () => {
      const content = 'function short() {\n  return 1;\n}'
      const files = [makeFile('src/foo.ts', content)]
      expect(countComplexFunctions(files, 50)).toBe(0)
    })

    it('should skip test files', () => {
      const body = Array(55).fill('  console.log("line");').join('\n')
      const content = `function longFunction() {\n${body}\n}`
      const files = [makeFile('test/foo.test.ts', content, true)]
      expect(countComplexFunctions(files, 50)).toBe(0)
    })

    it('should detect exported async functions', () => {
      const body = Array(55).fill('  await fetch("url");').join('\n')
      const content = `export async function fetchAll() {\n${body}\n}`
      const files = [makeFile('src/api.ts', content)]
      expect(countComplexFunctions(files, 50)).toBe(1)
    })
  })

  describe('estimateTestCoverage', () => {
    it('should read coverage-summary.json when available', () => {
      mockExistsSync.mockImplementation((path: string) =>
        path.includes('coverage-summary.json')
      )
      mockReadFileSync.mockReturnValue(JSON.stringify({
        total: { lines: { pct: 85 } },
      }))

      const result = estimateTestCoverage('/repo', [])
      expect(result).toBe(85)
    })

    it('should fall back to file ratio estimation', () => {
      mockExistsSync.mockReturnValue(false)

      const files = [
        makeFile('src/a.ts', 'code'),
        makeFile('src/b.ts', 'code'),
        makeFile('test/a.test.ts', 'test', true),
      ]

      const result = estimateTestCoverage('/repo', files)
      // 1 test file / 2 source files = 50%
      expect(result).toBe(50)
    })

    it('should return 0 for no source files', () => {
      mockExistsSync.mockReturnValue(false)
      expect(estimateTestCoverage('/repo', [])).toBe(0)
    })

    it('should cap at 100%', () => {
      mockExistsSync.mockReturnValue(false)

      const files = [
        makeFile('src/a.ts', 'code'),
        makeFile('test/a.test.ts', 'test', true),
        makeFile('test/a.spec.ts', 'test', true),
      ]

      const result = estimateTestCoverage('/repo', files)
      expect(result).toBeLessThanOrEqual(100)
    })
  })

  describe('countDeadExports', () => {
    it('should count exports not referenced in other files', () => {
      const files = [
        makeFile('src/utils.ts', 'export function unusedHelper() {}\nexport function usedHelper() {}'),
        makeFile('src/main.ts', 'import { usedHelper } from "./utils";\nusedHelper();'),
      ]
      expect(countDeadExports(files)).toBe(1) // unusedHelper
    })

    it('should not count exports referenced elsewhere', () => {
      const files = [
        makeFile('src/utils.ts', 'export function helper() {}'),
        makeFile('src/main.ts', 'import { helper } from "./utils";\nhelper();'),
      ]
      expect(countDeadExports(files)).toBe(0)
    })

    it('should skip index files', () => {
      const files = [
        makeFile('src/index.ts', 'export function main() {}'),
      ]
      expect(countDeadExports(files)).toBe(0)
    })

    it('should skip test files', () => {
      const files = [
        makeFile('src/utils.ts', 'export function helper() {}'),
        makeFile('test/utils.test.ts', 'import { helper } from "../src/utils";', true),
      ]
      // helper is only used in test file, but test files are excluded from source analysis
      // So it won't find a reference in source files → counts as dead
      expect(countDeadExports(files)).toBe(1)
    })

    it('should skip short export names', () => {
      const files = [
        makeFile('src/utils.ts', 'export const id = 1;\nexport const ab = 2;'),
      ]
      // 'id' and 'ab' are <= 2 chars, should be skipped
      expect(countDeadExports(files)).toBe(0)
    })
  })

  describe('countDryViolations', () => {
    it('should detect duplicate code blocks', () => {
      const block = '  const result = await fetch(apiEndpointUrl);\n  const data = await result.json();\n  return data.items.filter(Boolean);'
      const files = [
        makeFile('src/a.ts', block),
        makeFile('src/b.ts', block),
      ]
      expect(countDryViolations(files)).toBeGreaterThan(0)
    })

    it('should not flag unique code', () => {
      const files = [
        makeFile('src/a.ts', '  const x = computeAlpha();\n  const y = processAlpha(x);\n  return formatAlpha(y);'),
        makeFile('src/b.ts', '  const a = computeBeta();\n  const b = processBeta(a);\n  return formatBeta(b);'),
      ]
      expect(countDryViolations(files)).toBe(0)
    })

    it('should skip imports and short lines', () => {
      const files = [
        makeFile('src/a.ts', 'import { foo } from "bar";\n{\n}'),
        makeFile('src/b.ts', 'import { foo } from "bar";\n{\n}'),
      ]
      expect(countDryViolations(files)).toBe(0)
    })

    it('should skip test files', () => {
      const block = '  const result = await fetch(url);\n  const data = await result.json();\n  return data.items;'
      const files = [
        makeFile('test/a.test.ts', block, true),
        makeFile('test/b.test.ts', block, true),
      ]
      expect(countDryViolations(files)).toBe(0)
    })
  })

  describe('analyzeRepoHealth', () => {
    it('should return failed check for non-existent path', () => {
      mockExistsSync.mockReturnValue(false)
      const result = analyzeRepoHealth('/nonexistent')
      expect(result.passed).toBe(false)
      expect(result.testCoverage).toBe(0)
    })

    it('should analyze a repo with source files', () => {
      // Mock a simple repo structure
      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/repo') return true
        return false
      })
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/repo') return ['src']
        if (dir === join('/repo', 'src')) return ['main.ts']
        return []
      })
      mockStatSync.mockImplementation((path: string) => ({
        isDirectory: () => !path.endsWith('.ts'),
        isFile: () => path.endsWith('.ts'),
      }))
      mockReadFileSync.mockReturnValue('const x: string = "hello";\n')

      const result = analyzeRepoHealth('/repo')
      expect(result.typeErrors).toBe(0)
      expect(typeof result.testCoverage).toBe('number')
      expect(typeof result.dryViolations).toBe('number')
    })
  })

  describe('mergeHealthChecks', () => {
    it('should return default values for empty array', () => {
      const result = mergeHealthChecks([])
      expect(result.testCoverage).toBe(0)
      expect(result.dryViolations).toBe(0)
      expect(result.typeErrors).toBe(0)
      expect(result.deadCodeCount).toBe(0)
      expect(result.complexFunctions).toBe(0)
      expect(result.passed).toBe(true)
    })

    it('should average coverage and sum other metrics', () => {
      const checks: CodeHealthCheck[] = [
        { testCoverage: 80, dryViolations: 2, typeErrors: 1, deadCodeCount: 3, complexFunctions: 1, passed: true },
        { testCoverage: 60, dryViolations: 3, typeErrors: 2, deadCodeCount: 5, complexFunctions: 2, passed: false },
      ]
      const result = mergeHealthChecks(checks)
      expect(result.testCoverage).toBe(70) // (80+60)/2
      expect(result.dryViolations).toBe(5) // 2+3
      expect(result.typeErrors).toBe(3)    // 1+2
      expect(result.deadCodeCount).toBe(8) // 3+5
      expect(result.complexFunctions).toBe(3) // 1+2
      expect(result.passed).toBe(false) // one failed
    })

    it('should pass only when all checks pass', () => {
      const checks: CodeHealthCheck[] = [
        { testCoverage: 90, dryViolations: 0, typeErrors: 0, deadCodeCount: 0, complexFunctions: 0, passed: true },
        { testCoverage: 85, dryViolations: 1, typeErrors: 0, deadCodeCount: 2, complexFunctions: 0, passed: true },
      ]
      const result = mergeHealthChecks(checks)
      expect(result.passed).toBe(true)
    })
  })
})
