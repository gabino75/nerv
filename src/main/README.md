# Main Process (`src/main/`)

The Electron main process handles system-level operations, database management, Claude session orchestration, and IPC communication with the renderer.

## Purpose

This module is the backend of NERV. It:
- Manages the SQLite database for projects, tasks, and settings
- Spawns and controls Claude Code CLI sessions
- Handles permission hooks and approval workflows
- Creates and manages git worktrees
- Provides IPC handlers for renderer communication

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Entry point, window creation, app lifecycle |
| `database.ts` | SQLite database service singleton |
| `database-migrations.ts` | Schema version migrations |
| `terminal.ts` | PTY/terminal management |
| `hooks.ts` | Permission hook configuration and handling |
| `worktree.ts` | Git worktree lifecycle management |
| `nerv-md.ts` | NERV.md context file generation |
| `mcp-config.ts` | MCP server configuration for Claude sessions |
| `recovery.ts` | Session monitoring, hang/loop detection |
| `auto-update.ts` | Electron auto-update via electron-updater |
| `skills.ts` | Skill discovery and management |
| `repo-scanner.ts` | Repository context scanning (CLAUDE.md, skills, MCP) |
| `branching.ts` | Session branching for troubleshooting |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `claude/` | Claude session spawning, stream parsing, lifecycle |
| `database/` | Database operations by domain (projects, tasks, metrics) |
| `ipc/` | IPC handler registration and implementations |
| `audit/` | Code and plan health auditing |
| `verification/` | Acceptance criteria verification |
| `yolo-benchmark/` | Autonomous YOLO mode and benchmarking |
| `claude-md/` | CLAUDE.md parsing utilities |

## How It Works

1. **App Startup**: `index.ts` creates the main window and initializes services
2. **Database**: Single SQLite file at `~/.nerv/state.db` with migrations
3. **IPC**: Handlers in `ipc/` expose backend functions to renderer via contextBridge
4. **Claude Sessions**: `claude/` module spawns `claude` CLI with configured hooks
5. **Hooks**: Go binary (`nerv-hook`) intercepts tool calls for approval

## API/Exports

Main exports used by other modules:

```typescript
// Database service
import { databaseService } from './database'

// Claude session management
import { spawnClaude, killAllClaudeSessions } from './claude'

// IPC handler registration
import { registerAllHandlers } from './ipc'

// Utilities
import { broadcastToRenderers, generateId } from './utils'
```

## Dependencies

- `better-sqlite3`: SQLite database
- `node-pty`: Terminal emulation
- `electron-updater`: Auto-update support
- `fs-extra`: File system utilities

## Testing

Unit tests in `test/unit/main/`:
```bash
npm run test:unit -- --grep "main/"
```

## Common Tasks

### Adding a new IPC handler

1. Create handler function in appropriate file under `ipc/`
2. Register in `ipc/index.ts`
3. Add preload API method in `src/preload/api/`
4. Export from `src/preload/api/index.ts`

### Adding a database table

1. Add migration in `database-migrations.ts`
2. Increment version number
3. Add operations class in `database/`
4. Export from `database/index.ts`

### Adding a Claude hook

1. Update `DEFAULT_PERMISSIONS` in `hooks.ts`
2. Implement handler in Go binary (`cmd/nerv-hook/main.go`)
3. Rebuild hook: `cd cmd/nerv-hook && go build`
