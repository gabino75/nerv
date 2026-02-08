/**
 * NERV Core Library
 *
 * Platform-agnostic business logic for NERV.
 * This module can be used by both the CLI and Electron app.
 *
 * See PRD Section 12: CLI-First Architecture
 */

// Re-export types from shared (single source of truth)
export * from '../shared/types.js'
export * from '../shared/constants.js'

// Database
export { DatabaseService, createDatabaseService } from './database.js'
export type { DatabaseServiceConfig } from './database.js'

// Claude configuration
export { buildClaudeArgs, parseStreamMessage } from './claude-config.js'
export type { ClaudeArgsConfig, StreamMessage } from './claude-config.js'

// Platform helpers
export { getNervDir, ensureNervDir } from './platform.js'

// Programmatic API (PRD Section 12)
export { Nerv, createNerv } from './nerv-api.js'
export type { NervConfig, TaskCreateOptions, ClaudeStartOptions, YoloRunOptions, YoloRunResult } from './nerv-api.js'
