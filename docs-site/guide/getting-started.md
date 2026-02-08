# Getting Started

NERV (Neural Evolution & Repository Vectoring) is an Electron dashboard that orchestrates Claude Code for multi-repository development.

## What NERV Does

NERV provides a unified interface for:

- **Managing Claude Code sessions** - Multiple concurrent sessions with tabbed interface
- **Organizing tasks** - Kanban board with 5 statuses
- **Controlling permissions** - Approve/deny dangerous commands via hooks
- **Tracking context** - Monitor token usage and auto-generate NERV.md context files
- **Running benchmarks** - Autonomous YOLO mode with scoring

## Prerequisites

Before installing NERV, ensure you have:

1. **Claude Code CLI** - Install from [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)
2. **Git** - Version control system
3. **A repository** - A project you want to work on

## Installation

### Desktop App

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | `NERV-Setup-x.x.x.exe` |
| macOS | `NERV-x.x.x.dmg` |
| Linux | `NERV-x.x.x.AppImage` |

### CLI Only

```bash
npm install -g nerv
```

## First Steps

After installation:

1. **Launch NERV** - Open the app or run `nerv` in your terminal
2. **Create a Project** - Click "New Project" or run `nerv project create "My Project"`
3. **Add Tasks** - Create tasks for what you want to accomplish
4. **Start Working** - Click "Start Task" or run `nerv start <taskId>`

## Next Steps

- [Installation Guide](/guide/installation) - Detailed installation instructions
- [Quick Start](/guide/quick-start) - 5-minute getting started tutorial
- [Core Concepts](/guide/concepts) - Understand projects, tasks, cycles, and worktrees
