# CLI Reference

NERV is CLI-first - all features are accessible from the command line.

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help message |
| `--version`, `-v` | Show version |
| `--project <id>` | Override project detection |
| `--verbose` | Verbose output |
| `--json` | Output in JSON format |

## Command Groups

### Project Management

Manage projects and repositories.

```bash
nerv init                     # Initialize in current directory
nerv project create <name>    # Create new project
nerv project list             # List all projects
nerv project info [id]        # Show project details
nerv project switch <id>      # Switch to project
```

[Full project command reference](/cli/project)

### Task Management

Create and manage tasks.

```bash
nerv task create <title>      # Create task
nerv task list                # List tasks (Kanban view)
nerv task update <id> --status <status>  # Update status
```

[Full task command reference](/cli/task)

### Session Management

Start and manage Claude sessions.

```bash
nerv start [taskId]           # Start session
nerv resume [--session id]    # Resume session
nerv yolo                     # YOLO mode
```

[Full session command reference](/cli/session)

### Configuration

Manage settings.

```bash
nerv config list              # List settings
nerv config get <key>         # Get setting
nerv config set <key> <value> # Set setting
```

[Full config command reference](/cli/config)

### Benchmarking

Run and score benchmarks.

```bash
nerv benchmark <spec>         # Run benchmark
nerv benchmark score <dir>    # Score results
nerv benchmark history        # View history
```

[Full benchmark command reference](/cli/benchmark)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NERV_PROJECT_PATH` | Override project detection |
| `NERV_CONFIG_PATH` | Override config location |
| `NERV_LOG_LEVEL` | Logging: debug, info, warn, error |
| `NERV_OUTPUT_FORMAT` | Output: text, json |
| `NERV_MOCK_CLAUDE` | Use mock Claude (testing) |

## Configuration Hierarchy

Settings are resolved in priority order:

1. Environment variables (`NERV_*`)
2. Project-level settings (stored in SQLite, set with `--project`)
3. Global settings (stored in SQLite at `~/.nerv/state.db`)
4. Default values

## Quick Reference

```bash
# Initialize and create project
nerv init
nerv project create "My Feature" --goal "Build authentication"

# Create tasks
nerv task create "Implement login endpoint"
nerv task create "Add user registration"

# Start working
nerv task list
nerv start <taskId>

# Record learnings
nerv learn "OAuth requires PKCE for mobile"
nerv decide "Use JWT with 15-minute expiry"

# Complete cycle
nerv cycle complete --learnings "Auth patterns established"

# Run benchmark
nerv benchmark specs/todo-app.md --cycles 5
nerv benchmark score test-results/benchmark/
```
