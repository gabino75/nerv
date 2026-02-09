/**
 * NERV Demo Video Generator
 *
 * This test generates demo videos for the documentation site.
 * Uses Playwright's built-in video recording with electron.
 *
 * Run with: powershell -File test/scripts/run-e2e.ps1 -Suite demos
 *
 * Videos are saved to docs/demos/ for use in documentation.
 *
 * PRD Reference: Feature Demo Videos section
 * - quick-start.mp4 - 2-min getting started
 * - code-review.mp4 - Human-in-the-loop code review
 * - yolo-mode.mp4 - YOLO benchmark demo
 * - multi-repo.mp4 - Multi-repo workflow
 * - audit-health.mp4 - Audit & code health
 * - cost-context.mp4 - Cost tracking & context
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import os from 'os'
import { fileURLToPath } from 'url'
import { SELECTORS } from './helpers/selectors'
import { waitForRecommendDismissed } from './helpers/recommend-actions'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths
const MAIN_PATH = path.join(__dirname, '../../out/main/index.js')
const DOCS_DEMOS_PATH = path.join(__dirname, '../../docs-site/public/demos')
const TEST_RESULTS_PATH = path.join(__dirname, '../../test-results/demos')

// Demo recording settings
const DEMO_VIEWPORT = { width: 1280, height: 720 }
const APP_LAUNCH_TIMEOUT = 60000
const ACTION_DELAY = 800 // Delay between actions for visibility

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string
let testRepoPath2: string
let testRepoPath3: string

// ============================================================================
// Shared Demo Helpers
// ============================================================================

/**
 * Inject a visible cursor overlay into the page.
 * Playwright headless mode doesn't render the OS cursor, so we create
 * a CSS dot that follows mouse movements for professional demo recordings.
 */
async function injectCursorOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Create cursor element
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(255, 80, 80, 0.7);
      border: 2px solid rgba(255, 255, 255, 0.9);
      pointer-events: none;
      z-index: 999999;
      transform: translate(-50%, -50%);
      transition: width 0.15s, height 0.15s, background 0.15s;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    `
    document.body.appendChild(cursor)

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
    })

    // Click animation — pulse on click
    document.addEventListener('mousedown', () => {
      cursor.style.width = '28px'
      cursor.style.height = '28px'
      cursor.style.background = 'rgba(255, 40, 40, 0.9)'
    })
    document.addEventListener('mouseup', () => {
      cursor.style.width = '20px'
      cursor.style.height = '20px'
      cursor.style.background = 'rgba(255, 80, 80, 0.7)'
    })
  })
}

/**
 * Smoothly move the visible cursor to a target element.
 * Creates a human-like glide motion before clicking.
 */
async function glideToElement(page: Page, selector: string, steps = 15): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox()
  if (!box) return

  const targetX = box.x + box.width / 2
  const targetY = box.y + box.height / 2

  // Move mouse smoothly to target
  await page.mouse.move(targetX, targetY, { steps })
  await page.waitForTimeout(200)
}

/**
 * Spotlight effect: dark overlay with rectangular cutout around target element.
 * Replaces the broken zoomInto() which zoomed the background instead of the element.
 */
async function spotlight(page: Page, selector: string, holdMs = 2000, scale = 1.05): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox()
  if (!box) return

  const pad = 12 // padding around element
  const x = box.x - pad
  const y = box.y - pad
  const w = box.width + pad * 2
  const h = box.height + pad * 2

  // Dark overlay with cutout for the element
  await page.evaluate(({ x, y, w, h }) => {
    const overlay = document.createElement('div')
    overlay.id = 'demo-spotlight'
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999998;
      background: rgba(0,0,0,0.55);
      transition: opacity 0.3s;
    `
    // Polygon: outer rectangle CW, then inner cutout CCW
    overlay.style.clipPath = `polygon(
      evenodd,
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px
    )`
    document.body.appendChild(overlay)
  }, { x, y, w, h })

  // Optional: slight scale on the element itself (not the parent)
  if (scale > 1) {
    await element.evaluate((el, s) => {
      const htmlEl = el as HTMLElement
      htmlEl.style.transition = 'transform 0.4s ease'
      htmlEl.style.transform = `scale(${s})`
      htmlEl.style.position = 'relative'
      htmlEl.style.zIndex = '999999'
    }, scale)
  }

  await page.waitForTimeout(holdMs)

  // Remove spotlight + reset element
  await page.evaluate(() => {
    document.getElementById('demo-spotlight')?.remove()
  })
  if (scale > 1) {
    await element.evaluate((el) => {
      const htmlEl = el as HTMLElement
      htmlEl.style.transform = ''
      htmlEl.style.position = ''
      htmlEl.style.zIndex = ''
    })
  }
  await page.waitForTimeout(400)
}

/**
 * Click a dropdown menu item with visible cursor movement.
 * Replaces invisible dispatchEvent clicks with: glide → click trigger → glide → click item.
 */
async function clickDropdownItemDemo(
  page: Page,
  dropdownSelector: string,
  itemSelector: string
): Promise<void> {
  await glideToElement(page, dropdownSelector)
  await page.waitForTimeout(200)
  await page.locator(dropdownSelector).click()
  await page.waitForTimeout(400)
  await glideToElement(page, itemSelector)
  await page.waitForTimeout(200)
  try {
    await page.locator(itemSelector).click({ timeout: 1000 })
  } catch {
    // Backdrop intercepted — use dispatchEvent as fallback (cursor already moved there)
    await page.locator(itemSelector).evaluate(el =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
  }
  await page.waitForTimeout(400)
}

/**
 * Create a temporary git repository for testing
 */
function createTestRepo(name: string, files: Record<string, string> = {}): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `nerv-demo-${name}-`))

  // Initialize git repo with explicit main branch
  execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.email "demo@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.name "NERV Demo"', { cwd: tempDir, stdio: 'pipe' })

  // Create default files
  const defaultFiles: Record<string, string> = {
    'README.md': `# ${name}\n\nA demo project for NERV documentation.\n`,
    'package.json': JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      scripts: {
        test: 'echo "Tests pass"',
        build: 'echo "Build complete"'
      }
    }, null, 2),
    ...files
  }

  for (const [filePath, content] of Object.entries(defaultFiles)) {
    const fullPath = path.join(tempDir, filePath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content)
  }

  execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' })

  return tempDir
}

/**
 * Clean up test repository
 */
function cleanupTestRepo(repoPath: string): void {
  try {
    const worktreesDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`)
    if (fs.existsSync(worktreesDir)) {
      fs.rmSync(worktreesDir, { recursive: true, force: true })
    }
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch (e) {
    console.error(`Failed to cleanup test repo: ${e}`)
  }
}

/**
 * Slowly type text (for demo visibility)
 */
async function slowType(page: Page, selector: string, text: string): Promise<void> {
  const element = page.locator(selector)
  await element.click()
  for (const char of text) {
    await element.press(char === ' ' ? 'Space' : char)
    await page.waitForTimeout(50) // Typing speed
  }
}

/**
 * Wait and log (for demo pacing)
 */
async function demoWait(page: Page, label: string, ms: number = ACTION_DELAY): Promise<void> {
  console.log(`[Demo] ${label}`)
  await page.waitForTimeout(ms)
}

/**
 * Move video file from test-results to docs/demos with proper naming
 */
async function moveVideoToDocsDemo(videoPath: string, demoName: string): Promise<string> {
  const destPath = path.join(DOCS_DEMOS_PATH, `${demoName}.webm`)

  // Ensure destination directories exist
  if (!fs.existsSync(DOCS_DEMOS_PATH)) {
    fs.mkdirSync(DOCS_DEMOS_PATH, { recursive: true })
  }
  if (!fs.existsSync(TEST_RESULTS_PATH)) {
    fs.mkdirSync(TEST_RESULTS_PATH, { recursive: true })
  }

  // Copy to docs-site for local dev
  fs.copyFileSync(videoPath, destPath)
  console.log(`Demo video saved: ${destPath}`)

  // Also copy with proper name to test-results/demos/ (Docker entrypoint copies this to host)
  const testResultsDest = path.join(TEST_RESULTS_PATH, `${demoName}.webm`)
  fs.copyFileSync(videoPath, testResultsDest)
  console.log(`Demo video (test-results): ${testResultsDest}`)

  return destPath
}

/**
 * Clean stale database state before each demo
 */
function cleanDatabase(): void {
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }
}

/**
 * Launch Electron app with video recording
 */
async function launchApp(scenario = 'benchmark'): Promise<{ app: ElectronApplication; page: Page }> {
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  cleanDatabase()

  const app = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: scenario,
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  const page = await app.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await page.setViewportSize(DEMO_VIEWPORT)
  await page.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await page.waitForTimeout(500)
  const recoveryDialog = page.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = page.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await page.waitForTimeout(300)
    }
  }

  await page.waitForSelector(SELECTORS.app, { timeout: 10000 })
  await injectCursorOverlay(page)

  return { app, page }
}

/**
 * Save video and close app.
 * Sets electronApp = undefined to prevent afterEach double-close.
 */
async function saveVideoAndClose(app: ElectronApplication, page: Page, demoName: string): Promise<void> {
  const video = page.video()
  if (video) {
    const pid = app.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = app.close().then(() => {
      if (killTimer) clearTimeout(killTimer)
    })
    const timeoutPromise = new Promise<void>((resolve) => {
      killTimer = setTimeout(() => {
        if (pid) {
          try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
        }
        resolve()
      }, 5000)
    })
    await Promise.race([closePromise, timeoutPromise])

    const videoPath = await video.path()
    if (videoPath) {
      await moveVideoToDocsDemo(videoPath, demoName)
    }
  }
  // Prevent afterEach from trying to close the already-closed app
  electronApp = undefined as unknown as ElectronApplication
}

/**
 * Quick project creation (fast, no slow typing) — returns project ID
 */
async function quickCreateProject(page: Page, name: string, goal: string): Promise<string> {
  const newProjectBtn = page.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await newProjectBtn.click()
  await page.waitForTimeout(500)

  const nameInput = page.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill(name)
    await page.waitForTimeout(200)
  }

  const goalInput = page.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill(goal)
    await page.waitForTimeout(200)
  }

  const createBtn = page.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(1000)
  }

  // Get the project ID
  const projectId = await page.evaluate(async () => {
    const projects = await window.api.db.projects.getAll()
    return projects[0]?.id || ''
  })

  return projectId
}

/**
 * Seed session_metrics with cost data via raw SQL (costUsd/durationMs not in preload)
 */
async function seedCostDataDirect(
  app: ElectronApplication,
  entries: Array<{
    taskId: string
    model: string
    inputTokens: number
    outputTokens: number
    costUsd: number
    durationMs: number
    numTurns: number
  }>
): Promise<void> {
  await app.evaluate(async ({ app: _app }, { entries }) => {
    try {
      const Database = require('better-sqlite3')
      const path = require('path')
      const os = require('os')
      const dbPath = path.join(os.homedir(), '.nerv', 'state.db')
      const db = new Database(dbPath)
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO session_metrics
        (task_id, session_id, input_tokens, output_tokens, compaction_count, compactions_since_clear,
         cache_read_tokens, cache_creation_tokens, model, cost_usd, duration_ms, num_turns)
        VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)
      `)
      for (const e of entries) {
        stmt.run(e.taskId, `session-${e.taskId}`, e.inputTokens, e.outputTokens,
          e.model, e.costUsd, e.durationMs, e.numTurns)
      }
      db.close()
    } catch (e) {
      console.error('Failed to seed cost data:', e)
    }
  }, { entries })
}

/**
 * Backdate a task's updated_at to trigger spec drift "stale task" detection
 */
async function backdateTask(app: ElectronApplication, taskId: string, daysAgo: number): Promise<void> {
  await app.evaluate(async ({ app: _app }, { taskId, daysAgo }) => {
    try {
      const Database = require('better-sqlite3')
      const path = require('path')
      const os = require('os')
      const dbPath = path.join(os.homedir(), '.nerv', 'state.db')
      const db = new Database(dbPath)
      const pastDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
      db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(pastDate, taskId)
      db.close()
    } catch (e) {
      console.error('Failed to backdate task:', e)
    }
  }, { taskId, daysAgo })
}

/**
 * Seed audit log entries via renderer API
 */
async function seedAuditData(page: Page, taskIds: string[]): Promise<void> {
  await page.evaluate(async ({ taskIds }) => {
    // Health check results
    await window.api.db.audit.log(null, 'code_health_check', JSON.stringify({
      testCoverage: 78, dryViolations: 3, typeErrors: 0,
      deadCodeCount: 5, complexFunctions: 2, lastChecked: new Date().toISOString()
    }))
    // Task events
    for (const tid of taskIds) {
      await window.api.db.audit.log(tid, 'task_created', JSON.stringify({ title: 'Demo task' }))
      await window.api.db.audit.log(tid, 'task_status_changed', JSON.stringify({ from: 'idle', to: 'in_progress' }))
      await window.api.db.audit.log(tid, 'approval_requested', JSON.stringify({ toolName: 'Bash', command: 'npm test' }))
      await window.api.db.audit.log(tid, 'approval_resolved', JSON.stringify({ status: 'approved' }))
    }
    // Cycle events
    await window.api.db.audit.log(null, 'cycle_created', JSON.stringify({ cycleNumber: 1, goal: 'MVP Sprint' }))
    await window.api.db.audit.log(null, 'cycle_completed', JSON.stringify({ cycleNumber: 1, learnings: 'Auth module complete' }))
  }, { taskIds })
}

/**
 * Seed cost data via renderer API (tokens only — costUsd needs direct DB access)
 */
async function seedCostMetrics(
  page: Page,
  tasks: Array<{ id: string; model: string; inputTokens: number; outputTokens: number }>
): Promise<void> {
  await page.evaluate(async ({ tasks }) => {
    for (const t of tasks) {
      await window.api.db.metrics.update(t.id, {
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        model: t.model,
        sessionId: `session-${t.id}`
      })
    }
  }, { tasks })
}


// ============================================================================
// Setup & Teardown
// ============================================================================

test.beforeAll(async () => {
  // Ensure directories exist
  if (!fs.existsSync(DOCS_DEMOS_PATH)) {
    fs.mkdirSync(DOCS_DEMOS_PATH, { recursive: true })
  }
  if (!fs.existsSync(TEST_RESULTS_PATH)) {
    fs.mkdirSync(TEST_RESULTS_PATH, { recursive: true })
  }
})

test.afterEach(async () => {
  // Clean up app
  if (electronApp) {
    try {
      const pid = electronApp.process()?.pid
      await electronApp.evaluate(async ({ app }) => {
        app.quit()
      }).catch(() => {})

      // IMPORTANT: Clear the timeout if close succeeds to prevent the SIGKILL
      // from firing later and killing a reused PID (the next test's Electron).
      let killTimer: ReturnType<typeof setTimeout> | null = null
      const closePromise = electronApp.close().then(() => {
        if (killTimer) clearTimeout(killTimer)
      })
      const timeoutPromise = new Promise<void>((resolve) => {
        killTimer = setTimeout(() => {
          if (pid) {
            try {
              if (process.platform === 'win32') {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
              } else {
                process.kill(pid, 'SIGKILL')
              }
            } catch {
              // Process may already be dead
            }
          }
          resolve()
        }, 5000)
      })
      await Promise.race([closePromise, timeoutPromise])
    } catch (e) {
      console.log('App close error:', e)
    }
  }

  // Clean up test repos
  if (testRepoPath) cleanupTestRepo(testRepoPath)
  if (testRepoPath2) cleanupTestRepo(testRepoPath2)
  if (testRepoPath3) cleanupTestRepo(testRepoPath3)
})

// ============================================================================
// Demo Video Tests
// ============================================================================

/**
 * Demo 1: Quick Start
 *
 * Shows the recommend-first workflow that drives NERV's core UX:
 * 1. App launch with clean dashboard
 * 2. Create new project with slow typing + set repo path
 * 3. "What's Next?" round 1 → creates a cycle
 * 4. Show the cycle created
 * 5. "What's Next?" round 2 → creates a task
 * 6. Show task on board
 * 7. Start the task → Claude works in terminal
 * 8. Wait for task completion
 * 9. Final panoramic view
 */
test('demo_quick_start', async () => {
  test.setTimeout(240000)
  // Create test repo with realistic project structure
  testRepoPath = createTestRepo('my-app', {
    'src/index.ts': '// Main entry point\nimport { startServer } from "./server";\nstartServer();\n',
    'src/server.ts': '// Server setup\nexport function startServer() {\n  console.log("Server running on port 3000");\n}\n',
    'src/routes/api.ts': '// API routes\nexport const routes = [];\n',
    'src/middleware/auth.ts': '// Auth middleware placeholder\nexport function requireAuth() {\n  return (req: any, res: any, next: any) => next();\n}\n',
    'tests/api.test.ts': '// API tests\nimport { describe, it, expect } from "jest";\ndescribe("API", () => {\n  it("should start", () => { expect(true).toBe(true); });\n});\n',
    'package.json': JSON.stringify({
      name: 'my-rest-api',
      version: '0.1.0',
      scripts: {
        dev: 'ts-node src/index.ts',
        test: 'jest --coverage',
        build: 'tsc',
        lint: 'eslint src/'
      },
      dependencies: { express: '^4.18.0' },
      devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' }
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, outDir: './dist' } }, null, 2),
    'CLAUDE.md': '# My REST API\n\n## Architecture\n- Express server with TypeScript\n- JWT authentication\n- PostgreSQL database\n\n## Testing\n- Run `npm test` for unit tests\n- Run `npm run lint` for linting\n'
  })

  const result = await launchApp('benchmark')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'App launched - showing empty NERV dashboard', 3000)

  // ========================================
  // Step 1: Create a new project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating new project')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await glideToElement(window, SELECTORS.newProject)
  await demoWait(window, 'Highlighting New Project button', 1200)
  await newProjectBtn.click()
  await demoWait(window, 'Project dialog opened', 1500)

  // Spotlight the new project dialog
  const dialogSelector = SELECTORS.newProjectDialog
  await spotlight(window, dialogSelector, 1500)

  // Slow type the project name
  const projectNameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await projectNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.projectNameInput)
    await slowType(window, SELECTORS.projectNameInput, 'My REST API')
    await demoWait(window, 'Project name entered', 1000)
  }

  // Slow type a detailed project goal (spec-like)
  const projectGoalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await projectGoalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.projectGoalInput)
    await slowType(window, SELECTORS.projectGoalInput,
      'Build a REST API with JWT auth, user CRUD, PostgreSQL, and full test coverage', 35)
    await demoWait(window, 'Project goal entered — detailed spec', 1500)
  }

  // Create the project
  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.createProjectBtn)
    await demoWait(window, 'About to create project', 800)
    await createBtn.click()
    await demoWait(window, 'Project created successfully', 2000)
  }

  // Get project ID for reference
  const projectId = await window.evaluate(async () => {
    const projects = await window.api.db.projects.getAll()
    return projects[0]?.id || ''
  })

  // ========================================
  // Step 2: "What's Next?" round 1 — create a cycle
  // ========================================
  console.log('[Demo] Step 2: What\'s Next? → Create cycle')

  await glideToElement(window, SELECTORS.recommendBtn)
  await demoWait(window, 'About to ask "What\'s Next?"', 1200)
  await window.locator(SELECTORS.recommendBtn).click()
  await demoWait(window, 'Recommend panel opened', 800)

  await window.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })

  await glideToElement(window, SELECTORS.recommendDirectionInput)
  await slowType(window, SELECTORS.recommendDirectionInput, 'plan the MVP cycle', 40)
  await demoWait(window, 'Direction entered', 800)

  await glideToElement(window, SELECTORS.recommendAskBtn)
  await window.locator(SELECTORS.recommendAskBtn).click()
  await demoWait(window, 'Asking Claude for recommendations...', 800)

  const card0 = window.locator(SELECTORS.recommendCard(0))
  await card0.waitFor({ timeout: 15000 })
  await demoWait(window, 'Recommendations received — Claude suggests creating a cycle', 1500)

  // Spotlight the recommendation cards
  await spotlight(window, SELECTORS.recommendPanel, 2500)

  // Approve the first card (create_cycle)
  await glideToElement(window, SELECTORS.recommendApprove(0))
  await demoWait(window, 'Approving: Start your first development cycle', 800)
  await window.locator(SELECTORS.recommendApprove(0)).click()

  try {
    await window.locator(SELECTORS.recommendExecuteSuccess).waitFor({ timeout: 5000 })
    await demoWait(window, 'Cycle created! Panel auto-dismissing...', 2000)
  } catch {
    // Panel may have already auto-dismissed
  }
  await waitForRecommendDismissed(window)
  await demoWait(window, 'Panel dismissed', 600)

  // Dismiss recommend backdrop if still present
  const backdrop = window.locator('.recommend-backdrop').first()
  if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
    await backdrop.click()
    await window.waitForTimeout(300)
  }

  // ========================================
  // Step 3: Show the cycle panel in detail
  // ========================================
  console.log('[Demo] Step 3: Showing created cycle')

  const cyclesBtn = window.locator(SELECTORS.cyclesBtn).first()
  if (await cyclesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.cyclesBtn)
    await demoWait(window, 'Opening cycle panel', 800)
    await cyclesBtn.click()

    const cyclePanel = window.locator(SELECTORS.cyclePanel).first()
    if (await cyclePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await demoWait(window, 'Cycle #0 — active cycle with MVP goal', 1200)
      await spotlight(window, SELECTORS.cyclePanel, 3000)

      // Close cycle panel
      const closeBtn = window.locator(`${SELECTORS.cyclePanel} .close-btn`).first()
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click()
      }
      await window.waitForTimeout(500)
    }
  }

  // ========================================
  // Step 4: "What's Next?" round 2 — create a task
  // ========================================
  console.log('[Demo] Step 4: What\'s Next? → Create task')

  await waitForRecommendDismissed(window)
  await glideToElement(window, SELECTORS.recommendBtn)
  await demoWait(window, 'Asking "What\'s Next?" for task suggestions', 1000)
  await window.locator(SELECTORS.recommendBtn).click()
  await window.waitForTimeout(500)

  const panelVisible = await window.locator(SELECTORS.recommendPanel).isVisible().catch(() => false)
  if (!panelVisible) {
    await window.locator(SELECTORS.recommendBtn).click()
    await window.waitForTimeout(500)
  }
  await window.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })

  await glideToElement(window, SELECTORS.recommendAskBtn)
  await window.locator(SELECTORS.recommendAskBtn).click()
  await demoWait(window, 'Asking for next recommendations...', 800)

  const card0Round2 = window.locator(SELECTORS.recommendCard(0))
  await card0Round2.waitFor({ timeout: 15000 })
  await demoWait(window, 'Claude recommends implementing a core feature', 1500)

  await spotlight(window, SELECTORS.recommendPanel, 2500)

  await glideToElement(window, SELECTORS.recommendApprove(0))
  await demoWait(window, 'Approving: Implement core feature', 800)
  await window.locator(SELECTORS.recommendApprove(0)).click()

  try {
    await window.locator(SELECTORS.recommendExecuteSuccess).waitFor({ timeout: 5000 })
    await demoWait(window, 'Task created! Panel auto-dismissing...', 1500)
  } catch {
    // Panel may have already auto-dismissed
  }
  await waitForRecommendDismissed(window)

  // ========================================
  // Step 5: Show task on the board
  // ========================================
  console.log('[Demo] Step 5: Showing task on kanban board')

  const taskList = window.locator(SELECTORS.taskList).first()
  if (await taskList.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.taskList)
    await demoWait(window, 'Task board — task in TODO column', 1000)
    await spotlight(window, SELECTORS.taskList, 2500)
  }

  // ========================================
  // Step 6: Add a second task manually via + Add Task
  // ========================================
  console.log('[Demo] Step 6: Adding a second task manually')

  const addTaskBtn = window.locator(SELECTORS.addTaskBtn).first()
  if (await addTaskBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.addTaskBtn)
    await demoWait(window, 'Opening Add Task dialog', 800)
    await addTaskBtn.click()
    await window.waitForTimeout(800)

    // Select task type — click "Research" to show type selection
    const researchTypeBtn = window.locator('[data-testid="task-type-research"]').first()
    if (await researchTypeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="task-type-research"]')
      await demoWait(window, 'Selecting Research task type', 600)
      await researchTypeBtn.click()
      await demoWait(window, 'Research type selected', 800)

      // Switch back to Implementation for this task
      const implTypeBtn = window.locator('[data-testid="task-type-implementation"]').first()
      await glideToElement(window, '[data-testid="task-type-implementation"]')
      await implTypeBtn.click()
      await demoWait(window, 'Switched to Implementation type', 600)
    }

    // Type task title
    const taskTitleInput = window.locator(SELECTORS.taskTitleInput).first()
    if (await taskTitleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, SELECTORS.taskTitleInput)
      await slowType(window, SELECTORS.taskTitleInput, 'Add JWT authentication middleware', 35)
      await demoWait(window, 'Task title entered', 800)
    }

    // Type task description
    const taskDescInput = window.locator('#task-description').first()
    if (await taskDescInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '#task-description')
      await slowType(window, '#task-description',
        'Implement JWT token validation, refresh tokens, and role-based access control', 30)
      await demoWait(window, 'Task description entered', 1000)
    }

    // Create the task
    const createTaskBtn = window.locator(SELECTORS.createTaskBtn).first()
    if (await createTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, SELECTORS.createTaskBtn)
      await demoWait(window, 'Creating task', 600)
      await createTaskBtn.click()
      await demoWait(window, 'Second task created!', 1500)
    }
  }

  // Spotlight the board with both tasks
  if (await taskList.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Board now shows 2 tasks in TODO', 800)
    await spotlight(window, SELECTORS.taskList, 2500)
  }

  // ========================================
  // Step 7: Start a task — Claude works in terminal
  // ========================================
  console.log('[Demo] Step 7: Starting task — Claude in terminal')

  const startBtn = window.locator('[data-testid="start-task-btn"]').first()
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="start-task-btn"]')
    await demoWait(window, 'About to start task — Claude will begin working', 1200)
    await startBtn.click()
    await demoWait(window, 'Task started! Claude is now working...', 2000)
  }

  // Wait for terminal output (mock Claude runs ~3.5s)
  const terminal = window.locator(SELECTORS.terminal).first()
  if (await terminal.isVisible({ timeout: 8000 }).catch(() => false)) {
    console.log('[Demo] Step 8: Claude working in terminal')
    await demoWait(window, 'Terminal showing Claude session output', 1500)
    await spotlight(window, SELECTORS.terminalPanel, 4000)
  }

  // Wait for mock Claude to finish — task moves to review
  await window.waitForTimeout(5000)

  // ========================================
  // Step 8: Task completes — show status change
  // ========================================
  console.log('[Demo] Step 9: Task status update')

  // Check for task in review or in_progress (mock may complete quickly)
  const taskBoard = window.locator(SELECTORS.taskList).first()
  if (await taskBoard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Task progressing through workflow columns', 1200)
    await spotlight(window, SELECTORS.taskList, 3000)
  }

  // ========================================
  // Step 9: "What's Next?" round 3 — evolved recommendations
  // ========================================
  console.log('[Demo] Step 10: What\'s Next? — evolved recommendations')

  await waitForRecommendDismissed(window)
  const recommendBtn = window.locator(SELECTORS.recommendBtn).first()
  if (await recommendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.recommendBtn)
    await demoWait(window, 'Asking "What\'s Next?" — recommendations evolve with context', 1000)
    await recommendBtn.click()
    await window.waitForTimeout(500)

    const recPanel = window.locator(SELECTORS.recommendPanel).first()
    if (await recPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await window.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })
      await glideToElement(window, SELECTORS.recommendAskBtn)
      await window.locator(SELECTORS.recommendAskBtn).click()
      await window.waitForTimeout(500)

      const card = window.locator(SELECTORS.recommendCard(0))
      if (await card.isVisible({ timeout: 10000 }).catch(() => false)) {
        await demoWait(window, 'New recommendations based on current progress', 1500)
        await spotlight(window, SELECTORS.recommendPanel, 3000)
      }
    }

    // Dismiss the panel via dispatchEvent (backdrop is behind the panel)
    await waitForRecommendDismissed(window)
    await window.evaluate(() => {
      const backdrop = document.querySelector('.recommend-backdrop') as HTMLElement
      if (backdrop) backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await window.waitForTimeout(300)
  }

  // ========================================
  // Step 10: Final panoramic view
  // ========================================
  console.log('[Demo] Step 11: Final panoramic')
  await demoWait(window, 'NERV — AI-orchestrated development with cycles, tasks, and recommendations', 3500)

  await saveVideoAndClose(electronApp, window, 'quick-start')
})

/**
 * Demo 2: Code Review
 *
 * Shows the human-in-the-loop review workflow:
 * 1. Dashboard with task already in Review column
 * 2. Click task card → TaskReviewModal opens
 * 3. Show diff, Claude's summary
 * 4. Type feedback, click "Request Changes"
 * 5. Task moves back to in_progress
 * 6. Re-seed → task back in review
 * 7. Approve & Complete → task done
 */
test('demo_code_review', async () => {
  test.setTimeout(180000)
  // Create test repo with realistic code on main
  testRepoPath = createTestRepo('review-demo', {
    'src/server.ts': '// Express server\nimport express from "express";\nconst app = express();\napp.listen(3000);\n',
    'src/routes/users.ts': '// User routes\nimport { Router } from "express";\nexport const router = Router();\nrouter.get("/users", (req, res) => res.json([]));\n',
  })

  // Create feature branch with meaningful code changes
  execSync('git checkout -b feature/add-auth', { cwd: testRepoPath, stdio: 'pipe' })
  fs.writeFileSync(
    path.join(testRepoPath, 'src/auth.ts'),
    '// Auth middleware\nexport function requireAuth(req, res, next) {\n  const token = req.headers.authorization;\n  if (!token) return res.status(401).json({ error: "Unauthorized" });\n  next();\n}\n'
  )
  fs.writeFileSync(
    path.join(testRepoPath, 'src/routes/users.ts'),
    '// User routes\nimport { Router } from "express";\nimport { requireAuth } from "../auth";\nexport const router = Router();\nrouter.get("/users", requireAuth, (req, res) => res.json([]));\nrouter.post("/users", requireAuth, (req, res) => res.status(201).json(req.body));\n'
  )
  execSync('git add . && git commit -m "Add auth middleware and protect user routes"', { cwd: testRepoPath, stdio: 'pipe' })

  const result = await launchApp('benchmark')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'NERV Dashboard — code review workflow', 2000)

  // Quick project setup
  const projectId = await quickCreateProject(window, 'Auth API', 'Add authentication to REST API')

  // Seed: cycle + task in review status + TaskReview record
  const taskId = await window.evaluate(async ({ projectId }) => {
    const cycle = await window.api.db.cycles.create(projectId, 1, 'Add authentication')
    const task = await window.api.db.tasks.create(projectId, 'Add auth middleware and protect routes', 'Implement JWT auth middleware and apply to user routes', cycle.id)
    await window.api.db.tasks.updateStatus(task.id, 'in_progress')
    await window.api.db.tasks.updateStatus(task.id, 'review')
    await window.api.reviews.create(task.id)
    return task.id
  }, { projectId })

  // Set worktree_path on task so review modal finds git diffs
  await electronApp.evaluate(async ({ app: _app }, { taskId, repoPath }) => {
    try {
      const Database = require('better-sqlite3')
      const path = require('path')
      const os = require('os')
      const dbPath = path.join(os.homedir(), '.nerv', 'state.db')
      const db = new Database(dbPath)
      db.prepare('UPDATE tasks SET worktree_path = ? WHERE id = ?').run(repoPath, taskId)
      db.close()
    } catch (e) {
      console.error('Failed to set worktree_path:', e)
    }
  }, { taskId, repoPath: testRepoPath })

  await window.waitForTimeout(1000)

  // ========================================
  // Step 1: Show dashboard with task in Review column
  // ========================================
  console.log('[Demo] Step 1: Dashboard with task in Review column')
  await demoWait(window, 'Task in Review column — ready for code review', 2000)

  // Try to spotlight the review column
  const reviewColumn = window.locator('[data-testid="column-review"], .column-review, .board-column:has-text("Review")').first()
  if (await reviewColumn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await spotlight(window, '[data-testid="column-review"], .column-review, .board-column:has-text("Review")', 2000)
  }

  // ========================================
  // Step 2: Click task card → open review modal
  // ========================================
  console.log('[Demo] Step 2: Opening review modal')

  const taskCard = window.locator('.task-item').first()
  if (await taskCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '.task-item')
    await demoWait(window, 'Opening task for review', 600)
    await taskCard.click()
    await window.waitForTimeout(1000)
  }

  // ========================================
  // Step 3: Show diff and Claude's summary
  // ========================================
  console.log('[Demo] Step 3: Showing code changes')

  // Toggle diff if the button exists
  const toggleDiffBtn = window.locator('[data-testid="toggle-diff-btn"]').first()
  if (await toggleDiffBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="toggle-diff-btn"]')
    await demoWait(window, 'Showing code diff', 600)
    await toggleDiffBtn.click()
    await window.waitForTimeout(500)

    // Spotlight diff stats
    const diffStats = window.locator('[data-testid="diff-stats"]').first()
    if (await diffStats.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="diff-stats"]', 2000)
    }

    // Spotlight diff content
    const diffContent = window.locator('[data-testid="diff-content"]').first()
    if (await diffContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="diff-content"]', 2500)
    }
  }

  // Spotlight Claude's summary
  const claudeSummary = window.locator('[data-testid="claude-summary"]').first()
  if (await claudeSummary.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spotlight(window, '[data-testid="claude-summary"]', 2000)
  }

  // ========================================
  // Step 4: Type feedback and request changes
  // ========================================
  console.log('[Demo] Step 4: Requesting changes')

  const reviewNotes = window.locator('[data-testid="review-notes-input"]').first()
  if (await reviewNotes.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="review-notes-input"]')
    await slowType(window, '[data-testid="review-notes-input"]', 'Add input validation for edge cases')
    await demoWait(window, 'Feedback entered', 800)
  }

  const rejectBtn = window.locator('[data-testid="reject-review-btn"]').first()
  if (await rejectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="reject-review-btn"]')
    await demoWait(window, 'Requesting changes', 600)
    await rejectBtn.click()
    await window.waitForTimeout(1000)
  }

  await demoWait(window, 'Task moved back to in_progress for Claude to address feedback', 2000)

  // ========================================
  // Step 5: Re-seed task back to review (simulating Claude applied feedback)
  // ========================================
  console.log('[Demo] Step 5: Task re-enters review after Claude applies feedback')

  await window.evaluate(async ({ taskId }) => {
    await window.api.db.tasks.updateStatus(taskId, 'review')
    await window.api.reviews.create(taskId)
  }, { taskId })
  await window.waitForTimeout(1000)

  // ========================================
  // Step 6: Open review modal again and approve
  // ========================================
  console.log('[Demo] Step 6: Approving the updated work')

  const taskCard2 = window.locator('.task-item').first()
  if (await taskCard2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '.task-item')
    await demoWait(window, 'Reviewing updated code', 600)
    await taskCard2.click()
    await window.waitForTimeout(1000)
  }

  // Type approval notes
  const reviewNotes2 = window.locator('[data-testid="review-notes-input"]').first()
  if (await reviewNotes2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="review-notes-input"]')
    await slowType(window, '[data-testid="review-notes-input"]', 'Looks good, validation added correctly')
    await demoWait(window, 'Approval notes entered', 800)
  }

  const approveBtn = window.locator('[data-testid="approve-review-btn"]').first()
  if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="approve-review-btn"]')
    await demoWait(window, 'Approving & completing task', 600)
    await approveBtn.click()
    await window.waitForTimeout(1500)
  }

  await demoWait(window, 'Task approved and moved to Done!', 2000)

  // Spotlight the Done column
  const doneColumn = window.locator('[data-testid="column-done"], .column-done, .board-column:has-text("Done")').first()
  if (await doneColumn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await spotlight(window, '[data-testid="column-done"], .column-done, .board-column:has-text("Done")', 2000)
  }

  // ========================================
  // Final panoramic
  // ========================================
  console.log('[Demo] Final panoramic')
  await demoWait(window, 'NERV Code Review — human-in-the-loop quality gate', 2500)

  await saveVideoAndClose(electronApp, window, 'code-review')
})

/**
 * Demo 3: YOLO Mode (Autonomous Benchmark)
 *
 * Shows the YOLO benchmark configuration workflow:
 * 1. Launch + create project
 * 2. Open YOLO panel via Workflow dropdown (visible click)
 * 3. Configure benchmark (spec file, test command, max cycles)
 * 4. Save config + spotlight on saved config list
 * 5. Seed a completed benchmark result
 * 6. Show Results tab with metrics
 * 7. Final panoramic
 */
test('demo_yolo_mode', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('todo-app', {
    'SPEC.md': `# Todo App Specification\n\n## Overview\nBuild a simple todo application with CRUD operations.\n\n## Requirements\n- [ ] Create todo items with title and description\n- [ ] List all todo items\n- [ ] Mark todo items as complete\n- [ ] Delete todo items\n\n## Tech Stack\n- TypeScript\n- Node.js\n- In-memory storage\n\n## Acceptance Criteria\n- All CRUD operations work correctly\n- Tests pass for each operation\n`,
    'src/index.ts': '// Todo App Entry Point\n',
    'package.json': JSON.stringify({
      name: 'todo-app',
      version: '1.0.0',
      scripts: { test: 'jest', start: 'ts-node src/index.ts' }
    }, null, 2)
  })

  const result = await launchApp('yolo')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'NERV Dashboard — ready for YOLO benchmark', 2500)

  // ========================================
  // Step 1: Create project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating YOLO benchmark project')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await glideToElement(window, SELECTORS.newProject)
  await demoWait(window, 'Highlighting New Project button', 1000)
  await newProjectBtn.click()
  await demoWait(window, 'Project dialog opened', 1200)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectNameInput, 'Todo App Benchmark')
    await demoWait(window, 'Project name entered', 800)
  }

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectGoalInput, 'Build a todo app from spec')
    await demoWait(window, 'Project goal entered', 800)
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.createProjectBtn)
    await demoWait(window, 'About to create project', 600)
    await createBtn.click()
    await demoWait(window, 'Project created for YOLO benchmark', 1500)
  }

  // ========================================
  // Step 2: Open YOLO panel via Workflow dropdown (visible click)
  // ========================================
  console.log('[Demo] Step 2: Opening YOLO panel')

  await clickDropdownItemDemo(window, SELECTORS.workflowDropdown, '[data-testid="yolo-btn"]')

  const yoloPanel = window.locator(SELECTORS.yoloPanel)
  await yoloPanel.waitFor({ timeout: 5000 })
  await demoWait(window, 'YOLO Benchmark panel opened', 1500)

  // ========================================
  // Step 3: Configure benchmark settings
  // ========================================
  console.log('[Demo] Step 3: Configuring YOLO benchmark')

  const specFileInput = window.locator('[data-testid="yolo-spec-file"]')
  if (await specFileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-spec-file"]')
    await specFileInput.fill('SPEC.md')
    await demoWait(window, 'Spec file: SPEC.md', 800)
  }

  const testCmdInput = window.locator('[data-testid="yolo-test-command"]')
  if (await testCmdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-test-command"]')
    await testCmdInput.fill('npm test')
    await demoWait(window, 'Test command: npm test', 800)
  }

  const maxCyclesInput = window.locator('[data-testid="yolo-max-cycles"]')
  if (await maxCyclesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-max-cycles"]')
    await maxCyclesInput.fill('5')
    await demoWait(window, 'Max cycles: 5', 800)
  }

  const autoApprove = window.locator('[data-testid="yolo-auto-approve-review"]')
  if (await autoApprove.isVisible({ timeout: 1000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-auto-approve-review"]')
    await demoWait(window, 'Auto-approve enabled', 600)
  }

  // Spotlight the configure form
  await spotlight(window, SELECTORS.yoloPanel, 2000)

  // ========================================
  // Step 4: Save configuration
  // ========================================
  console.log('[Demo] Step 4: Saving YOLO config')

  const saveConfigBtn = window.locator('[data-testid="yolo-save-config-btn"]')
  if (await saveConfigBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-save-config-btn"]')
    await demoWait(window, 'Saving benchmark configuration', 600)
    await saveConfigBtn.click()
    await demoWait(window, 'Configuration saved!', 1200)
  }

  // Spotlight saved config list
  const configList = window.locator('[data-testid="yolo-config-list"]')
  if (await configList.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spotlight(window, '[data-testid="yolo-config-list"]', 2000)
  }

  // ========================================
  // Step 5: Start YOLO benchmark
  // ========================================
  console.log('[Demo] Step 5: Starting YOLO benchmark')

  const startBtn = window.locator('[data-testid="yolo-start-btn"]').first()
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-start-btn"]')
    await demoWait(window, 'About to start autonomous benchmark', 800)
    await startBtn.click()
    await demoWait(window, 'YOLO benchmark started!', 1500)
  }

  // ========================================
  // Step 6: Show Running tab
  // ========================================
  console.log('[Demo] Step 6: Showing Running tab')

  const runningTab = window.locator('[data-testid="yolo-tab-running"]')
  if (await runningTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-tab-running"]')
    await runningTab.click()
    await demoWait(window, 'Running tab — live benchmark progress', 1000)

    const runningContent = window.locator('[data-testid="yolo-running-content"]')
    if (await runningContent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="yolo-running-content"]', 2500)
    }
  }

  // ========================================
  // Step 7: Wait for completion and show Results tab
  // ========================================
  console.log('[Demo] Step 7: Results tab')

  // Wait a bit for mock to complete
  await window.waitForTimeout(5000)

  const resultsTab = window.locator('[data-testid="yolo-tab-results"]')
  if (await resultsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-tab-results"]')
    await resultsTab.click()
    await demoWait(window, 'Results tab — benchmark metrics', 1000)

    const resultsContent = window.locator('[data-testid="yolo-results-content"]')
    if (await resultsContent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="yolo-results-content"]', 2500)
    }
  }

  // ========================================
  // Final panoramic
  // ========================================
  console.log('[Demo] Final panoramic')
  await demoWait(window, 'NERV YOLO Mode — autonomous benchmarking from spec to results', 2500)

  await saveVideoAndClose(electronApp, window, 'yolo-mode')
})

/**
 * Demo 4: Multi-Repo + Knowledge
 *
 * Shows multi-repo management and knowledge base:
 * 1. Launch + create project
 * 2. Seed repos via API
 * 3. Open Repos panel (visible click) → show connected repos
 * 4. Open Knowledge panel → show CLAUDE.md content
 * 5. Open Worktree panel → show worktree info
 * 6. Final panoramic
 */
test('demo_multi_repo', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('shared-types', {
    'src/types.ts': 'export interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport interface Todo {\n  id: string;\n  title: string;\n  completed: boolean;\n  userId: string;\n}\n',
    'src/validation.ts': 'export const isValidEmail = (email: string) => email.includes("@");\nexport const isValidId = (id: string) => /^[a-z0-9-]+$/.test(id);\n',
    'CLAUDE.md': '# Shared Types\n\n## Stack\n- TypeScript\n- Node.js\n\n## Standards\n- Use interfaces, not types\n- Export all types from index.ts\n',
    'package.json': JSON.stringify({
      name: 'shared-types',
      version: '1.0.0',
      main: 'src/types.ts',
      scripts: { build: 'tsc' }
    }, null, 2)
  })

  testRepoPath2 = createTestRepo('api-backend', {
    'src/server.ts': '// Express API Server\nimport express from "express";\n\nconst app = express();\napp.use(express.json());\napp.listen(3001, () => console.log("API on port 3001"));\n',
    'src/routes/users.ts': '// User API routes\nimport { Router } from "express";\nexport const userRouter = Router();\n',
    'CLAUDE.md': '# API Backend\n\n## Stack\n- Express\n- TypeScript\n- Jest\n\n## Standards\n- REST conventions\n- Validate inputs\n',
    'package.json': JSON.stringify({
      name: 'api-backend',
      version: '1.0.0',
      scripts: { dev: 'ts-node src/server.ts', test: 'jest' }
    }, null, 2)
  })

  const result = await launchApp('benchmark')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'NERV Dashboard — multi-repo + knowledge', 2500)

  // ========================================
  // Step 1: Create project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating multi-repo project')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await glideToElement(window, SELECTORS.newProject)
  await demoWait(window, 'Highlighting New Project button', 1000)
  await newProjectBtn.click()
  await demoWait(window, 'Project dialog opened', 1200)

  const nameInput2 = window.locator(SELECTORS.projectNameInput).first()
  if (await nameInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectNameInput, 'Full Stack App')
    await demoWait(window, 'Project name entered', 800)
  }

  const goalInput2 = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectGoalInput, 'API + frontend with shared types')
    await demoWait(window, 'Project goal entered', 800)
  }

  const createBtn2 = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.createProjectBtn)
    await demoWait(window, 'About to create project', 600)
    await createBtn2.click()
    await demoWait(window, 'Project created', 1500)
  }

  // Get project ID
  const projectId = await window.evaluate(async () => {
    const projects = await window.api.db.projects.getAll()
    return projects[0]?.id || ''
  })

  // ========================================
  // Step 2: Seed repos via API
  // ========================================
  console.log('[Demo] Step 2: Seeding repos')

  await window.evaluate(async ({ projectId, repoPath1, repoPath2 }) => {
    await window.api.db.repos.create(projectId, 'shared-types', repoPath1, { stack: 'TypeScript, Node.js' })
    await window.api.db.repos.create(projectId, 'api-backend', repoPath2, { stack: 'Express, TypeScript, Jest' })
  }, { projectId, repoPath1: testRepoPath, repoPath2: testRepoPath2 })
  await window.waitForTimeout(500)

  // ========================================
  // Step 3: Open Repos panel → show connected repos
  // ========================================
  console.log('[Demo] Step 3: Opening Repos panel')

  await clickDropdownItemDemo(window, SELECTORS.knowledgeDropdown, '[data-testid="repos-btn"]')

  // Wait for repos panel to appear
  const reposPanel = window.locator('.panel-container, .panel-overlay, [data-testid="repos-panel"]').first()
  if (await reposPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Repos panel — connected repositories', 1500)
    await spotlight(window, '.panel-container, .panel-overlay, [data-testid="repos-panel"]', 2500)

    // Close repos panel
    const closeBtn = window.locator('.panel-container .close-btn, .panel-overlay .close-btn').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await window.keyboard.press('Escape')
    }
    await window.waitForTimeout(500)
  }

  // ========================================
  // Step 4: Open Knowledge panel → show CLAUDE.md
  // ========================================
  console.log('[Demo] Step 4: Opening Knowledge panel')

  await clickDropdownItemDemo(window, SELECTORS.knowledgeDropdown, '[data-testid="knowledge-btn"]')

  const knowledgePanel = window.locator('.panel, [data-testid="knowledge-panel"]').first()
  if (await knowledgePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Knowledge Base — CLAUDE.md and project context', 1500)
    await spotlight(window, '.panel, [data-testid="knowledge-panel"]', 2500)

    // Close knowledge panel
    const overlay = window.locator('.overlay[role="dialog"]').first()
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await overlay.click({ position: { x: 10, y: 10 } })
    } else {
      await window.keyboard.press('Escape')
    }
    await window.waitForTimeout(800)

    try {
      await window.locator('.overlay[role="dialog"]').waitFor({ state: 'detached', timeout: 3000 })
    } catch {
      await window.keyboard.press('Escape')
      await window.waitForTimeout(500)
    }
  }

  // ========================================
  // Step 5: Open Worktree panel
  // ========================================
  console.log('[Demo] Step 5: Opening Worktree panel')

  await clickDropdownItemDemo(window, SELECTORS.workflowDropdown, '[data-testid="worktrees-btn"]')

  const worktreePanel = window.locator('[data-testid="worktree-panel"]')
  if (await worktreePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Worktree panel — manage git worktrees', 1500)
    await spotlight(window, '[data-testid="worktree-panel"]', 2000)

    const closeBtn = window.locator('[data-testid="worktree-panel"] .close-btn, [data-testid="worktree-panel"] button:has-text("Close")').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await window.keyboard.press('Escape')
    }
    await window.waitForTimeout(500)
  }

  // ========================================
  // Final panoramic
  // ========================================
  console.log('[Demo] Final panoramic')
  await demoWait(window, 'NERV — Multi-repo management with knowledge base and worktrees', 2500)

  await saveVideoAndClose(electronApp, window, 'multi-repo')
})

/**
 * Demo 5: Audit & Code Health
 *
 * Shows the audit panel with pre-seeded data:
 * 1. Quick project setup + seed cycle, tasks, audit logs
 * 2. Open Audit panel (visible click on Workflow dropdown)
 * 3. Health tab: run health check, spotlight metrics
 * 4. Spec Drift tab: run drift check, spotlight stale task warning
 * 5. Logs tab: spotlight filters and log entries
 * 6. Final panoramic
 */
test('demo_audit_health', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('audit-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'audit-demo',
      version: '1.0.0',
      scripts: { test: 'echo "Tests pass"', build: 'tsc' }
    }, null, 2)
  })

  const result = await launchApp('benchmark')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'NERV Dashboard — audit & code health', 2000)

  // ========================================
  // Step 1: Quick project setup + seed data
  // ========================================
  console.log('[Demo] Step 1: Quick project setup + seed data')

  const projectId = await quickCreateProject(window, 'Code Health Demo', 'Demonstrate audit and code health features')

  // Create cycle and tasks
  const taskIds = await window.evaluate(async ({ projectId }) => {
    const cycle = await window.api.db.cycles.create(projectId, 1, 'MVP Sprint')
    const t1 = await window.api.db.tasks.create(projectId, 'Set up project structure', 'Initialize TypeScript project with Express', cycle.id)
    await window.api.db.tasks.updateStatus(t1.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t1.id, 'done')
    const t2 = await window.api.db.tasks.create(projectId, 'Implement user auth', 'Add JWT auth middleware', cycle.id)
    await window.api.db.tasks.updateStatus(t2.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t2.id, 'done')
    const t3 = await window.api.db.tasks.create(projectId, 'Add integration tests', 'Write tests for auth endpoints', cycle.id)
    await window.api.db.tasks.updateStatus(t3.id, 'in_progress')
    // t3 stays in_progress — will be backdated to be "stale"
    return [t1.id, t2.id, t3.id]
  }, { projectId })

  // Backdate the in_progress task to trigger "stale task" in spec drift
  await backdateTask(electronApp, taskIds[2], 14)

  // Seed audit log entries
  await seedAuditData(window, taskIds)

  await demoWait(window, 'Data seeded: cycle, tasks, audit logs', 1000)

  // ========================================
  // Step 2: Open Audit panel (visible click)
  // ========================================
  console.log('[Demo] Step 2: Opening Audit panel')

  // Use visible dropdown click to show the workflow
  await clickDropdownItemDemo(window, SELECTORS.workflowDropdown, '[data-testid="audit-btn"]')

  const auditPanel = window.locator(SELECTORS.auditPanel)
  // If dropdown click didn't work, fall back to CustomEvent
  if (!await auditPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await window.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-audit-panel'))
    })
  }
  await auditPanel.waitFor({ timeout: 5000 })
  await demoWait(window, 'Audit panel opened', 1500)

  // ========================================
  // Step 3: Code Health tab
  // ========================================
  console.log('[Demo] Step 3: Showing Code Health tab')

  const healthTab = window.locator('[data-testid="audit-tab-health"]')
  if (await healthTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-health"]')
    await healthTab.click()
    await window.waitForTimeout(300)
  }

  const runHealthBtn = window.locator('[data-testid="run-health-check-btn"]')
  if (await runHealthBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="run-health-check-btn"]')
    await demoWait(window, 'Running code health check', 600)
    await runHealthBtn.click()
    await window.waitForTimeout(1000)
  }

  // Spotlight health metrics
  const healthMetrics = window.locator('[data-testid="health-metrics"]')
  if (await healthMetrics.isVisible({ timeout: 3000 }).catch(() => false)) {
    await spotlight(window, '[data-testid="health-metrics"]', 2500)
  } else {
    const healthContent = window.locator('[data-testid="audit-health-content"]')
    if (await healthContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="audit-health-content"]', 2500)
    }
  }

  // ========================================
  // Step 4: Spec Drift tab
  // ========================================
  console.log('[Demo] Step 4: Showing Spec Drift tab')

  const driftTab = window.locator('[data-testid="audit-tab-drift"]')
  if (await driftTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-drift"]')
    await demoWait(window, 'Switching to Spec Drift tab', 600)
    await driftTab.click()
    await window.waitForTimeout(500)

    const runDriftBtn = window.locator('[data-testid="run-drift-check-btn"]')
    if (await runDriftBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="run-drift-check-btn"]')
      await demoWait(window, 'Running drift check', 600)
      await runDriftBtn.click()
      await window.waitForTimeout(1000)
    }

    const driftContent = window.locator('[data-testid="audit-drift-content"]')
    if (await driftContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="audit-drift-content"]', 2500)
    }
  }

  // ========================================
  // Step 5: Logs tab
  // ========================================
  console.log('[Demo] Step 5: Showing Logs tab')

  const logsTab = window.locator('[data-testid="audit-tab-logs"]')
  if (await logsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-logs"]')
    await demoWait(window, 'Switching to Audit Logs tab', 600)
    await logsTab.click()
    await window.waitForTimeout(500)

    // Spotlight filter controls
    const taskFilter = window.locator('[data-testid="audit-task-filter"]')
    if (await taskFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="audit-task-filter"]')
      await demoWait(window, 'Filter audit events by task', 800)
    }

    const eventFilter = window.locator('[data-testid="audit-event-filter"]')
    if (await eventFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="audit-event-filter"]')
      await demoWait(window, 'Filter by event type', 800)
    }

    // Spotlight the entire audit panel to show populated logs
    await spotlight(window, SELECTORS.auditPanel, 2500)
  }

  // ========================================
  // Final panoramic
  // ========================================
  console.log('[Demo] Final panoramic')

  const closeBtn = window.locator(`${SELECTORS.auditPanel} .close-btn`).first()
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click()
    await window.waitForTimeout(500)
  }

  await demoWait(window, 'NERV Audit — code health, spec drift detection, and audit logging', 2500)

  await saveVideoAndClose(electronApp, window, 'audit-health')
})

/**
 * Demo 6: Cost & Context
 *
 * Shows cost tracking with pre-seeded session metrics:
 * 1. Quick project setup + seed tasks with cost data
 * 2. Open Cost Dashboard (visible click on Settings dropdown)
 * 3. Spotlight summary cards, budget progress, cost-by-model
 * 4. Show By Project tab
 * 5. Show Recent Tasks tab
 * 6. Final panoramic
 */
test('demo_cost_context', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('cost-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'cost-demo',
      version: '1.0.0',
      scripts: { test: 'echo "Tests pass"' }
    }, null, 2)
  })

  const result = await launchApp('benchmark')
  electronApp = result.app
  window = result.page

  await demoWait(window, 'NERV Dashboard — cost & context monitoring', 2000)

  // ========================================
  // Step 1: Quick project setup + seed cost data
  // ========================================
  console.log('[Demo] Step 1: Quick project setup + seed cost data')

  const projectId = await quickCreateProject(window, 'Cost Tracking Demo', 'Demonstrate cost and context monitoring')

  // Create tasks
  const taskIds = await window.evaluate(async ({ projectId }) => {
    const t1 = await window.api.tasksExtended.createWithType(projectId, 'Set up project structure', 'implementation')
    await window.api.db.tasks.updateStatus(t1.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t1.id, 'done')
    const t2 = await window.api.tasksExtended.createWithType(projectId, 'Implement user auth', 'implementation')
    await window.api.db.tasks.updateStatus(t2.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t2.id, 'done')
    const t3 = await window.api.tasksExtended.createWithType(projectId, 'Add integration tests', 'implementation')
    await window.api.db.tasks.updateStatus(t3.id, 'in_progress')
    return [t1.id, t2.id, t3.id]
  }, { projectId })

  // Seed session metrics with tokens via API
  await seedCostMetrics(window, [
    { id: taskIds[0], model: 'claude-sonnet-4-5-20250929', inputTokens: 85000, outputTokens: 32000 },
    { id: taskIds[1], model: 'claude-opus-4-6', inputTokens: 156000, outputTokens: 67000 },
    { id: taskIds[2], model: 'claude-sonnet-4-5-20250929', inputTokens: 42000, outputTokens: 15000 },
  ])

  // Seed cost_usd and duration_ms via direct DB (not in preload API)
  await seedCostDataDirect(electronApp, [
    { taskId: taskIds[0], model: 'claude-sonnet-4-5-20250929', inputTokens: 85000, outputTokens: 32000, costUsd: 0.85, durationMs: 45000, numTurns: 12 },
    { taskId: taskIds[1], model: 'claude-opus-4-6', inputTokens: 156000, outputTokens: 67000, costUsd: 2.45, durationMs: 120000, numTurns: 24 },
    { taskId: taskIds[2], model: 'claude-sonnet-4-5-20250929', inputTokens: 42000, outputTokens: 15000, costUsd: 0.55, durationMs: 30000, numTurns: 8 },
  ])

  await demoWait(window, 'Cost data seeded: 3 tasks, 2 models, $3.85 total', 1000)

  // ========================================
  // Step 2: Show Context Monitor (if visible)
  // ========================================
  console.log('[Demo] Step 2: Showing Context Monitor')

  const contextMonitor = window.locator(SELECTORS.contextMonitor).first()
  if (await contextMonitor.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.contextMonitor)
    await demoWait(window, 'Context Monitor — token usage, model, compaction count', 1200)
    await spotlight(window, SELECTORS.contextMonitor, 2500)
  } else {
    await demoWait(window, 'Context Monitor appears when a Claude session is active', 1500)
  }

  // ========================================
  // Step 3: Open Cost Dashboard via Settings dropdown (visible click)
  // ========================================
  console.log('[Demo] Step 3: Opening Cost Dashboard')

  await clickDropdownItemDemo(window, SELECTORS.settingsDropdown, '[data-testid="cost-btn"]')

  // Wait for cost dashboard modal
  const costModal = window.locator('.modal-backdrop, .modal, [data-testid="cost-dashboard"]').first()
  if (await costModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Cost Dashboard opened', 1500)

    // Spotlight summary cards
    const summaryCards = window.locator('[data-testid="cost-summary"]')
    if (await summaryCards.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotlight(window, '[data-testid="cost-summary"]', 2500)
    }

    // Spotlight budget progress
    const budgetProgress = window.locator('[data-testid="budget-progress"]')
    if (await budgetProgress.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="budget-progress"]')
      await demoWait(window, 'Budget usage and remaining', 800)
      await spotlight(window, '[data-testid="budget-progress"]', 2000)
    }

    // Spotlight cost by model
    const costByModel = window.locator('[data-testid="cost-by-model"]')
    if (await costByModel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="cost-by-model"]')
      await demoWait(window, 'Cost breakdown by model', 800)
      await spotlight(window, '[data-testid="cost-by-model"]', 2500)
    }

    // ========================================
    // Step 4: Show By Project tab
    // ========================================
    console.log('[Demo] Step 4: Cost by project')

    const costByProject = window.locator('[data-testid="cost-by-project"]')
    if (await costByProject.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="cost-by-project"]')
      await demoWait(window, 'Cost per project', 800)
      await spotlight(window, '[data-testid="cost-by-project"]', 2000)
    }

    // ========================================
    // Step 5: Show Recent Tasks tab (if tab-based)
    // ========================================
    console.log('[Demo] Step 5: Recent tasks')

    // Look for tab buttons within the cost modal
    const recentTasksTab = window.locator('button:has-text("Recent Tasks"), [data-testid="cost-tab-tasks"]').first()
    if (await recentTasksTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, 'button:has-text("Recent Tasks"), [data-testid="cost-tab-tasks"]')
      await recentTasksTab.click()
      await window.waitForTimeout(500)
    }

    // Close cost dashboard
    const closeBtnCost = window.locator('.modal .close-btn').first()
    if (await closeBtnCost.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtnCost.click()
      await window.waitForTimeout(500)
    }
  }

  // ========================================
  // Final panoramic
  // ========================================
  console.log('[Demo] Final panoramic')
  await demoWait(window, 'NERV — Cost tracking, context monitoring, and budget management', 2500)

  await saveVideoAndClose(electronApp, window, 'cost-context')
})
