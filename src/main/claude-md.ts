/**
 * CLAUDE.md Management Service
 *
 * This file re-exports from the modular structure for backwards compatibility.
 * The actual implementation is split across files in ./claude-md/ directory:
 *
 * - claude-md/types.ts: Type definitions
 * - claude-md/stack-detection.ts: Stack detection logic and data
 * - claude-md/file-operations.ts: File I/O operations
 * - claude-md/parser.ts: CLAUDE.md parsing and formatting
 * - claude-md/index.ts: Main exports and composed functions
 */

export * from './claude-md/index'
