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

  // Ensure destination directory exists
  if (!fs.existsSync(DOCS_DEMOS_PATH)) {
    fs.mkdirSync(DOCS_DEMOS_PATH, { recursive: true })
  }

  // Copy video file (keep original for debugging)
  fs.copyFileSync(videoPath, destPath)
  console.log(`Demo video saved: ${destPath}`)

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

      const closePromise = electronApp.close()
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(() => {
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
      )
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
 * Shows:
 * 1. App launch with professional pause
 * 2. Create new project with slow typing
 * 3. Navigate the dashboard
 * 4. Create a task
 * 5. Start a Claude session
 * 6. Basic terminal interaction
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
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required")').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }

  // Wait for app to fully render - show the dashboard
  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })

  // Inject cursor overlay for visible mouse tracking
  await injectCursorOverlay(window)

  await demoWait(window, 'App launched - showing NERV dashboard', 2500)

  // ========================================
  // Step 1: Create a new project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating new project with slow typing')
  const newProjectBtn = window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
  await expect(newProjectBtn).toBeVisible({ timeout: 5000 })
  await glideToElement(window, '[data-testid="new-project"], [data-testid="add-project"]')
  await demoWait(window, 'Highlighting New Project button', 1000)
  await newProjectBtn.click()
  await demoWait(window, 'Project dialog opened', 1200)

  // Slow type the project name
  const projectNameInput = window.locator('[data-testid="project-name-input"], input[placeholder*="name" i]').first()
  if (await projectNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-name-input"], input[placeholder*="name" i]', 'My REST API')
    await demoWait(window, 'Project name entered', 800)
  }

  // Slow type the project goal
  const projectGoalInput = window.locator('[data-testid="project-goal-input"], textarea').first()
  if (await projectGoalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-goal-input"], textarea', 'Build a REST API with user authentication')
    await demoWait(window, 'Project goal entered', 800)
  }

  // Create the project
  const createBtn = window.locator('[data-testid="create-project-btn"], button:has-text("Create")').first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="create-project-btn"], button:has-text("Create")')
    await demoWait(window, 'About to create project', 600)
    await createBtn.click()
    await demoWait(window, 'Project created successfully', 1500)
  }

  // ========================================
  // Step 2: Explore the dashboard layout
  // ========================================
  console.log('[Demo] Step 2: Exploring dashboard')

  // Hover over task board to show it
  const taskBoard = window.locator('[data-testid="task-board"], .task-board, .kanban').first()
  if (await taskBoard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="task-board"], .task-board, .kanban')
    await zoomInto(window, '[data-testid="task-board"], .task-board, .kanban', 2000, 1.5)
  }

  // ========================================
  // Step 3: Create a task
  // ========================================
  console.log('[Demo] Step 3: Creating a task')
  const addTaskBtn = window.locator('[data-testid="add-task"], button:has-text("Add Task"), button:has-text("New Task")').first()
  if (await addTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="add-task"], button:has-text("Add Task"), button:has-text("New Task")')
    await demoWait(window, 'Clicking Add Task button', 800)
    await addTaskBtn.click()
    await demoWait(window, 'Task dialog opened', 1000)

    // Fill in task details with slow typing
    const taskTitleInput = window.locator('[data-testid="task-title-input"], input[placeholder*="title" i], input[placeholder*="task" i]').first()
    if (await taskTitleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slowType(window, '[data-testid="task-title-input"], input[placeholder*="title" i], input[placeholder*="task" i]', 'Add user login endpoint')
      await demoWait(window, 'Task title entered', 800)
    }

    // Create the task
    const createTaskBtn = window.locator('[data-testid="create-task-btn"], button:has-text("Create")').first()
    if (await createTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createTaskBtn.click()
      await demoWait(window, 'Task created - appears in Todo column', 1500)
    }
  }

  // ========================================
  // Step 4: Start a Claude session
  // ========================================
  console.log('[Demo] Step 4: Starting Claude session')
  const startTaskBtn = window.locator('[data-testid="start-task-btn"], button:has-text("Start")').first()
  if (await startTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="start-task-btn"], button:has-text("Start")')
    await demoWait(window, 'About to start Claude session', 800)
    await startTaskBtn.click()
    await demoWait(window, 'Claude session starting...', 2000)
  }

  // ========================================
  // Step 5: Show terminal with Claude output
  // ========================================
  console.log('[Demo] Step 5: Terminal interaction')
  const terminalArea = window.locator('[data-testid="terminal-panel"], .terminal-panel, .xterm').first()
  if (await terminalArea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="terminal-panel"], .terminal-panel, .xterm')
    await zoomInto(window, '[data-testid="terminal-panel"], .terminal-panel, .xterm', 2500, 1.6)
  }

  // Show the context monitor if visible
  const contextMonitor = window.locator('[data-testid="context-monitor"], .context-monitor').first()
  if (await contextMonitor.isVisible({ timeout: 1000 }).catch(() => false)) {
    await glideToElement(window, '[data-testid="context-monitor"], .context-monitor')
    await zoomInto(window, '[data-testid="context-monitor"], .context-monitor', 1500, 1.8)
  }

  // Final panoramic view
  await demoWait(window, 'NERV - Your AI-powered development dashboard', 2500)

  // Save video
  const video = window.video()
  if (video) {
    await electronApp.close()
    const videoPath = await video.path()
    if (videoPath) {
      await moveVideoToDocsDemo(videoPath, 'quick-start')
    }
  }
})

/**
 * Demo: YOLO Mode (Autonomous Development)
 *
 * Shows:
 * 1. Create project from spec
 * 2. Configure YOLO mode settings
 * 3. Start autonomous development loop
 * 4. Watch tasks progress automatically
 * 5. See AI review and auto-merge
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

  // Dismiss recovery dialog
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"]').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click()
    }
  }

  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })
  await injectCursorOverlay(window)
  await demoWait(window, 'NERV Dashboard - Ready for YOLO mode', 2000)

  // ========================================
  // Step 1: Create project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating YOLO benchmark project')
  const newProjectBtn = window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
  await glideToElement(window, '[data-testid="new-project"], [data-testid="add-project"]')
  await newProjectBtn.click()
  await demoWait(window, 'Opening project dialog', 1000)

  const nameInput = window.locator('[data-testid="project-name-input"], input[placeholder*="name" i]').first()
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-name-input"], input[placeholder*="name" i]', 'Todo App Benchmark')
    await demoWait(window, 'Project name for benchmark', 800)
  }

  const goalInput = window.locator('[data-testid="project-goal-input"], textarea').first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-goal-input"], textarea', 'Autonomous todo app development')
    await demoWait(window, 'YOLO will build this autonomously', 800)
  }

  const createBtn = window.locator('[data-testid="create-project-btn"], button:has-text("Create")').first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await demoWait(window, 'Project created for YOLO benchmark', 1200)
  }

  // ========================================
  // Step 2: Navigate to YOLO configuration
  // ========================================
  console.log('[Demo] Step 2: Configuring YOLO mode')

  // Look for YOLO toggle or settings
  const yoloToggle = window.locator('[data-testid="yolo-toggle"], input[type="checkbox"]:near(:text("YOLO")), label:has-text("YOLO")').first()
  if (await yoloToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yoloToggle.hover()
    await demoWait(window, 'YOLO mode - AI reviews code automatically', 1200)
    await yoloToggle.click()
    await demoWait(window, 'YOLO mode enabled!', 1000)
  }

  // Look for cycle configuration
  const cycleConfig = window.locator('[data-testid="cycle-config"], [data-testid="yolo-cycles"], input[placeholder*="cycle" i]').first()
  if (await cycleConfig.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cycleConfig.hover()
    await demoWait(window, 'Configure number of autonomous cycles', 1000)
  }

  // ========================================
  // Step 3: Start YOLO autonomous loop
  // ========================================
  console.log('[Demo] Step 3: Starting YOLO loop')
  const startYoloBtn = window.locator('[data-testid="start-yolo"], button:has-text("Start YOLO"), button:has-text("YOLO"), [data-testid="yolo-start"]').first()
  if (await startYoloBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoWait(window, 'About to start autonomous development', 1000)
    await startYoloBtn.click()
    await demoWait(window, 'YOLO mode started - Claude working autonomously', 2000)
  }

  // ========================================
  // Step 4: Watch task progression
  // ========================================
  console.log('[Demo] Step 4: Watching autonomous progress')

  // Show the task board updating
  const taskBoard = window.locator('[data-testid="task-board"], .task-board, .kanban').first()
  if (await taskBoard.isVisible({ timeout: 2000 }).catch(() => false)) {
    await taskBoard.hover()
    await demoWait(window, 'Tasks moving automatically through columns', 2000)
  }

  // Show terminal with Claude output
  const terminalArea = window.locator('[data-testid="terminal-panel"], .terminal-panel, .xterm').first()
  if (await terminalArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await terminalArea.hover()
    await demoWait(window, 'Claude writing code and running tests', 2500)
  }

  // ========================================
  // Step 5: Show AI review process
  // ========================================
  console.log('[Demo] Step 5: AI Review')

  // Look for review status or approval area
  const reviewArea = window.locator('[data-testid="review-panel"], [data-testid="approval-queue"], .approval-queue').first()
  if (await reviewArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reviewArea.hover()
    await demoWait(window, 'AI reviews and approves completed work', 2000)
  }

  // Show YOLO status/progress
  const yoloStatus = window.locator('[data-testid="yolo-status"], .yolo-status, :text("Cycle"), :text("Progress")').first()
  if (await yoloStatus.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yoloStatus.hover()
    await demoWait(window, 'Tracking cycle progress and cost', 1500)
  }

  // Final view showing autonomous operation
  await demoWait(window, 'YOLO Mode - Fully autonomous development with AI review', 3000)

  // Save video
  const video = window.video()
  if (video) {
    await electronApp.close()
    const videoPath = await video.path()
    if (videoPath) {
      await moveVideoToDocsDemo(videoPath, 'yolo-mode')
    }
  }
})

/**
 * Demo: Multi-Repo Workflow
 *
 * Shows:
 * 1. Create project for multi-repo development
 * 2. Show repo list panel
 * 3. Multiple terminal tabs for different repos
 * 4. Cross-repo task coordination
 * 5. Split view for parallel work
 */
test('demo_multi_repo', async () => {
  // Create three related repos (backend, frontend, shared)
  testRepoPath = createTestRepo('shared-types', {
    'src/types.ts': 'export interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport interface Todo {\n  id: string;\n  title: string;\n  completed: boolean;\n  userId: string;\n}\n',
    'src/validation.ts': 'export const isValidEmail = (email: string) => email.includes("@");\nexport const isValidId = (id: string) => /^[a-z0-9-]+$/.test(id);\n',
    'package.json': JSON.stringify({
      name: 'shared-types',
      version: '1.0.0',
      main: 'src/types.ts',
      scripts: { build: 'tsc' }
    }, null, 2)
  })

  testRepoPath2 = createTestRepo('api-backend', {
    'src/server.ts': '// Express API Server\nimport express from "express";\nimport { User, Todo } from "shared-types";\n\nconst app = express();\napp.use(express.json());\n\napp.listen(3001, () => console.log("API on port 3001"));\n',
    'src/routes/users.ts': '// User API routes\nimport { Router } from "express";\nimport { User } from "shared-types";\n\nexport const userRouter = Router();\n',
    'src/routes/todos.ts': '// Todo API routes\nimport { Router } from "express";\nimport { Todo } from "shared-types";\n\nexport const todoRouter = Router();\n',
    'package.json': JSON.stringify({
      name: 'api-backend',
      version: '1.0.0',
      scripts: { dev: 'ts-node src/server.ts', test: 'jest' }
    }, null, 2)
  })

  testRepoPath3 = createTestRepo('web-frontend', {
    'src/App.tsx': '// React App\nimport React from "react";\nimport { User, Todo } from "shared-types";\n\nexport default function App() {\n  return (\n    <div className="app">\n      <h1>Todo App</h1>\n    </div>\n  );\n}\n',
    'src/components/UserList.tsx': '// User List Component\nimport React from "react";\nimport { User } from "shared-types";\n\nexport function UserList({ users }: { users: User[] }) {\n  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;\n}\n',
    'src/components/TodoList.tsx': '// Todo List Component\nimport React from "react";\nimport { Todo } from "shared-types";\n\nexport function TodoList({ todos }: { todos: Todo[] }) {\n  return <ul>{todos.map(t => <li key={t.id}>{t.title}</li>)}</ul>;\n}\n',
    'package.json': JSON.stringify({
      name: 'web-frontend',
      version: '1.0.0',
      scripts: { dev: 'vite', build: 'vite build', test: 'jest' }
    }, null, 2)
  })

  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`)
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

  // Dismiss recovery dialog
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator('[data-testid="recovery-dialog"]').first()
  if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismissBtn = window.locator('button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click()
    }
  }

  await window.waitForSelector('[data-testid="app"]', { timeout: 10000 })
  await injectCursorOverlay(window)
  await demoWait(window, 'NERV Dashboard - Multi-repo support', 2000)

  // ========================================
  // Step 1: Create project with slow typing
  // ========================================
  console.log('[Demo] Step 1: Creating multi-repo project')
  const newProjectBtn = window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
  await glideToElement(window, '[data-testid="new-project"], [data-testid="add-project"]')
  await newProjectBtn.click()
  await demoWait(window, 'Creating a multi-repo project', 1000)

  const nameInput = window.locator('[data-testid="project-name-input"], input[placeholder*="name" i]').first()
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-name-input"], input[placeholder*="name" i]', 'Full Stack Todo App')
    await demoWait(window, 'Multi-repo project name', 800)
  }

  const goalInput = window.locator('[data-testid="project-goal-input"], textarea').first()
  if (await goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await slowType(window, '[data-testid="project-goal-input"], textarea', 'Full-stack with shared types, API, and frontend')
    await demoWait(window, 'Project spans 3 repositories', 800)
  }

  const createBtn = window.locator('[data-testid="create-project-btn"], button:has-text("Create")').first()
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await demoWait(window, 'Project created for multi-repo work', 1200)
  }

  // ========================================
  // Step 2: Show repo list/panel
  // ========================================
  console.log('[Demo] Step 2: Showing repo list')

  // Look for repo list or worktree panel
  const repoPanel = window.locator('[data-testid="repo-list"], [data-testid="worktree-panel"], .repo-list, .worktree-panel').first()
  if (await repoPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await repoPanel.hover()
    await demoWait(window, 'Repo panel - manage multiple repositories', 1500)
  }

  // ========================================
  // Step 3: Show terminal tabs
  // ========================================
  console.log('[Demo] Step 3: Multiple terminal tabs')

  const tabContainer = window.locator('[data-testid="tab-container"], .tab-container').first()
  if (await tabContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tabContainer.hover()
    await demoWait(window, 'Terminal tabs - one per repo or task', 1500)
  }

  // Click new tab button if visible (avoid matching add-project "+" button)
  const newTabBtn = window.locator('[data-testid="new-tab"], .add-tab-btn').first()
  if (await newTabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newTabBtn.hover()
    await demoWait(window, 'Create new terminal tabs for different repos', 1000)
    await newTabBtn.click()
    await demoWait(window, 'Choose Claude session or shell terminal', 1200)

    // Close the dropdown if it opened
    await window.keyboard.press('Escape')
    await window.waitForTimeout(300)
  }

  // ========================================
  // Step 4: Show task board for cross-repo work
  // ========================================
  console.log('[Demo] Step 4: Cross-repo task coordination')

  const taskBoard = window.locator('[data-testid="task-board"], .task-board, .kanban').first()
  if (await taskBoard.isVisible({ timeout: 2000 }).catch(() => false)) {
    await taskBoard.hover()
    await demoWait(window, 'Task board coordinates work across repos', 1500)
  }

  // Try to show add task for cross-repo work
  const addTaskBtn = window.locator('[data-testid="add-task"], button:has-text("Add Task"), button:has-text("New Task")').first()
  if (await addTaskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addTaskBtn.click()
    await demoWait(window, 'Create task - can span multiple repos', 1000)

    const taskTitleInput = window.locator('[data-testid="task-title-input"], input[placeholder*="title" i], input[placeholder*="task" i]').first()
    if (await taskTitleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slowType(window, '[data-testid="task-title-input"], input[placeholder*="title" i], input[placeholder*="task" i]', 'Add User type to shared-types and use in API + frontend')
      await demoWait(window, 'Cross-repo task description', 1000)
    }

    // Close without creating
    const cancelBtn = window.locator('button:has-text("Cancel")').first()
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelBtn.click()
      await window.waitForTimeout(300)
    } else {
      await window.keyboard.press('Escape')
      await window.waitForTimeout(300)
    }
  }

  // ========================================
  // Step 5: Show split view capability
  // ========================================
  console.log('[Demo] Step 5: Split view for parallel work')

  const splitBtn = window.locator('[data-testid="split-view"], button:has-text("Split"), .split-btn, button[title*="split" i]').first()
  if (await splitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await splitBtn.hover()
    await demoWait(window, 'Split view - work on multiple repos simultaneously', 1200)
    const isEnabled = await splitBtn.isEnabled().catch(() => false)
    if (isEnabled) {
      await splitBtn.click()
      await demoWait(window, 'Side-by-side terminals for coordinated changes', 2000)
    }
  }

  // Show terminal area
  const terminalArea = window.locator('[data-testid="terminal-panel"], .terminal-panel, .xterm').first()
  if (await terminalArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await terminalArea.hover()
    await demoWait(window, 'Each pane can run Claude on a different repo', 2000)
  }

  // Final panoramic view
  await demoWait(window, 'Multi-Repo Development - Coordinate changes across your entire stack', 3000)

  // Save video
  const video = window.video()
  if (video) {
    await electronApp.close()
    const videoPath = await video.path()
    if (videoPath) {
      await moveVideoToDocsDemo(videoPath, 'multi-repo')
    }
  }
})
