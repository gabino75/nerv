# NERV

**Neural Evolution & Repository Vectoring** — an Electron dashboard that orchestrates [Claude Code](https://github.com/anthropics/claude-code) for multi-repository development.

<!-- TODO: Replace with actual screenshot -->
<!-- ![NERV Dashboard](https://gabino75.github.io/nerv/demos/dashboard.png) -->

## Overview

NERV is a single desktop app that manages everything you need when building across multiple repos with Claude Code: terminal sessions, task boards, permission hooks, and development cycles — all in one window.

**Key features:**
- Launch and manage multiple Claude Code sessions simultaneously
- Approve or deny dangerous commands through a permission hook system
- Git worktree isolation — your main branch is never touched directly
- Cycle-based development workflow with task tracking
- YOLO mode for fully autonomous operation with cost limits
- Full CLI alongside the GUI — every feature works headless

## Demo

<!-- TODO: Record and embed demo clips showing:
     1. Creating a project and starting a Claude session
     2. Permission approval flow
     3. YOLO mode running autonomously
     See: https://gabino75.github.io/nerv/demos -->

> Demo clips coming soon. See the [documentation site](https://gabino75.github.io/nerv/) for guides and feature walkthroughs.

## Quick Start

**Prerequisites:** [Claude Code CLI](https://github.com/anthropics/claude-code) (active subscription), [Git](https://git-scm.com/) 2.20+, Node.js 18+

```bash
git clone https://github.com/gabino75/nerv.git
cd nerv
npm install
npm run dev
```

**Pre-built binaries** for Windows and Linux are available on the [Releases](https://github.com/gabino75/nerv/releases) page.

> **macOS:** No pre-built binary yet. Clone the repo and run `npm run dev` or `npm run build && npx electron-builder --mac` to build locally.

## Usage

### GUI

Launch with `npm run dev` or run the installed app. Create a project, point it at your repos, and start a Claude session from the dashboard.

### CLI

```bash
nerv                             # Interactive REPL
nerv project create my-app       # Create a project
nerv start                       # Start a Claude session
nerv task create "Add auth"      # Create a task
nerv yolo --cycles 5             # Autonomous mode (5 cycles)
nerv permissions list             # View permission rules
nerv config list                  # View settings
```

Run `nerv help` for the full command list, or see the [CLI Reference](https://gabino75.github.io/nerv/cli/).

## Documentation

Full docs at **[gabino75.github.io/nerv](https://gabino75.github.io/nerv/)** — installation guide, feature walkthroughs, architecture, and CLI reference.

## Development

```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build
npm run typecheck    # TypeScript checks
npm run test:unit    # Unit tests (235+)
```

**Tech stack:** Electron + electron-vite, Svelte 5 + Tailwind CSS, SQLite (better-sqlite3), xterm.js + node-pty, Go permission hook binary.

## License

[MIT](./LICENSE)
