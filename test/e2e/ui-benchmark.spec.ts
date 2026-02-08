/**
 * UI Benchmark - Drives real NERV Electron app through a 3-phase pipeline
 *
 * This test launches the actual NERV UI with Playwright and runs the full
 * benchmark pipeline: Setup → Build → Grade.
 *
 * Environment variables:
 *   NERV_MOCK_CLAUDE=true/false  - Use mock or real Claude (default: true)
 *   NERV_RECORD_ALL=true         - Record video of the benchmark
 *   NERV_SLOW_MODE=true          - Add pauses for debugging
 *
 * Run:
 *   npx playwright test test/e2e/ui-benchmark.spec.ts
 */

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { launchNervBenchmark, standardCleanup, log, safeAppClose } from './helpers/launch'
import { UIBenchmarkRunner, type UIBenchmarkConfig } from './helpers/ui-benchmark'
import { extractUserScenario, isUserScenarioFormat, parseSpec } from '../../src/core/spec-parser'
import type { UserScenario } from '../../src/shared/types/benchmark'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SPECS_DIR = path.join(__dirname, '../../specs')
const OUTPUT_BASE = path.join(__dirname, '../../test-results/ui-benchmark')

test.afterEach(async () => {
  await standardCleanup()
})

test.describe('UI Benchmark', () => {
  test('todo-app spec - full pipeline', async () => {
    // Timeout: 30 minutes for mock, 3 hours for real
    const useMock = process.env.NERV_MOCK_CLAUDE !== 'false'
    test.setTimeout(useMock ? 30 * 60 * 1000 : 3 * 60 * 60 * 1000)

    // Load and parse spec
    const specPath = path.join(SPECS_DIR, 'todo-app.md')
    const specContent = fs.readFileSync(specPath, 'utf-8')

    let scenario: UserScenario
    if (isUserScenarioFormat(specContent)) {
      const parsed = extractUserScenario(specContent)
      if (!parsed) throw new Error('Failed to parse user scenario from spec')
      scenario = parsed
    } else {
      // Fallback: create minimal scenario from old-format spec
      const parsed = parseSpec(specContent)
      scenario = {
        projectIdea: parsed.title,
        userProfile: { strong: [], moderate: [], weak: [], neverUsed: [] },
        techPreferences: [],
        roughMilestones: parsed.cycles.map(c => c.title),
        midProjectEvents: [],
        qualityBar: [],
      }
    }

    log('step', 'Parsed spec', {
      milestones: scenario.roughMilestones.length,
      events: scenario.midProjectEvents.length,
      format: isUserScenarioFormat(specContent) ? 'scenario' : 'legacy',
    })

    // Launch NERV
    const { app, window, testRepoPath } = await launchNervBenchmark('benchmark')

    // Capture Electron console for diagnostics
    const consoleLogs: string[] = []
    window.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`
      consoleLogs.push(text)
      if (msg.text().includes('[NERV]') || msg.text().includes('Error') || msg.text().includes('error')) {
        log('info', `Electron: ${msg.text()}`)
      }
    })
    window.on('pageerror', error => {
      consoleLogs.push(`[PAGE_ERROR] ${error.message}`)
      log('fail', `Page error: ${error.message}`)
    })

    // Create output directory for this run
    const runId = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)
    const outputDir = path.join(OUTPUT_BASE, `run-${runId}`)
    fs.mkdirSync(outputDir, { recursive: true })

    // Copy spec to output
    fs.copyFileSync(specPath, path.join(outputDir, 'spec.md'))

    try {
      // Configure and run benchmark
      // Review mode: 'none' for mock, env NERV_REVIEW_MODE for real ('auto' or 'human')
      // Review mode: 'none' auto-approves after Claude completes.
      // 'auto' uses Claude review agent but requires re-spawn support (not yet implemented).
      // Default to 'none' for both mock and real until review re-iteration is wired up.
      const envReviewMode = process.env.NERV_REVIEW_MODE as 'auto' | 'human' | 'none' | undefined
      const reviewMode = envReviewMode ?? 'none' as const

      const config: UIBenchmarkConfig = {
        specFile: 'todo-app.md',
        scenario,
        testRepoPath,
        outputDir,
        taskTimeout: useMock ? 60 * 1000 : 15 * 60 * 1000,
        cycleTimeout: useMock ? 5 * 60 * 1000 : 45 * 60 * 1000,
        totalTimeout: useMock ? 10 * 60 * 1000 : 3 * 60 * 60 * 1000,
        reviewMode,
        maxReviewIterations: 3,
      }

      const runner = new UIBenchmarkRunner(window, config)
      const result = await runner.run()

      // Write result
      fs.writeFileSync(
        path.join(outputDir, 'result.json'),
        JSON.stringify(result, null, 2),
      )

      log('pass', 'UI Benchmark complete', {
        overall: result.grade.overallScore,
        tasks: result.build.tasksCompleted,
        cycles: result.build.cyclesCompleted,
        duration: `${Math.round(result.totalDurationMs / 1000)}s`,
      })

      // Assertions
      expect(result.setup.success).toBe(true)
      expect(result.build.tasksCompleted).toBeGreaterThanOrEqual(1)
      expect(result.grade.overallScore).toBeGreaterThan(0)
    } finally {
      // Write Electron console logs for diagnostics
      if (consoleLogs.length > 0) {
        fs.writeFileSync(
          path.join(outputDir, 'electron-console.log'),
          consoleLogs.join('\n'),
        )
      }
      await safeAppClose(app)
    }
  })
})
