# Session Commands

Start and manage Claude Code sessions.

## `nerv start`

Start a Claude session.

```bash
nerv start [taskId] [options]
```

**Arguments:**
- `[taskId]` - Optional task ID (supports prefix matching)

**Options:**
- `--task`, `-t <taskId>` - Explicit task option
- `--agent <name>` - Use specific agent
- `--resume`, `-r <sessionId>` - Resume previous session

**Examples:**
```bash
# Start generic session
nerv start

# Start task session
nerv start task_abc123

# With specific agent
nerv start task_abc123 --agent researcher

# Resume session
nerv start --resume session_xyz789
```

**Behavior:**
- Without taskId: Starts generic session for project exploration
- With taskId: Creates worktree, generates NERV.md, launches Claude

## `nerv resume`

Resume a previous session.

```bash
nerv resume [options]
```

**Options:**
- `--session <id>` - Specific session ID
- `--task <id>` - Resume most recent session for task

**Examples:**
```bash
# Resume most recent session
nerv resume

# Resume specific session
nerv resume --session session_abc123

# Resume last session for task
nerv resume --task task_xyz789
```

## `nerv yolo`

Run in autonomous YOLO mode.

```bash
nerv yolo [options]
```

**Options:**
- `--cycles <n>` - Maximum cycles (default: 10)
- `--max-cost <usd>` - Cost limit (default: 5.00)
- `--stop-on-failure` - Stop on first failure

**Examples:**
```bash
# Basic YOLO run
nerv yolo

# With limits
nerv yolo --cycles 5 --max-cost 2.00

# Stop on failure
nerv yolo --stop-on-failure
```

See [YOLO Mode](/features/yolo-mode) for details.

## `nerv session list`

List all sessions.

```bash
nerv session list [options]
```

**Options:**
- `--status <status>` - Filter: `active`, `completed`, `interrupted`
- `--task <id>` - Filter by task

**Output:**
```
Sessions:
ID              Task          Status      Started
──────────────  ────────────  ──────────  ──────────────────
session_abc123  Add login     active      2026-01-15 14:22
session_def456  Fix auth      completed   2026-01-15 10:30
session_ghi789  (generic)     completed   2026-01-14 16:45
```

## `nerv session show`

Show session details.

```bash
nerv session show <id>
```

**Output:**
```
Session: session_abc123
Task: Add login endpoint (task_xyz789)
Status: completed
Started: 2026-01-15 14:22
Ended: 2026-01-15 15:45

Metrics:
- Duration: 1h 23m
- Tokens: 45,230 input / 12,450 output
- Cost: $0.87
- Turns: 34

Tools used: Read (42), Edit (18), Bash (12)
```

## `nerv session stop`

Stop an active session.

```bash
nerv session stop <id>
```

Gracefully stops the Claude process and marks session as interrupted.

## Context Commands

### `nerv context`

Show or generate project context.

```bash
nerv context [show|generate] [--full]
```

**Examples:**
```bash
# Show current context summary
nerv context

# Show full NERV.md
nerv context show

# Regenerate context
nerv context generate
```

### `nerv learn`

Record a learning.

```bash
nerv learn "content" [--category <cat>]
```

**Categories:** `technical`, `process`, `domain`, `architecture`, `other`

```bash
nerv learn "OAuth requires PKCE for mobile apps" --category technical
```

### `nerv learnings`

List all learnings.

```bash
nerv learnings [--export FILE]
```

### `nerv decide`

Record a decision.

```bash
nerv decide "title" [--rationale "why"] [--alternatives "others"]
```

```bash
nerv decide "Use JWT with 15-minute expiry" \
  --rationale "Balance security and UX" \
  --alternatives "Session cookies, 1-hour tokens"
```

### `nerv decisions`

List all decisions.

```bash
nerv decisions
```

## Cycle Commands

### `nerv cycle create`

Create a new development cycle.

```bash
nerv cycle create ["goal"]
```

```bash
nerv cycle create "Implement core authentication features"
```

### `nerv cycle list`

List all cycles.

```bash
nerv cycle list
```

### `nerv cycle complete`

Complete the active cycle.

```bash
nerv cycle complete [--learnings "summary"]
```

```bash
nerv cycle complete --learnings "OAuth patterns established, JWT working"
```

### `nerv cycle audit`

Run code health check.

```bash
nerv cycle audit
```

Checks TypeScript, build, test coverage and reports issues.
