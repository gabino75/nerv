/**
 * Task Verification (PRD Section 16)
 * Runs verifiers for task acceptance criteria
 */

import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import type {
  AcceptanceCriterion,
  VerifierResult,
  TaskVerificationResult
} from '../shared/types.js'
import type { DatabaseService } from './database/index.js'

/**
 * Run a command verifier
 */
async function runCommandVerifier(
  criterion: AcceptanceCriterion,
  cwd: string
): Promise<VerifierResult> {
  const startTime = Date.now()

  if (!criterion.command) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: 'No command specified',
      duration_ms: 0,
      checked_at: new Date().toISOString()
    }
  }

  return new Promise((resolve) => {
    const args = process.platform === 'win32'
      ? ['cmd', '/c', criterion.command!]
      : ['sh', '-c', criterion.command!]

    const proc = spawn(args[0], args.slice(1), {
      cwd,
      env: process.env,
      shell: false
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (exitCode) => {
      const duration = Date.now() - startTime
      const output = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : '')
      const expectedExitCode = criterion.expected_exit_code ?? 0

      let passed = exitCode === expectedExitCode

      // Check expected output if specified
      if (passed && criterion.expected_output) {
        try {
          const regex = new RegExp(criterion.expected_output)
          passed = regex.test(output)
        } catch {
          // Treat as substring match if not valid regex
          passed = output.includes(criterion.expected_output)
        }
      }

      resolve({
        criterion_id: criterion.id,
        passed,
        output: output.slice(0, 10000),
        exit_code: exitCode ?? undefined,
        duration_ms: duration,
        checked_at: new Date().toISOString()
      })
    })

    proc.on('error', (err) => {
      resolve({
        criterion_id: criterion.id,
        passed: false,
        output: `Command failed to start: ${err.message}`,
        duration_ms: Date.now() - startTime,
        checked_at: new Date().toISOString()
      })
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      proc.kill()
      resolve({
        criterion_id: criterion.id,
        passed: false,
        output: 'Command timed out after 5 minutes',
        duration_ms: Date.now() - startTime,
        checked_at: new Date().toISOString()
      })
    }, 300000)
  })
}

/**
 * Run a file_exists verifier
 */
function runFileExistsVerifier(
  criterion: AcceptanceCriterion,
  cwd: string
): VerifierResult {
  const startTime = Date.now()

  if (!criterion.file_path) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: 'No file path specified',
      duration_ms: 0,
      checked_at: new Date().toISOString()
    }
  }

  const fullPath = criterion.file_path.startsWith('/')
    ? criterion.file_path
    : `${cwd}/${criterion.file_path}`

  const exists = existsSync(fullPath)

  return {
    criterion_id: criterion.id,
    passed: exists,
    output: exists ? `File exists: ${fullPath}` : `File not found: ${fullPath}`,
    duration_ms: Date.now() - startTime,
    checked_at: new Date().toISOString()
  }
}

/**
 * Run a grep verifier
 */
function runGrepVerifier(
  criterion: AcceptanceCriterion,
  cwd: string
): VerifierResult {
  const startTime = Date.now()

  if (!criterion.grep_file || !criterion.grep_pattern) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: 'No file or pattern specified for grep',
      duration_ms: 0,
      checked_at: new Date().toISOString()
    }
  }

  const fullPath = criterion.grep_file.startsWith('/')
    ? criterion.grep_file
    : `${cwd}/${criterion.grep_file}`

  if (!existsSync(fullPath)) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: `File not found: ${fullPath}`,
      duration_ms: Date.now() - startTime,
      checked_at: new Date().toISOString()
    }
  }

  try {
    const content = readFileSync(fullPath, 'utf-8')
    let matches: boolean

    try {
      const regex = new RegExp(criterion.grep_pattern)
      matches = regex.test(content)
    } catch {
      // Treat as substring match if not valid regex
      matches = content.includes(criterion.grep_pattern)
    }

    const shouldMatch = criterion.should_match !== false
    const passed = shouldMatch ? matches : !matches

    return {
      criterion_id: criterion.id,
      passed,
      output: matches
        ? `Pattern "${criterion.grep_pattern}" found in ${criterion.grep_file}`
        : `Pattern "${criterion.grep_pattern}" not found in ${criterion.grep_file}`,
      duration_ms: Date.now() - startTime,
      checked_at: new Date().toISOString()
    }
  } catch (err) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - startTime,
      checked_at: new Date().toISOString()
    }
  }
}

/**
 * Run a test_pass verifier
 */
async function runTestPassVerifier(
  criterion: AcceptanceCriterion,
  cwd: string
): Promise<VerifierResult> {
  if (!criterion.test_command) {
    return {
      criterion_id: criterion.id,
      passed: false,
      output: 'No test command specified',
      duration_ms: 0,
      checked_at: new Date().toISOString()
    }
  }

  const modifiedCriterion: AcceptanceCriterion = {
    ...criterion,
    command: criterion.test_command,
    expected_exit_code: 0,
    expected_output: criterion.test_pattern
  }

  return runCommandVerifier(modifiedCriterion, cwd)
}

/**
 * Run a manual verifier
 */
function runManualVerifier(criterion: AcceptanceCriterion): VerifierResult {
  return {
    criterion_id: criterion.id,
    passed: false,
    output: criterion.checklist_item ?? 'Manual verification required',
    duration_ms: 0,
    checked_at: new Date().toISOString()
  }
}

/**
 * Run a single verifier
 */
async function runVerifier(
  criterion: AcceptanceCriterion,
  cwd: string
): Promise<VerifierResult> {
  switch (criterion.verifier) {
    case 'command':
      return runCommandVerifier(criterion, cwd)
    case 'file_exists':
      return runFileExistsVerifier(criterion, cwd)
    case 'grep':
      return runGrepVerifier(criterion, cwd)
    case 'test_pass':
      return runTestPassVerifier(criterion, cwd)
    case 'manual':
      return runManualVerifier(criterion)
    default:
      return {
        criterion_id: criterion.id,
        passed: false,
        output: `Unknown verifier type: ${criterion.verifier}`,
        duration_ms: 0,
        checked_at: new Date().toISOString()
      }
  }
}

/**
 * Verify all criteria for a task
 */
export async function verifyTask(
  taskId: string,
  db: DatabaseService,
  worktreePath?: string
): Promise<TaskVerificationResult> {
  const criteria = db.getCriteriaForTask(taskId)

  if (criteria.length === 0) {
    return {
      task_id: taskId,
      all_passed: true,
      auto_criteria_passed: true,
      manual_pending: 0,
      results: [],
      checked_at: new Date().toISOString()
    }
  }

  const task = db.getTask(taskId)
  const cwd = worktreePath ?? task?.worktree_path ?? process.cwd()

  const results: VerifierResult[] = []
  let manualPending = 0
  let autoPassed = true

  for (const criterion of criteria) {
    const result = await runVerifier(criterion, cwd)
    results.push(result)

    // Update criterion status in database
    const status = criterion.verifier === 'manual'
      ? 'pending'
      : result.passed ? 'pass' : 'fail'
    db.updateCriterionStatus(criterion.id, status, result.output)

    if (criterion.verifier === 'manual') {
      const currentCriterion = db.getCriterion(criterion.id)
      if (currentCriterion?.status !== 'pass') {
        manualPending++
      }
    } else if (!result.passed) {
      autoPassed = false
    }
  }

  // Check if all manual criteria have been verified
  const updatedCriteria = db.getCriteriaForTask(taskId)
  const manualCriteria = updatedCriteria.filter(c => c.verifier === 'manual')
  const manualPassed = manualCriteria.every(c => c.status === 'pass')

  const allPassed = autoPassed && manualPassed

  return {
    task_id: taskId,
    all_passed: allPassed,
    auto_criteria_passed: autoPassed,
    manual_pending: manualPending,
    results,
    checked_at: new Date().toISOString()
  }
}
