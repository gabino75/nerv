#!/usr/bin/env node
/**
 * NERV Context MCP Server
 *
 * Provides read-only access to project and task context for Claude Code sessions.
 * Reads from NERV's SQLite database at ~/.nerv/state.db
 *
 * This MCP server exposes three tools:
 * - get_current_task: Get details about the current task including acceptance criteria
 * - get_cycle_info: Get info about the current cycle and other tasks in it
 * - get_project_goal: Get the high-level project objective
 *
 * Environment variables:
 * - NERV_PROJECT_ID: The project ID (required)
 * - NERV_TASK_ID: The current task ID (optional)
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

// Database path
function getDatabasePath(): string {
  return join(homedir(), '.nerv', 'state.db')
}

// Get database connection
function getDb(): Database.Database | null {
  const dbPath = getDatabasePath()
  if (!existsSync(dbPath)) {
    console.error(`[nerv-context] Database not found at: ${dbPath}`)
    return null
  }

  try {
    return new Database(dbPath, { readonly: true })
  } catch (error) {
    console.error(`[nerv-context] Failed to open database:`, error)
    return null
  }
}

// Task interface matching NERV's schema
interface Task {
  id: string
  project_id: string
  cycle_id: string | null
  title: string
  description: string | null
  task_type: string
  status: string
  repos: string | null
  worktree_path: string | null
  session_id: string | null
  created_at: string
  completed_at: string | null
}

interface Project {
  id: string
  name: string
  goal: string | null
  created_at: string
}

interface Cycle {
  id: string
  project_id: string
  cycle_number: number
  goal: string | null
  status: string
  learnings: string | null
}

interface AcceptanceCriterion {
  id: string
  task_id: string
  description: string
  verifier_type: string
  verifier_config: string | null
  status: string
}

// Get current task details
function getCurrentTask(taskId: string | undefined, projectId: string): {
  task: Task | null
  acceptanceCriteria: AcceptanceCriterion[]
  error?: string
} {
  const db = getDb()
  if (!db) {
    return { task: null, acceptanceCriteria: [], error: 'Database not available' }
  }

  try {
    let task: Task | null = null

    if (taskId) {
      // Get specific task
      task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined ?? null
    } else {
      // Get the most recently started task for this project
      task = db.prepare(`
        SELECT * FROM tasks
        WHERE project_id = ? AND status IN ('in_progress', 'todo')
        ORDER BY
          CASE status WHEN 'in_progress' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
      `).get(projectId) as Task | undefined ?? null
    }

    if (!task) {
      return { task: null, acceptanceCriteria: [], error: 'No task found' }
    }

    // Get acceptance criteria for the task
    const criteria = db.prepare(`
      SELECT * FROM acceptance_criteria WHERE task_id = ?
    `).all(task.id) as AcceptanceCriterion[]

    db.close()
    return { task, acceptanceCriteria: criteria }
  } catch (error) {
    db.close()
    return { task: null, acceptanceCriteria: [], error: String(error) }
  }
}

// Get cycle information
function getCycleInfo(projectId: string, cycleId?: string): {
  cycle: Cycle | null
  tasks: Task[]
  error?: string
} {
  const db = getDb()
  if (!db) {
    return { cycle: null, tasks: [], error: 'Database not available' }
  }

  try {
    let cycle: Cycle | null = null

    if (cycleId) {
      cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(cycleId) as Cycle | undefined ?? null
    } else {
      // Get active cycle for project
      cycle = db.prepare(`
        SELECT * FROM cycles WHERE project_id = ? AND status = 'active'
        ORDER BY cycle_number DESC LIMIT 1
      `).get(projectId) as Cycle | undefined ?? null
    }

    if (!cycle) {
      db.close()
      return { cycle: null, tasks: [], error: 'No active cycle found' }
    }

    // Get tasks in this cycle
    const tasks = db.prepare(`
      SELECT * FROM tasks WHERE cycle_id = ? ORDER BY created_at
    `).all(cycle.id) as Task[]

    db.close()
    return { cycle, tasks }
  } catch (error) {
    db.close()
    return { cycle: null, tasks: [], error: String(error) }
  }
}

// Get project goal
function getProjectGoal(projectId: string): { project: Project | null; error?: string } {
  const db = getDb()
  if (!db) {
    return { project: null, error: 'Database not available' }
  }

  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined ?? null
    db.close()

    if (!project) {
      return { project: null, error: 'Project not found' }
    }

    return { project }
  } catch (error) {
    db.close()
    return { project: null, error: String(error) }
  }
}

// Create and configure the MCP server
const server = new Server(
  {
    name: 'nerv-context',
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
  const projectId = process.env.NERV_PROJECT_ID
  const taskId = process.env.NERV_TASK_ID

  return {
    tools: [
      {
        name: 'get_current_task',
        description: `Get details about the current task including title, description, status, type, and acceptance criteria.${taskId ? ` Current task ID: ${taskId}` : ' No task ID set, will return most recent in-progress task.'}`,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_cycle_info',
        description: `Get information about the current cycle including goal, status, learnings, and list of all tasks in the cycle.${projectId ? ` Project ID: ${projectId}` : ''}`,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_project_goal',
        description: `Get the high-level project objective and metadata.${projectId ? ` Project ID: ${projectId}` : ''}`,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
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
    case 'get_current_task': {
      const { task, acceptanceCriteria, error } = getCurrentTask(taskId, projectId)

      if (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error}`
          }]
        }
      }

      if (!task) {
        return {
          content: [{
            type: 'text',
            text: 'No current task found.'
          }]
        }
      }

      // Format output
      const criteriaText = acceptanceCriteria.length > 0
        ? '\n\n## Acceptance Criteria\n' + acceptanceCriteria.map(c =>
            `- [${c.status === 'passed' ? 'x' : ' '}] ${c.description} (${c.verifier_type})`
          ).join('\n')
        : ''

      return {
        content: [{
          type: 'text',
          text: `# Task: ${task.title}

**ID:** ${task.id}
**Type:** ${task.task_type}
**Status:** ${task.status}
**Cycle:** ${task.cycle_id || 'None'}

## Description
${task.description || 'No description provided.'}${criteriaText}`
        }]
      }
    }

    case 'get_cycle_info': {
      const { cycle, tasks, error } = getCycleInfo(projectId)

      if (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error}`
          }]
        }
      }

      if (!cycle) {
        return {
          content: [{
            type: 'text',
            text: 'No active cycle found.'
          }]
        }
      }

      const tasksText = tasks.length > 0
        ? '\n\n## Tasks in this Cycle\n' + tasks.map(t =>
            `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} (${t.status})`
          ).join('\n')
        : '\n\nNo tasks in this cycle yet.'

      return {
        content: [{
          type: 'text',
          text: `# Cycle ${cycle.cycle_number}

**ID:** ${cycle.id}
**Status:** ${cycle.status}
**Goal:** ${cycle.goal || 'No goal set'}

## Learnings
${cycle.learnings || 'No learnings recorded yet.'}${tasksText}`
        }]
      }
    }

    case 'get_project_goal': {
      const { project, error } = getProjectGoal(projectId)

      if (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error}`
          }]
        }
      }

      if (!project) {
        return {
          content: [{
            type: 'text',
            text: 'Project not found.'
          }]
        }
      }

      return {
        content: [{
          type: 'text',
          text: `# Project: ${project.name}

**ID:** ${project.id}
**Created:** ${project.created_at}

## Goal
${project.goal || 'No goal set for this project.'}`
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

  console.error(`[nerv-context] Starting MCP server`)
  console.error(`[nerv-context] Project ID: ${projectId || '(not set)'}`)
  console.error(`[nerv-context] Task ID: ${taskId || '(not set)'}`)
  console.error(`[nerv-context] Database: ${getDatabasePath()}`)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[nerv-context] Server connected via stdio')
}

main().catch((error) => {
  console.error('[nerv-context] Fatal error:', error)
  process.exit(1)
})
