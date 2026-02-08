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
 * - yolo-mode.mp4 - YOLO benchmark demo
 * - multi-repo.mp4 - Multi-repo workflow
 */

import { test, expect, _electron as electron, ElectronApplication, Page, BrowserContext } from '@playwright/test'
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
 * Zoom into a region of the page for emphasis.
 * Applies CSS transform to zoom into a specific element,
 * holds for the specified duration, then zooms back out.
 */
async function zoomInto(page: Page, selector: string, holdMs = 2000, scale = 1.8): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox()
  if (!box) return

  // Calculate transform origin based on element position
  const originX = box.x + box.width / 2
  const originY = box.y + box.height / 2

  // Apply zoom
  await page.evaluate(({ originX, originY, scale }) => {
    const app = document.querySelector('[data-testid="app"]') as HTMLElement || document.body
    app.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
    app.style.transformOrigin = `${originX}px ${originY}px`
    app.style.transform = `scale(${scale})`
  }, { originX, originY, scale })

  await page.waitForTimeout(holdMs)

  // Zoom back out
  await page.evaluate(() => {
    const app = document.querySelector('[data-testid="app"]') as HTMLElement || document.body
    app.style.transform = 'scale(1)'
  })
  await page.waitForTimeout(700) // Wait for transition to finish
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
 * Setup: Create docs/demos directory
 */
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
 * Demo: Quick Start (2-min getting started)
 *
 * Shows the recommend-first workflow that drives NERV's core UX:
 * 1. App launch with clean dashboard
 * 2. Create new project with slow typing
 * 3. "What's Next?" round 1 → creates a cycle
 * 4. Show the cycle created
 * 5. "What's Next?" round 2 → creates a task
 * 6. Show task on board
 * 7. Start the task → Claude works in terminal
 * 8. Wait for completion
 * 9. Final panoramic view
 */
test('demo_quick_start', async () => {
  // Create test repo with realistic project structure
  testRepoPath = createTestRepo('my-app', {
    'src/index.ts': '// Main entry point\nimport { startServer } from "./server";\nstartServer();\n',
    'src/server.ts': '// Server setup\nexport function startServer() {\n  console.log("Server running on port 3000");\n}\n',
    'src/routes/api.ts': '// API routes\nexport const routes = [];\n',
    'package.json': JSON.stringify({
      name: 'my-app',
      version: '1.0.0',
      scripts: {
        dev: 'ts-node src/index.ts',
        test: 'jest',
        build: 'tsc'
      }
    }, null, 2)
  })

  // Verify the built app exists
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Clean stale database state from previous runs (pattern from launch.ts)
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }

  // Launch Electron with video recording
  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'benchmark',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.setViewportSize(DEMO_VIEWPORT)
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  // Wait for app to fully render - show the dashboard
  await window.waitForSelector(SELECTORS.app, { timeout: 10000 })

  // Inject cursor overlay for visible mouse tracking
  await injectCursorOverlay(window)

  await demoWait(window, 'App launched - showing empty NERV dashboard', 2500)

  // ========================================
  // Step 1: Create a new project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating new project')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await glideToElement(window, SELECTORS.newProject)
  await demoWait(window, 'Highlighting New Project button', 1000)
  await newProjectBtn.click()
  await demoWait(window, 'Project dialog opened', 1200)

  // Slow type the project name
  const projectNameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await projectNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectNameInput, 'My REST API')
    await demoWait(window, 'Project name entered', 800)
  }

  // Slow type the project goal
  const projectGoalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await projectGoalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectGoalInput, 'Build a REST API with user auth')
    await demoWait(window, 'Project goal entered', 800)
  }

  // Create the project
  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.createProjectBtn)
    await demoWait(window, 'About to create project', 600)
    await createBtn.click()
    await demoWait(window, 'Project created successfully', 1500)
  }

  // ========================================
  // Step 2: "What's Next?" round 1 — create a cycle
  // ========================================
  console.log('[Demo] Step 2: What\'s Next? → Create cycle')

  // Click the "What's Next?" button
  await glideToElement(window, SELECTORS.recommendBtn)
  await demoWait(window, 'About to ask "What\'s Next?"', 800)
  await window.locator(SELECTORS.recommendBtn).click()
  await demoWait(window, 'Recommend panel opened', 500)

  // Wait for panel to appear
  await window.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })

  // Type a direction
  const dirInput = window.locator(SELECTORS.recommendDirectionInput)
  await slowType(window, SELECTORS.recommendDirectionInput, 'start with a cycle')
  await demoWait(window, 'Direction entered', 600)

  // Click Ask
  await glideToElement(window, SELECTORS.recommendAskBtn)
  await window.locator(SELECTORS.recommendAskBtn).click()
  await demoWait(window, 'Asking Claude for recommendations...', 500)

  // Wait for recommendation cards to appear
  const card0 = window.locator(SELECTORS.recommendCard(0))
  await card0.waitFor({ timeout: 15000 })
  await demoWait(window, 'Recommendations received', 800)

  // Zoom into the cards for visibility
  await zoomInto(window, SELECTORS.recommendPanel, 2000, 1.5)

  // Approve the first card (create_cycle)
  await glideToElement(window, SELECTORS.recommendApprove(0))
  await demoWait(window, 'Approving: Start your first development cycle', 600)
  await window.locator(SELECTORS.recommendApprove(0)).click()

  // Wait for success + auto-dismiss
  try {
    await window.locator(SELECTORS.recommendExecuteSuccess).waitFor({ timeout: 5000 })
    await demoWait(window, 'Cycle created! Panel auto-dismissing...', 1500)
  } catch {
    // Panel may have already auto-dismissed
  }
  await waitForRecommendDismissed(window)
  await demoWait(window, 'Panel dismissed', 500)

  // Dismiss recommend backdrop if still present (z-index:99 blocks clicks)
  const backdrop = window.locator('.recommend-backdrop').first()
  if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
    await backdrop.click()
    await window.waitForTimeout(300)
  }

  // ========================================
  // Step 3: Show the cycle that was created
  // ========================================
  console.log('[Demo] Step 3: Showing created cycle')

  const cyclesBtn = window.locator(SELECTORS.cyclesBtn).first()
  if (await cyclesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.cyclesBtn)
    await demoWait(window, 'Opening cycle panel', 600)
    await cyclesBtn.click()

    const cyclePanel = window.locator(SELECTORS.cyclePanel).first()
    if (await cyclePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await demoWait(window, 'Cycle panel showing active cycle', 800)
      await zoomInto(window, SELECTORS.cyclePanel, 2000, 1.5)

      // Close cycle panel via close button
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
  await demoWait(window, 'Asking "What\'s Next?" again', 800)
  await window.locator(SELECTORS.recommendBtn).click()
  await window.waitForTimeout(500)

  // Check if panel appeared, retry if needed
  const panelVisible = await window.locator(SELECTORS.recommendPanel).isVisible().catch(() => false)
  if (!panelVisible) {
    await window.locator(SELECTORS.recommendBtn).click()
    await window.waitForTimeout(500)
  }
  await window.locator(SELECTORS.recommendPanel).waitFor({ timeout: 5000 })

  // Click Ask (no direction this time)
  await glideToElement(window, SELECTORS.recommendAskBtn)
  await window.locator(SELECTORS.recommendAskBtn).click()
  await demoWait(window, 'Asking for next recommendations...', 500)

  // Wait for cards — now should suggest create_task since cycle exists but no tasks
  const card0Round2 = window.locator(SELECTORS.recommendCard(0))
  await card0Round2.waitFor({ timeout: 15000 })
  await demoWait(window, 'Recommendations: Implement core feature', 800)

  // Zoom into cards
  await zoomInto(window, SELECTORS.recommendPanel, 2000, 1.5)

  // Approve the first card (create_task)
  await glideToElement(window, SELECTORS.recommendApprove(0))
  await demoWait(window, 'Approving: Implement core feature', 600)
  await window.locator(SELECTORS.recommendApprove(0)).click()

  // Wait for success + auto-dismiss
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
  console.log('[Demo] Step 5: Showing task on board')

  const taskList = window.locator(SELECTORS.taskList).first()
  if (await taskList.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.taskList)
    await zoomInto(window, SELECTORS.taskList, 2000, 1.5)
  }

  // ========================================
  // Step 6: Start the task — Claude works in terminal
  // ========================================
  console.log('[Demo] Step 6: Starting task')

  const startTaskBtn = window.locator(SELECTORS.startTaskBtn).first()
  if (await startTaskBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.startTaskBtn)
    await demoWait(window, 'About to start Claude on this task', 800)
    // Button may be disabled if no repo path is configured — click only if enabled
    const isEnabled = await startTaskBtn.isEnabled().catch(() => false)
    if (isEnabled) {
      await startTaskBtn.click()
      await demoWait(window, 'Claude session starting...', 2000)
    } else {
      await demoWait(window, 'Start Task button (requires repo path)', 1200)
    }
  }

  // ========================================
  // Step 7: Show terminal with Claude working
  // ========================================
  console.log('[Demo] Step 7: Terminal interaction')

  const terminalArea = window.locator(SELECTORS.terminalPanel).first()
  if (await terminalArea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.terminalPanel)
    await zoomInto(window, SELECTORS.terminalPanel, 2500, 1.6)
  }

  // ========================================
  // Step 8: Wait for task completion (~3.5s in mock mode)
  // ========================================
  console.log('[Demo] Step 8: Waiting for task completion')

  // In mock mode, task moves to review/done quickly
  // Wait for the task status to change (accept both review and done)
  try {
    await window.waitForFunction(() => {
      const taskItems = document.querySelectorAll('.task-item')
      for (const item of taskItems) {
        const status = item.getAttribute('data-status')
        if (status === 'review' || status === 'done') return true
      }
      return false
    }, { timeout: 15000 })
    await demoWait(window, 'Task completed!', 1500)
  } catch {
    // Mock may have already completed before we could check
    await demoWait(window, 'Task processing complete', 1500)
  }

  // ========================================
  // Step 9: Final panoramic view
  // ========================================
  console.log('[Demo] Step 9: Final panoramic')
  await demoWait(window, 'NERV - Recommend-driven AI development workflow', 2500)

  // Save video
  const video = window.video()
  if (video) {
    // Use cleanup timer fix pattern from launch.ts
    const pid = electronApp.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = electronApp.close().then(() => {
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
      await moveVideoToDocsDemo(videoPath, 'quick-start')
    }
  }
})

/**
 * Demo: YOLO Mode (Autonomous Benchmark)
 *
 * Shows the full YOLO benchmark workflow:
 * 1. Launch + create project
 * 2. Open YOLO panel via Workflow dropdown
 * 3. Configure benchmark (spec file, test command, max cycles)
 * 4. Save config + zoom into saved config list
 * 5. Start YOLO benchmark
 * 6. Show Running tab with live progress
 * 7. Wait for completion
 * 8. Show Results tab with final metrics
 * 9. Final panoramic
 */
test('demo_yolo_mode', async () => {
  // Create test repo with SPEC.md for YOLO benchmark
  testRepoPath = createTestRepo('todo-app', {
    'SPEC.md': `# Todo App Specification

## Overview
Build a simple todo application with CRUD operations.

## Requirements
- [ ] Create todo items with title and description
- [ ] List all todo items
- [ ] Mark todo items as complete
- [ ] Delete todo items

## Tech Stack
- TypeScript
- Node.js
- In-memory storage (for simplicity)

## Acceptance Criteria
- All CRUD operations work correctly
- Tests pass for each operation
`,
    'src/index.ts': '// Todo App Entry Point\n',
    'package.json': JSON.stringify({
      name: 'todo-app',
      version: '1.0.0',
      scripts: {
        test: 'jest',
        start: 'ts-node src/index.ts'
      }
    }, null, 2)
  })

  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Clean stale database state from previous runs
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }

  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'yolo',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.setViewportSize(DEMO_VIEWPORT)
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  await window.waitForSelector(SELECTORS.app, { timeout: 10000 })
  await injectCursorOverlay(window)
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
  // Step 2: Open YOLO panel via Workflow dropdown
  // ========================================
  console.log('[Demo] Step 2: Opening YOLO panel')

  // Open Workflow dropdown
  await glideToElement(window, SELECTORS.workflowDropdown)
  await demoWait(window, 'Opening Workflow menu', 600)
  await window.locator(SELECTORS.workflowDropdown).click()
  await window.waitForTimeout(400)

  // Click YOLO btn (use dispatchEvent to avoid dropdown backdrop interception)
  const yoloBtn = window.locator('[data-testid="yolo-btn"]')
  await yoloBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await window.waitForTimeout(500)

  // Wait for YOLO panel to appear
  const yoloPanel = window.locator(SELECTORS.yoloPanel)
  await yoloPanel.waitFor({ timeout: 5000 })
  await demoWait(window, 'YOLO Benchmark panel opened', 1500)

  // ========================================
  // Step 3: Configure benchmark settings
  // ========================================
  console.log('[Demo] Step 3: Configuring YOLO benchmark')

  // Fill spec file
  const specFileInput = window.locator('[data-testid="yolo-spec-file"]')
  if (await specFileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-spec-file"]')
    await specFileInput.fill('SPEC.md')
    await demoWait(window, 'Spec file: SPEC.md', 800)
  }

  // Fill test command
  const testCmdInput = window.locator('[data-testid="yolo-test-command"]')
  if (await testCmdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-test-command"]')
    await testCmdInput.fill('npm test')
    await demoWait(window, 'Test command: npm test', 800)
  }

  // Adjust max cycles to 5
  const maxCyclesInput = window.locator('[data-testid="yolo-max-cycles"]')
  if (await maxCyclesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-max-cycles"]')
    await maxCyclesInput.fill('5')
    await demoWait(window, 'Max cycles: 5', 800)
  }

  // Show auto-approve checkbox (already checked by default)
  const autoApprove = window.locator('[data-testid="yolo-auto-approve-review"]')
  if (await autoApprove.isVisible({ timeout: 1000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-auto-approve-review"]')
    await demoWait(window, 'Auto-approve enabled', 600)
  }

  // Zoom into configure form
  await zoomInto(window, SELECTORS.yoloPanel, 2000, 1.5)

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

  // Zoom into saved config list
  const configList = window.locator('[data-testid="yolo-config-list"]')
  if (await configList.isVisible({ timeout: 2000 }).catch(() => false)) {
    await zoomInto(window, '[data-testid="yolo-config-list"]', 2000, 1.5)
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
  // Step 6: Show Running tab with live progress
  // ========================================
  console.log('[Demo] Step 6: Showing Running tab')

  const runningTab = window.locator('[data-testid="yolo-tab-running"]')
  if (await runningTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-tab-running"]')
    await runningTab.click()
    await demoWait(window, 'Running tab — live benchmark progress', 1000)

    // Wait for running content to appear
    const runningContent = window.locator('[data-testid="yolo-running-content"]')
    if (await runningContent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zoomInto(window, '[data-testid="yolo-running-content"]', 2500, 1.5)
    }
  }

  // ========================================
  // Step 7: Wait for benchmark completion
  // ========================================
  console.log('[Demo] Step 7: Waiting for benchmark to finish')

  // In mock mode, YOLO finishes quickly — wait for status to change
  try {
    await window.waitForFunction(() => {
      const statusEl = document.querySelector('.running-status')
      if (!statusEl) return false
      const text = statusEl.textContent?.toLowerCase() || ''
      return text.includes('success') || text.includes('complete') || text.includes('failed')
    }, { timeout: 30000 })
    await demoWait(window, 'Benchmark completed!', 1500)
  } catch {
    // Mock may finish before we check, or status may not be visible
    await demoWait(window, 'Benchmark processing complete', 1500)
  }

  // ========================================
  // Step 8: Show Results tab with final metrics
  // ========================================
  console.log('[Demo] Step 8: Showing Results tab')

  const resultsTab = window.locator('[data-testid="yolo-tab-results"]')
  if (await resultsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="yolo-tab-results"]')
    await resultsTab.click()
    await demoWait(window, 'Results tab — benchmark metrics', 1000)

    // Wait for results content
    const resultsContent = window.locator('[data-testid="yolo-results-content"]')
    if (await resultsContent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zoomInto(window, '[data-testid="yolo-results-content"]', 2500, 1.5)
    }
  }

  // ========================================
  // Step 9: Final panoramic view
  // ========================================
  console.log('[Demo] Step 9: Final panoramic')
  await demoWait(window, 'NERV YOLO Mode — autonomous benchmarking from spec to results', 2500)

  // Save video
  const video = window.video()
  if (video) {
    const pid = electronApp.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = electronApp.close().then(() => {
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
      await moveVideoToDocsDemo(videoPath, 'yolo-mode')
    }
  }
})

/**
 * Demo: Multi-Repo + Knowledge
 *
 * Shows worktree management and knowledge base features:
 * 1. Launch + create project
 * 2. Open Worktree panel via Workflow dropdown
 * 3. Show worktree list
 * 4. Open Knowledge panel via Knowledge dropdown
 * 5. Show Repos panel
 * 6. Final panoramic
 */
test('demo_multi_repo', async () => {
  // Create two related repos
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

  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Clean stale database state from previous runs
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }

  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'benchmark',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.setViewportSize(DEMO_VIEWPORT)
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  await window.waitForSelector(SELECTORS.app, { timeout: 10000 })
  await injectCursorOverlay(window)
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

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectNameInput, 'Full Stack App')
    await demoWait(window, 'Project name entered', 800)
  }

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, SELECTORS.projectGoalInput, 'API + frontend with shared types')
    await demoWait(window, 'Project goal entered', 800)
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.createProjectBtn)
    await demoWait(window, 'About to create project', 600)
    await createBtn.click()
    await demoWait(window, 'Project created', 1500)
  }

  // ========================================
  // Step 2: Open Worktree panel via Workflow dropdown
  // ========================================
  console.log('[Demo] Step 2: Opening Worktree panel')

  await glideToElement(window, SELECTORS.workflowDropdown)
  await demoWait(window, 'Opening Workflow menu', 600)
  await window.locator(SELECTORS.workflowDropdown).click()
  await window.waitForTimeout(400)

  // Click Worktrees btn (use dispatchEvent to avoid dropdown backdrop)
  const worktreesBtn = window.locator('[data-testid="worktrees-btn"]')
  await worktreesBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await window.waitForTimeout(500)

  // Wait for worktree panel
  const worktreePanel = window.locator('[data-testid="worktree-panel"]')
  if (await worktreePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Worktree panel — manage git worktrees', 1500)
    await zoomInto(window, '[data-testid="worktree-panel"]', 2000, 1.5)

    // Close worktree panel
    const closeBtn = window.locator('[data-testid="worktree-panel"] .close-btn, [data-testid="worktree-panel"] button:has-text("Close")').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await window.keyboard.press('Escape')
    }
    await window.waitForTimeout(500)
  }

  // ========================================
  // Step 3: Show Knowledge panel
  // ========================================
  console.log('[Demo] Step 3: Opening Knowledge panel')

  await glideToElement(window, SELECTORS.knowledgeDropdown)
  await demoWait(window, 'Opening Knowledge menu', 600)
  await window.locator(SELECTORS.knowledgeDropdown).click()
  await window.waitForTimeout(400)

  // Click Knowledge Base btn
  const knowledgeBtn = window.locator('[data-testid="knowledge-btn"]')
  await knowledgeBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await window.waitForTimeout(500)

  // Wait for knowledge panel to appear
  const knowledgePanel = window.locator('.panel, [data-testid="knowledge-panel"]').first()
  if (await knowledgePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Knowledge Base — CLAUDE.md and project context', 1500)
    await zoomInto(window, '.panel', 2500, 1.5)

    // Close knowledge panel — click the overlay backdrop to dismiss
    const overlay = window.locator('.overlay[role="dialog"]').first()
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Click the overlay edge (outside the panel) to dismiss
      await overlay.click({ position: { x: 10, y: 10 } })
    } else {
      await window.keyboard.press('Escape')
    }
    await window.waitForTimeout(800)

    // Ensure overlay is gone before proceeding
    try {
      await window.locator('.overlay[role="dialog"]').waitFor({ state: 'detached', timeout: 3000 })
    } catch {
      // Force close via Escape if overlay persists
      await window.keyboard.press('Escape')
      await window.waitForTimeout(500)
    }
  }

  // ========================================
  // Step 4: Show Repos panel
  // ========================================
  console.log('[Demo] Step 4: Opening Repos panel')

  await glideToElement(window, SELECTORS.knowledgeDropdown)
  await demoWait(window, 'Opening Knowledge menu for Repos', 600)
  await window.locator(SELECTORS.knowledgeDropdown).click()
  await window.waitForTimeout(400)

  // Click Repos btn
  const reposBtn = window.locator('[data-testid="repos-btn"]')
  await reposBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await window.waitForTimeout(500)

  // Wait for repos panel
  const reposPanel = window.locator('.panel-container, .panel-overlay').first()
  if (await reposPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Repos panel — connected repositories', 1500)
    await zoomInto(window, '.panel-container, .panel-overlay', 2500, 1.5)

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
  // Step 5: Final panoramic view
  // ========================================
  console.log('[Demo] Step 5: Final panoramic')
  await demoWait(window, 'NERV — Multi-repo management with knowledge base and worktrees', 2500)

  // Save video
  const video = window.video()
  if (video) {
    const pid = electronApp.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = electronApp.close().then(() => {
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
      await moveVideoToDocsDemo(videoPath, 'multi-repo')
    }
  }
})

/**
 * Demo: Audit & Code Health
 *
 * Shows the audit panel with code health metrics, spec drift, and logs:
 * 1. Launch + create project with a cycle and task (fast, no slow typing)
 * 2. Open Audit panel via CustomEvent
 * 3. Show Code Health tab with health metrics
 * 4. Show Spec Drift tab
 * 5. Show Logs tab with audit events
 * 6. Final panoramic
 */
test('demo_audit_health', async () => {
  testRepoPath = createTestRepo('audit-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'audit-demo',
      version: '1.0.0',
      scripts: { test: 'echo "Tests pass"', build: 'tsc' }
    }, null, 2)
  })

  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Clean stale database state from previous runs
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }

  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'benchmark',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.setViewportSize(DEMO_VIEWPORT)
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  await window.waitForSelector(SELECTORS.app, { timeout: 10000 })
  await injectCursorOverlay(window)
  await demoWait(window, 'NERV Dashboard — audit & code health', 2000)

  // ========================================
  // Step 1: Quick project setup (no slow typing)
  // ========================================
  console.log('[Demo] Step 1: Quick project setup')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('Code Health Demo')
    await window.waitForTimeout(200)
  }

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('Demonstrate audit and code health features')
    await window.waitForTimeout(200)
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await demoWait(window, 'Project created', 1000)
  }

  // ========================================
  // Step 2: Open Audit panel via CustomEvent
  // ========================================
  console.log('[Demo] Step 2: Opening Audit panel')

  // Use proven CustomEvent pattern (bypasses dropdown backdrop issues)
  await window.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-audit-panel'))
  })
  await window.waitForTimeout(500)

  const auditPanel = window.locator(SELECTORS.auditPanel)
  await auditPanel.waitFor({ timeout: 5000 })
  await demoWait(window, 'Audit panel opened', 1500)

  // ========================================
  // Step 3: Show Code Health tab
  // ========================================
  console.log('[Demo] Step 3: Showing Code Health tab')

  // Health tab should be active by default
  const healthTab = window.locator('[data-testid="audit-tab-health"]')
  if (await healthTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-health"]')
    await healthTab.click()
    await window.waitForTimeout(300)
  }

  // Run health check if button is available
  const runHealthBtn = window.locator('[data-testid="run-health-check-btn"]')
  if (await runHealthBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="run-health-check-btn"]')
    await demoWait(window, 'Running code health check', 600)
    await runHealthBtn.click()
    await window.waitForTimeout(1000)
  }

  // Zoom into health metrics
  const healthMetrics = window.locator('[data-testid="health-metrics"]')
  if (await healthMetrics.isVisible({ timeout: 3000 }).catch(() => false)) {
    await zoomInto(window, '[data-testid="health-metrics"]', 2500, 1.5)
  } else {
    // Zoom into health content as fallback
    const healthContent = window.locator('[data-testid="audit-health-content"]')
    if (await healthContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await zoomInto(window, '[data-testid="audit-health-content"]', 2500, 1.5)
    }
  }

  // ========================================
  // Step 4: Show Spec Drift tab
  // ========================================
  console.log('[Demo] Step 4: Showing Spec Drift tab')

  const driftTab = window.locator('[data-testid="audit-tab-drift"]')
  if (await driftTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-drift"]')
    await demoWait(window, 'Switching to Spec Drift tab', 600)
    await driftTab.click()
    await window.waitForTimeout(500)

    // Run drift check if available
    const runDriftBtn = window.locator('[data-testid="run-drift-check-btn"]')
    if (await runDriftBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="run-drift-check-btn"]')
      await runDriftBtn.click()
      await window.waitForTimeout(1000)
    }

    // Zoom into drift content
    const driftContent = window.locator('[data-testid="audit-drift-content"]')
    if (await driftContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await zoomInto(window, '[data-testid="audit-drift-content"]', 2500, 1.5)
    }
  }

  // ========================================
  // Step 5: Show Logs tab
  // ========================================
  console.log('[Demo] Step 5: Showing Logs tab')

  const logsTab = window.locator('[data-testid="audit-tab-logs"]')
  if (await logsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="audit-tab-logs"]')
    await demoWait(window, 'Switching to Audit Logs tab', 600)
    await logsTab.click()
    await window.waitForTimeout(500)

    // Show filter dropdowns
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

    // Zoom into audit panel to show logs
    await zoomInto(window, SELECTORS.auditPanel, 2500, 1.5)
  }

  // ========================================
  // Step 6: Final panoramic view
  // ========================================
  console.log('[Demo] Step 6: Final panoramic')

  // Close audit panel
  const closeBtn = window.locator(`${SELECTORS.auditPanel} .close-btn`).first()
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click()
    await window.waitForTimeout(500)
  }

  await demoWait(window, 'NERV Audit — code health, spec drift detection, and audit logging', 2500)

  // Save video
  const video = window.video()
  if (video) {
    const pid = electronApp.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = electronApp.close().then(() => {
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
      await moveVideoToDocsDemo(videoPath, 'audit-health')
    }
  }
})

/**
 * Demo: Cost & Context
 *
 * Shows context monitoring and cost tracking:
 * 1. Launch + create project (fast)
 * 2. Show Context Monitor bar
 * 3. Open Cost Dashboard via Settings dropdown
 * 4. Zoom into summary cards, budget bar, cost-by-model
 * 5. Final panoramic
 */
test('demo_cost_context', async () => {
  testRepoPath = createTestRepo('cost-demo', {
    'src/index.ts': '// Main entry\nconsole.log("hello");\n',
    'package.json': JSON.stringify({
      name: 'cost-demo',
      version: '1.0.0',
      scripts: { test: 'echo "Tests pass"' }
    }, null, 2)
  })

  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
  }

  // Clean stale database state from previous runs
  const nervDir = path.join(os.homedir(), '.nerv')
  const dbPath = path.join(nervDir, 'state.db')
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* may already be deleted */ }
    }
  }

  electronApp = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: 'true',
      MOCK_CLAUDE_SCENARIO: 'benchmark',
      NERV_LOG_LEVEL: 'info'
    },
    timeout: APP_LAUNCH_TIMEOUT,
    recordVideo: {
      dir: TEST_RESULTS_PATH,
      size: DEMO_VIEWPORT
    }
  })

  window = await electronApp.firstWindow({ timeout: APP_LAUNCH_TIMEOUT })
  await window.setViewportSize(DEMO_VIEWPORT)
  await window.waitForLoadState('domcontentloaded')

  // Dismiss recovery dialog if it appears
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  await window.waitForSelector(SELECTORS.app, { timeout: 10000 })
  await injectCursorOverlay(window)
  await demoWait(window, 'NERV Dashboard — cost & context monitoring', 2000)

  // ========================================
  // Step 1: Quick project setup
  // ========================================
  console.log('[Demo] Step 1: Quick project setup')
  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await newProjectBtn.click()
  await window.waitForTimeout(500)

  const nameInput = window.locator(SELECTORS.projectNameInput).first()
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('Cost Tracking Demo')
    await window.waitForTimeout(200)
  }

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goalInput.fill('Demonstrate cost and context monitoring')
    await window.waitForTimeout(200)
  }

  const createBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await demoWait(window, 'Project created', 1000)
  }

  // ========================================
  // Step 2: Show Context Monitor
  // ========================================
  console.log('[Demo] Step 2: Showing Context Monitor')

  const contextMonitor = window.locator(SELECTORS.contextMonitor).first()
  if (await contextMonitor.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.contextMonitor)
    await demoWait(window, 'Context Monitor — token usage, model, compaction count', 1200)
    await zoomInto(window, SELECTORS.contextMonitor, 2500, 1.8)
  } else {
    await demoWait(window, 'Context Monitor appears when a Claude session is active', 1500)
  }

  // ========================================
  // Step 3: Open Cost Dashboard via Settings dropdown
  // ========================================
  console.log('[Demo] Step 3: Opening Cost Dashboard')

  await glideToElement(window, SELECTORS.settingsDropdown)
  await demoWait(window, 'Opening Settings menu', 600)
  await window.locator(SELECTORS.settingsDropdown).click()
  await window.waitForTimeout(400)

  // Click Cost Dashboard btn (use dispatchEvent to avoid dropdown backdrop)
  const costBtn = window.locator('[data-testid="cost-btn"]')
  await costBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await window.waitForTimeout(500)

  // Wait for cost dashboard modal to appear
  const costModal = window.locator('.modal-backdrop, .modal').first()
  if (await costModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'Cost Dashboard opened', 1500)

    // Zoom into summary cards
    const summaryCards = window.locator('[data-testid="cost-summary"]')
    if (await summaryCards.isVisible({ timeout: 2000 }).catch(() => false)) {
      await zoomInto(window, '[data-testid="cost-summary"]', 2500, 1.5)
    }

    // Zoom into budget progress
    const budgetProgress = window.locator('[data-testid="budget-progress"]')
    if (await budgetProgress.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="budget-progress"]')
      await demoWait(window, 'Budget usage and remaining', 800)
      await zoomInto(window, '[data-testid="budget-progress"]', 2000, 1.5)
    }

    // Zoom into cost by model
    const costByModel = window.locator('[data-testid="cost-by-model"]')
    if (await costByModel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="cost-by-model"]')
      await demoWait(window, 'Cost breakdown by model', 800)
      await zoomInto(window, '[data-testid="cost-by-model"]', 2500, 1.5)
    }

    // Show cost by project tab if available
    const costByProject = window.locator('[data-testid="cost-by-project"]')
    if (await costByProject.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glideToElement(window, '[data-testid="cost-by-project"]')
      await demoWait(window, 'Cost per project', 800)
      await zoomInto(window, '[data-testid="cost-by-project"]', 2000, 1.5)
    }

    // Close cost dashboard
    const closeBtn = window.locator('.modal .close-btn').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
      await window.waitForTimeout(500)
    }
  }

  // ========================================
  // Step 4: Show Approval Queue (if visible)
  // ========================================
  console.log('[Demo] Step 4: Checking Approval Queue')

  const approvalQueue = window.locator(SELECTORS.approvalQueue).first()
  if (await approvalQueue.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, SELECTORS.approvalQueue)
    await demoWait(window, 'Approval Queue — pending permission requests', 1200)
    await zoomInto(window, SELECTORS.approvalQueue, 2000, 1.5)
  }

  // ========================================
  // Step 5: Final panoramic view
  // ========================================
  console.log('[Demo] Step 5: Final panoramic')
  await demoWait(window, 'NERV — Cost tracking, context monitoring, and budget management', 2500)

  // Save video
  const video = window.video()
  if (video) {
    const pid = electronApp.process()?.pid
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const closePromise = electronApp.close().then(() => {
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
      await moveVideoToDocsDemo(videoPath, 'cost-context')
    }
  }
})
