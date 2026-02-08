# Project Commands

Manage projects and repositories.

## `nerv init`

Initialize NERV in the current directory.

```bash
nerv init
```

Creates a `.nerv` directory with project configuration.

## `nerv project create`

Create a new project.

```bash
nerv project create <name> [options]
```

**Arguments:**
- `<name>` - Project name (required)

**Options:**
- `--goal "description"` - Project goal/description

**Example:**
```bash
nerv project create "OAuth Feature" --goal "Add OAuth2 authentication to API"
```

## `nerv project list`

List all projects.

```bash
nerv project list
```

Shows all projects with the current project marked with `*`:

```
Projects:
* project_abc123  OAuth Feature     (3 tasks, 2 cycles)
  project_def456  API Refactor      (5 tasks, 1 cycle)
```

## `nerv project info`

Show detailed project information.

```bash
nerv project info [id]
```

**Arguments:**
- `[id]` - Project ID (optional, shows current if omitted)

**Output:**
```
Project: OAuth Feature
ID: project_abc123
Created: 2026-01-15

Goal: Add OAuth2 authentication to API

Repositories:
- /home/user/projects/api (main)
- /home/user/projects/frontend

Tasks:
- todo: 2
- in_progress: 1
- review: 0
- done: 3

Cycles: 2 (1 active)
```

## `nerv project switch`

Switch to a different project.

```bash
nerv project switch <id>
```

**Arguments:**
- `<id>` - Project ID (supports prefix matching)

**Example:**
```bash
# Full ID
nerv project switch project_abc123

# Prefix match
nerv project switch abc
```

## `nerv project delete`

Delete a project.

```bash
nerv project delete <id> [--force]
```

**Arguments:**
- `<id>` - Project ID

**Options:**
- `--force` - Skip confirmation prompt

**Warning:** This deletes all project data including tasks, sessions, and learnings.

## `nerv project add-repo`

Add a repository to the current project.

```bash
nerv project add-repo <path>
```

**Arguments:**
- `<path>` - Local path or Git URL

**Examples:**
```bash
# Local path
nerv project add-repo ./backend

# Git URL
nerv project add-repo https://github.com/org/repo.git
```

## `nerv project remove-repo`

Remove a repository from the current project.

```bash
nerv project remove-repo <path>
```

## Multi-Repository Projects

Projects can span multiple repositories:

```bash
# Create project
nerv project create "Full Stack Feature"

# Add repositories
nerv project add-repo ./api
nerv project add-repo ./web
nerv project add-repo ./shared

# Claude will have access to all repos
nerv start
```

When starting a session, NERV uses `--add-dir` to give Claude access to all project repositories.
