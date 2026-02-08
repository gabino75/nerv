# Quick Start

Get up and running with NERV in 5 minutes.

## Using the Desktop App

### 1. Create a Project

1. Launch NERV
2. Click **"New Project"**
3. Enter a project name (e.g., "OAuth Feature")
4. Select your repository folder
5. Describe your goal (e.g., "Add OAuth2 authentication to the API")

### 2. Create Tasks

1. Click **"New Task"** in the Task Board
2. Enter task details:
   - Title: "Implement login endpoint"
   - Description: "Create POST /api/auth/login endpoint with JWT"
   - Type: Implementation

### 3. Start Working

1. Click on a task in the **Todo** column
2. Click **"Start Task"**
3. NERV will:
   - Create a git worktree
   - Generate NERV.md context
   - Spawn a Claude Code session

### 4. Work with Claude

Watch the terminal panel as Claude works. You can:

- **Send messages** - Type in the input field and press Enter
- **Approve commands** - Respond to permission requests
- **Monitor progress** - See tool calls and code changes

### 5. Review & Complete

When Claude finishes:

1. Review the changes in the diff view
2. Run tests to verify functionality
3. Click **"Complete"** to merge or **"Request Changes"**

## Using the CLI

### Initialize

```bash
# Navigate to your project
cd my-project

# Initialize NERV
nerv init
```

### Create Project and Tasks

```bash
# Create a project
nerv project create "OAuth Feature" --goal "Add OAuth2 authentication"

# Create tasks
nerv task create "Implement login endpoint"
nerv task create "Add user registration"
nerv task create "Set up JWT middleware"
```

### Start a Session

```bash
# List tasks
nerv task list

# Start working on a task
nerv start <taskId>
```

### Record Learnings

```bash
# Add a learning
nerv learn "Use refresh tokens for better security"

# Add a decision
nerv decide "Use JWT with 15-minute expiry" --rationale "Balance security and UX"
```

### Complete the Cycle

```bash
# Complete the cycle with learnings
nerv cycle complete --learnings "OAuth implementation patterns established"
```

## Example Workflow

Here's a complete CLI workflow:

```bash
# Initialize
nerv init
nerv project create "My App" --goal "Build a task manager"

# Create cycle and tasks
nerv cycle create "MVP features"
nerv task create "Set up database schema"
nerv task create "Create task CRUD endpoints"
nerv task create "Add basic UI"

# Work on first task
nerv task list
nerv start task_abc123

# After completion, record learnings
nerv learn "SQLite works well for single-user apps"
nerv task update task_abc123 --status done

# Continue with next task
nerv start task_def456

# Complete the cycle
nerv cycle complete --learnings "Core CRUD patterns established"
```

## Next Steps

- [Core Concepts](/guide/concepts) - Understand projects, tasks, and cycles
- [Multi-Tab Sessions](/features/multi-tab) - Work on multiple tasks simultaneously
- [YOLO Mode](/features/yolo-mode) - Run benchmarks autonomously
