# Architecture Overview

NERV is built as an Electron application with a CLI-first design.

## Process Model

NERV is an Electron app with three process types:

```mermaid
flowchart TB
    subgraph Main["Electron Main Process"]
        direction LR
        M1[Window Management]
        M2["SQLite (better-sqlite3)"]
        M3["PTY (node-pty)"]
        M4[Claude Code Spawning]
        M5[IPC Handlers]
    end

    subgraph Preload["Preload Script"]
        direction LR
        P1["window.api"]
        P2[Database Ops]
        P3[Terminal I/O]
        P4[Session Management]
    end

    subgraph Renderer["Renderer Process (Svelte 5)"]
        direction LR
        R1[UI Components]
        R2[Reactive State]
        R3["xterm.js Terminal"]
    end

    Main -->|"IPC (contextBridge)"| Preload
    Preload -->|"window.api"| Renderer
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

```mermaid
sequenceDiagram
    participant User
    participant Renderer as Renderer (Svelte)
    participant Main as Main Process
    participant PTY as PTY / Claude Code

    User->>Renderer: Click "Start Task"
    Renderer->>Main: window.api.claude.startSession(taskId)
    Main->>Main: 1. Create worktree
    Main->>Main: 2. Generate NERV.md
    Main->>PTY: 3. Spawn claude CLI
    PTY-->>Main: stdout/stderr
    Main-->>Renderer: IPC events
    Renderer-->>User: Update terminal display
```

### Permission Flow

```mermaid
sequenceDiagram
    participant Claude as Claude Code
    participant Hook as nerv-hook (Go)
    participant Main as Main Process
    participant UI as Renderer

    Claude->>Hook: Tool call (rm -rf ./build)
    Hook->>Main: Check rules (named pipe)
    Main-->>Main: Not in allowlist
    Main->>UI: Show approval dialog (IPC)
    UI-->>Main: User approves
    Main->>Hook: Send approval (named pipe)
    Hook-->>Claude: Allow command to proceed
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

```mermaid
flowchart TB
    subgraph CLI["CLI (src/cli/)"]
        direction LR
        C1[Argument Parsing]
        C2[Command Routing]
    end

    subgraph Core["Core (src/core/)"]
        direction LR
        K1[DatabaseService]
        K2[ClaudeConfig]
        K3[Platform Utilities]
    end

    subgraph Electron["Electron App (src/main/)"]
        direction LR
        E1[IPC Handlers]
        E2[Window Management]
    end

    CLI --> Core
    Electron --> Core
```

Both CLI and Electron share the same core logic, ensuring feature parity.
