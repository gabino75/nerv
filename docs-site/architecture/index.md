# Architecture Overview

NERV is built as an Electron application with a CLI-first design.

## Process Model

NERV is an Electron app with three process types:

```
┌─────────────────────────────────────────────────────────┐
│                  Electron Main Process                  │
│  - Window management                                    │
│  - SQLite database (better-sqlite3)                     │
│  - PTY management (node-pty)                            │
│  - Claude Code process spawning                         │
│  - IPC handlers                                         │
└───────────────┬─────────────────────────────────────────┘
                │ IPC (contextBridge)
┌───────────────▼─────────────────────────────────────────┐
│                     Preload Script                      │
│  - Exposes safe API via window.api                      │
│  - Database operations                                  │
│  - Terminal input/output                                │
│  - Claude session management                            │
└───────────────┬─────────────────────────────────────────┘
                │ window.api
┌───────────────▼─────────────────────────────────────────┐
│                Renderer Process (Svelte)                │
│  - UI components                                        │
│  - Svelte 5 reactive state                              │
│  - xterm.js terminal rendering                          │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop App | Electron + electron-vite |
| UI Framework | Svelte 5 |
| Styling | Tailwind CSS |
| Database | SQLite (better-sqlite3) |
| Terminal | xterm.js + node-pty |
| Permission Hooks | Go binary |

## Directory Structure

```
src/
├── shared/                 # Shared between all processes
│   ├── types.ts            # Type re-exports
│   ├── types/              # TypeScript interfaces by domain
│   └── constants.ts        # Configuration constants
│
├── core/                   # Platform-agnostic business logic
│   ├── database.ts         # Main DatabaseService class
│   ├── database/           # Database operation modules
│   ├── claude-config.ts    # Claude CLI argument builder
│   └── migrations.ts       # Schema migration definitions
│
├── cli/                    # Command-line interface
│   ├── index.ts            # Entry point
│   └── commands/           # Command implementations
│
├── main/                   # Electron main process
│   ├── index.ts            # Entry point, window creation
│   ├── terminal.ts         # PTY process management
│   ├── claude.ts           # Claude session orchestration
│   └── ipc/                # IPC handler modules
│
├── preload/                # Context bridge
│   ├── index.ts            # Main preload script
│   └── api/                # API modules
│
└── renderer/               # Svelte UI
    └── src/
        ├── App.svelte
        ├── app.css
        ├── stores/
        └── components/
```

## Data Flow

### Starting a Task

```
User clicks "Start Task"
        │
        ▼
┌───────────────────┐
│    Renderer       │  window.api.claude.startSession(taskId)
└────────┬──────────┘
         │ IPC
         ▼
┌───────────────────┐
│      Main         │  1. Create worktree
│                   │  2. Generate NERV.md
│                   │  3. Spawn claude CLI
└────────┬──────────┘
         │ stdout/stderr
         ▼
┌───────────────────┐
│    PTY Process    │  Claude Code running
└────────┬──────────┘
         │ IPC events
         ▼
┌───────────────────┐
│    Renderer       │  Update terminal display
└───────────────────┘
```

### Permission Flow

```
Claude wants to run `rm -rf ./build`
        │
        ▼
┌───────────────────┐
│   nerv-hook       │  Hook binary intercepts
└────────┬──────────┘
         │ Check rules
         ▼
┌───────────────────┐
│  Main Process     │  Not in allowlist
└────────┬──────────┘
         │ IPC
         ▼
┌───────────────────┐
│    Renderer       │  Show approval dialog
└────────┬──────────┘
         │ User approves
         ▼
┌───────────────────┐
│  Main Process     │  Send approval to hook
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   nerv-hook       │  Allow command to proceed
└───────────────────┘
```

## Key Components

### Database Service

The `DatabaseService` class handles all SQLite operations:

- 18 tables for projects, tasks, sessions, etc.
- Automatic migrations on startup
- WAL mode for better concurrency

[Database Details](/architecture/database)

### Claude Integration

Claude Code integration handles:

- CLI argument building
- Stream JSON parsing
- Session state management
- Context generation (NERV.md)

[Claude Integration Details](/architecture/claude-integration)

### Permission Hooks

The Go-based hook system:

- Intercepts pre-tool-use events
- Checks against permission rules
- Communicates with main process

[Hook Details](/architecture/hooks)

## CLI Architecture

The CLI shares core logic with the Electron app:

```
┌─────────────────────────────────────────┐
│                  CLI                    │
│  src/cli/index.ts                       │
│  - Argument parsing                     │
│  - Command routing                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│                 Core                    │
│  src/core/                              │
│  - DatabaseService                      │
│  - ClaudeConfig                         │
│  - Platform utilities                   │
└─────────────────────────────────────────┘
```

This ensures feature parity between CLI and UI.
