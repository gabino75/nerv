# Renderer Process (`src/renderer/`)

The Electron renderer process provides the NERV dashboard UI using Svelte 5 and Tailwind CSS.

## Purpose

This module is the frontend of NERV. It:
- Displays the project dashboard with task board, terminal, and approval queue
- Manages Svelte stores for reactive state
- Communicates with main process via preload API
- Handles user interactions and real-time updates

## Key Files

| File | Description |
|------|-------------|
| `src/main.ts` | Entry point, mounts Svelte app |
| `src/App.svelte` | Root component, layout and routing |
| `src/app.css` | Global styles with CSS variables |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `src/components/` | UI components (dashboard panels, dialogs, controls) |
| `src/components/shared/` | Reusable components (Modal, Button, FormGroup) |
| `src/stores/` | Svelte stores for state management |
| `src/lib/` | Utility functions and helpers |

## Key Components

### Dashboard Panels
- `ProjectSelector.svelte` - Project list and creation
- `TaskBoard.svelte` - Kanban task board
- `ApprovalQueue.svelte` - Permission approval interface
- `TabContainer.svelte` - Terminal tabs with split view
- `ModelStats.svelte` - Cost tracking and usage metrics
- `ContextMonitor.svelte` - Token usage and context alerts
- `ActiveSessionsPanel.svelte` - Running Claude sessions
- `WorkflowTemplatesPanel.svelte` - Skill/template browser

### Dialogs
- `NewProjectDialog.svelte` - Project creation wizard
- `NewTaskModal.svelte` - Task creation form
- `TaskReviewModal.svelte` - Task review and approval
- `LockedProjectDialog.svelte` - Multi-instance lock handling
- `BranchingDialog.svelte` - Session branching
- `UpdateNotification.svelte` - Auto-update UI

### Shared Components
- `Modal.svelte` - Reusable modal wrapper
- `Button.svelte` - Styled button component
- `FormGroup.svelte` - Form field with label and validation

## How It Works

1. **App Mount**: `main.ts` mounts `App.svelte` to `#app`
2. **Stores**: Reactive state in `stores/` synced with main process
3. **IPC**: `window.api` (from preload) provides typed access to backend
4. **Events**: Main process broadcasts events, renderer subscribes
5. **Styling**: Tailwind + CSS variables in `app.css`

## API/Exports

Renderer uses the preload API exposed via `window.api`:

```typescript
// Database operations
window.api.db.projects.getAll()
window.api.db.tasks.create(task)

// Claude sessions
window.api.claude.spawn(config)
window.api.claude.onOutput(callback)

// Settings
window.api.settings.get('theme')
window.api.settings.set('theme', 'dark')
```

## Svelte 5 Patterns

```typescript
// Reactive state
let projects = $state<Project[]>([])

// Derived values
let selected = $derived(projects.find(p => p.id === id))

// Side effects
$effect(() => {
  console.log('Projects changed:', projects.length)
})

// Typed props
interface Props { task: Task }
let { task }: Props = $props()
```

## CSS Variables

Global CSS variables in `app.css`:

```css
--color-nerv-primary    /* Primary accent */
--color-nerv-bg         /* Background */
--color-nerv-surface    /* Card/panel surfaces */
--color-nerv-text       /* Primary text */
--z-nerv-modal          /* Modal z-index */
--z-nerv-dropdown       /* Dropdown z-index */
--spacing-nerv-sm       /* Small spacing */
--spacing-nerv-md       /* Medium spacing */
```

## Dependencies

- `svelte`: UI framework (v5 runes mode)
- `tailwindcss`: Utility-first CSS
- `xterm.js`: Terminal emulation

## Testing

E2E tests cover renderer functionality:
```bash
npm run test:e2e
```

## Common Tasks

### Adding a new component

1. Create `ComponentName.svelte` in `components/`
2. Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
3. Import and use in parent component

### Adding a new store

1. Create store file in `stores/`
2. Use `$state()` for reactive values
3. Export getters/setters for main process sync

### Styling guidelines

- Use Tailwind utilities for layout and spacing
- Use CSS variables for colors and z-index
- Keep component-specific styles in `<style>` block
- Use responsive breakpoints for small screens
