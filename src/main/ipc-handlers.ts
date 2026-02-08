/**
 * IPC Handlers - Re-export from modular structure
 *
 * This file maintains backwards compatibility while the actual handlers
 * have been split into modular files in src/main/ipc/
 *
 * @see src/main/ipc/index.ts
 */

export { registerIpcHandlers } from './ipc/index'
