/**
 * Review Agent for YOLO Benchmark
 *
 * PRD Section 4: Review Modes - Review agent integration
 *
 * Spawns Claude as a yolo-reviewer agent to evaluate completed task code
 * instead of simple auto-approve in YOLO mode.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { spawnClaude, hasClaudeSession, getClaudeSessionInfo, killClaudeSession } from '../claude'
import { claudeSessions } from '../claude/state'
import { parseStreamJsonLine } from '../claude/stream-parser'
import { isAppShuttingDown } from '../app-state'
import type { ClaudeSpawnConfig } from '../../shared/types'
import type { ActiveBenchmark } from './types'

const execAsync = promisify(exec)

export interface ReviewDecision {
  decision: 'approve' | 'needs_changes' | 'reject'
  justification: string
  concerns: string[]
  suggestions: string[]
  confidence: number
  autoMerge: boolean
}

export interface ReviewAgentResult {
  success: boolean
  decision?: ReviewDecision
  error?: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
}

/** Get git diff for a worktree compared to base branch */
async function getWorktreeDiff(worktreePath: string): Promise<string> {
  try {
    // Get the merge-base to compare against
    const { stdout: baseBranch } = await execAsync(
      'git rev-parse --abbrev-ref HEAD@{upstream} 2>/dev/null || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "HEAD~10"',
      { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
    )
    const base = baseBranch.trim().replace('origin/', '')

    // Get the diff
    const { stdout: diff } = await execAsync(
      `git diff ${base}...HEAD --stat && echo "---DIFF---" && git diff ${base}...HEAD`,
      { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
    )

    // Limit diff size to avoid token overload
    const maxDiffLength = 50000
    if (diff.length > maxDiffLength) {
      return diff.substring(0, maxDiffLength) + '\n\n[... diff truncated due to size ...]'
    }
    return diff
  } catch (error) {
    // Fallback: show recent changes
    try {
      const { stdout: diff } = await execAsync(
        'git diff HEAD~5...HEAD --stat && echo "---DIFF---" && git diff HEAD~5...HEAD',
        { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
      )
      const maxDiffLength = 50000
      if (diff.length > maxDiffLength) {
        return diff.substring(0, maxDiffLength) + '\n\n[... diff truncated due to size ...]'
      }
      return diff
    } catch {
      return 'Unable to generate diff'
    }
  }
}

/** Get CLAUDE.md conventions from project if available */
function getProjectConventions(worktreePath: string): string {
  // Check CLAUDE.md first, then NERV.md
  const conventionFiles = ['CLAUDE.md', 'NERV.md']
  const contents: string[] = []

  for (const filename of conventionFiles) {
    const filePath = join(worktreePath, filename)
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const maxLen = 5000
        contents.push(`## ${filename}\n${content.length > maxLen ? content.substring(0, maxLen) + '\n\n[... truncated ...]' : content}`)
      } catch {
        // skip
      }
    }
  }

  return contents.join('\n\n')
}

/** Get diff stats summary for quick overview */
function getDiffStats(diff: string): { filesChanged: number; insertions: number; deletions: number } {
  const stats = { filesChanged: 0, insertions: 0, deletions: 0 }

  // Parse diff --stat output (before ---DIFF---)
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

/** Build the review prompt for Claude */
function buildReviewPrompt(
  taskDescription: string,
  diff: string,
  conventions: string,
  testsPassed: boolean,
  testsOutput?: string
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
${testsOutput ? `\nTest output:\n${testsOutput}` : ''}

`

  if (conventions) {
    prompt += `## Project Conventions
${conventions}

`
  }

  prompt += `## Review Criteria
1. Does the implementation address the task requirements?
2. Does the code follow project conventions?
3. Are there any obvious bugs or issues?
4. Is the code maintainable and readable?
5. Are there security concerns?

## Required Output Format
You MUST respond with a valid JSON object in this exact format:
\`\`\`json
{
  "decision": "approve" | "needs_changes" | "reject",
  "justification": "Brief explanation of your decision",
  "concerns": ["List of specific concerns, if any"],
  "suggestions": ["List of improvement suggestions, if any"],
  "confidence": 0.95,
  "autoMerge": true
}
\`\`\`

Rules:
- "approve": Code is acceptable and can be merged
- "needs_changes": Minor issues that should be addressed
- "reject": Major issues, bugs, or doesn't meet requirements
- confidence: 0.0 to 1.0, how confident you are in your decision
- autoMerge: true if the code can be automatically merged without human review

Respond ONLY with the JSON object, no additional text.`

  return prompt
}

/** Parse Claude's response to extract review decision */
function parseReviewDecision(response: string): ReviewDecision | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*"decision"[\s\S]*\}/m)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!parsed.decision || !['approve', 'needs_changes', 'reject'].includes(parsed.decision)) {
      return null
    }

    return {
      decision: parsed.decision,
      justification: parsed.justification || '',
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      autoMerge: typeof parsed.autoMerge === 'boolean' ? parsed.autoMerge : false
    }
  } catch {
    return null
  }
}

/** Wait for Claude review session to complete and capture output */
async function waitForReviewCompletion(
  sessionId: string,
  active: ActiveBenchmark,
  maxWaitMs: number = 5 * 60 * 1000
): Promise<{ output: string; costUsd: number; inputTokens: number; outputTokens: number; durationMs: number }> {
  const startTime = Date.now()
  const textChunks: string[] = []
  let jsonBuffer = ''

  // Subscribe to PTY data to capture Claude's text output
  const session = claudeSessions.get(sessionId)
  let dataDisposable: { dispose(): void } | undefined

  if (session) {
    dataDisposable = session.pty.onData((data: string) => {
      jsonBuffer += data
      const lines = jsonBuffer.split('\n')
      jsonBuffer = lines.pop() || ''

      for (const line of lines) {
        const msg = parseStreamJsonLine(line)
        if (!msg) continue

        if (msg.type === 'assistant' && msg.message?.content) {
          for (const content of msg.message.content) {
            if (content.type === 'text' && content.text) {
              textChunks.push(content.text)
            }
          }
        }
      }
    })
  }

  while (hasClaudeSession(sessionId)) {
    if (active.stopRequested || isAppShuttingDown()) {
      killClaudeSession(sessionId)
      break
    }

    if (Date.now() - startTime > maxWaitMs) {
      killClaudeSession(sessionId)
      break
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Process any remaining buffered data
  if (jsonBuffer.trim()) {
    const msg = parseStreamJsonLine(jsonBuffer)
    if (msg?.type === 'assistant' && msg.message?.content) {
      for (const content of msg.message.content) {
        if (content.type === 'text' && content.text) {
          textChunks.push(content.text)
        }
      }
    }
  }

  if (dataDisposable) {
    dataDisposable.dispose()
  }

  const output = textChunks.join('\n')
  const durationMs = Date.now() - startTime

  const sessionInfo = getClaudeSessionInfo(sessionId)
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0

  if (sessionInfo) {
    inputTokens = sessionInfo.tokenUsage.inputTokens
    outputTokens = sessionInfo.tokenUsage.outputTokens
    costUsd = (inputTokens * 0.000003) + (outputTokens * 0.000015)
  }

  return { output, costUsd, inputTokens, outputTokens, durationMs }
}

/**
 * Run the review agent on a completed task
 */
export async function runReviewAgent(
  worktreePath: string,
  taskDescription: string,
  projectId: string,
  active: ActiveBenchmark,
  testsPassed: boolean,
  testsOutput?: string
): Promise<ReviewAgentResult> {
  const result: ReviewAgentResult = {
    success: false,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0
  }

  try {
    // Get git diff
    const diff = await getWorktreeDiff(worktreePath)
    if (diff === 'Unable to generate diff') {
      result.error = 'Could not generate git diff for review'
      return result
    }

    // Get project conventions
    const conventions = getProjectConventions(worktreePath)

    // Build review prompt
    const prompt = buildReviewPrompt(taskDescription, diff, conventions, testsPassed, testsOutput)

    // Spawn Claude as reviewer
    const spawnConfig: ClaudeSpawnConfig = {
      projectId,
      cwd: worktreePath,
      prompt,
      model: active.config.model,
      maxTurns: 1 // Single response expected
    }

    console.log('[ReviewAgent] Spawning Claude for code review...')
    const spawnResult = spawnClaude(spawnConfig)

    if (!spawnResult.success || !spawnResult.sessionId) {
      result.error = spawnResult.error || 'Failed to spawn review agent'
      return result
    }

    // Wait for completion
    const completion = await waitForReviewCompletion(spawnResult.sessionId, active)
    result.costUsd = completion.costUsd
    result.inputTokens = completion.inputTokens
    result.outputTokens = completion.outputTokens
    result.durationMs = completion.durationMs

    // Parse Claude's review response
    let decision: ReviewDecision | null = null

    if (completion.output) {
      decision = parseReviewDecision(completion.output)
    }

    // Fallback to heuristic if Claude output couldn't be parsed
    if (!decision) {
      console.log('[ReviewAgent] Could not parse Claude response, using heuristic fallback')
      decision = testsPassed
        ? {
            decision: 'approve',
            justification: 'Tests pass; review agent output could not be parsed',
            concerns: [],
            suggestions: [],
            confidence: 0.8,
            autoMerge: true
          }
        : {
            decision: 'needs_changes',
            justification: 'Tests failed - implementation needs fixes',
            concerns: ['Tests are not passing'],
            suggestions: ['Fix failing tests before merging'],
            confidence: 0.9,
            autoMerge: false
          }
    }

    result.success = true
    result.decision = decision

    console.log(`[ReviewAgent] Review complete: ${decision.decision} (confidence: ${decision.confidence})`)

    return result
  } catch (error) {
    const err = error as Error
    result.error = `Review agent error: ${err.message}`
    console.error('[ReviewAgent]', result.error)
    return result
  }
}
