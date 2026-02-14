/**
 * NERV Screenshot Demo Generator
 *
 * Captures screenshots for step-by-step documentation guides.
 * Uses Playwright with Electron — same helpers as docs-demos.spec.ts
 * but NO cursor overlay, NO captions, NO spotlight effects.
 *
 * Run with: npx playwright test test/e2e/screenshot-demos.spec.ts
 *
 * Screenshots are saved to docs-site/public/screenshots/demos/
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
const SCREENSHOTS_PATH = path.join(__dirname, '../../docs-site/public/screenshots/demos')

// Settings
const DEMO_VIEWPORT = { width: 1280, height: 720 }
const APP_LAUNCH_TIMEOUT = 60000

let electronApp: ElectronApplication
let testRepoPath: string
let testRepoPath2: string

// ============================================================================
// Helpers
// ============================================================================

/**
 * Take a screenshot and save to the appropriate demo directory.
 */
async function takeScreenshot(page: Page, demo: string, step: string): Promise<void> {
  const dir = path.join(SCREENSHOTS_PATH, demo)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${step}.png`) })
}

/**
 * Create a temporary git repository for testing.
 */
function createTestRepo(name: string, files: Record<string, string> = {}): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `nerv-demo-${name}-`))

  execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.email "demo@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.name "NERV Demo"', { cwd: tempDir, stdio: 'pipe' })

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
 * Clean up test repository.
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
 * Clean stale database state before each demo.
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
 * Launch Electron app (no video recording, no cursor overlay).
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

  return { app, page }
}

/**
 * Quick project creation — returns project ID.
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

  const projectId = await page.evaluate(async () => {
    const projects = await window.api.db.projects.getAll()
    return projects[0]?.id || ''
  })

  return projectId
}

/**
 * Click a dropdown menu item.
 */
async function clickDropdownItem(
  page: Page,
  dropdownSelector: string,
  itemSelector: string
): Promise<void> {
  await page.locator(dropdownSelector).click()
  await page.waitForTimeout(400)
  try {
    await page.locator(itemSelector).click({ timeout: 1000 })
  } catch {
    await page.locator(itemSelector).evaluate(el =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
  }
  await page.waitForTimeout(400)
}

/**
 * Seed cost data directly into SQLite (bypasses preload API for cost_usd/duration_ms).
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
 * Backdate a task's updated_at to trigger spec drift detection.
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
 * Seed audit log entries via renderer API.
 */
async function seedAuditData(page: Page, taskIds: string[]): Promise<void> {
  await page.evaluate(async ({ taskIds }) => {
    await window.api.db.audit.log(null, 'code_health_check', JSON.stringify({
      testCoverage: 78, dryViolations: 3, typeErrors: 0,
      deadCodeCount: 5, complexFunctions: 2, lastChecked: new Date().toISOString()
    }))
    for (const tid of taskIds) {
      await window.api.db.audit.log(tid, 'task_created', JSON.stringify({ title: 'Demo task' }))
      await window.api.db.audit.log(tid, 'task_status_changed', JSON.stringify({ from: 'idle', to: 'in_progress' }))
      await window.api.db.audit.log(tid, 'approval_requested', JSON.stringify({ toolName: 'Bash', command: 'npm test' }))
      await window.api.db.audit.log(tid, 'approval_resolved', JSON.stringify({ status: 'approved' }))
    }
    await window.api.db.audit.log(null, 'cycle_created', JSON.stringify({ cycleNumber: 1, goal: 'MVP Sprint' }))
    await window.api.db.audit.log(null, 'cycle_completed', JSON.stringify({ cycleNumber: 1, learnings: 'Auth module complete' }))
  }, { taskIds })
}

// ============================================================================
// Setup & Teardown
// ============================================================================

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOTS_PATH, { recursive: true })
})

test.afterEach(async () => {
  if (electronApp) {
    try {
      const pid = electronApp.process()?.pid
      await electronApp.evaluate(async ({ app }) => {
        app.quit()
      }).catch(() => {})

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
            } catch { /* already dead */ }
          }
          resolve()
        }, 5000)
      })
      await Promise.race([closePromise, timeoutPromise])
    } catch (e) {
      console.log('App close error:', e)
    }
  }

  if (testRepoPath) cleanupTestRepo(testRepoPath)
  if (testRepoPath2) cleanupTestRepo(testRepoPath2)
})

// ============================================================================
// Screenshot Tests
// ============================================================================

/**
 * Quick Start — 10 screenshots covering project creation, recommendations, and task workflow.
 */
test('screenshots_quick_start', async () => {
  test.setTimeout(240000)
  testRepoPath = createTestRepo('my-app', {
    'src/index.ts': '// Main entry point\nimport { startServer } from "./server";\nstartServer();\n',
    'src/server.ts': '// Server setup\nexport function startServer() {\n  console.log("Server running on port 3000");\n}\n',
    'src/routes/api.ts': '// API routes\nexport const routes = [];\n',
    'tests/api.test.ts': '// API tests\ndescribe("API", () => {\n  it("should start", () => { expect(true).toBe(true); });\n});\n',
    'package.json': JSON.stringify({
      name: 'my-rest-api', version: '0.1.0',
      scripts: { dev: 'ts-node src/index.ts', test: 'jest --coverage', build: 'tsc' },
      dependencies: { express: '^4.18.0' },
      devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' }
    }, null, 2),
    'CLAUDE.md': '# My REST API\n\n## Architecture\n- Express server with TypeScript\n- JWT authentication\n- PostgreSQL database\n\n## Testing\n- Run `npm test` for unit tests\n'
  })

  const { app, page } = await launchApp('benchmark')
  electronApp = app

  // 01 - Empty dashboard
  await page.waitForTimeout(1000)
  await takeScreenshot(page, 'quick-start', '01-empty-dashboard')

  // 02 - Click New Project → dialog
  const newProjectBtn = page.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await newProjectBtn.click()
  await page.waitForTimeout(500)
  await takeScreenshot(page, 'quick-start', '02-new-project-dialog')

  // 03 - Fill in project name and goal
  const nameInput = page.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('My REST API')
    await page.waitForTimeout(200)
  }
  const goalInput = page.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('Build a REST API with JWT auth, user CRUD, and full test coverage')
    await page.waitForTimeout(200)
  }
  await takeScreenshot(page, 'quick-start', '03-project-form-filled')

  // 04 - Create project → empty kanban board
  const createBtn = page.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'quick-start', '04-empty-kanban')

  // 05 - Open "What's Next?" panel
  await page.locator(SELECTORS.recommendBtn).click()
  await page.waitForTimeout(500)
  const panelVisible = await page.locator(SELECTORS.recommendPanel).isVisible().catch(() => false)
  if (!panelVisible) {
    await page.locator(SELECTORS.recommendBtn).click()
    await page.waitForTimeout(500)
  }
  await page.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })
  await takeScreenshot(page, 'quick-start', '05-whats-next-panel')

  // 06 - Ask for recommendations → cards appear
  await page.locator(SELECTORS.recommendAskBtn).click()
  const card0 = page.locator(SELECTORS.recommendCard(0))
  await card0.waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
  await takeScreenshot(page, 'quick-start', '06-recommendations')

  // 07 - Approve recommendation (create cycle) → show result
  await page.locator(SELECTORS.recommendApprove(0)).click()
  try {
    await page.locator(SELECTORS.recommendExecuteSuccess).waitFor({ timeout: 5000 })
  } catch { /* auto-dismissed */ }
  await waitForRecommendDismissed(page)
  await page.waitForTimeout(500)

  // Dismiss backdrop if present
  const backdrop = page.locator('.recommend-backdrop').first()
  if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
    await backdrop.click()
    await page.waitForTimeout(300)
  }

  // 08 - What's Next round 2 → create a task
  await waitForRecommendDismissed(page)
  await page.locator(SELECTORS.recommendBtn).click()
  await page.waitForTimeout(500)
  const panel2 = await page.locator(SELECTORS.recommendPanel).isVisible().catch(() => false)
  if (!panel2) {
    await page.locator(SELECTORS.recommendBtn).click()
    await page.waitForTimeout(500)
  }
  await page.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })
  await page.locator(SELECTORS.recommendAskBtn).click()
  const card0r2 = page.locator(SELECTORS.recommendCard(0))
  await card0r2.waitFor({ timeout: 15000 })
  await page.locator(SELECTORS.recommendApprove(0)).click()
  try {
    await page.locator(SELECTORS.recommendExecuteSuccess).waitFor({ timeout: 5000 })
  } catch { /* auto-dismissed */ }
  await waitForRecommendDismissed(page)
  await page.waitForTimeout(500)

  // Kanban board with task
  await takeScreenshot(page, 'quick-start', '07-kanban-with-task')

  // 08 - Add a second task manually
  const addTaskBtn = page.locator(SELECTORS.addTaskBtn).first()
  if (await addTaskBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addTaskBtn.click()
    await page.waitForTimeout(800)

    const taskTitleInput = page.locator(SELECTORS.taskTitleInput).first()
    if (await taskTitleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await taskTitleInput.fill('Add JWT authentication middleware')
      await page.waitForTimeout(200)
    }

    const taskDescInput = page.locator('#task-description').first()
    if (await taskDescInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await taskDescInput.fill('Implement JWT token validation, refresh tokens, and role-based access control')
      await page.waitForTimeout(200)
    }

    await takeScreenshot(page, 'quick-start', '08-new-task-dialog')

    const createTaskBtn = page.locator(SELECTORS.createTaskBtn).first()
    if (await createTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createTaskBtn.click()
      await page.waitForTimeout(1000)
    }
  }

  // 09 - Kanban board with 2 tasks
  await takeScreenshot(page, 'quick-start', '09-kanban-two-tasks')

  // 10 - Start a task → terminal output
  const startBtn = page.locator('[data-testid="start-task-btn"]').first()
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await startBtn.click()
    await page.waitForTimeout(2000)

    // Switch to CLIs tab to see terminal
    const cliTab = page.locator('[data-testid="tab-clis"]')
    if (await cliTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cliTab.click()
      await page.waitForTimeout(1000)
    }

    const terminal = page.locator(SELECTORS.terminal).first()
    if (await terminal.isVisible({ timeout: 8000 }).catch(() => false)) {
      await page.waitForTimeout(2000)
      await takeScreenshot(page, 'quick-start', '10-terminal-working')
    }
  }
})

/**
 * Code Review — 8 screenshots covering the review modal workflow.
 */
test('screenshots_code_review', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('review-demo', {
    'src/server.ts': '// Express server\nimport express from "express";\nconst app = express();\napp.listen(3000);\n',
    'src/routes/users.ts': '// User routes\nimport { Router } from "express";\nexport const router = Router();\nrouter.get("/users", (req, res) => res.json([]));\n',
  })

  // Create feature branch with code changes
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

  const { app, page } = await launchApp('benchmark')
  electronApp = app

  // Quick project setup
  const projectId = await quickCreateProject(page, 'Auth API', 'Add authentication to REST API')

  // Seed: cycle + task in review status + review record
  const taskId = await page.evaluate(async ({ projectId }) => {
    const cycle = await window.api.db.cycles.create(projectId, 1, 'Add authentication')
    const task = await window.api.db.tasks.create(projectId, 'Add auth middleware and protect routes', 'Implement JWT auth middleware and apply to user routes', cycle.id)
    await window.api.db.tasks.updateStatus(task.id, 'in_progress')
    await window.api.db.tasks.updateStatus(task.id, 'review')
    await window.api.reviews.create(task.id)
    return task.id
  }, { projectId })

  await page.evaluate(async ({ taskId, repoPath }) => {
    await window.api.db.tasks.updateWorktree(taskId, repoPath)
  }, { taskId, repoPath: testRepoPath })

  await page.evaluate(async ({ taskId }) => {
    await window.api.reviews.setClaudeSummary(
      taskId,
      'Added JWT authentication middleware in src/auth.ts with token validation. Applied requireAuth guard to all user routes in src/routes/users.ts. The middleware checks for Authorization header and returns 401 if missing. Added POST /users endpoint for creating new users.'
    )
  }, { taskId })

  await page.evaluate(async ({ projectId: pid }) => {
    const store = (window as any).__nervStore
    if (store?.loadTasks) await store.loadTasks(pid)
  }, { projectId })
  await page.waitForTimeout(1000)

  // 01 - Task in review column
  await takeScreenshot(page, 'code-review', '01-task-in-review')

  // 02 - Open review modal
  const taskCard = page.locator('[data-testid="task-item"]').first()
  if (await taskCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await taskCard.dispatchEvent('click')
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'code-review', '02-review-modal')

  // 03 - Show diff (toggle it open)
  const loadingIndicator = page.locator('.loading-indicator:has-text("Loading")')
  try {
    await loadingIndicator.waitFor({ state: 'visible', timeout: 5000 })
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 20000 })
  } catch { /* loading may already be done */ }

  const toggleDiffBtn = page.locator('[data-testid="toggle-diff-btn"]').first()
  if (await toggleDiffBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await toggleDiffBtn.click()
    await page.waitForTimeout(500)
    await takeScreenshot(page, 'code-review', '03-diff-expanded')
  }

  // 04 - Claude's summary
  const claudeSummary = page.locator('[data-testid="claude-summary"]').first()
  if (await claudeSummary.isVisible({ timeout: 2000 }).catch(() => false)) {
    await takeScreenshot(page, 'code-review', '04-claude-summary')
  }

  // 05 - Type review feedback
  const reviewNotes = page.locator('[data-testid="review-notes-input"]').first()
  if (await reviewNotes.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reviewNotes.fill('Add input validation for edge cases')
    await page.waitForTimeout(300)
    await takeScreenshot(page, 'code-review', '05-review-feedback')
  }

  // 06 - Click "Request Changes"
  const rejectBtn = page.locator('[data-testid="reject-review-btn"]').first()
  if (await rejectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await rejectBtn.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'code-review', '06-changes-requested')

  // 07 - Re-seed task back to review (simulating Claude addressing feedback)
  await page.evaluate(async ({ taskId }) => {
    await window.api.db.tasks.updateStatus(taskId, 'review')
    await window.api.reviews.create(taskId)
  }, { taskId })
  await page.evaluate(async ({ projectId: pid }) => {
    const store = (window as any).__nervStore
    if (store?.loadTasks) await store.loadTasks(pid)
  }, { projectId })
  await page.waitForTimeout(1000)
  await takeScreenshot(page, 'code-review', '07-resubmitted')

  // 08 - Approve → task done
  const taskCard2 = page.locator('[data-testid="task-item"]').first()
  if (await taskCard2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await taskCard2.dispatchEvent('click')
    await page.waitForTimeout(1000)
  }

  const approveBtn = page.locator('[data-testid="approve-review-btn"]').first()
  if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await approveBtn.click()
    await page.waitForTimeout(1500)
  }
  await takeScreenshot(page, 'code-review', '08-approved-done')
})

/**
 * YOLO Mode — 6 screenshots covering configuration and results.
 */
test('screenshots_yolo_mode', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('todo-app', {
    'SPEC.md': '# Todo App Specification\n\n## Overview\nBuild a simple todo application with CRUD operations.\n\n## Requirements\n- [ ] Create todo items with title and description\n- [ ] List all todo items\n- [ ] Mark todo items as complete\n- [ ] Delete todo items\n\n## Tech Stack\n- TypeScript\n- Node.js\n\n## Acceptance Criteria\n- All CRUD operations work correctly\n- Tests pass for each operation\n',
    'src/index.ts': '// Todo App Entry Point\n',
    'package.json': JSON.stringify({
      name: 'todo-app', version: '1.0.0',
      scripts: { test: 'jest', start: 'ts-node src/index.ts' }
    }, null, 2)
  })

  const { app, page } = await launchApp('yolo')
  electronApp = app

  await quickCreateProject(page, 'Todo App Benchmark', 'Build a todo app from spec')

  // Open YOLO panel
  await clickDropdownItem(page, SELECTORS.workflowDropdown, '[data-testid="yolo-btn"]')
  const yoloPanel = page.locator(SELECTORS.yoloPanel)
  await yoloPanel.waitFor({ timeout: 5000 })

  // 01 - YOLO panel configure tab (empty)
  await takeScreenshot(page, 'yolo-mode', '01-configure-empty')

  // 02 - Fill in configuration
  const specFileInput = page.locator('[data-testid="yolo-spec-file"]')
  if (await specFileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await specFileInput.fill('SPEC.md')
  }
  const testCmdInput = page.locator('[data-testid="yolo-test-command"]')
  if (await testCmdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await testCmdInput.fill('npm test')
  }
  const maxCyclesInput = page.locator('[data-testid="yolo-max-cycles"]')
  if (await maxCyclesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await maxCyclesInput.fill('5')
  }
  await page.waitForTimeout(300)
  await takeScreenshot(page, 'yolo-mode', '02-configure-filled')

  // 03 - Save configuration
  const saveConfigBtn = page.locator('[data-testid="yolo-save-config-btn"]')
  if (await saveConfigBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveConfigBtn.click()
    await page.waitForTimeout(800)
  }
  await takeScreenshot(page, 'yolo-mode', '03-config-saved')

  // 04 - Start benchmark → running tab
  const startBtn = page.locator('[data-testid="yolo-start-btn"]').first()
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await startBtn.click()
    await page.waitForTimeout(1500)
  }

  const runningTab = page.locator('[data-testid="yolo-tab-running"]')
  if (await runningTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await runningTab.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'yolo-mode', '04-running')

  // 05 - Wait for completion → results tab
  await page.waitForTimeout(5000)
  const resultsTab = page.locator('[data-testid="yolo-tab-results"]')
  if (await resultsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resultsTab.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'yolo-mode', '05-results')

  // 06 - Final board state
  // Close YOLO panel and show kanban
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await takeScreenshot(page, 'yolo-mode', '06-board-after')
})

/**
 * Multi-Repo — 6 screenshots covering multi-repo management.
 */
test('screenshots_multi_repo', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('shared-types', {
    'src/types.ts': 'export interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport interface Todo {\n  id: string;\n  title: string;\n  completed: boolean;\n  userId: string;\n}\n',
    'CLAUDE.md': '# Shared Types\n\n## Stack\n- TypeScript\n- Node.js\n\n## Standards\n- Use interfaces, not types\n- Export all types from index.ts\n',
    'package.json': JSON.stringify({
      name: 'shared-types', version: '1.0.0',
      main: 'src/types.ts', scripts: { build: 'tsc' }
    }, null, 2)
  })

  testRepoPath2 = createTestRepo('api-backend', {
    'src/server.ts': '// Express API Server\nimport express from "express";\nconst app = express();\napp.use(express.json());\napp.listen(3001);\n',
    'CLAUDE.md': '# API Backend\n\n## Stack\n- Express\n- TypeScript\n- Jest\n\n## Standards\n- REST conventions\n- Validate inputs\n',
    'package.json': JSON.stringify({
      name: 'api-backend', version: '1.0.0',
      scripts: { dev: 'ts-node src/server.ts', test: 'jest' }
    }, null, 2)
  })

  const { app, page } = await launchApp('benchmark')
  electronApp = app

  const projectId = await quickCreateProject(page, 'Full Stack App', 'API + frontend with shared types')

  // Seed repos
  await page.evaluate(async ({ projectId, repoPath1, repoPath2 }) => {
    await window.api.db.repos.create(projectId, 'shared-types', repoPath1, { stack: 'TypeScript, Node.js' })
    await window.api.db.repos.create(projectId, 'api-backend', repoPath2, { stack: 'Express, TypeScript, Jest' })
  }, { projectId, repoPath1: testRepoPath, repoPath2: testRepoPath2 })

  // Seed tasks across repos
  await page.evaluate(async (pid: string) => {
    const cycle = await window.api.db.cycles.create(pid, 1, 'Cross-Repo Sprint')
    const t1 = await window.api.db.tasks.create(pid, 'Shared type definitions', 'Define User and Todo interfaces in shared-types', cycle.id)
    await window.api.db.tasks.updateStatus(t1.id, 'done')
    const t2 = await window.api.db.tasks.create(pid, 'API validation layer', 'Add input validation using shared types', cycle.id)
    await window.api.db.tasks.updateStatus(t2.id, 'in_progress')
    await window.api.db.tasks.create(pid, 'Integration tests', 'Write cross-repo integration tests', cycle.id)
  }, projectId)

  await page.evaluate(async (pid: string) => {
    const store = (window as any).__nervStore
    if (store?.loadTasks) await store.loadTasks(pid)
  }, projectId)
  await page.waitForTimeout(500)

  // 01 - Kanban board with tasks
  const kanbanTab = page.locator(SELECTORS.tabKanban)
  if (await kanbanTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await kanbanTab.click()
    await page.waitForTimeout(500)
  }
  await takeScreenshot(page, 'multi-repo', '01-kanban-board')

  // 02 - Open Repos panel
  await clickDropdownItem(page, SELECTORS.moreDropdown, '[data-testid="repos-btn"]')
  const reposPanel = page.locator('.panel-container, .panel-overlay, [data-testid="repos-panel"]').first()
  if (await reposPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(500)
    await takeScreenshot(page, 'multi-repo', '02-repos-panel')

    // Close repos panel
    const closeBtn = page.locator('.panel-container .close-btn, .panel-overlay .close-btn').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(500)
  }

  // 03 - Open Knowledge panel
  await clickDropdownItem(page, SELECTORS.moreDropdown, '[data-testid="knowledge-btn"]')
  const knowledgePanel = page.locator('.panel, [data-testid="knowledge-panel"]').first()
  if (await knowledgePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(500)
    await takeScreenshot(page, 'multi-repo', '03-knowledge-panel')

    const overlay = page.locator('.overlay[role="dialog"]').first()
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await overlay.click({ position: { x: 10, y: 10 } })
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(500)
    try {
      await page.locator('.overlay[role="dialog"]').waitFor({ state: 'detached', timeout: 3000 })
    } catch {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  }

  // 04 - Open Worktree panel
  await clickDropdownItem(page, SELECTORS.moreDropdown, '[data-testid="worktrees-btn"]')
  const worktreePanel = page.locator('[data-testid="worktree-panel"]')
  if (await worktreePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(500)
    await takeScreenshot(page, 'multi-repo', '04-worktrees-panel')

    const closeBtn = page.locator('[data-testid="worktree-panel"] .close-btn').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(500)
  }

  // 05 - Click a task to show detail
  const taskCard = page.locator('[data-testid="task-item"]').first()
  if (await taskCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await taskCard.dispatchEvent('click')
    await page.waitForTimeout(1000)
    await takeScreenshot(page, 'multi-repo', '05-task-detail')
  }
})

/**
 * Audit & Health — 7 screenshots covering health, drift, and logs tabs.
 */
test('screenshots_audit_health', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('audit-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'audit-demo', version: '1.0.0',
      scripts: { test: 'echo "Tests pass"', build: 'tsc' }
    }, null, 2)
  })

  const { app, page } = await launchApp('benchmark')
  electronApp = app

  const projectId = await quickCreateProject(page, 'Code Health Demo', 'Demonstrate audit and code health features')

  // Seed cycle and tasks
  const taskIds = await page.evaluate(async ({ projectId }) => {
    const cycle = await window.api.db.cycles.create(projectId, 1, 'MVP Sprint')
    const t1 = await window.api.db.tasks.create(projectId, 'Set up project structure', 'Initialize TypeScript project with Express', cycle.id)
    await window.api.db.tasks.updateStatus(t1.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t1.id, 'done')
    const t2 = await window.api.db.tasks.create(projectId, 'Implement user auth', 'Add JWT auth middleware', cycle.id)
    await window.api.db.tasks.updateStatus(t2.id, 'in_progress')
    await window.api.db.tasks.updateStatus(t2.id, 'done')
    const t3 = await window.api.db.tasks.create(projectId, 'Add integration tests', 'Write tests for auth endpoints', cycle.id)
    await window.api.db.tasks.updateStatus(t3.id, 'in_progress')
    return [t1.id, t2.id, t3.id]
  }, { projectId })

  await backdateTask(app, taskIds[2], 14)
  await seedAuditData(page, taskIds)

  // Open audit panel
  await clickDropdownItem(page, SELECTORS.workflowDropdown, '[data-testid="audit-btn"]')
  const auditPanel = page.locator(SELECTORS.auditPanel)
  if (!await auditPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-audit-panel'))
    })
  }
  await auditPanel.waitFor({ timeout: 5000 })
  await page.waitForTimeout(500)

  // 01 - Health tab
  const healthTab = page.locator('[data-testid="audit-tab-health"]')
  if (await healthTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await healthTab.click()
    await page.waitForTimeout(300)
  }
  const runHealthBtn = page.locator('[data-testid="run-health-check-btn"]')
  if (await runHealthBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await runHealthBtn.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'audit-health', '01-health-metrics')

  // 02 - Health tab action items
  await takeScreenshot(page, 'audit-health', '02-health-actions')

  // 03 - Spec Drift tab
  const driftTab = page.locator('[data-testid="audit-tab-drift"]')
  if (await driftTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await driftTab.click()
    await page.waitForTimeout(500)
  }
  const runDriftBtn = page.locator('[data-testid="run-drift-check-btn"]')
  if (await runDriftBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await runDriftBtn.click()
    await page.waitForTimeout(1000)
  }
  await takeScreenshot(page, 'audit-health', '03-spec-drift')

  // 04 - Stale task warning detail
  await takeScreenshot(page, 'audit-health', '04-stale-task')

  // 05 - Logs tab
  const logsTab = page.locator('[data-testid="audit-tab-logs"]')
  if (await logsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logsTab.click()
    await page.waitForTimeout(500)
  }
  await takeScreenshot(page, 'audit-health', '05-logs')

  // 06 - Filter by task
  const taskFilter = page.locator('[data-testid="audit-task-filter"]')
  if (await taskFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
    await taskFilter.selectOption({ index: 1 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  await takeScreenshot(page, 'audit-health', '06-logs-filtered')
})

/**
 * Cost & Context — 6 screenshots covering cost dashboard tabs.
 */
test('screenshots_cost_context', async () => {
  test.setTimeout(180000)
  testRepoPath = createTestRepo('cost-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'cost-demo', version: '1.0.0',
      scripts: { test: 'echo "Tests pass"' }
    }, null, 2)
  })

  const { app, page } = await launchApp('benchmark')
  electronApp = app

  const projectId = await quickCreateProject(page, 'Cost Tracking Demo', 'Demonstrate cost and context monitoring')

  // Create tasks
  const taskIds = await page.evaluate(async ({ projectId }) => {
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

  // Seed cost data directly (INSERT OR REPLACE — avoids conflict with seedCostMetrics)
  await seedCostDataDirect(app, [
    { taskId: taskIds[0], model: 'claude-sonnet-4-5-20250929', inputTokens: 85000, outputTokens: 32000, costUsd: 0.85, durationMs: 45000, numTurns: 12 },
    { taskId: taskIds[1], model: 'claude-opus-4-6', inputTokens: 156000, outputTokens: 67000, costUsd: 2.45, durationMs: 120000, numTurns: 24 },
    { taskId: taskIds[2], model: 'claude-sonnet-4-5-20250929', inputTokens: 42000, outputTokens: 15000, costUsd: 0.55, durationMs: 30000, numTurns: 8 },
  ])

  // 01 - Dashboard before opening cost panel (context monitor if visible)
  await takeScreenshot(page, 'cost-context', '01-dashboard')

  // Open cost dashboard
  await clickDropdownItem(page, SELECTORS.settingsDropdown, '[data-testid="cost-btn"]')
  const costModal = page.locator('.modal-backdrop, .modal, [data-testid="cost-dashboard"]').first()
  if (await costModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(500)

    // 02 - Cost dashboard overview
    await takeScreenshot(page, 'cost-context', '02-cost-overview')

    // 03 - Cost by model
    const costByModel = page.locator('[data-testid="cost-by-model"]')
    if (await costByModel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await takeScreenshot(page, 'cost-context', '03-cost-by-model')
    }

    // 04 - Budget progress
    const budgetProgress = page.locator('[data-testid="budget-progress"]')
    if (await budgetProgress.isVisible({ timeout: 2000 }).catch(() => false)) {
      await takeScreenshot(page, 'cost-context', '04-budget-progress')
    }

    // 05 - Cost by project
    const costByProject = page.locator('[data-testid="cost-by-project"]')
    if (await costByProject.isVisible({ timeout: 2000 }).catch(() => false)) {
      await takeScreenshot(page, 'cost-context', '05-cost-by-project')
    }

    // 06 - Recent tasks
    const recentTasksTab = page.locator('button:has-text("Recent Tasks"), [data-testid="cost-tab-tasks"]').first()
    if (await recentTasksTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await recentTasksTab.click()
      await page.waitForTimeout(500)
    }
    await takeScreenshot(page, 'cost-context', '06-recent-tasks')
  }
})
