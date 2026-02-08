# Installation

## Prerequisites

### Claude Code CLI

NERV requires the Claude Code CLI to be installed and authenticated:

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Authenticate (follow the prompts)
claude auth
```

An active Claude Code subscription is required.

### Git

NERV uses Git for worktree management. Version 2.20 or later is required:

```bash
git --version
```

### Node.js

Node.js 18+ is required:

```bash
node --version
```

## Build from Source

```bash
git clone https://github.com/gabino75/nerv.git
cd nerv
npm install
npm run dev
```

This starts NERV in development mode with hot reload. For a production build:

```bash
npm run build
```

## Data Storage

NERV stores all data in `~/.nerv/`:

```
~/.nerv/
├── state.db          # SQLite database (settings, projects, tasks, sessions, permissions)
├── projects/         # Per-project worktree data
└── benchmarks/       # Benchmark history
    └── history.jsonl
```

All configuration, permissions, and project data live in the SQLite database. Use the CLI to manage settings:

```bash
# View all settings
nerv config list

# Set a value
nerv config set monthly_budget_usd 50

# View settings with sources
nerv config get theme
```

## Troubleshooting

### Claude Code Not Found

```
Error: claude command not found
```

**Solution:** Install Claude Code CLI and ensure it's in your PATH:
```bash
npm install -g @anthropic-ai/claude-code
```

### Permission Denied

```
Error: Permission denied for ~/.nerv/state.db
```

**Solution:** Check file permissions or run as appropriate user.

### Native Module Errors

If you see errors about native modules (better-sqlite3, node-pty):

```bash
npm run rebuild
```

## Next Steps

- [Getting Started](/guide/getting-started) — create your first project
- [Core Concepts](/guide/concepts) — learn about NERV's architecture
