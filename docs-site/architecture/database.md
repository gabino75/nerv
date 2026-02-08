# Database Architecture

NERV uses SQLite for all persistent state.

## Overview

- **Engine**: SQLite via better-sqlite3
- **Mode**: WAL (Write-Ahead Logging)
- **Location**: `~/.nerv/state.db`
- **Migrations**: Automatic on startup

## Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project metadata |
| `project_repos` | Repositories per project |
| `tasks` | Kanban tasks |
| `cycles` | Development cycles |
| `claude_sessions` | Session tracking |

### Permission Tables

| Table | Purpose |
|-------|---------|
| `approval_requests` | Pending permission requests |
| `approval_rules` | Pattern-based rules |

### Knowledge Tables

| Table | Purpose |
|-------|---------|
| `decisions` | Recorded decisions (ADRs) |
| `metrics` | Per-session token/cost metrics |
| `audit_log` | All state changes |

### Configuration Tables

| Table | Purpose |
|-------|---------|
| `settings` | Project-level settings |

## Key Tables

### projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

### tasks

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  cycle_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'implementation',
  status TEXT DEFAULT 'todo',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id)
)
```

### claude_sessions

```sql
CREATE TABLE claude_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  status TEXT DEFAULT 'active',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
)
```

### approval_rules

```sql
CREATE TABLE approval_rules (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'allow' or 'deny'
  tool TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```

## Migrations

Migrations are defined in `src/core/migrations.ts` and run automatically:

```typescript
export const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ...
      )
    `
  },
  {
    version: 2,
    up: `
      ALTER TABLE tasks ADD COLUMN type TEXT DEFAULT 'implementation'
    `
  },
  // ...
]
```

## DatabaseService

The `DatabaseService` class provides typed operations:

```typescript
class DatabaseService {
  // Projects
  createProject(name: string, goal?: string): Project
  getProjects(): Project[]
  getProject(id: string): Project | null

  // Tasks
  createTask(projectId: string, title: string): Task
  getTasks(projectId: string): Task[]
  updateTask(id: string, updates: Partial<Task>): Task

  // Sessions
  createSession(projectId: string, taskId?: string): Session
  updateSession(id: string, updates: Partial<Session>): Session

  // Rules
  createRule(pattern: string, action: string, tool: string): Rule
  getRules(): Rule[]
  matchRule(tool: string, command: string): Rule | null
}
```

## Query Patterns

### Get Tasks by Status

```typescript
const inProgress = db.getTasks(projectId)
  .filter(t => t.status === 'in_progress')
```

### Calculate Project Cost

```typescript
const sessions = db.getSessions(projectId)
const totalCost = sessions.reduce((sum, s) => sum + s.cost_usd, 0)
```

### Check Permission Rule

```typescript
const rule = db.matchRule('Bash', 'npm test')
if (rule?.action === 'allow') {
  // Proceed
}
```

## Backup & Recovery

### Manual Backup

```bash
cp ~/.nerv/state.db ~/.nerv/state.db.backup
```

### WAL Checkpoint

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

### Export Data

```bash
nerv export --format json > backup.json
```

## Performance

SQLite with WAL mode provides:

- Fast reads (no locking)
- Reliable writes
- Automatic recovery
- Single-file database

For typical NERV usage (hundreds of tasks, thousands of sessions), SQLite performs well without optimization.
