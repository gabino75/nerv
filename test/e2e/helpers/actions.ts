/**
 * NERV E2E Test Actions
 *
 * Reusable actions for interacting with NERV UI in tests.
 */

import { Page, expect } from '@playwright/test'
import { SELECTORS, TIMEOUT, DROPDOWN_PARENT } from './selectors'
import { log, slowWait, microWait } from './launch'

/**
 * Create a project with a repo for testing
 */
export async function setupBenchmarkProjectWithRepo(
  window: Page,
  testRepoPath: string
): Promise<{ projectId: string; projectName: string } | null> {
  const projectName = `Benchmark-${Date.now()}`
  log('step', 'Creating project', { name: projectName })

  const newProjectBtn = window.locator(SELECTORS.newProject).first()
  if (!await newProjectBtn.isVisible({ timeout: TIMEOUT.ui }).catch(() => false)) {
    log('fail', 'New project button not visible')
    return null
  }

  await microWait(window)
  await newProjectBtn.dispatchEvent('click')
  await slowWait(window, 'Dialog opening')

  const dialog = window.locator(SELECTORS.newProjectDialog).first()
  await expect(dialog).toBeVisible({ timeout: TIMEOUT.ui })
  await microWait(window)

  log('info', 'Filling project name')
  await window.locator(SELECTORS.projectNameInput).first().fill(projectName)
  await microWait(window)

  const goalInput = window.locator(SELECTORS.projectGoalInput).first()
  if (await goalInput.isVisible().catch(() => false)) {
    log('info', 'Filling project goal')
    await goalInput.fill('Benchmark test')
    await microWait(window)
  }

  await slowWait(window, 'Form filled, clicking Create')
  const submitBtn = window.locator(SELECTORS.createProjectBtn).first()
  if (await submitBtn.isEnabled()) {
    await submitBtn.click()
    await slowWait(window, 'Project created')
  }

  const projectId = await window.evaluate(async (name) => {
    const api = (window as unknown as { api: { db: { projects: { getAll: () => Promise<Array<{ id: string; name: string }>> } } } }).api
    const projects = await api.db.projects.getAll()
    return projects.find(p => p.name === name)?.id || null
  }, projectName)

  if (!projectId) {
    log('fail', 'Failed to get project ID')
    return null
  }

  // Add repo
  const repoAdded = await window.evaluate(async (args: { projectId: string; repoPath: string }) => {
    const api = (window as unknown as { api: { db: { repos: { create: (projectId: string, name: string, path: string, stack?: string) => Promise<unknown> } } } }).api
    try {
      await api.db.repos.create(args.projectId, 'test-repo', args.repoPath, 'node')
      return true
    } catch { return false }
  }, { projectId, repoPath: testRepoPath })

  log('pass', 'Project created', { projectId, repoAdded })
  return { projectId, projectName }
}

/**
 * Create a task for a project via REAL UI clicks
 * This is the preferred method - uses actual UI interactions
 */
export async function createBenchmarkTask(
  window: Page,
  projectId: string,
  title: string,
  description: string
): Promise<string | null> {
  log('step', 'Creating task via UI', { title })

  // STEP 1: Click "Add Task" button
  const addTaskBtn = window.locator(SELECTORS.addTaskBtn).first()
  const addTaskVisible = await addTaskBtn.isVisible({ timeout: 5000 }).catch(() => false)

  if (!addTaskVisible) {
    log('info', 'Add Task button not visible, trying API fallback')
    return createBenchmarkTaskViaAPI(window, projectId, title, description)
  }

  await microWait(window)
  // Use force click if terminal panel is blocking the button (layout overlap issue)
  await addTaskBtn.click({ force: true })
  await slowWait(window, 'New Task dialog opening')

  // STEP 2: Verify dialog opened
  const dialog = window.locator(SELECTORS.newTaskDialog).first()
  const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false)

  if (!dialogVisible) {
    log('info', 'New Task dialog not visible, trying API fallback')
    return createBenchmarkTaskViaAPI(window, projectId, title, description)
  }

  // STEP 3: Fill in task title
  log('info', 'Filling task title')
  const titleInput = window.locator(SELECTORS.taskTitleInput).first()
  await titleInput.fill(title)
  await microWait(window)

  // STEP 4: Fill in description (optional but we have it)
  const descInput = window.locator(SELECTORS.taskDescriptionInput).first()
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill(description)
    await microWait(window)
  }

  // STEP 5: Click Create Task button
  log('info', 'Clicking Create Task button')
  const createBtn = window.locator(SELECTORS.createTaskBtn).first()
  await createBtn.click()
  await slowWait(window, 'Task creation')

  // STEP 6: Wait for modal to close (click outside to force close if needed)
  await window.waitForTimeout(500)
  const modalStillVisible = await window.locator(SELECTORS.newTaskDialog).isVisible({ timeout: 1000 }).catch(() => false)
  if (modalStillVisible) {
    // Force close by clicking on the overlay
    log('info', 'Modal still visible, clicking overlay to close')
    await window.locator(SELECTORS.newTaskDialog).click({ position: { x: 10, y: 10 } })
    await window.waitForTimeout(300)
  }
  await window.waitForSelector(SELECTORS.newTaskDialog, { state: 'hidden', timeout: 5000 }).catch(() => {
    log('info', 'Modal may not have closed')
  })
  await window.waitForTimeout(300)

  // STEP 7: Get task ID from database (verification read is OK)
  const taskId = await window.evaluate(async (args: { projectId: string; title: string }) => {
    const api = (window as unknown as { api: { db: { tasks: { getForProject: (projectId: string) => Promise<Array<{ id: string; title: string }>> } } } }).api
    const tasks = await api.db.tasks.getForProject(args.projectId)
    return tasks.find(t => t.title === args.title)?.id || null
  }, { projectId, title })

  if (taskId) {
    log('pass', 'Task created via UI', { taskId })
  } else {
    log('fail', 'Failed to get task ID after UI creation')
  }

  await window.waitForTimeout(500)
  return taskId
}

/**
 * API fallback for task creation (used when UI is not available)
 */
export async function createBenchmarkTaskViaAPI(
  window: Page,
  projectId: string,
  title: string,
  description: string
): Promise<string | null> {
  log('info', 'Creating task via API', { title })

  const taskId = await window.evaluate(async (args: { projectId: string; title: string; description: string }) => {
    const api = (window as unknown as { api: { db: { tasks: { create: (projectId: string, title: string, description: string) => Promise<{ id: string }> } } } }).api
    try {
      const task = await api.db.tasks.create(args.projectId, args.title, args.description)
      return task.id
    } catch { return null }
  }, { projectId, title, description })

  if (taskId) {
    log('pass', 'Task created via API', { taskId })

    // Refresh the Svelte store so TaskBoard shows the new task card
    // App.svelte exposes appStore as window.__nervStore in test mode
    await window.evaluate(async (pid: string) => {
      const store = (window as unknown as { __nervStore?: { loadTasks: (pid: string) => Promise<void> } }).__nervStore
      if (store?.loadTasks) {
        await store.loadTasks(pid)
      }
    }, projectId)

    await slowWait(window, 'Task created')
  } else {
    log('fail', 'Failed to create task')
  }

  await window.waitForTimeout(500)
  return taskId
}

/**
 * Start a task by clicking the Start Task button
 */
export async function startTask(window: Page): Promise<boolean> {
  log('step', 'Starting task')
  const startBtn = window.locator(SELECTORS.startTaskBtn).first()

  if (await startBtn.isVisible({ timeout: TIMEOUT.ui }) && await startBtn.isEnabled()) {
    await slowWait(window, 'Before Start Task')
    await startBtn.click()
    await slowWait(window, 'After Start Task')
    await window.waitForTimeout(3000)
    log('pass', 'Task started')
    return true
  }

  log('fail', 'Start Task button not visible or not enabled')
  return false
}

/**
 * Select a project in the sidebar
 */
export async function selectProject(window: Page, projectNamePattern: string): Promise<boolean> {
  const projectItem = window.locator(`${SELECTORS.projectItem}:has-text("${projectNamePattern}")`).first()
  if (await projectItem.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
    await projectItem.click()
    await window.waitForTimeout(300)
    // Auto-dismiss locked project dialog if it appears
    await dismissLockedDialog(window)
    log('pass', 'Project selected', { pattern: projectNamePattern })
    return true
  }
  log('fail', 'Project not found', { pattern: projectNamePattern })
  return false
}

/**
 * Click a button that lives inside a DropdownMenu.
 * Opens the parent dropdown first, then clicks the item.
 */
export async function clickDropdownItem(window: Page, itemTestId: string): Promise<boolean> {
  const parentId = DROPDOWN_PARENT[itemTestId]
  if (!parentId) {
    log('fail', 'No dropdown parent mapped for', { itemTestId })
    return false
  }

  // Open the parent dropdown
  const trigger = window.locator(`[data-testid="${parentId}"]`)
  const triggerVisible = await trigger.isVisible({ timeout: 3000 }).catch(() => false)
  if (!triggerVisible) {
    log('fail', 'Dropdown trigger not visible', { parentId })
    return false
  }

  await trigger.click()
  await window.waitForTimeout(200)

  // Click the item
  const item = window.locator(`[data-testid="${itemTestId}"]`)
  const itemVisible = await item.isVisible({ timeout: 2000 }).catch(() => false)
  if (!itemVisible) {
    log('fail', 'Dropdown item not visible after opening dropdown', { itemTestId })
    return false
  }

  await item.click()
  await window.waitForTimeout(200)
  log('pass', 'Clicked dropdown item', { parentId, itemTestId })
  return true
}

/**
 * Helper to reliably open the Audit Panel
 * Tries button click first, then event dispatch as fallback
 */
export async function openAuditPanel(window: Page): Promise<boolean> {
  log('step', 'Opening Audit Panel')

  const auditPanel = window.locator(SELECTORS.auditPanel)

  // Check if panel is already open
  let panelVisible = await auditPanel.isVisible({ timeout: 1000 }).catch(() => false)
  if (panelVisible) {
    log('check', 'Audit panel already visible')
    return true
  }

  // Try clicking the button via dropdown (audit-btn is inside Workflow dropdown)
  log('info', 'Clicking audit button via dropdown')
  try {
    const clicked = await clickDropdownItem(window, 'audit-btn')
    if (clicked) {
      await window.waitForTimeout(300)
      panelVisible = await auditPanel.isVisible({ timeout: 2000 }).catch(() => false)
      if (panelVisible) {
        log('check', 'Audit panel visible (dropdown click)')
        return true
      }
    }
  } catch (e) {
    log('info', 'Dropdown click failed', { error: String(e) })
  }

  // Fallback: Use event dispatch
  log('info', 'Trying event dispatch fallback')
  try {
    await window.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-audit-panel'))
    })
    await window.waitForTimeout(300)

    panelVisible = await auditPanel.isVisible({ timeout: 2000 }).catch(() => false)
    if (panelVisible) {
      log('check', 'Audit panel visible (event dispatch)')
      return true
    }
  } catch (e) {
    log('info', 'Event dispatch failed', { error: String(e) })
  }

  log('fail', 'Could not open Audit panel')
  return false
}

/**
 * Helper to reliably open the Cycle Panel via "More" dropdown
 */
export async function openCyclePanel(window: Page): Promise<boolean> {
  log('step', 'Opening Cycle Panel')

  const cyclePanel = window.locator(SELECTORS.cyclePanel)

  // Check if panel is already open
  let panelVisible = await cyclePanel.isVisible({ timeout: 1000 }).catch(() => false)
  if (panelVisible) {
    log('check', 'Cycle panel already visible')
    return true
  }

  // Click cycles-btn via "More" dropdown
  const clicked = await clickDropdownItem(window, 'cycles-btn')
  if (clicked) {
    await window.waitForTimeout(300)
    panelVisible = await cyclePanel.isVisible({ timeout: 2000 }).catch(() => false)
    if (panelVisible) {
      log('check', 'Cycle panel visible (dropdown click)')
      return true
    }
  }

  log('fail', 'Could not open Cycle panel')
  return false
}

/**
 * Approve a permission request by clicking "Just Once"
 */
export async function approvePermission(window: Page): Promise<boolean> {
  const approvalAllowOnce = window.locator(SELECTORS.approvalAllowOnce).first()
  const visible = await approvalAllowOnce.isVisible({ timeout: TIMEOUT.short }).catch(() => false)

  if (visible) {
    log('step', 'Clicking "Just Once" approval button')
    await approvalAllowOnce.click()
    await slowWait(window, 'Approval submitted')
    log('pass', 'Permission approved')
    return true
  }

  return false
}

/**
 * Deny a permission request
 */
export async function denyPermission(window: Page): Promise<boolean> {
  const approvalDeny = window.locator(SELECTORS.approvalDenyOnce).first()
  const visible = await approvalDeny.isVisible({ timeout: TIMEOUT.short }).catch(() => false)

  if (visible) {
    log('step', 'Clicking "Deny" approval button')
    await approvalDeny.click()
    await slowWait(window, 'Denial submitted')
    log('pass', 'Permission denied')
    return true
  }

  log('info', 'No deny button visible')
  return false
}

/**
 * Close any open modal/panel
 */
export async function closeModal(window: Page): Promise<void> {
  const closeBtn = window.locator(SELECTORS.closeBtn).first()
  if (await closeBtn.isVisible({ timeout: TIMEOUT.exists }).catch(() => false)) {
    await closeBtn.click()
    await window.waitForTimeout(300)
  }
}

/**
 * Dismiss recovery dialog if present
 */
export async function dismissRecoveryDialog(window: Page): Promise<void> {
  await window.waitForTimeout(500)
  const recoveryDialog = window.locator(SELECTORS.recoveryDialog).first()
  if (await recoveryDialog.isVisible({ timeout: TIMEOUT.exists }).catch(() => false)) {
    const dismissBtn = window.locator(SELECTORS.dismissBtn).first()
    if (await dismissBtn.isVisible({ timeout: TIMEOUT.exists }).catch(() => false)) {
      await dismissBtn.click()
      await window.waitForTimeout(300)
    }
  }
}

/**
 * Dismiss locked project dialog if present (clicks "Force Open")
 */
export async function dismissLockedDialog(window: Page): Promise<void> {
  const lockedDialog = window.locator(SELECTORS.lockedProjectDialog).first()
  if (await lockedDialog.isVisible({ timeout: TIMEOUT.exists }).catch(() => false)) {
    log('info', 'Locked project dialog detected, clicking Force Open')
    const forceBtn = window.locator(SELECTORS.lockedForceBtn).first()
    if (await forceBtn.isVisible({ timeout: TIMEOUT.exists }).catch(() => false)) {
      await forceBtn.click()
      await window.waitForTimeout(300)
    }
  }
}
