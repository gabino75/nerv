/**
 * YOLO Benchmark Service
 * Manages autonomous benchmark execution for Golden Test 2
 *
 * YOLO mode runs Claude without human intervention:
 * - Auto-creates cycles and tasks
 * - Auto-approves reviews (if configured)
 * - Runs tests to validate
 * - Tracks cost/time/test metrics
 * - Stops on: success, limit reached, or blocked
 */

// Re-export lifecycle functions
export {
  startYoloBenchmark,
  stopYoloBenchmark,
  pauseYoloBenchmark,
  resumeYoloBenchmark,
  getActiveBenchmarkStatus,
  cleanupYoloBenchmarks,
  shouldAutoApproveDangerousTools
} from './lifecycle'

// Re-export grading functions
export {
  calculateBenchmarkGrade,
  compareBenchmarks
} from './grading'

// Re-export utilities
export { calculateSpecCompletion } from './utils'

// Re-export review agent (PRD Section 4: Review agent integration)
export { runReviewAgent } from './review-agent'
export type { ReviewDecision, ReviewAgentResult } from './review-agent'

// Re-export IPC handlers
export { registerYoloBenchmarkIpcHandlers } from './ipc-handlers'
