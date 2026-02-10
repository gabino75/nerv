/**
 * NERV E2E Test Helpers
 *
 * Centralized exports for all test utilities.
 */

// Selectors and constants
export {
  SELECTORS,
  TIMEOUT,
  CONFIG,
  getTimeout,
} from './selectors'

// Launch utilities
export {
  type TestContext,
  type MultiRepoTestContext,
  log,
  slowWait,
  microWait,
  createTestRepo,
  cleanupTestRepo,
  getCurrentApp,
  getCurrentTestRepoPath,
  getCurrentTestRepoPath2,
  clearTrackingRefs,
  registerTestRepo2,
  safeAppClose,
  launchNervBenchmark,
  launchNervRealClaude,
  standardCleanup,
} from './launch'

// Selectors - dropdown mapping
export {
  DROPDOWN_PARENT,
} from './selectors'

// Actions
export {
  setupBenchmarkProjectWithRepo,
  createBenchmarkTask,
  createBenchmarkTaskViaAPI,
  startTask,
  selectProject,
  clickDropdownItem,
  openAuditPanel,
  openCyclePanel,
  switchToCliTab,
  switchToKanbanTab,
  approvePermission,
  denyPermission,
  closeModal,
  dismissRecoveryDialog,
} from './actions'

// Benchmark Collector
export {
  BenchmarkCollector,
  type TaskMetrics,
  type CycleMetrics,
} from './benchmark-collector'
