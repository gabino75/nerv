# Development Setup

This guide covers setting up your development environment for contributing to NERV.

## Prerequisites

Before contributing, ensure you have:

- **Node.js 20+** - Required for building and running
- **npm 9+** - Package management
- **Git** - Version control
- **Go 1.21+** - Required only for building the permission hook binary
- **Docker** - Required for running E2E tests
- **Claude Code CLI** - Required for running with real Claude sessions

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/gabino75/nerv.git
cd nerv
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Rebuild Native Modules

NERV uses native modules (better-sqlite3, node-pty) that need to be compiled for Electron:

```bash
npm run rebuild
```

### 4. Start Development Server

```bash
npm run dev
```

This starts the app with hot reload enabled.

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build production Electron app |
| `npm run build:cli` | Build standalone CLI (outputs to `out/cli/`) |
| `npm run build:hooks` | Build Go hook binary for Windows |
| `npm run build:hooks:all` | Build hook binaries for all platforms |
| `npm run preview` | Preview production build |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |

## Code Style

### TypeScript Rules

1. **All types in `src/shared/types/`** - Never duplicate types
2. **Explicit imports**: `import type { Project } from '../shared/types'`
3. **No `any`** - Use `unknown` with type guards
4. **No type assertions** - No `as unknown as X` patterns

### Svelte 5 Patterns

```typescript
// Reactive state
let projects = $state<Project[]>([])

// Derived values
let activeProject = $derived(projects.find(p => p.id === currentId))

// Side effects
$effect(() => {
  console.log('Project count changed:', projects.length)
})

// Props with types
interface Props {
  task: Task
  onUpdate: (task: Task) => void
}
let { task, onUpdate }: Props = $props()
```

### CSS Patterns

Use CSS custom properties from `app.css`:

```css
.component {
  background: var(--color-nerv-bg);
  color: var(--color-nerv-text);
  padding: var(--spacing-nerv-md);
  z-index: var(--z-nerv-dropdown);
}
```

### Constants

All magic numbers and configuration go in `src/shared/constants.ts`:

```typescript
import { TERMINAL_DEFAULTS, TASK_STATUS_CONFIG } from '../shared/constants'

// Use terminal dimensions
const { cols, rows } = TERMINAL_DEFAULTS

// Use status configuration
const { icon, color } = TASK_STATUS_CONFIG[task.status]
```

## Common Tasks

### Adding a New IPC Handler

1. Define types in `src/shared/types/`
2. Add handler in `src/main/ipc/<domain>-handlers.ts`
3. Export from `src/main/ipc/index.ts`
4. Add preload API in `src/preload/api/<domain>.ts`
5. Export from `src/preload/index.ts`

### Adding a New Database Table

1. Add migration in `src/core/migrations.ts`
2. Add types in `src/shared/types/database.ts`
3. Create operations module in `src/core/database/<table>.ts`
4. Add mixin to DatabaseService in `src/core/database.ts`

### Adding a New UI Component

1. Create `src/renderer/src/components/MyComponent.svelte`
2. Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
3. Import types from `../../shared/types`
4. Use CSS variables for styling

### Adding a CLI Command

1. Create `src/cli/commands/<command>.ts`
2. Export handler function
3. Register in `src/cli/index.ts`
4. Build with `npm run build:cli`

## Debugging

### Development Tools

- **DevTools**: Press F12 in the running app
- **Main Process Logs**: Check terminal where `npm run dev` runs
- **Database**: SQLite file at `~/.nerv/state.db`

### Common Issues

**Native module errors**: Run `npm run rebuild` after npm install

**Database locked**: Close other NERV instances; SQLite uses WAL mode

**Tests fail locally**: Use Docker (`-Suite all` without `-Local`)

**Type errors**: Run `npm run typecheck` to see all issues

## Submitting Changes

### Before Committing

Run the pre-commit checks:

```bash
npm run build      # Must pass
npm run typecheck  # No errors
npm run test:unit  # All tests pass
```

For thorough validation, run E2E tests in Docker:

```bash
powershell -File test/scripts/run-e2e.ps1 -Suite all
```

### Commit Message Format

Use conventional commit messages:

```
type(scope): description

Examples:
feat(terminal): add split view mode
fix(database): handle null values in migration
docs(readme): update installation instructions
test(e2e): add benchmark test coverage
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Run all tests locally
4. Open a PR with a clear description
5. Wait for CI to pass
6. Address review feedback
7. Squash and merge

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Svelte 5 Documentation](https://svelte.dev/docs)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [xterm.js Documentation](https://xtermjs.org/docs/)
