# NERV Project

NERV (Neural Evolution & Repository Vectoring) - an Electron dashboard that orchestrates Claude Code for multi-repository development.

## What NERV Does

1. User opens NERV dashboard
2. NERV launches Claude Code sessions
3. Manages permissions via hooks
4. Coordinates tasks across multiple repos

## Tech Stack

- Electron + electron-vite
- Svelte 5 + Tailwind CSS
- SQLite (better-sqlite3)
- xterm.js + node-pty for terminal
- Go binary for permission hooks

---

# Coding Standards

## File Organization

```
src/
├── shared/           # Shared between main/renderer
│   ├── types/        # TypeScript interfaces (SINGLE SOURCE OF TRUTH)
│   │   ├── index.ts  # Re-exports all types
│   │   └── *.ts      # Domain-specific type files
│   └── constants.ts  # All configuration constants
├── core/             # Shared logic (used by main + CLI)
│   ├── database.ts   # Database access layer
│   ├── settings.ts   # Settings management
│   ├── org-config.ts # Organization config sync
│   └── verification.ts # Integrity checks
├── main/             # Electron main process
│   ├── index.ts      # Entry point, window creation
│   ├── database/     # SQLite tables (core, projects, tasks, etc.)
│   ├── ipc/          # IPC handlers (per-domain files)
│   ├── terminal.ts   # Terminal/PTY management
│   ├── claude.ts     # Claude Code process management
│   ├── worktree.ts   # Git worktree management
│   ├── hooks.ts      # Permission hook system
│   ├── skills.ts     # Workflow templates
│   ├── recovery.ts   # Error recovery
│   └── utils.ts      # Utility functions
├── cli/              # CLI entry point and commands
│   ├── index.ts      # CLI main, command registration
│   ├── colors.ts     # Shared color/formatting utilities
│   └── commands/     # Individual command files
├── preload/
│   └── index.ts      # Context bridge API
└── renderer/
    └── src/
        ├── App.svelte    # Root component
        ├── app.css       # Global styles with CSS variables
        ├── stores/       # Svelte stores
        └── components/   # UI components
            └── shared/   # Reusable components (Modal, Button, FormGroup)
```

## Type System Rules

1. **All types live in `src/shared/types/`** - never duplicate
2. **Import types explicitly**: `import type { Project, Task } from '../shared/types'`
3. **No `any` types** - use `unknown` and type guards
4. **No type assertions** like `as unknown as X`

## Constants Rules

1. **All magic numbers go in `src/shared/constants.ts`**
2. **Use the constants**: `import { TERMINAL_DEFAULTS } from '../shared/constants'`
3. **Group related constants** in objects

## DRY Patterns

```typescript
// Use utility for broadcasting
import { broadcastToRenderers } from './utils'
broadcastToRenderers('channel', data)

// Use utility for ID generation
import { generateId } from '../shared/constants'
const id = generateId('task')

// Use config for status display
import { TASK_STATUS_CONFIG } from '../shared/constants'
const { icon, color } = TASK_STATUS_CONFIG[task.status]
```

## Svelte 5 Patterns

```typescript
// Reactive state
let projects = $state<Project[]>([])

// Derived values
let selected = $derived(projects.find(p => p.id === id))

// Side effects
$effect(() => { console.log('Changed:', projects.length) })

// Typed props
interface Props { task: Task }
let { task }: Props = $props()
```

## CSS Patterns

Use CSS custom properties defined in app.css:
- `--color-nerv-primary`, `--color-nerv-bg`, etc.
- `--z-nerv-modal`, `--z-nerv-dropdown`, etc.
- `--spacing-nerv-sm`, `--spacing-nerv-md`, etc.

## Before Committing

```bash
npm run build      # Must pass
npm run typecheck  # No errors
npm run test:unit  # 480+ unit tests
npm run test:e2e   # E2E tests (Playwright in Docker)
```

---
