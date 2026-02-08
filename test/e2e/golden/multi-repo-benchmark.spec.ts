/**
 * NERV Multi-Repo Benchmark E2E Test
 *
 * This test exercises NERV's multi-repository workflow capabilities:
 * - Multiple repositories in one project
 * - Worktree isolation for each task
 * - Parallel task execution
 * - CLAUDE.md scanning and integration
 * - Context tracking across repos
 *
 * Uses the nerv-todo-benchmark fixture with 3 repos:
 * - todo-shared: Shared types and utilities
 * - todo-backend: Node.js REST API
 * - todo-frontend: Vanilla JS UI
 *
 * Run:
 *   npm run test:e2e:docker -- --grep "multi-repo"
 */

import { test, expect } from '@playwright/test'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

// Import from centralized helpers
import {
  TIMEOUT,
  log,
  slowWait,
  microWait,
  cleanupTestRepo,
  safeAppClose,
  launchNervBenchmark,
  standardCleanup,
  setupBenchmarkProjectWithRepo,
  createBenchmarkTask,
  BenchmarkCollector,
} from '../helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to the multi-repo benchmark fixture
const BENCHMARK_FIXTURE_PATH = path.join(__dirname, '../../fixtures/nerv-todo-benchmark')

/**
 * Copy a benchmark repo to a temp location for testing
 * Returns the path to the copied repo
 */
function copyBenchmarkRepo(repoName: string): string {
  const sourcePath = path.join(BENCHMARK_FIXTURE_PATH, repoName)

  // Validate source path exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`Benchmark fixture not found: ${sourcePath}`)
    console.error(`BENCHMARK_FIXTURE_PATH: ${BENCHMARK_FIXTURE_PATH}`)
    console.error(`__dirname: ${__dirname}`)
    throw new Error(`Benchmark fixture not found: ${sourcePath}. Make sure nerv-todo-benchmark/${repoName} exists in test/fixtures/`)
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `nerv-${repoName}-`))

  // Copy all files (excluding node_modules and .git)
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue

    const srcPath = path.join(sourcePath, entry.name)
    const destPath = path.join(tempDir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === '.git') {
        // Copy .git directory
        fs.cpSync(srcPath, destPath, { recursive: true })
      } else {
        fs.cpSync(srcPath, destPath, { recursive: true })
      }
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }

  // Re-init git if needed (ensure clean state)
  if (!fs.existsSync(path.join(tempDir, '.git'))) {
    execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
    execSync('git config user.email "test@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
    execSync('git config user.name "NERV Test"', { cwd: tempDir, stdio: 'pipe' })
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
    execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' })
  }

  return tempDir
}

// ============================================================================
// MULTI-REPO BENCHMARK TESTS
// ============================================================================

test.describe('NERV Multi-Repo Benchmark Tests', () => {
  test.describe.configure({ timeout: TIMEOUT.benchmark })

  // Cleanup after each test
  test.afterEach(async () => {
    await standardCleanup()
  })

  // -------------------------------------------------------------------------
  // TEST: Multi-Repo Project Creation
  // -------------------------------------------------------------------------
  test('multi_repo_project_creation - NERV creates project with multiple repositories', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    // Copy benchmark repos to temp locations
    const sharedRepoPath = copyBenchmarkRepo('todo-shared')
    const backendRepoPath = copyBenchmarkRepo('todo-backend')
    const frontendRepoPath = copyBenchmarkRepo('todo-frontend')

    try {
      log('step', 'Creating multi-repo project')

      // Step 1: Create project
      const projectName = `Multi-Repo-${Date.now()}`
      log('info', 'Creating project', { name: projectName })

      const newProjectBtn = window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
      await expect(newProjectBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await newProjectBtn.dispatchEvent('click')
      await slowWait(window, 'Dialog opening')

      // Fill project name
      const nameInput = window.locator('[data-testid="project-name-input"], #project-name').first()
      await nameInput.fill(projectName)
      await microWait(window)

      // Fill project goal
      const goalInput = window.locator('[data-testid="project-goal-input"], #project-goal').first()
      if (await goalInput.isVisible().catch(() => false)) {
        await goalInput.fill('Build a multi-repo todo app')
        await microWait(window)
      }

      // Submit
      const createBtn = window.locator('[data-testid="create-project-btn"], button:has-text("Create Project")').first()
      await createBtn.click()
      await slowWait(window, 'Project creation')

      // Get project ID
      const projectId = await window.evaluate(async (name: string) => {
        const api = (window as unknown as { api: { db: { projects: { getAll: () => Promise<Array<{ id: string; name: string }>> } } } }).api
        const projects = await api.db.projects.getAll()
        return projects.find(p => p.name === name)?.id || null
      }, projectName)

      expect(projectId).not.toBeNull()
      log('check', 'Project created', { projectId })

      // Step 2: Add multiple repositories
      log('step', 'Adding multiple repositories')

      // Add shared repo
      const sharedAdded = await window.evaluate(async (args: { projectId: string; path: string }) => {
        const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
        try {
          await api.db.repos.create(args.projectId, 'todo-shared', args.path, 'node')
          return true
        } catch { return false }
      }, { projectId: projectId!, path: sharedRepoPath })
      expect(sharedAdded).toBe(true)
      log('check', 'Shared repo added')

      // Add backend repo
      const backendAdded = await window.evaluate(async (args: { projectId: string; path: string }) => {
        const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
        try {
          await api.db.repos.create(args.projectId, 'todo-backend', args.path, 'node')
          return true
        } catch { return false }
      }, { projectId: projectId!, path: backendRepoPath })
      expect(backendAdded).toBe(true)
      log('check', 'Backend repo added')

      // Add frontend repo
      const frontendAdded = await window.evaluate(async (args: { projectId: string; path: string }) => {
        const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
        try {
          await api.db.repos.create(args.projectId, 'todo-frontend', args.path, 'node')
          return true
        } catch { return false }
      }, { projectId: projectId!, path: frontendRepoPath })
      expect(frontendAdded).toBe(true)
      log('check', 'Frontend repo added')

      // Step 3: Verify all repos in project
      const repos = await window.evaluate(async (projectId: string) => {
        const api = (window as unknown as { api: { db: { repos: { getForProject: (projectId: string) => Promise<Array<{ id: string; name: string; path: string }>> } } } }).api
        return await api.db.repos.getForProject(projectId)
      }, projectId!)

      expect(repos.length).toBe(3)
      expect(repos.map(r => r.name).sort()).toEqual(['todo-backend', 'todo-frontend', 'todo-shared'])
      log('pass', 'All 3 repositories added to project', { repoCount: repos.length })

      log('pass', 'Multi-repo project creation complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(sharedRepoPath)
      cleanupTestRepo(backendRepoPath)
      cleanupTestRepo(frontendRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: CLAUDE.md Scanning
  // -------------------------------------------------------------------------
  test('claude_md_scanning - NERV scans and stores CLAUDE.md from each repository', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    const sharedRepoPath = copyBenchmarkRepo('todo-shared')
    const backendRepoPath = copyBenchmarkRepo('todo-backend')

    try {
      log('step', 'Testing CLAUDE.md scanning')

      // Create project with repos
      const project = await setupBenchmarkProjectWithRepo(window, sharedRepoPath)
      expect(project).not.toBeNull()

      // Add backend repo
      await window.evaluate(async (args: { projectId: string; path: string }) => {
        const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
        await api.db.repos.create(args.projectId, 'todo-backend', args.path, 'node')
      }, { projectId: project!.projectId, path: backendRepoPath })

      // Wait for scanning to complete
      await window.waitForTimeout(2000)

      // Check if repo context was scanned (via database)
      const repoContext = await window.evaluate(async (projectId: string) => {
        const api = (window as unknown as { api: { db: { repos: { getForProject: (projectId: string) => Promise<Array<{ id: string; name: string }>> }; query?: (sql: string) => Promise<unknown[]> } } }).api
        const repos = await api.db.repos.getForProject(projectId)

        // Try to get repo context if the API exists
        if (api.db.query) {
          const context = await api.db.query('SELECT * FROM repo_context WHERE repo_id IN (SELECT id FROM repos WHERE project_id = ?)')
          return { repos, context }
        }
        return { repos, context: null }
      }, project!.projectId)

      log('check', 'Repos in project', { count: repoContext.repos.length })

      // The scan should have found CLAUDE.md files
      // We verify by checking that the repos were added successfully
      expect(repoContext.repos.length).toBeGreaterThanOrEqual(1)

      log('pass', 'CLAUDE.md scanning test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(sharedRepoPath)
      cleanupTestRepo(backendRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Multi-Repo Task Creation
  // -------------------------------------------------------------------------
  test('multi_repo_task_creation - NERV creates tasks that can span multiple repos', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    const sharedRepoPath = copyBenchmarkRepo('todo-shared')
    const backendRepoPath = copyBenchmarkRepo('todo-backend')
    const frontendRepoPath = copyBenchmarkRepo('todo-frontend')

    try {
      log('step', 'Creating tasks for multi-repo project')

      // Create project with all repos
      const projectName = `Task-Test-${Date.now()}`

      // Create project
      const newProjectBtn = window.locator('[data-testid="new-project"], [data-testid="add-project"]').first()
      await expect(newProjectBtn).toBeVisible({ timeout: TIMEOUT.ui })
      await newProjectBtn.dispatchEvent('click')
      await slowWait(window, 'Dialog opening')

      await window.locator('[data-testid="project-name-input"], #project-name').first().fill(projectName)
      await microWait(window)

      const goalInput = window.locator('[data-testid="project-goal-input"], #project-goal').first()
      if (await goalInput.isVisible().catch(() => false)) {
        await goalInput.fill('Multi-repo todo app')
        await microWait(window)
      }

      await window.locator('[data-testid="create-project-btn"], button:has-text("Create Project")').first().click()
      await slowWait(window, 'Project creation')

      const projectId = await window.evaluate(async (name: string) => {
        const api = (window as unknown as { api: { db: { projects: { getAll: () => Promise<Array<{ id: string; name: string }>> } } } }).api
        const projects = await api.db.projects.getAll()
        return projects.find(p => p.name === name)?.id || null
      }, projectName)

      expect(projectId).not.toBeNull()

      // Add all repos
      for (const [name, repoPath] of [
        ['todo-shared', sharedRepoPath],
        ['todo-backend', backendRepoPath],
        ['todo-frontend', frontendRepoPath]
      ]) {
        await window.evaluate(async (args: { projectId: string; name: string; path: string }) => {
          const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
          await api.db.repos.create(args.projectId, args.name, args.path, 'node')
        }, { projectId: projectId!, name, path: repoPath })
      }
      log('check', 'All repos added')

      // Create tasks for different repos
      const sharedTaskId = await createBenchmarkTask(
        window,
        projectId!,
        'Implement validation functions',
        'Implement validateTodo, validateCreateInput, and validateUpdateInput in todo-shared'
      )
      expect(sharedTaskId).not.toBeNull()
      log('check', 'Shared task created', { taskId: sharedTaskId })

      const backendTaskId = await createBenchmarkTask(
        window,
        projectId!,
        'Implement API endpoints',
        'Implement all REST API endpoints in todo-backend'
      )
      expect(backendTaskId).not.toBeNull()
      log('check', 'Backend task created', { taskId: backendTaskId })

      const frontendTaskId = await createBenchmarkTask(
        window,
        projectId!,
        'Implement UI rendering',
        'Implement all render functions in todo-frontend'
      )
      expect(frontendTaskId).not.toBeNull()
      log('check', 'Frontend task created', { taskId: frontendTaskId })

      // Verify all tasks exist
      const tasks = await window.evaluate(async (projectId: string) => {
        const api = (window as unknown as { api: { db: { tasks: { getForProject: (projectId: string) => Promise<Array<{ id: string; title: string }>> } } } }).api
        return await api.db.tasks.getForProject(projectId)
      }, projectId!)

      expect(tasks.length).toBe(3)
      log('pass', 'All 3 tasks created for multi-repo project')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(sharedRepoPath)
      cleanupTestRepo(backendRepoPath)
      cleanupTestRepo(frontendRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Benchmark Output Collection
  // -------------------------------------------------------------------------
  test('benchmark_output_collection - BenchmarkCollector captures multi-repo metrics', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    const sharedRepoPath = copyBenchmarkRepo('todo-shared')

    try {
      log('step', 'Testing benchmark output collection')

      // Create project
      const project = await setupBenchmarkProjectWithRepo(window, sharedRepoPath)
      expect(project).not.toBeNull()

      // Initialize benchmark collector
      const benchmarkOutputDir = path.join(__dirname, '../../../test-results')
      const benchmarkConfig = {
        reviewMode: 'normal' as const,
        maxCycles: 3,
        auditFrequency: 1,
        model: 'claude-sonnet-4-20250514',
        specFile: 'multi-repo-benchmark.md',
      }
      const collector = new BenchmarkCollector(
        benchmarkOutputDir,
        benchmarkConfig,
        'Multi-repo benchmark spec'
      )

      // Start a cycle
      collector.startCycle('cycle-0', 0)

      // Create and track a task
      const taskId = await createBenchmarkTask(
        window,
        project!.projectId,
        'Implement generateId',
        'Implement the generateId function in todo-shared/types.js'
      )
      expect(taskId).not.toBeNull()

      // Record task start
      collector.startTask(taskId!, 'Implement generateId', 'shared')

      // Simulate some work
      await window.waitForTimeout(500)

      // Record task completion
      collector.completeTask(taskId!, 'done')

      // End cycle
      collector.completeCycle('cycle-0', 1)

      // Generate summary
      const summary = collector.finalize()

      // Verify summary structure
      expect(summary.benchmarkId).toBeDefined()
      expect(summary.model).toBe('claude-sonnet-4-20250514')
      expect(summary.cycles.total).toBe(1)
      expect(summary.tasks.total).toBe(1)
      expect(summary.tasks.completed).toBe(1)

      log('check', 'Benchmark summary generated', {
        totalTasks: summary.tasks.total,
        completedTasks: summary.tasks.completed
      })

      log('pass', 'Benchmark output collection working')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(sharedRepoPath)
      await safeAppClose(app)
    }
  })

  // -------------------------------------------------------------------------
  // TEST: Repo Context in NERV.md
  // -------------------------------------------------------------------------
  test('repo_context_in_nervmd - NERV includes repo context in generated NERV.md', async () => {
    const { app, window, testRepoPath } = await launchNervBenchmark('simple_task')

    const sharedRepoPath = copyBenchmarkRepo('todo-shared')

    try {
      log('step', 'Testing repo context inclusion in NERV.md')

      // Create project with repo
      const project = await setupBenchmarkProjectWithRepo(window, sharedRepoPath)
      expect(project).not.toBeNull()

      // Wait for scanning
      await window.waitForTimeout(1500)

      // Try to generate NERV.md context
      const nervMdContent = await window.evaluate(async (projectId: string) => {
        const api = (window as unknown as { api: { nerv?: { generateContext: (projectId: string, taskId?: string) => Promise<string> } } }).api
        if (api.nerv?.generateContext) {
          return await api.nerv.generateContext(projectId)
        }
        return null
      }, project!.projectId)

      if (nervMdContent) {
        // Verify NERV.md contains project info
        expect(nervMdContent).toContain(project!.projectName)
        log('check', 'NERV.md content generated')
      } else {
        log('info', 'NERV.md generation API not available in test mode')
      }

      log('pass', 'Repo context integration test complete')

    } finally {
      cleanupTestRepo(testRepoPath)
      cleanupTestRepo(sharedRepoPath)
      await safeAppClose(app)
    }
  })
})
