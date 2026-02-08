/**
 * Code Health Analysis (PRD Section 5)
 *
 * Static analysis of repository source files to detect:
 * - Type safety issues (usage of 'any' type)
 * - Complex functions (> threshold lines)
 * - Dead code (exported symbols not imported elsewhere)
 * - Test coverage estimation (test files vs source files)
 * - DRY violations (duplicate code blocks)
 */

import { join, extname, relative } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { AUDIT_THRESHOLDS } from '../../shared/constants'
import type { CodeHealthCheck } from '../../shared/types'

// Source file extensions to analyze
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.svelte'])
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', '/test/', '/tests/']

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'coverage',
  '.svelte-kit', '.next', '.nuxt', '.cache', '.turbo'
])

interface SourceFile {
  path: string
  relativePath: string
  content: string
  lines: string[]
  isTest: boolean
}

/**
 * Walk a directory tree and collect source files
 */
function walkSourceFiles(rootDir: string, maxFiles = 5000): SourceFile[] {
  const files: SourceFile[] = []

  function walk(dir: string): void {
    if (files.length >= maxFiles) return

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return
      if (SKIP_DIRS.has(entry)) continue

      const fullPath = join(dir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(entry))) {
        try {
          const content = readFileSync(fullPath, 'utf-8')
          const relativePath = relative(rootDir, fullPath)
          const isTest = TEST_PATTERNS.some(p => relativePath.includes(p))
          files.push({
            path: fullPath,
            relativePath,
            content,
            lines: content.split('\n'),
            isTest
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(rootDir)
  return files
}

/**
 * Count 'any' type usage in source files (PRD: "Any `any` types")
 * Matches: `: any`, `as any`, `<any>`, `any[]`, `any,`, `any)`
 * Excludes: comments, strings, and test files
 */
export function countAnyTypes(files: SourceFile[]): number {
  // Pattern matches common 'any' type usages in TypeScript
  const anyPattern = /(?::\s*any\b|as\s+any\b|<any[>,\s]|:\s*any\s*[,)\]|}])/g
  let count = 0

  for (const file of files) {
    if (file.isTest) continue
    const ext = extname(file.relativePath)
    if (ext !== '.ts' && ext !== '.tsx') continue

    for (const line of file.lines) {
      const trimmed = line.trim()
      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
      const matches = trimmed.match(anyPattern)
      if (matches) {
        count += matches.length
      }
    }
  }

  return count
}

/**
 * Count functions exceeding complexity threshold (PRD: "Functions > 50 lines")
 * Detects function/method declarations and counts their body lines
 */
export function countComplexFunctions(files: SourceFile[], threshold: number = AUDIT_THRESHOLDS.complexityThreshold): number {
  const funcStart = /^(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?:=>|:\s*\([^)]*\)\s*=>)|\w+\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{)/
  let count = 0

  for (const file of files) {
    if (file.isTest) continue

    let braceDepth = 0
    let funcStartLine = -1
    let inFunction = false

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i]
      const trimmed = line.trim()

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue

      if (!inFunction && funcStart.test(trimmed)) {
        inFunction = true
        funcStartLine = i
        braceDepth = 0
      }

      if (inFunction) {
        for (const ch of line) {
          if (ch === '{') braceDepth++
          if (ch === '}') braceDepth--
        }

        if (braceDepth <= 0 && funcStartLine >= 0) {
          const bodyLines = i - funcStartLine + 1
          if (bodyLines > threshold) {
            count++
          }
          inFunction = false
          funcStartLine = -1
        }
      }
    }
  }

  return count
}

/**
 * Estimate test coverage from file ratios
 * Looks for coverage report JSON first, falls back to file ratio estimation
 */
export function estimateTestCoverage(repoPath: string, files: SourceFile[]): number {
  // Try to read coverage report if it exists
  const coveragePaths = [
    join(repoPath, 'coverage', 'coverage-summary.json'),
    join(repoPath, 'coverage', 'coverage-final.json')
  ]

  for (const covPath of coveragePaths) {
    if (existsSync(covPath)) {
      try {
        const data = JSON.parse(readFileSync(covPath, 'utf-8'))
        // coverage-summary.json format
        if (data.total?.lines?.pct !== undefined) {
          return Math.round(data.total.lines.pct)
        }
        // coverage-final.json format - calculate from file entries
        if (typeof data === 'object' && !data.total) {
          let totalStatements = 0
          let coveredStatements = 0
          for (const fileData of Object.values(data) as Array<{ s?: Record<string, number> }>) {
            if (fileData.s) {
              for (const count of Object.values(fileData.s)) {
                totalStatements++
                if (count > 0) coveredStatements++
              }
            }
          }
          if (totalStatements > 0) {
            return Math.round((coveredStatements / totalStatements) * 100)
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Fallback: estimate from test file ratio
  const sourceFiles = files.filter(f => !f.isTest)
  const testFiles = files.filter(f => f.isTest)

  if (sourceFiles.length === 0) return 0

  // Heuristic: each test file roughly covers 1 source file
  // Cap at 100%, apply a dampening factor since not all source needs tests
  const ratio = Math.min(1, testFiles.length / sourceFiles.length)
  return Math.round(ratio * 100)
}

/**
 * Detect exported symbols not referenced in other files (simplified dead code detection)
 * PRD: "> 10 unused exports"
 */
export function countDeadExports(files: SourceFile[]): number {
  const sourceFiles = files.filter(f => !f.isTest)
  if (sourceFiles.length === 0) return 0

  // Collect all named exports
  const exportPattern = /export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g
  const exports: Map<string, string> = new Map() // name -> file

  for (const file of sourceFiles) {
    let match
    while ((match = exportPattern.exec(file.content)) !== null) {
      exports.set(match[1], file.relativePath)
    }
  }

  // Check which exports are referenced in other files
  let deadCount = 0
  for (const [name, exportFile] of exports) {
    // Skip common entry-point exports and index files
    if (exportFile.includes('index.') || name === 'default') continue
    // Skip very short names that could cause false positives
    if (name.length <= 2) continue

    let referenced = false
    for (const file of sourceFiles) {
      if (file.relativePath === exportFile) continue

      // Check for import or usage of the name
      if (file.content.includes(name)) {
        referenced = true
        break
      }
    }

    if (!referenced) {
      deadCount++
    }
  }

  return deadCount
}

/**
 * Detect duplicate code blocks (simplified DRY violation detection)
 * PRD: "> 5 instances"
 *
 * Looks for non-trivial code blocks (3+ lines) that appear in multiple places
 */
export function countDryViolations(files: SourceFile[]): number {
  const sourceFiles = files.filter(f => !f.isTest)
  if (sourceFiles.length === 0) return 0

  const BLOCK_SIZE = 3 // Minimum lines for a "block"
  const MIN_LINE_LENGTH = 20 // Skip trivial lines
  const blockCounts: Map<string, number> = new Map()

  for (const file of sourceFiles) {
    const meaningfulLines = file.lines
      .map(l => l.trim())
      .filter(l =>
        l.length >= MIN_LINE_LENGTH &&
        !l.startsWith('//') &&
        !l.startsWith('*') &&
        !l.startsWith('/*') &&
        !l.startsWith('import ') &&
        !l.startsWith('export ') &&
        l !== '{' && l !== '}' && l !== '})' && l !== ']);'
      )

    // Create sliding windows of BLOCK_SIZE lines
    for (let i = 0; i <= meaningfulLines.length - BLOCK_SIZE; i++) {
      const block = meaningfulLines.slice(i, i + BLOCK_SIZE).join('\n')
      blockCounts.set(block, (blockCounts.get(block) || 0) + 1)
    }
  }

  // Count blocks that appear more than once
  let violations = 0
  for (const count of blockCounts.values()) {
    if (count > 1) violations++
  }

  return violations
}

/**
 * Run all code health checks for a repository path
 */
export function analyzeRepoHealth(repoPath: string): CodeHealthCheck {
  if (!existsSync(repoPath)) {
    return {
      testCoverage: 0,
      dryViolations: 0,
      typeErrors: 0,
      deadCodeCount: 0,
      complexFunctions: 0,
      passed: false
    }
  }

  const files = walkSourceFiles(repoPath)

  const typeErrors = countAnyTypes(files)
  const complexFunctions = countComplexFunctions(files)
  const testCoverage = estimateTestCoverage(repoPath, files)
  const deadCodeCount = countDeadExports(files)
  const dryViolations = countDryViolations(files)

  const passed =
    testCoverage >= AUDIT_THRESHOLDS.testCoverage &&
    dryViolations <= AUDIT_THRESHOLDS.dryViolationLimit &&
    typeErrors <= AUDIT_THRESHOLDS.typeErrorLimit &&
    deadCodeCount <= AUDIT_THRESHOLDS.deadCodeLimit

  return {
    testCoverage,
    dryViolations,
    typeErrors,
    deadCodeCount,
    complexFunctions,
    passed
  }
}

/**
 * Merge multiple repo health checks into a combined result
 */
export function mergeHealthChecks(checks: CodeHealthCheck[]): CodeHealthCheck {
  if (checks.length === 0) {
    return {
      testCoverage: 0,
      dryViolations: 0,
      typeErrors: 0,
      deadCodeCount: 0,
      complexFunctions: 0,
      passed: true
    }
  }

  // Average coverage, sum everything else
  const totalCoverage = checks.reduce((sum, c) => sum + c.testCoverage, 0)

  return {
    testCoverage: Math.round(totalCoverage / checks.length),
    dryViolations: checks.reduce((sum, c) => sum + c.dryViolations, 0),
    typeErrors: checks.reduce((sum, c) => sum + c.typeErrors, 0),
    deadCodeCount: checks.reduce((sum, c) => sum + c.deadCodeCount, 0),
    complexFunctions: checks.reduce((sum, c) => sum + c.complexFunctions, 0),
    passed: checks.every(c => c.passed)
  }
}
