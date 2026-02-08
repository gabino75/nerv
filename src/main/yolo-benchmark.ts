/**
 * YOLO Benchmark Service
 *
 * This file re-exports from the modular yolo-benchmark structure for backwards compatibility.
 * The actual implementation is split across files in ./yolo-benchmark/ directory:
 *
 * - yolo-benchmark/types.ts: Internal type definitions
 * - yolo-benchmark/utils.ts: Utility functions (sleep, spec completion, test running)
 * - yolo-benchmark/grading.ts: Benchmark grading and comparison
 * - yolo-benchmark/lifecycle.ts: Start, stop, pause, resume benchmarks
 * - yolo-benchmark/execution.ts: Main execution loop
 * - yolo-benchmark/ipc-handlers.ts: IPC handler registration
 */

export * from './yolo-benchmark/index'
