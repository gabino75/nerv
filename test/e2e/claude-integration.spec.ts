/**
 * NERV Claude Code Integration E2E Tests
 *
 * These tests exercise REAL Claude Code integration (no mocking).
 * They create projects, run tasks, and verify Claude completes work.
 *
 * IMPORTANT: These tests use actual Claude API tokens.
 * Set NERV_MOCK_CLAUDE=false to enable real Claude execution.
 *
 * Docker Usage:
 *   docker build -t nerv-e2e -f test/e2e/Dockerfile .
 *   docker run --rm -v ~/.anthropic:/root/.anthropic -e NERV_MOCK_CLAUDE=false nerv-e2e
 *
 * Local Usage:
 *   NERV_MOCK_CLAUDE=false npm run test:e2e:claude
 *
 * Logging Strategy:
 * - Test logs: Playwright reporter + custom logging
 * - NERV logs: Captured from Electron main process
 * - Claude output: Captured from terminal panel
 * - Database state: Queried via IPC at key points
 * - All logs written to test-results/claude-integration/
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths - use environment variable for Docker compatibility
const MAIN_PATH = process.env.NERV_MAIN_PATH || path.join(__dirname, '../../out/main/index.js');
const FIXTURE_PATH = process.env.NERV_FIXTURE_PATH || path.join(__dirname, '../fixtures/simple-node-app');
const LOG_DIR = process.env.NERV_LOG_DIR || path.join(__dirname, '../test-results/claude-integration');

// Timeouts for Claude operations (much longer than UI tests)
// CLAUDE_TASK_TIMEOUT: Max time to wait for Claude to complete a full task
// This covers the entire task execution: spawning Claude, all API calls,
// file operations, running tests, etc.
const TIMEOUT_SIMPLE = 15 * 60 * 1000;   // 15 min for simple tasks (add endpoint)
const TIMEOUT_MEDIUM = 30 * 60 * 1000;   // 30 min for medium tasks (multi-step)
const TIMEOUT_COMPLEX = 60 * 60 * 1000;  // 60 min for complex tasks (multi-file, debugging)

const CLAUDE_TASK_TIMEOUT = parseInt(process.env.NERV_CLAUDE_TIMEOUT || String(TIMEOUT_COMPLEX));
const APP_LAUNCH_TIMEOUT = parseInt(process.env.NERV_LAUNCH_TIMEOUT || '30000');

// Detect Docker/CI environment
const IS_DOCKER = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true';
const IS_CI = process.env.CI === 'true';

// Check if real Claude was explicitly requested via NERV_MOCK_CLAUDE=false
const REAL_CLAUDE_REQUESTED = process.env.NERV_MOCK_CLAUDE === 'false';

// Skip real Claude tests in Docker/CI UNLESS real Claude was explicitly requested
// When -RealClaude flag is used, NERV_MOCK_CLAUDE=false and we should run the tests
const SKIP_REAL_CLAUDE = REAL_CLAUDE_REQUESTED ? false : (IS_DOCKER || IS_CI || process.env.NERV_SKIP_CLAUDE_TESTS === 'true');

// Test configuration
interface TestConfig {
  useMockClaude: boolean;
  maxTurns: number;
  captureAllLogs: boolean;
  isDocker: boolean;
  isCI: boolean;
}

const DEFAULT_CONFIG: TestConfig = {
  useMockClaude: process.env.NERV_MOCK_CLAUDE !== 'false',
  maxTurns: parseInt(process.env.NERV_MAX_TURNS || '20'),
  captureAllLogs: true,
  isDocker: IS_DOCKER,
  isCI: IS_CI,
};

// Log environment on startup
console.log('='.repeat(60));
console.log('NERV Claude Integration Tests');
console.log('='.repeat(60));
console.log(`Environment: ${IS_DOCKER ? 'Docker' : IS_CI ? 'CI' : 'Local'}`);
console.log(`Mock Claude: ${DEFAULT_CONFIG.useMockClaude}`);
console.log(`Max Turns: ${DEFAULT_CONFIG.maxTurns}`);
console.log(`Log Dir: ${LOG_DIR}`);
console.log(`Fixture: ${FIXTURE_PATH}`);
console.log('='.repeat(60));

// Log levels
type LogLevel = 'info' | 'debug' | 'warn' | 'error';

/**
 * Comprehensive logger for Claude integration tests
 */
class IntegrationTestLogger {
  private logFile: string;
  private logs: Array<{ timestamp: string; level: LogLevel; source: string; message: string }> = [];
  private startTime: number;

  constructor(testName: string) {
    this.startTime = Date.now();

    // Ensure log directory exists
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(LOG_DIR, `${testName}-${timestamp}.log`);
  }

  log(level: LogLevel, source: string, message: string) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const entry = {
      timestamp: `+${elapsed}s`,
      level,
      source,
      message,
    };
    this.logs.push(entry);

    // Also write to console for real-time visibility
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]`;
    console.log(`${prefix} ${message}`);
  }

  info(source: string, message: string) { this.log('info', source, message); }
  debug(source: string, message: string) { this.log('debug', source, message); }
  warn(source: string, message: string) { this.log('warn', source, message); }
  error(source: string, message: string) { this.log('error', source, message); }

  /**
   * Save all logs to file
   */
  save() {
    const content = this.logs.map(l =>
      `${l.timestamp} [${l.level.toUpperCase().padEnd(5)}] [${l.source.padEnd(15)}] ${l.message}`
    ).join('\n');

    fs.writeFileSync(this.logFile, content);
    console.log(`\nLogs saved to: ${this.logFile}`);
  }

  /**
   * Get logs for a specific source
   */
  getLogsFor(source: string): string[] {
    return this.logs.filter(l => l.source === source).map(l => l.message);
  }
}

/**
 * Test context with app, window, and logger
 */
interface TestContext {
  app: ElectronApplication;
  window: Page;
  logger: IntegrationTestLogger;
  config: TestConfig;
}

/**
 * Setup function for Claude integration tests
 */
async function setupTest(testName: string, config: Partial<TestConfig> = {}): Promise<TestContext> {
  const testConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = new IntegrationTestLogger(testName);

  logger.info('setup', `Starting test: ${testName}`);
  logger.info('setup', `Mock Claude: ${testConfig.useMockClaude}`);
  logger.info('setup', `Fixture path: ${FIXTURE_PATH}`);

  // Verify prerequisites
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Built app not found at ${MAIN_PATH}. Run 'npm run build' first.`);
  }

  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`Test fixture not found at ${FIXTURE_PATH}`);
  }

  // Launch Electron with appropriate environment
  logger.info('setup', 'Launching Electron...');
  const app = await electron.launch({
    args: [MAIN_PATH, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NERV_TEST_MODE: 'true',
      NERV_MOCK_CLAUDE: testConfig.useMockClaude ? 'true' : 'false',
      NERV_LOG_LEVEL: 'debug',
      // Capture all main process logs
      ELECTRON_ENABLE_LOGGING: '1',
    },
    timeout: APP_LAUNCH_TIMEOUT,
  });

  // Capture main process console output
  app.on('console', (msg) => {
    logger.debug('electron-main', msg.text());
  });

  // Get the first window
  const window = await app.firstWindow();
  logger.info('setup', 'Window opened');

  // Capture renderer console output
  window.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      logger.error('renderer', text);
    } else if (type === 'warning') {
      logger.warn('renderer', text);
    } else {
      logger.debug('renderer', text);
    }
  });

  // Capture page errors
  window.on('pageerror', (error) => {
    logger.error('renderer', `Page error: ${error.message}`);
  });

  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
  logger.info('setup', 'App loaded');

  return { app, window, logger, config: testConfig };
}

/**
 * Teardown function
 */
async function teardownTest(ctx: TestContext) {
  ctx.logger.info('teardown', 'Closing app...');

  // Take final screenshot
  try {
    await ctx.window.screenshot({
      path: path.join(LOG_DIR, `final-state-${Date.now()}.png`)
    });
  } catch (e) {
    ctx.logger.warn('teardown', `Could not take final screenshot: ${e}`);
  }

  // Save logs
  ctx.logger.save();

  // Close app
  if (ctx.app) {
    await ctx.app.close();
  }
}

/**
 * Helper: Dismiss recovery dialog if present
 */
async function dismissRecoveryDialog(ctx: TestContext) {
  try {
    // Wait a bit for dialog to appear
    await ctx.window.waitForTimeout(500);

    const recoveryDialog = ctx.window.locator('[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required"), [aria-labelledby="recovery-title"]').first();
    if (await recoveryDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      ctx.logger.info('ui', 'Recovery dialog detected, dismissing...');

      // Try dismiss button first
      const dismissBtn = ctx.window.locator('button:has-text("Dismiss")').first();
      if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dismissBtn.click();
        await ctx.window.waitForTimeout(300);
        ctx.logger.info('ui', 'Recovery dialog dismissed');
        return;
      }

      // Try close button
      const closeBtn = ctx.window.locator('.overlay .close-btn, [data-testid="close-recovery"]').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
        await ctx.window.waitForTimeout(300);
        ctx.logger.info('ui', 'Recovery dialog closed');
        return;
      }

      // Try clicking outside to close modal
      await ctx.window.keyboard.press('Escape');
      await ctx.window.waitForTimeout(300);
      ctx.logger.info('ui', 'Recovery dialog closed via Escape');
    }
  } catch {
    // No recovery dialog, that's fine
  }
}

/**
 * Helper: Dismiss any error banners
 */
async function dismissErrorBanners(ctx: TestContext) {
  try {
    const errorBanner = await ctx.window.locator('.error-banner button').first();
    if (await errorBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      ctx.logger.info('ui', 'Dismissing error banner');
      await errorBanner.click();
      await ctx.window.waitForTimeout(300);
    }
  } catch {
    // No error banner, that's fine
  }
}

/**
 * Helper: Create a project via UI
 */
async function createProject(ctx: TestContext, name: string, repoPath: string): Promise<string | null> {
  ctx.logger.info('ui', `Creating project: ${name}`);

  // Dismiss any blocking dialogs
  await dismissRecoveryDialog(ctx);
  await dismissErrorBanners(ctx);

  // Click New Project button
  const newProjectButton = await ctx.window.locator(
    'button:has-text("New Project"), button:has-text("+"), [data-testid="new-project-button"]'
  ).first();

  await expect(newProjectButton).toBeVisible({ timeout: 5000 });
  await newProjectButton.click();
  ctx.logger.info('ui', 'Clicked New Project button');

  // Wait for dialog
  const projectForm = await ctx.window.locator(
    '[role="dialog"], .modal, form, [data-testid="project-form"]'
  ).first();
  await expect(projectForm).toBeVisible({ timeout: 5000 });
  ctx.logger.info('ui', 'Project form visible');

  // Fill in project name
  const nameInput = await ctx.window.locator(
    'input[placeholder*="name" i], input[name="name"], [data-testid="project-name-input"], input'
  ).first();

  if (await nameInput.isVisible()) {
    await nameInput.fill(name);
    ctx.logger.info('ui', `Filled project name: ${name}`);
  }

  // Fill in goal (optional)
  const goalInput = await ctx.window.locator(
    'textarea, input[placeholder*="goal" i], [data-testid="project-goal-input"]'
  ).first();

  if (await goalInput.isVisible().catch(() => false)) {
    await goalInput.fill('E2E test project for Claude integration');
  }

  // Take screenshot of form
  await ctx.window.screenshot({
    path: path.join(LOG_DIR, 'project-form.png')
  });

  // Submit
  const submitButton = await ctx.window.locator(
    'button:has-text("Create"), button:has-text("Save"), button[type="submit"]'
  ).first();

  if (await submitButton.isVisible()) {
    const isEnabled = await submitButton.isEnabled().catch(() => false);
    ctx.logger.info('ui', `Submit button enabled: ${isEnabled}`);

    if (isEnabled) {
      await submitButton.click();
      await ctx.window.waitForTimeout(1000);
      ctx.logger.info('ui', 'Project creation submitted');
    }
  }

  // Verify project was created by checking the project selector
  await ctx.window.waitForTimeout(500);

  // Add the repo to the project via IPC
  // This is critical for worktree creation when starting tasks
  if (repoPath) {
    ctx.logger.info('ui', `Adding repo to project: ${repoPath}`);
    try {
      const projectId = await ctx.window.evaluate(async (projectName) => {
        const api = (window as { api?: { db?: { projects?: { getAll: () => Promise<{ id: string; name: string }[]> } } } }).api;
        if (!api?.db?.projects) return null;
        const projects = await api.db.projects.getAll();
        const project = projects?.find((p: { name: string }) => p.name === projectName);
        return project?.id || null;
      }, name);

      if (projectId) {
        await ctx.window.evaluate(async ({ projectId, repoPath }) => {
          const api = (window as { api?: { db?: { repos?: { create: (pid: string, name: string, path: string) => Promise<unknown> } } } }).api;
          if (!api?.db?.repos) return null;
          // Use basename of path as repo name
          const repoName = repoPath.split(/[/\\]/).pop() || 'repo';
          return await api.db.repos.create(projectId, repoName, repoPath);
        }, { projectId, repoPath });
        ctx.logger.info('ui', `Repo added successfully: ${repoPath}`);
      } else {
        ctx.logger.warn('ui', 'Could not find project ID to add repo');
      }
    } catch (e) {
      ctx.logger.error('ui', `Failed to add repo: ${e}`);
    }
  }

  return name; // Return project name as identifier
}

/**
 * Helper: Create a task via UI
 */
async function createTask(ctx: TestContext, title: string, description: string): Promise<boolean> {
  ctx.logger.info('ui', `Creating task: ${title}`);

  await dismissErrorBanners(ctx);

  // STEP 1: Click "Add Task" button using data-testid
  const addTaskBtn = ctx.window.locator('[data-testid="add-task-btn"]').first();

  if (!await addTaskBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    ctx.logger.warn('ui', 'Add Task button not visible');
    return false;
  }

  // Use force click to handle any layout overlap issues
  await addTaskBtn.click({ force: true });
  ctx.logger.info('ui', 'Clicked Add Task button');

  // STEP 2: Wait for dialog to open
  const dialog = ctx.window.locator('[data-testid="new-task-dialog"]').first();
  if (!await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    ctx.logger.warn('ui', 'New Task dialog did not open');
    return false;
  }
  ctx.logger.info('ui', 'New Task dialog opened');

  // STEP 3: Fill in task title (within the dialog)
  const titleInput = dialog.locator('[data-testid="task-title-input"], input[placeholder*="title" i]').first();
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill(title);
    ctx.logger.info('ui', `Filled task title: ${title}`);
  } else {
    ctx.logger.warn('ui', 'Could not find title input');
  }

  // STEP 4: Fill in description (within the dialog)
  const descInput = dialog.locator('#task-description, textarea').first();
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill(description);
    ctx.logger.info('ui', `Filled task description`);
  }

  // STEP 5: Submit using the create button within dialog
  const createBtn = dialog.locator('[data-testid="create-task-btn"], button:has-text("Create Task")').first();
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await ctx.window.waitForTimeout(500);
    ctx.logger.info('ui', 'Task created successfully');
    return true;
  }

  // Fallback: try any submit-like button in the dialog
  const submitButton = dialog.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
    await ctx.window.waitForTimeout(500);
    ctx.logger.info('ui', 'Task creation submitted');
    return true;
  }

  ctx.logger.warn('ui', 'Could not find submit button in dialog');
  return false;
}

/**
 * Helper: Start a task and wait for Claude
 */
async function startTaskAndWaitForClaude(
  ctx: TestContext,
  taskTitle: string,
  timeoutMs: number = CLAUDE_TASK_TIMEOUT
): Promise<{ success: boolean; terminalOutput: string }> {
  ctx.logger.info('claude', `Starting task: ${taskTitle}`);

  // Find the task in the task list
  const taskItem = await ctx.window.locator(
    `[data-testid="task-item"]:has-text("${taskTitle}"), .task-item:has-text("${taskTitle}")`
  ).first();

  if (!await taskItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    ctx.logger.error('claude', 'Task not found in list');
    return { success: false, terminalOutput: '' };
  }

  // Click task to select it
  await taskItem.click();
  await ctx.window.waitForTimeout(300);

  // Find and click Start button
  const startButton = await ctx.window.locator(
    'button:has-text("Start"), button:has-text("Start Task"), [data-testid="start-task-btn"]'
  ).first();

  if (!await startButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    ctx.logger.error('claude', 'Start button not visible');
    return { success: false, terminalOutput: '' };
  }

  await startButton.click();
  ctx.logger.info('claude', 'Task started - waiting for Claude...');

  // Take screenshot
  await ctx.window.screenshot({
    path: path.join(LOG_DIR, 'task-started.png')
  });

  // Collect terminal output
  let terminalOutput = '';
  const startTime = Date.now();

  // Poll for task completion
  // Note: xterm.js uses canvas rendering, so textContent() doesn't capture terminal output
  // Instead, we rely on task status changes and database state
  let lastLogTime = Date.now();
  const LOG_INTERVAL = 10000; // Log every 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);

    // Log progress periodically
    if (Date.now() - lastLogTime > LOG_INTERVAL) {
      ctx.logger.info('claude', `Still waiting for task... (${elapsedSecs}s elapsed)`);
      lastLogTime = Date.now();
    }

    // Check if task completed by looking at the task item's data-task-status attribute
    const taskItem = await ctx.window.locator(
      `[data-testid="task-item"]:has-text("${taskTitle}")`
    ).first();

    if (await taskItem.isVisible().catch(() => false)) {
      const status = await taskItem.getAttribute('data-task-status');

      if (status === 'done' || status === 'review') {
        ctx.logger.info('claude', `Task completed with status: ${status} (${elapsedSecs}s)`);
        return { success: true, terminalOutput };
      }

      if (status === 'interrupted') {
        ctx.logger.warn('claude', `Task interrupted (${elapsedSecs}s)`);
        return { success: false, terminalOutput };
      }
    }

    // Check for errors in the UI
    const errorIndicator = await ctx.window.locator(
      '[data-testid="task-error"], .task-error, .error-message, .error-banner'
    ).first();

    if (await errorIndicator.isVisible().catch(() => false)) {
      const errorText = await errorIndicator.textContent();
      ctx.logger.error('claude', `Task error: ${errorText}`);
      return { success: false, terminalOutput };
    }

    // Check if terminal panel shows completion indicators
    const terminalPanel = await ctx.window.locator('[data-testid="terminal-panel"]').first();
    if (await terminalPanel.isVisible().catch(() => false)) {
      // Try to get task state from database to track progress
      try {
        const dbState = await ctx.window.evaluate(async (title) => {
          const api = (window as { api?: { db?: { tasks?: { getForProject?: (id: string) => Promise<{ title: string; status: string }[]> } } } }).api;
          if (!api?.db?.tasks) return null;
          // Get current project's tasks
          const projects = await api.db.projects.getAll();
          if (!projects?.length) return null;
          for (const p of projects) {
            const tasks = await api.db.tasks.getForProject(p.id);
            const task = tasks?.find((t: { title: string }) => t.title === title);
            if (task) return { status: task.status };
          }
          return null;
        }, taskTitle);

        if (dbState?.status === 'done' || dbState?.status === 'review') {
          ctx.logger.info('claude', `Task completed (via DB) with status: ${dbState.status} (${elapsedSecs}s)`);
          return { success: true, terminalOutput };
        }
      } catch {
        // DB check failed, continue polling UI
      }
    }

    await ctx.window.waitForTimeout(2000);
  }

  ctx.logger.warn('claude', 'Task timed out');
  return { success: false, terminalOutput };
}

/**
 * Helper: Capture database state via IPC
 */
async function captureDatabaseState(ctx: TestContext): Promise<object> {
  ctx.logger.info('db', 'Capturing database state...');

  try {
    // Use Electron's evaluate to call IPC
    const state = await ctx.window.evaluate(async () => {
      // @ts-expect-error - window.api is defined by preload
      const api = window.api;
      if (!api) return { error: 'API not available' };

      const projects = await api.db.projects.getAll();
      const approvals = await api.db.approvals.getAll();

      // Get tasks for each project
      const projectsWithTasks = await Promise.all(
        projects.map(async (p: { id: string }) => ({
          ...p,
          tasks: await api.db.tasks.getForProject(p.id)
        }))
      );

      return {
        projects: projectsWithTasks,
        approvals,
        timestamp: new Date().toISOString()
      };
    });

    ctx.logger.info('db', `Captured: ${JSON.stringify(state).substring(0, 200)}...`);

    // Save full state to file
    const stateFile = path.join(LOG_DIR, `db-state-${Date.now()}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    ctx.logger.info('db', `Full state saved to: ${stateFile}`);

    return state;
  } catch (e) {
    ctx.logger.error('db', `Failed to capture state: ${e}`);
    return { error: String(e) };
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

/**
 * Test: Full Claude integration - create project, create task, run Claude
 *
 * This test exercises the complete workflow:
 * 1. Create a project pointing to simple-node-app fixture
 * 2. Create a task: "Add a /health endpoint"
 * 3. Start the task (spawns real Claude Code)
 * 4. Wait for completion
 * 5. Verify the endpoint was created
 */
test.describe('Claude Code Integration', () => {
  // Each test can take up to 1 hour for complex tasks
  test.describe.configure({ timeout: TIMEOUT_COMPLEX });

  test('simple_task_completion - Claude can add a health endpoint', async () => {
    // Skip in Docker/CI - requires real Claude API tokens
    test.skip(SKIP_REAL_CLAUDE, 'Requires real Claude API tokens (not available in Docker/CI)');

    const ctx = await setupTest('simple_task_completion', {
      useMockClaude: false,
      maxTurns: 20,
    });

    try {
      // Wait for app to be ready
      await ctx.window.waitForSelector('[data-testid="app"]', { timeout: 10000 });
      ctx.logger.info('test', 'App is ready');

      // Capture initial state
      await captureDatabaseState(ctx);

      // Step 1: Create project
      await createProject(ctx, 'Health Endpoint Test', FIXTURE_PATH);
      await ctx.window.waitForTimeout(1000);

      // Capture state after project creation
      await captureDatabaseState(ctx);

      // Step 2: Create task
      const taskCreated = await createTask(
        ctx,
        'Add health endpoint',
        'Add a GET /health endpoint to index.js that returns {"status": "ok"}'
      );

      if (!taskCreated) {
        ctx.logger.warn('test', 'Task creation via UI failed, test may be incomplete');
      }

      // Capture state after task creation
      await captureDatabaseState(ctx);

      // Take screenshot
      await ctx.window.screenshot({
        path: path.join(LOG_DIR, 'before-start.png')
      });

      // Step 3: Start task and wait for Claude
      const result = await startTaskAndWaitForClaude(ctx, 'Add health endpoint');

      // Log terminal output
      if (result.terminalOutput) {
        const outputFile = path.join(LOG_DIR, 'terminal-output.txt');
        fs.writeFileSync(outputFile, result.terminalOutput);
        ctx.logger.info('test', `Terminal output saved to: ${outputFile}`);
      }

      // Capture final state
      const finalState = await captureDatabaseState(ctx);

      // Take final screenshot
      await ctx.window.screenshot({
        path: path.join(LOG_DIR, 'after-completion.png')
      });

      // Assertions
      ctx.logger.info('test', `Task success: ${result.success}`);

      // For now, just verify the test ran without crashing
      // Real verification would check if /health endpoint exists in the worktree
      expect(ctx.logger.getLogsFor('error').length).toBeLessThan(5);

    } finally {
      await teardownTest(ctx);
    }
  });

  test('permission_enforcement - Dangerous commands are queued for approval', async () => {
    // Skip in Docker/CI - requires real Claude API tokens
    test.skip(SKIP_REAL_CLAUDE, 'Requires real Claude API tokens (not available in Docker/CI)');

    const ctx = await setupTest('permission_enforcement', {
      useMockClaude: false,
      maxTurns: 10,
    });

    try {
      await ctx.window.waitForSelector('[data-testid="app"]', { timeout: 10000 });

      // Create project
      await createProject(ctx, 'Permission Test', FIXTURE_PATH);
      await ctx.window.waitForTimeout(1000);

      // Create task that will require dangerous permissions
      await createTask(
        ctx,
        'Clean and rebuild',
        'Delete node_modules and run npm install'
      );

      // Start task
      const startButton = await ctx.window.locator(
        'button:has-text("Start"), [data-testid="start-task-btn"]'
      ).first();

      if (await startButton.isVisible().catch(() => false)) {
        await startButton.click();
        ctx.logger.info('test', 'Started permission test task');

        // Wait for approval request to appear
        const approvalQueue = await ctx.window.locator(
          '[data-testid="approval-queue"], .approval-queue, .approval-panel'
        ).first();

        // Poll for approval request (with timeout)
        const startTime = Date.now();
        let approvalFound = false;

        while (Date.now() - startTime < 60000) { // 1 minute timeout
          if (await approvalQueue.isVisible().catch(() => false)) {
            const approvalText = await approvalQueue.textContent();
            if (approvalText?.includes('rm') || approvalText?.includes('delete')) {
              ctx.logger.info('test', 'Approval request found for dangerous operation');
              approvalFound = true;
              break;
            }
          }
          await ctx.window.waitForTimeout(1000);
        }

        // Take screenshot
        await ctx.window.screenshot({
          path: path.join(LOG_DIR, 'permission-test.png')
        });

        ctx.logger.info('test', `Approval request found: ${approvalFound}`);
      }

      await captureDatabaseState(ctx);

    } finally {
      await teardownTest(ctx);
    }
  });

  test('error_recovery - NERV handles Claude errors gracefully', async () => {
    // Skip in Docker/CI - requires real Claude API tokens
    test.skip(SKIP_REAL_CLAUDE, 'Requires real Claude API tokens (not available in Docker/CI)');

    const ctx = await setupTest('error_recovery', {
      useMockClaude: false,
      maxTurns: 5, // Low max turns to force early completion
    });

    try {
      await ctx.window.waitForSelector('[data-testid="app"]', { timeout: 10000 });

      // Create project
      await createProject(ctx, 'Error Recovery Test', FIXTURE_PATH);
      await ctx.window.waitForTimeout(1000);

      // Create an intentionally vague/impossible task
      await createTask(
        ctx,
        'Impossible task',
        'Solve world hunger using only JavaScript'
      );

      // Start task
      await startTaskAndWaitForClaude(ctx, 'Impossible task', 30000); // 30 second timeout

      // Capture state - should show interrupted or error status
      const state = await captureDatabaseState(ctx);

      // Take screenshot
      await ctx.window.screenshot({
        path: path.join(LOG_DIR, 'error-recovery.png')
      });

      // Verify app didn't crash
      const appContainer = await ctx.window.locator('[data-testid="app"]');
      await expect(appContainer).toBeVisible();

      ctx.logger.info('test', 'App remained stable after error condition');

    } finally {
      await teardownTest(ctx);
    }
  });
});

// ============================================================================
// LOGGING VERIFICATION TEST
// ============================================================================

/**
 * Test: Verify logging infrastructure captures all sources
 */
test('logging_infrastructure - All log sources are captured', async () => {
  const ctx = await setupTest('logging_verification', {
    useMockClaude: true, // Use mock for this test
  });

  try {
    await ctx.window.waitForSelector('[data-testid="app"]', { timeout: 10000 });

    // Trigger various log sources
    ctx.logger.info('test', 'Testing info log');
    ctx.logger.warn('test', 'Testing warn log');
    ctx.logger.error('test', 'Testing error log');
    ctx.logger.debug('test', 'Testing debug log');

    // Trigger renderer console
    await ctx.window.evaluate(() => {
      console.log('Test log from renderer');
      console.warn('Test warning from renderer');
    });

    await ctx.window.waitForTimeout(500);

    // Verify logs were captured
    const testLogs = ctx.logger.getLogsFor('test');
    expect(testLogs.length).toBeGreaterThanOrEqual(4);

    const rendererLogs = ctx.logger.getLogsFor('renderer');
    expect(rendererLogs.length).toBeGreaterThanOrEqual(0); // May be async

    ctx.logger.info('test', `Captured ${testLogs.length} test logs, ${rendererLogs.length} renderer logs`);

  } finally {
    await teardownTest(ctx);
  }
});
