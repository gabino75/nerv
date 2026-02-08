/**
 * Application state management
 *
 * This module holds app-level state that needs to be shared across modules
 * without importing electron. This allows other modules to check app state
 * in unit tests.
 */

// Track if we're shutting down to suppress errors during cleanup
let isShuttingDown = false

/**
 * Check if the app is currently shutting down
 */
export function isAppShuttingDown(): boolean {
  return isShuttingDown
}

/**
 * Mark the app as shutting down
 * Should only be called by the main electron lifecycle handlers
 */
export function setAppShuttingDown(value: boolean): void {
  isShuttingDown = value
}
