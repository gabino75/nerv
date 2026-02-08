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

/**
 * Run tests and parse results
 */
export async function runTests(testCommand: string, cwd: string): Promise<TestResult> {
  const result: TestResult = { passed: 0, failed: 0 }

  try {
    const { stdout, stderr } = await execAsync(testCommand, {
      cwd,
      timeout: 60000
    })

    const output = stdout + stderr

    // Jest/Vitest format: "Tests: X passed, Y failed"
    const jestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/is)
    if (jestMatch) {
      result.passed = parseInt(jestMatch[1], 10)
      result.failed = parseInt(jestMatch[2], 10)
      if (result.failed > 0) {
        result.failureOutput = output.slice(-2000) // Capture last 2000 chars of output
      }
      return result
    }

    // Mocha format: "X passing, Y failing"
    const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)\s*failing/is)
    if (mochaMatch) {
      result.passed = parseInt(mochaMatch[1], 10)
      result.failed = parseInt(mochaMatch[2], 10)
      if (result.failed > 0) {
        result.failureOutput = output.slice(-2000)
      }
      return result
    }

    // Mocha format with only passing tests
    const mochaPassOnlyMatch = output.match(/(\d+)\s*passing/i)
    if (mochaPassOnlyMatch && !output.match(/failing/i)) {
      result.passed = parseInt(mochaPassOnlyMatch[1], 10)
      result.failed = 0
      return result
    }

    result.passed = 1
  } catch (err) {
    result.failed = 1
    const error = err as { stdout?: string; stderr?: string; message?: string }
    // Capture error output for debug task
    const errorOutput = (error.stdout || '') + (error.stderr || '') + (error.message || '')
    result.failureOutput = errorOutput.slice(-2000)
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
