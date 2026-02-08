# Multi-Tab Sessions

NERV supports running multiple concurrent Claude Code sessions with a tabbed interface.

## Overview

The terminal panel supports multiple tabs, each running its own Claude session:

- **Task tabs** - Linked to a specific task, showing the task name
- **Shell tabs** - Regular terminal sessions (PowerShell, bash, etc.)
- **Standalone tabs** - Claude sessions for exploration/research

## Creating Tabs

### New Claude Tab

Click the **+** button and select "Claude Session" to start a new Claude tab.

### New Shell Tab

Click the **+** button and select "Shell" for a regular terminal.

### Task-Linked Tab

Click "Start Task" on any task to create a tab linked to that task.

## Split View

NERV supports horizontal and vertical split views:

1. Click the **split icon** (⊞) in the tab bar
2. Choose "Split Horizontal" or "Split Vertical"
3. Each pane can have its own tabs
4. Drag the handle to resize panes

## Tab Features

### Tab Identification

- **Task tabs** show the task title and status
- **Shell tabs** show the shell type (PowerShell, bash, etc.)
- **Active tab** is highlighted with accent color

### Tab Actions

Right-click a tab for options:
- **Close** - Terminate the session
- **Move to other pane** - Move to split pane
- **Duplicate** - Create a copy of the session

### Context Isolation

Each tab maintains its own:
- Claude Code session and context
- Terminal history and state
- Environment variables

## Working with Multiple Sessions

### Parallel Task Work

Work on multiple tasks simultaneously:

1. Start Task A in the first tab
2. Split the view
3. Start Task B in the second pane
4. Switch focus as needed

### Research + Implementation

Use split view for research and implementation:

1. Left pane: Claude researching architecture options
2. Right pane: Claude implementing based on findings

### Code Review Workflow

Use tabs for code review:

1. Tab 1: Running tests
2. Tab 2: Claude reviewing changes
3. Tab 3: Making fixes based on review

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New Claude tab |
| `Ctrl+Shift+T` | New Shell tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+W` | Close tab |

## CLI Usage

The CLI can list and manage sessions:

```bash
# List active sessions
nerv session list

# Attach to a session
nerv session attach <id>

# Resume a session
nerv resume --session <id>
```

## Best Practices

1. **Use task tabs for focused work** - Each task gets its own context
2. **Use shell tabs for manual commands** - git status, npm install, etc.
3. **Use split view for related work** - Research + implementation
4. **Close completed tabs** - Keep the interface clean
