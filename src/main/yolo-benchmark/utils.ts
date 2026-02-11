/**
 * YOLO Benchmark utilities
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { TestResult } from './types'

const execAsync = promisify(exec)

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate spec completion percentage by counting markdown checkboxes
 * Looks for - [ ] (unchecked) and - [x] (checked) patterns
 */
export function calculateSpecCompletion(specFilePath: string, cwd: string): number {
  const fullPath = join(cwd, specFilePath)

  if (!existsSync(fullPath)) {
    console.warn(`[YOLO] Spec file not found: ${fullPath}`)
    return 0
  }

  try {
    const content = readFileSync(fullPath, 'utf-8')

    const uncheckedPattern = /- \[ \]/g
    const checkedPattern = /- \[x\]/gi

    const uncheckedMatches = content.match(uncheckedPattern) || []
    const checkedMatches = content.match(checkedPattern) || []

    const total = uncheckedMatches.length + checkedMatches.length
    if (total === 0) {
      return 0
    }

    return (checkedMatches.length / total) * 100
  } catch (err) {
    console.error(`[YOLO] Error reading spec file: ${err}`)
    return 0
  }
}

/** Parse test output to extract pass/fail counts from various test runner formats */
export function parseTestOutput(output: string): { passed: number; failed: number } | null {
  // Jest/Vitest "Tests:" summary line (preferred — avoids matching "Test Suites:" line)
  // Handle both orderings: "X passed, Y failed" and "X failed, Y passed"
  const jestTestsLine = output.match(/^Tests:\s+.*?(\d+)\s*passed.*?(\d+)\s*failed/im)
  if (jestTestsLine) {
    return { passed: parseInt(jestTestsLine[1], 10), failed: parseInt(jestTestsLine[2], 10) }
  }
  const jestTestsLineReversed = output.match(/^Tests:\s+.*?(\d+)\s*failed.*?(\d+)\s*passed/im)
  if (jestTestsLineReversed) {
    return { passed: parseInt(jestTestsLineReversed[2], 10), failed: parseInt(jestTestsLineReversed[1], 10) }
  }

  // Generic Jest/Vitest format: "X passed, Y failed" (single line)
  const jestMatch = output.match(/(\d+)\s*passed[,\s]+(\d+)\s*failed/i)
  if (jestMatch) {
    return { passed: parseInt(jestMatch[1], 10), failed: parseInt(jestMatch[2], 10) }
  }

  // Mocha format: "X passing, Y failing"
  const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/is)
  if (mochaMatch) {
    return { passed: parseInt(mochaMatch[1], 10), failed: parseInt(mochaMatch[2], 10) }
  }

  // Node.js built-in test runner (TAP): "# pass N" / "# fail N"
  const tapPassMatch = output.match(/# pass\s+(\d+)/i)
  const tapFailMatch = output.match(/# fail\s+(\d+)/i)
  if (tapPassMatch || tapFailMatch) {
    return {
      passed: tapPassMatch ? parseInt(tapPassMatch[1], 10) : 0,
      failed: tapFailMatch ? parseInt(tapFailMatch[1], 10) : 0,
    }
  }

  // Mocha format with only passing tests
  const mochaPassOnlyMatch = output.match(/(\d+)\s*passing/i)
  if (mochaPassOnlyMatch && !output.match(/failing/i)) {
    return { passed: parseInt(mochaPassOnlyMatch[1], 10), failed: 0 }
  }

  // Jest/Vitest with only passing: "Tests: X passed"
  const jestPassOnlyMatch = output.match(/(\d+)\s*passed/i)
  if (jestPassOnlyMatch && !output.match(/failed/i)) {
    return { passed: parseInt(jestPassOnlyMatch[1], 10), failed: 0 }
  }

  return null
}

/**
 * Run tests and parse results
 */
export async function runTests(testCommand: string, cwd: string): Promise<TestResult> {
  const result: TestResult = { passed: 0, failed: 0 }

  let output = ''
  let exitedClean = false

  try {
    const { stdout, stderr } = await execAsync(testCommand, {
      cwd,
      timeout: 60000
    })
    output = stdout + stderr
    exitedClean = true
  } catch (err) {
    // Test runners commonly exit non-zero when tests fail.
    // We still need to parse their stdout/stderr for actual results.
    const error = err as { stdout?: string; stderr?: string; message?: string }
    output = (error.stdout || '') + (error.stderr || '')
    if (!output) {
      output = error.message || ''
    }
  }

  // Parse test output regardless of exit code
  const parsed = parseTestOutput(output)
  if (parsed) {
    result.passed = parsed.passed
    result.failed = parsed.failed
    if (result.failed > 0) {
      result.failureOutput = output.slice(-2000)
    }
    return result
  }

  // No recognizable test output format
  if (exitedClean) {
    // Command succeeded but output wasn't parseable — assume tests passed
    result.passed = 1
  } else {
    // Command failed and no parseable output — likely no test infrastructure
    result.failed = 1
    result.failureOutput = output.slice(-2000)
  }

  return result
}

/**
 * Build the task prompt for Claude
 */
export function buildTaskPrompt(specFile: string | null, testCommand: string | null, cycleNumber: number): string {
  const specFilePath = specFile || 'SPEC.md'
  const testInfo = testCommand
    ? `\n\nRun tests with: ${testCommand}`
    : ''

  return `YOLO Benchmark Cycle ${cycleNumber}

You are running in autonomous YOLO benchmark mode. Your goal is to make progress on the project specification.

Spec file: ${specFilePath}${testInfo}

IMPORTANT WORKFLOW:
1. Read ${specFilePath} to see the feature checklist with [ ] and [x] checkboxes
2. Find unchecked items (- [ ]) that you can implement
3. Implement the functionality for those items
4. Run tests to verify your implementation
5. CRITICAL: Update ${specFilePath} to mark completed items as [x]
   - Change "- [ ] item" to "- [x] item" for each completed feature
   - This tracks your progress for the benchmark

Focus on:
1. Understanding the current state by reading the spec
2. Implementing unchecked items from the checklist
3. Running tests after each implementation
4. Updating the spec file to mark completed items

Do your best work autonomously. All tool uses will be auto-approved.`
}
