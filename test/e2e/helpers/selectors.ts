/**
 * NERV E2E Test Selectors and Constants
 *
 * Centralized selectors and timeout constants for all E2E tests.
 * Using data-testid attributes for stable, maintainable selectors.
 */

/**
 * Selectors for UI elements
 * Use data-testid where possible for stability
 */
export const SELECTORS = {
  // App container
  app: '[data-testid="app"]',

  // Projects
  newProject: '[data-testid="new-project"], [data-testid="add-project"]',
  newProjectDialog: '[data-testid="new-project-dialog"], [role="dialog"]:has-text("New Project")',
  projectList: '[data-testid="project-list"]',
  projectItem: '.project-item',
  projectNameInput: '[data-testid="project-name-input"], #project-name',
  projectGoalInput: '[data-testid="project-goal-input"], #project-goal',
  createProjectBtn: '[data-testid="create-project-btn"], button:has-text("Create Project")',

  // Tasks
  addTaskBtn: '[data-testid="add-task-btn"]',
  newTaskDialog: '[data-testid="new-task-dialog"]',
  taskTitleInput: '[data-testid="task-title-input"]',
  taskDescriptionInput: '#task-description',
  createTaskBtn: '[data-testid="create-task-btn"]',
  taskList: '[data-testid="task-list"]',
  taskItem: '.task-item',
  startTaskBtn: 'button:has-text("Start Task")',
  stopTaskBtn: 'button:has-text("Stop")',

  // Terminal
  terminal: '.xterm-screen',
  terminalPanel: '[data-testid="terminal-panel"], .terminal-panel',

  // Context Monitor
  contextMonitor: '[data-testid="context-monitor"], .context-monitor, .context-bar',

  // Approval Queue
  approvalQueue: '[data-testid="approval-queue"], .approval-queue',
  approvalAllowOnce: '[data-testid="approval-allow-once"]',
  approvalDenyOnce: '[data-testid="approval-deny-once"]',
  approvalAlwaysAllow: '[data-testid="approval-always-allow"]',

  // Cycles
  cyclesBtn: '[data-testid="cycles-btn"]',
  cyclePanel: '[data-testid="cycle-panel"]',
  startCycle0Btn: '[data-testid="start-cycle-0-btn"]',
  cycleGoalInput: '[data-testid="cycle-goal-input"]',
  createCycleBtn: '[data-testid="create-cycle-btn"]',
  completeCycleBtn: '[data-testid="complete-cycle-btn"]',
  learningsInput: '[data-testid="learnings-input"]',
  confirmCompleteCycleBtn: '[data-testid="confirm-complete-cycle-btn"]',
  cycleHistory: '.cycle-history',
  activeCycle: '.active-cycle',

  // Audit
  auditBtn: '[data-testid="audit-btn"]',
  auditPanel: '[data-testid="audit-panel"]',

  // Branching
  branchBtn: '[data-testid="branch-btn"]',
  branchDialog: '[data-testid="branch-dialog"]',
  mergeBranchBtn: '[data-testid="merge-branch-btn"]',
  discardBranchBtn: '[data-testid="discard-branch-btn"]',

  // Review
  reviewPanel: '[data-testid="review-panel"]',
  reviewApproveBtn: '[data-testid="review-approve-btn"]',
  reviewRequestChangesBtn: '[data-testid="review-request-changes-btn"]',

  // Recovery
  recoveryDialog: '[data-testid="recovery-dialog"], .overlay:has-text("Recovery Required")',
  dismissBtn: 'button:has-text("Dismiss")',

  // YOLO Benchmark
  yoloPanel: '[data-testid="yolo-panel"]',
  yoloConfigList: '[data-testid="yolo-config-list"]',
  yoloStartBtn: '[data-testid="yolo-start-btn"]',

  // Model Selector
  modelSelector: '[data-testid="model-selector"]',

  // Decisions
  decisionsBtn: '[data-testid="decisions-btn"]',
  decisionsPanel: '[data-testid="decisions-panel"]',

  // Worktrees
  worktreesBtn: '[data-testid="worktrees-btn"]',
  worktreesPanel: '[data-testid="worktrees-panel"]',

  // Benchmark-specific
  taskItemById: (taskId: string) => `[data-testid="task-item"][data-task-id="${taskId}"]`,
  askClaudePlanBtn: '[data-testid="ask-claude-plan-btn"]',
  cycleDirectionInput: '[data-testid="cycle-direction-input"]',
  approveTaskBtn: '[data-testid="approve-task-btn"]',

  // Generic
  closeBtn: '.close-btn',
  modal: '.modal',
  overlay: '.overlay',
} as const

/**
 * Timeout constants in milliseconds
 */
export const TIMEOUT = {
  /** Time to wait for Electron app to launch */
  launch: 60000,

  /** Time for UI elements to become visible */
  ui: 15000,

  /** Time for slow mode UI delays */
  uiSlow: 30000,

  /** Time for individual task operations */
  task: 120000,

  /** Time for slow mode task operations */
  taskSlow: 240000,

  /** Time for full benchmark runs */
  benchmark: 300000,

  /** Time for slow mode benchmark runs */
  benchmarkSlow: 600000,

  /** Short timeout for quick checks */
  short: 3000,

  /** Very short timeout for existence checks */
  exists: 1000,
} as const

/**
 * Configuration from environment variables
 */
export const CONFIG = {
  /** Enable slow mode for debugging */
  slowMode: process.env.NERV_SLOW_MODE === 'true',

  /** Use mock Claude (default: true for tests) */
  mockClaude: process.env.NERV_MOCK_CLAUDE !== 'false',

  /** Delay between actions in slow mode */
  slowDelay: parseInt(process.env.NERV_SLOW_DELAY || '2000'),

  /** Micro-delay for form fills and quick actions */
  microDelay: parseInt(process.env.NERV_MICRO_DELAY || '500'),
} as const

/**
 * Get timeout value adjusted for slow mode
 */
export function getTimeout(base: number): number {
  return CONFIG.slowMode ? base * 2 : base
}
