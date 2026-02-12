# Getting Started

NERV is spec-driven AI development. Write a spec defining what you want to build, and NERV orchestrates Claude Code to build it — MVP first, E2E tests always, iterating cycle by cycle until it's done.

![NERV Dashboard](/screenshots/dashboard-project.png)

## What NERV Does

You define *what* to build in a spec. NERV handles the rest:

- **AI-guided iteration** — "What's Next?" recommends and executes the right step at every stage
- **Spec-driven planning** — markdown specs with checkboxes that track completion as Claude builds
- **Test-first development** — MVP scope and E2E tests are prioritized in early cycles
- **Permission control** — approve/deny commands via hooks with pattern-based rules
- **Context management** — token tracking and auto-generated NERV.md context for Claude
- **Autonomous mode** — YOLO mode for fully autonomous operation with cost limits and AI review

## Prerequisites

1. **Claude Code CLI** — install from [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) (requires an active subscription)
2. **Git** — version 2.20 or later
3. **Node.js** — version 18 or later

## Install

```bash
git clone https://github.com/gabino75/nerv.git
cd nerv
npm install
npm run dev
```

That's it. NERV launches in development mode with hot reload.

## Your First Project

### 1. Create a Project

Click **"New Project"** in the sidebar. Give it a name, a goal (what you're building), and select your repository folder.

### 2. Ask "What's Next?"

Click the **"What's Next?"** button in the action bar. NERV gathers your project state — goal, spec, tasks, learnings — and asks Claude to recommend 2-3 ranked next steps.

![Recommend Panel](/screenshots/recommend-panel.png)

On a fresh project, Claude will typically recommend creating your first development cycle.

### 3. Approve a Recommendation

Each recommendation shows a phase badge, action type, title, and description. Click **"Approve"** to execute it. NERV creates the cycle, task, or other resource directly.

You can also type direction in the input field (e.g., "focus on auth first") before clicking **Ask** to steer the recommendations.

### 4. Let Claude Build

Once you have tasks, click **"Start Task"**. NERV:

1. Creates a git worktree with an isolated branch
2. Generates a `NERV.md` context file with your spec, goal, and learnings
3. Spawns a Claude Code session in the terminal

Watch Claude work in the terminal panel. Approve permissions as they come up.

### 5. Review and Repeat

When Claude finishes, review the changes and click **"Approve"** to merge. Record learnings that carry forward to the next cycle.

Click **"What's Next?"** again. Keep going until your spec is complete.

## The Two Modes

| Starting out | Deep in the project |
|---|---|
| Click "What's Next?" and approve | You know what's next |
| Let Claude suggest cycles and tasks | Create targeted tasks manually |
| `nerv recommend` | `nerv cycle create "Polish auth edge cases"` |
| Claude drives, you review | You drive, Claude builds |

Both modes use the same tools — the difference is how much direction you provide.

## CLI Equivalent

```bash
# Create project
nerv project create "My API" --goal "REST API with auth"

# Ask Claude what to do
nerv recommend

# With direction
nerv recommend --direction "focus on error handling"

# Let Claude plan the cycle
nerv cycle create

# Start a task
nerv start <taskId>

# Record what you learned
nerv learn "bcrypt is slow in tests — use fast rounds"

# Repeat
nerv recommend
```

## Next Steps

- [Dashboard & UI](/guide/dashboard) — the 3-tab interface and core workflow loop
- [Core Concepts](/guide/concepts) — projects, tasks, cycles, and worktrees
- [What's Next? Feature](/features/recommend) — the recommendation system in depth
- [YOLO Mode](/features/yolo-mode) — fully autonomous development
- [CLI Reference](/cli/) — full command list
