/**
 * Benchmark Review Agent - CLI-compatible review using `claude --print`
 *
 * Extracted from src/main/yolo-benchmark/review-agent.ts.
 * Replaces PTY-based Claude spawn with subprocess for CLI use.
 */

import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ReviewDecision } from '../shared/types/benchmark.js'

export interface ReviewResult {
  success: boolean
  decision: ReviewDecision | null
  error?: string
  costUsd: number
  durationMs: number
}

/**
 * Get diff stats from git diff --stat output.
 */
export function getDiffStats(diff: string): { filesChanged: number; insertions: number; deletions: number } {
  const stats = { filesChanged: 0, insertions: 0, deletions: 0 }
  const statSection = diff.split('---DIFF---')[0] || ''

  for (const line of statSection.split('\n')) {
    const statMatch = line.match(/(\d+) files? changed/)
    if (statMatch) stats.filesChanged = parseInt(statMatch[1], 10)

    const insertMatch = line.match(/(\d+) insertions?\(\+\)/)
    if (insertMatch) stats.insertions = parseInt(insertMatch[1], 10)

    const deleteMatch = line.match(/(\d+) deletions?\(-\)/)
    if (deleteMatch) stats.deletions = parseInt(deleteMatch[1], 10)
  }

  return stats
}

/**
 * Get project conventions from CLAUDE.md if present.
 */
function getProjectConventions(worktreePath: string): string {
  for (const filename of ['CLAUDE.md', 'NERV.md']) {
    const filePath = join(worktreePath, filename)
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        return content.length > 5000 ? content.substring(0, 5000) + '\n\n[... truncated ...]' : content
      } catch {
        // skip
      }
    }
  }
  return ''
}

/**
 * Build the review prompt for Claude.
 */
export function buildReviewPrompt(
  taskDescription: string,
  diff: string,
  conventions: string,
  testsPassed: boolean,
): string {
  const stats = getDiffStats(diff)

  let prompt = `# Code Review Request

You are a code reviewer evaluating a completed task. Analyze the changes and provide a structured review decision.

## Task Description
${taskDescription}

## Change Summary
- Files changed: ${stats.filesChanged}
- Insertions: ${stats.insertions}
- Deletions: ${stats.deletions}

## Code Changes (git diff)
\`\`\`
${diff}
\`\`\`

## Test Results
${testsPassed ? '✓ All tests pass' : '✗ Tests failed or not run'}
`

  if (conventions) {
    prompt += `\n## Project Conventions\n${conventions}\n`
  }

  prompt += `
## Required Output Format
Respond with ONLY a valid JSON object:
{
  "decision": "approve" | "needs_changes" | "reject",
  "justification": "Brief explanation",
  "concerns": ["..."],
  "suggestions": ["..."],
  "confidence": 0.95,
  "autoMerge": true
}

Rules:
- "approve": Code is acceptable and can be merged
- "needs_changes": Minor issues that should be addressed
- "reject": Major issues, bugs, or doesn't meet requirements
- confidence: 0.0 to 1.0
- autoMerge: true if safe to automatically merge

Respond ONLY with the JSON object, no additional text.`

  return prompt
}

/**
 * Parse Claude's response to extract review decision.
 */
export function parseReviewDecision(response: string): ReviewDecision | null {
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
 * Run the review agent on a completed task using `claude --print`.
 */
export async function runReviewAgent(
  worktreePath: string,
  taskDescription: string,
  diff: string,
  testsPassed: boolean,
  model: string = 'sonnet',
): Promise<ReviewResult> {
  const startTime = Date.now()
  const result: ReviewResult = {
    success: false,
    decision: null,
    costUsd: 0,
    durationMs: 0,
  }

  try {
    if (diff === 'Unable to generate diff' || !diff.trim()) {
      result.error = 'Could not generate git diff for review'
      result.durationMs = Date.now() - startTime
      return result
    }

    const conventions = getProjectConventions(worktreePath)
    const prompt = buildReviewPrompt(taskDescription, diff, conventions, testsPassed)

    const claudeOutput = await spawnClaudeForReview(prompt, model, worktreePath)
    result.durationMs = Date.now() - startTime

    const decision = parseReviewDecision(claudeOutput)

    if (!decision) {
      // Fallback heuristic
      result.decision = testsPassed
        ? {
            decision: 'approve',
            justification: 'Tests pass; review output could not be parsed',
            concerns: [],
            suggestions: [],
            confidence: 0.6,
            autoMerge: false,
          }
        : {
            decision: 'needs_changes',
            justification: 'Tests failed - implementation needs fixes',
            concerns: ['Tests are not passing'],
            suggestions: ['Fix failing tests before merging'],
            confidence: 0.9,
            autoMerge: false,
          }
      result.success = true
      return result
    }

    result.success = true
    result.decision = decision
    return result
  } catch (error) {
    result.error = `Review agent error: ${(error as Error).message}`
    result.durationMs = Date.now() - startTime
    return result
  }
}

/**
 * Spawn claude --print for review grading.
 */
function spawnClaudeForReview(prompt: string, model: string, cwd: string): Promise<string> {
  const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude'

  return new Promise((resolve, reject) => {
    const claudeProcess = spawn(claudeCommand, [
      '--print',
      '--output-format', 'text',
      '--model', model,
      '--max-turns', '1',
    ], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    })

    let stdout = ''
    let stderr = ''

    claudeProcess.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    claudeProcess.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    claudeProcess.stdin.write(prompt)
    claudeProcess.stdin.end()

    const timeout = setTimeout(() => {
      claudeProcess.kill()
      reject(new Error('Review agent timed out after 5 minutes'))
    }, 5 * 60 * 1000)

    claudeProcess.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 || stdout.length > 0) {
        resolve(stdout)
      } else {
        reject(new Error(`Claude review exited with code ${code}: ${stderr.slice(0, 200)}`))
      }
    })

    claudeProcess.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start Claude: ${err.message}`))
    })
  })
}
