/**
 * Claude Code integration
 *
 * This file re-exports from the modular claude structure for backwards compatibility.
 * The actual implementation is split across files in ./claude/ directory:
 *
 * - claude/types.ts: Internal type definitions
 * - claude/state.ts: Session state management
 * - claude/utils.ts: Utility functions (session ID, command building)
 * - claude/stream-parser.ts: Stream-json output parsing
 * - claude/session.ts: Session lifecycle (spawn, resume, kill)
 * - claude/ipc-handlers.ts: IPC handler registration
 */

export * from './claude/index'
