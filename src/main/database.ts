/**
 * NERV Database Service
 *
 * This file re-exports from the modular database structure for backwards compatibility.
 * The actual implementation is split across files in ./database/ directory:
 *
 * - database/core.ts: Base database initialization
 * - database/projects.ts: Project and settings operations
 * - database/tasks.ts: Task operations
 * - database/cycles.ts: Cycle operations
 * - database/approvals.ts: Approval operations
 * - database/metrics.ts: Session metrics and audit log
 * - database/repos.ts: Repository and context operations
 * - database/decisions.ts: Decision and branch operations
 * - database/yolo.ts: YOLO benchmark operations
 * - database/subagents.ts: Subagent tracking
 */

export * from './database/index'
