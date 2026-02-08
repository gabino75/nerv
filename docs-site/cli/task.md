# Task Commands

Create and manage tasks in Kanban workflow.

## `nerv task create`

Create a new task.

```bash
nerv task create <title> [options]
```

**Arguments:**
- `<title>` - Task title (required)

**Options:**
- `--description "desc"` - Task description
- `--type <type>` - Task type: `implementation`, `research`, `debug`, `refactor`

**Examples:**
```bash
# Basic task
nerv task create "Implement login endpoint"

# With description
nerv task create "Add user authentication" \
  --description "Implement OAuth2 login flow with JWT tokens"

# Research task
nerv task create "Investigate caching options" --type research
```

## `nerv task list`

List tasks in Kanban view or flat list.

```bash
nerv task list [options]
```

**Options:**
- `--format kanban` - Display as Kanban board (default)
- `--format list` - Display as flat list
- `--status <status>` - Filter by status

**Kanban Output:**
```
TODO          IN_PROGRESS   REVIEW        DONE
────────────  ────────────  ────────────  ────────────
Add login     Fix auth bug                User model
Add register                              API setup
```

**List Output:**
```bash
nerv task list --format list

ID           Status       Title
───────────  ───────────  ─────────────────────
task_abc123  todo         Add login endpoint
task_def456  in_progress  Fix auth bug
task_ghi789  done         Set up user model
```

## `nerv task update`

Update task status.

```bash
nerv task update <id> --status <status>
```

**Arguments:**
- `<id>` - Task ID (supports prefix matching)

**Options:**
- `--status <status>` - New status: `todo`, `in_progress`, `interrupted`, `review`, `done`

**Examples:**
```bash
# Move to in progress
nerv task update abc123 --status in_progress

# Mark for review
nerv task update abc123 --status review

# Mark as done
nerv task update abc123 --status done
```

## `nerv task show`

Show task details.

```bash
nerv task show <id>
```

**Output:**
```
Task: Add login endpoint
ID: task_abc123
Status: in_progress
Type: implementation
Created: 2026-01-15 10:30

Description:
Implement POST /api/auth/login endpoint with:
- Email/password validation
- JWT token generation
- Rate limiting

Sessions: 2
Last session: 2026-01-15 14:22
```

## `nerv task delete`

Delete a task.

```bash
nerv task delete <id> [--force]
```

**Arguments:**
- `<id>` - Task ID

**Options:**
- `--force` - Skip confirmation

## Task Workflow

Tasks follow a Kanban workflow:

```
todo → in_progress → review → done
              ↓
         interrupted
```

### Status Meanings

| Status | Meaning |
|--------|---------|
| `todo` | Not started |
| `in_progress` | Currently being worked on |
| `interrupted` | Paused (session ended before completion) |
| `review` | Ready for human review |
| `done` | Completed and merged |

### Task Types

| Type | Use For |
|------|---------|
| `implementation` | Building or modifying code |
| `research` | Investigation, documentation |
| `debug` | Finding and fixing bugs |
| `refactor` | Improving code structure |

## Task-Session Relationship

Each task can have multiple sessions:

```bash
# Start first session
nerv start task_abc123
# ... work ...
# Session ends (interrupted)

# Resume later
nerv resume --task task_abc123
# ... continue work ...
```

The task status updates based on session state:
- Session started → `in_progress`
- Session ended unexpectedly → `interrupted`
- Session completed successfully → `review`
