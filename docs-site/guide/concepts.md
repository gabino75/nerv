# Core Concepts

Understanding NERV's key concepts will help you work more effectively.

## Projects

A **Project** represents a development goal that may span one or more repositories.

- Each project has its own database storing tasks, sessions, and learnings
- Projects are isolated - work on multiple projects simultaneously
- Multi-repo projects use `--add-dir` to give Claude access to all repos

```bash
# Create a project
nerv project create "OAuth Feature"

# List all projects
nerv project list

# Switch between projects
nerv project switch <id>
```

## Tasks

A **Task** is a single unit of work. Tasks follow a Kanban workflow:

| Status | Description |
|--------|-------------|
| `todo` | Not yet started |
| `in_progress` | Currently being worked on |
| `interrupted` | Paused mid-work |
| `review` | Ready for review |
| `done` | Completed |

### Task Types

| Type | Use For |
|------|---------|
| `implementation` | Building or modifying code |
| `research` | Investigation, documentation |
| `debug` | Finding and fixing bugs |
| `refactor` | Improving code structure |

```bash
# Create a task
nerv task create "Implement login endpoint" --type implementation

# Update status
nerv task update <id> --status review
```

## Cycles

A **Cycle** is a logical grouping of related tasks. Cycles help you:

- Focus on a specific goal
- Capture learnings along the way
- Know when to step back and review

```bash
# Create a cycle
nerv cycle create "Authentication MVP"

# Complete with learnings
nerv cycle complete --learnings "OAuth patterns established"
```

## Worktrees

NERV uses **git worktrees** to isolate task work:

- Each task gets its own worktree with a unique branch
- Your main branch is never directly modified
- Branch naming: `nerv/{project-id}-{task-id}`
- Worktrees are created in `~/.nerv/projects/{project}/worktrees/`

Benefits:
- Work on multiple tasks in parallel without conflicts
- Safely abandon work without affecting main
- Review changes before merging

## Context (NERV.md)

Claude Code sessions receive context via NERV.md, which includes:

- Current task description and acceptance criteria
- Project goal and cycle focus
- Learnings from previous cycles
- Key decisions (ADRs)

NERV tracks token usage and keeps context small by:
- Summarizing old learnings
- Pruning irrelevant context
- Notifying you when context is compacted

## Sessions

A **Session** is a Claude Code conversation. Sessions can be:

- **Task-linked** - Associated with a specific task
- **Standalone** - For exploration and research
- **Resumed** - Continue a previous conversation

```bash
# Start a task session
nerv start <taskId>

# Resume a session
nerv resume --session <sessionId>
```

## Permission Rules

NERV intercepts dangerous commands using hooks. Rules use pattern matching:

```
Bash(npm test:*)     # Allow any npm test command
Bash(rm -rf ./build) # Allow specific rm command
Read(~/.ssh/*)       # Deny reading SSH keys
```

Rules are stored in `~/.nerv/permissions.json` and can be learned from your approval history:

```bash
nerv permissions learn
```

## Settings Hierarchy

Settings are resolved in priority order:

1. **Environment variables** (`NERV_*`)
2. **Project config** (`.nerv/config.json`)
3. **Global config** (`~/.nerv/config.json`)
4. **Default values**

```bash
# View all settings
nerv config list

# Set a value
nerv config set monthly_budget_usd 50
```
