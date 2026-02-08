# Installation

## Desktop Application

### Windows

1. Download `NERV-Setup-x.x.x.exe` from [GitHub Releases](https://github.com/gabino75/nerv/releases)
2. Run the installer
3. Launch NERV from the Start menu

### macOS

No pre-built binary is available for macOS yet. To run on macOS, clone the repo and build from source:

```bash
git clone https://github.com/gabino75/nerv.git
cd nerv && npm install && npm run dev
```

### Linux

**AppImage:**
```bash
chmod +x NERV-x.x.x.AppImage
./NERV-x.x.x.AppImage
```

**Debian/Ubuntu:**
```bash
sudo dpkg -i nerv_x.x.x_amd64.deb
```

## CLI Installation

Install the CLI globally via npm:

```bash
npm install -g nerv
```

Verify the installation:

```bash
nerv --version
```

## Prerequisites

### Claude Code CLI

NERV requires the Claude Code CLI to be installed and configured:

```bash
# Install Claude Code
npm install -g @anthropic/claude-code

# Authenticate (follow the prompts)
claude auth
```

### Git

NERV uses Git for worktree management. Ensure Git is installed:

```bash
git --version
```

## Configuration

After installation, NERV creates a configuration directory at `~/.nerv/`:

```
~/.nerv/
├── config.json       # Global settings
├── permissions.json  # Permission rules
└── state.db          # SQLite database
```

### Global Settings

Edit `~/.nerv/config.json` to configure defaults:

```json
{
  "theme": "dark",
  "defaultModel": "claude-sonnet-4-20250514",
  "notificationsEnabled": true,
  "maxConcurrentSessions": 4,
  "monthlyBudgetAlert": 100.00
}
```

## Troubleshooting

### Claude Code Not Found

```
Error: claude command not found
```

**Solution:** Install Claude Code CLI and ensure it's in your PATH:
```bash
npm install -g @anthropic/claude-code
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

- [Quick Start](/guide/quick-start) - Create your first project
- [Core Concepts](/guide/concepts) - Learn about NERV's architecture
