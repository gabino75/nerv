#!/usr/bin/env node
/**
 * NERV Progress MCP Server
 *
 * Allows Claude Code sessions to write progress updates back to NERV.
 * Writes to NERV's SQLite database at ~/.nerv/state.db
 *
 * This MCP server exposes the following tools:
 * - update_task_status: Change task status with optional notes
 * - record_learning: Add a learning to the current project
 * - record_decision: Add an architectural decision record (ADR)
 * - create_task: Create a new task in the project
 * - update_spec: Propose a spec update (queued for human review)
 *
 * Environment variables:
 * - NERV_PROJECT_ID: The project ID (required)
 * - NERV_TASK_ID: The current task ID (optional, but needed for task operations)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'

// Database path
function getDatabasePath(): string {
  return join(homedir(), '.nerv', 'state.db')
}

// Get database connection (read-write)
function getDb(): Database.Database | null {
  const dbPath = getDatabasePath()
  if (!existsSync(dbPath)) {
    console.error(`[nerv-progress] Database not found at: ${dbPath}`)
    return null
  }

  try {
    return new Database(dbPath)
  } catch (error) {
    console.error(`[nerv-progress] Failed to open database:`, error)
    return null
  }
}

// Generate a unique ID
function generateId(): string {
  return randomUUID().slice(0, 8)
}

// Valid task statuses (database uses: todo, in_progress, interrupted, review, done)
// PRD also documents: blocked (alias for interrupted), complete (alias for done)
type TaskStatus = 'todo' | 'in_progress' | 'interrupted' | 'review' | 'done'
const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'interrupted', 'review', 'done']

// PRD uses 'blocked' and 'complete' in some places, map to database equivalents
const STATUS_ALIASES: Record<string, TaskStatus> = {
  'blocked': 'interrupted',
  'complete': 'done'
}

// Normalize status (handle PRD aliases)
function normalizeStatus(status: string): TaskStatus | null {
  // Check if it's a direct valid status
  if (VALID_STATUSES.includes(status as TaskStatus)) {
    return status as TaskStatus
  }
  // Check if it's an alias
  if (status in STATUS_ALIASES) {
    return STATUS_ALIASES[status]
  }
  return null
}

// Update task status
function updateTaskStatus(taskId: string, inputStatus: string, notes?: string): { success: boolean; error?: string } {
  const status = normalizeStatus(inputStatus)
  if (!status) {
    return { success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')} (aliases: blocked, complete)` }
  }

  const db = getDb()
  if (!db) {
    return { success: false, error: 'Database not available' }
  }

  try {
    // Update task status
    const result = db.prepare(`
      UPDATE tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE completed_at END
      WHERE id = ?
    `).run(status, status, taskId)

    if (result.changes === 0) {
      db.close()
      return { success: false, error: 'Task not found' }
    }

    // Log the status update as an audit event
    db.prepare(`
      INSERT INTO audit_log (timestamp, task_id, event_type, details)
      VALUES (datetime('now'), ?, 'status_update', ?)
    `).run(taskId, JSON.stringify({ status, notes }))

    db.close()
    return { success: true }
  } catch (error) {
    db.close()
    return { success: false, error: String(error) }
  }
}

// Record a learning
function recordLearning(projectId: string, content: string, category?: string): { success: boolean; id?: string; error?: string } {
  const db = getDb()
  if (!db) {
    return { success: false, error: 'Database not available' }
  }

  try {
    const id = generateId()
    const validCategory = ['technical', 'process', 'domain', 'architecture', 'other'].includes(category || '')
      ? category
      : 'other'

    db.prepare(`
      INSERT INTO learnings (id, project_id, content, category, source, created_at)
      VALUES (?, ?, ?, ?, 'cycle_completion', datetime('now'))
    `).run(id, projectId, content, validCategory)

    db.close()
    return { success: true, id }
  } catch (error) {
    db.close()
    return { success: false, error: String(error) }
  }
}

// Record a decision (ADR)
function recordDecision(projectId: string, title: string, rationale: string, cycleId?: string): { success: boolean; id?: string; error?: string } {
  const db = getDb()
  if (!db) {
    return { success: false, error: 'Database not available' }
  }

  try {
    const id = generateId()

    db.prepare(`
      INSERT INTO decisions (id, project_id, cycle_id, title, rationale, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, projectId, cycleId || null, title, rationale)

    // Log the decision as an audit event
    db.prepare(`
      INSERT INTO audit_log (timestamp, task_id, event_type, details)
      VALUES (datetime('now'), NULL, 'decision_recorded', ?)
    `).run(JSON.stringify({ id, title }))

    db.close()
    return { success: true, id }
  } catch (error) {
    db.close()
    return { success: false, error: String(error) }
  }
}

// Create a new task
function createTask(
  projectId: string,
  title: string,
  description?: string,
  taskType?: string,
  cycleId?: string
): { success: boolean; id?: string; error?: string } {
  const db = getDb()
  if (!db) {
    return { success: false, error: 'Database not available' }
  }

  try {
    const id = generateId()
    const type = ['implementation', 'research', 'debug'].includes(taskType || '') ? taskType : 'implementation'

    db.prepare(`
      INSERT INTO tasks (id, project_id, cycle_id, title, description, task_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'todo', datetime('now'))
    `).run(id, projectId, cycleId || null, title, description || null, type)

    // Log task creation as an audit event
    db.prepare(`
      INSERT INTO audit_log (timestamp, task_id, event_type, details)
      VALUES (datetime('now'), ?, 'task_created', ?)
    `).run(id, JSON.stringify({ title, type }))

    db.close()
    return { success: true, id }
  } catch (error) {
    db.close()
    return { success: false, error: String(error) }
  }
}

// Propose a spec update (stored for human review)
function proposeSpecUpdate(projectId: string, section: string, content: string): { success: boolean; error?: string } {
  const db = getDb()
  if (!db) {
    return { success: false, error: 'Database not available' }
  }

  try {
    // Store spec updates in audit log for human review
    // In a full implementation, this could have its own table
    db.prepare(`
      INSERT INTO audit_log (timestamp, task_id, event_type, details)
      VALUES (datetime('now'), NULL, 'spec_update_proposed', ?)
    `).run(JSON.stringify({ projectId, section, content }))

    db.close()
    return { success: true }
  } catch (error) {
    db.close()
    return { success: false, error: String(error) }
  }
}

// Create and configure the MCP server
const server = new Server(
  {
    name: 'nerv-progress',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'update_task_status',
        description: 'Update the status of the current task. Valid statuses: todo, in_progress, interrupted (or blocked), review, done (or complete)',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['todo', 'in_progress', 'interrupted', 'blocked', 'review', 'done', 'complete'],
              description: 'The new status for the task. "blocked" is an alias for "interrupted", "complete" is an alias for "done"'
            },
            notes: {
              type: 'string',
              description: 'Optional notes about the status change'
            }
          },
          required: ['status']
        }
      },
      {
        name: 'record_learning',
        description: 'Record a learning or insight from the current work session. Learnings are persisted and available for future reference.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The learning content'
            },
            category: {
              type: 'string',
              enum: ['technical', 'process', 'domain', 'architecture', 'other'],
              description: 'Category of the learning'
            }
          },
          required: ['content']
        }
      },
      {
        name: 'record_decision',
        description: 'Record an architectural decision (ADR) with rationale. Decisions are persisted for project documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short title for the decision'
            },
            rationale: {
              type: 'string',
              description: 'Explanation of why this decision was made, including alternatives considered'
            }
          },
          required: ['title', 'rationale']
        }
      },
      {
        name: 'create_task',
        description: 'Create a new task in the project. Use this when discovering new work that needs to be done.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new task'
            },
            description: {
              type: 'string',
              description: 'Detailed description of what the task involves'
            },
            task_type: {
              type: 'string',
              enum: ['implementation', 'research', 'debug'],
              description: 'Type of task'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'update_spec',
        description: 'Propose a spec/documentation update. Updates are queued for human review.',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              description: 'The section or file to update (e.g., "CLAUDE.md", "API.md")'
            },
            content: {
              type: 'string',
              description: 'The proposed content or changes'
            }
          },
          required: ['section', 'content']
        }
      }
    ]
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const projectId = process.env.NERV_PROJECT_ID
  const taskId = process.env.NERV_TASK_ID

  if (!projectId) {
    throw new McpError(ErrorCode.InvalidParams, 'NERV_PROJECT_ID environment variable not set')
  }

  switch (request.params.name) {
    case 'update_task_status': {
      if (!taskId) {
        return {
          content: [{
            type: 'text',
            text: 'Error: NERV_TASK_ID not set. Cannot update task status without a task ID.'
          }]
        }
      }

      const inputStatus = request.params.arguments?.status as string
      const notes = request.params.arguments?.notes as string | undefined

      const { success, error } = updateTaskStatus(taskId, inputStatus, notes)
      const normalizedStatus = normalizeStatus(inputStatus)

      return {
        content: [{
          type: 'text',
          text: success
            ? `Task status updated to: ${normalizedStatus}${inputStatus !== normalizedStatus ? ` (from "${inputStatus}")` : ''}${notes ? `\nNotes: ${notes}` : ''}`
            : `Error updating task status: ${error}`
        }]
      }
    }

    case 'record_learning': {
      const content = request.params.arguments?.content as string
      const category = request.params.arguments?.category as string | undefined

      if (!content) {
        throw new McpError(ErrorCode.InvalidParams, 'Content is required')
      }

      const { success, id, error } = recordLearning(projectId, content, category)

      return {
        content: [{
          type: 'text',
          text: success
            ? `Learning recorded (ID: ${id}): ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`
            : `Error recording learning: ${error}`
        }]
      }
    }

    case 'record_decision': {
      const title = request.params.arguments?.title as string
      const rationale = request.params.arguments?.rationale as string

      if (!title || !rationale) {
        throw new McpError(ErrorCode.InvalidParams, 'Title and rationale are required')
      }

      // Get active cycle if available
      const db = getDb()
      let cycleId: string | undefined
      if (db) {
        const cycle = db.prepare(`
          SELECT id FROM cycles WHERE project_id = ? AND status = 'active'
          ORDER BY cycle_number DESC LIMIT 1
        `).get(projectId) as { id: string } | undefined
        cycleId = cycle?.id
        db.close()
      }

      const { success, id, error } = recordDecision(projectId, title, rationale, cycleId)

      return {
        content: [{
          type: 'text',
          text: success
            ? `Decision recorded (ID: ${id}): ${title}`
            : `Error recording decision: ${error}`
        }]
      }
    }

    case 'create_task': {
      const title = request.params.arguments?.title as string
      const description = request.params.arguments?.description as string | undefined
      const taskType = request.params.arguments?.task_type as string | undefined

      if (!title) {
        throw new McpError(ErrorCode.InvalidParams, 'Title is required')
      }

      // Get active cycle if available
      const db = getDb()
      let cycleId: string | undefined
      if (db) {
        const cycle = db.prepare(`
          SELECT id FROM cycles WHERE project_id = ? AND status = 'active'
          ORDER BY cycle_number DESC LIMIT 1
        `).get(projectId) as { id: string } | undefined
        cycleId = cycle?.id
        db.close()
      }

      const { success, id, error } = createTask(projectId, title, description, taskType, cycleId)

      return {
        content: [{
          type: 'text',
          text: success
            ? `Task created (ID: ${id}): ${title}`
            : `Error creating task: ${error}`
        }]
      }
    }

    case 'update_spec': {
      const section = request.params.arguments?.section as string
      const content = request.params.arguments?.content as string

      if (!section || !content) {
        throw new McpError(ErrorCode.InvalidParams, 'Section and content are required')
      }

      const { success, error } = proposeSpecUpdate(projectId, section, content)

      return {
        content: [{
          type: 'text',
          text: success
            ? `Spec update proposed for "${section}". The update has been queued for human review.`
            : `Error proposing spec update: ${error}`
        }]
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
  }
})

// Main entry point
async function main() {
  const projectId = process.env.NERV_PROJECT_ID
  const taskId = process.env.NERV_TASK_ID

  console.error(`[nerv-progress] Starting MCP server`)
  console.error(`[nerv-progress] Project ID: ${projectId || '(not set)'}`)
  console.error(`[nerv-progress] Task ID: ${taskId || '(not set)'}`)
  console.error(`[nerv-progress] Database: ${getDatabasePath()}`)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[nerv-progress] Server connected via stdio')
}

main().catch((error) => {
  console.error('[nerv-progress] Fatal error:', error)
  process.exit(1)
})
