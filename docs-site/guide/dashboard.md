# Dashboard & UI Overview

NERV's dashboard is organized into three tabs that match the development workflow: define what to build, manage how it gets built, and run ad-hoc sessions when needed.

## The Three Tabs

### Tab 1: Spec

The **Spec** tab is where you define *what* to build. It shows your project's specification as a markdown document with checkboxes that track progress as Claude implements features.

**What you'll find here:**

- **Spec viewer/editor** — your project goal rendered as markdown. Checkboxes update automatically as Claude completes work
- **Action buttons** — Build Spec, Review Spec, Rewrite Spec, Add Documentation. Each spawns a Claude agent focused on that task
- **Spec completion** — a percentage showing how many checkbox items are done

**When to use it:** At the start of a project to write your spec, and periodically to check progress against it.

### Tab 2: Kanban

The **Kanban** tab is where you manage *how* things get built. This is the primary working tab — you'll spend most of your time here.

**What you'll find here:**

- **Cycle header** — shows the active cycle number and progress
- **Task cards** — organized by status (Todo, In Progress, Review, Done). Each card shows the task title, assigned agent, and worktree indicator
- **Action Bar** — Start Task, Stop, Resume, Add Task, and the "What's Next?" button
- **Approval Queue** — pending items that need your review (permission requests, merge approvals)
- **Context Monitor** — token usage, model info, and compaction count for the active Claude session

**Task drill-down:** Click any task card to see details — live agent output, git diff, review workflow, acceptance criteria, and approve/deny controls.

**When to use it:** During active development. Start tasks, monitor Claude's progress, review and approve changes.

### Tab 3: CLIs

The **CLIs** tab provides direct terminal access for work that doesn't fit the structured workflow.

**What you'll find here:**

- **Terminal sessions** — multiple tabs for Claude, PowerShell, Python, Bash, or WSL
- **Claude instances** — opened in your project directory with NERV context (MCP servers for project state, progress tracking, and docs)
- **Session management** — create, close, and switch between terminal tabs

**When to use it:** For asking Claude questions, running ad-hoc commands, debugging, or handling edge cases the structured workflow can't cover. The CLIs tab is *not* the primary workflow — the Kanban tab's "What's Next?" loop is more effective because it gives Claude scoped context.

## Tab Switching

Switch between tabs using:

- **Click** the tab labels (Spec, Kanban, CLIs) in the tab bar
- **Keyboard shortcuts** — `Alt+1` (Spec), `Alt+2` (Kanban), `Alt+3` (CLIs)

The Kanban tab is the default when you open NERV.

## Header Bar

The header bar is always visible above the tabs. It contains:

- **Project selector** — switch between projects
- **Model selector** — choose which Claude model to use
- **"More" dropdown** — access secondary features:
  - Cycle management
  - Knowledge base
  - Worktree panel
  - Settings & permissions
  - Cost dashboard
  - Audit logs
  - Export/import
  - YOLO/benchmark configuration

## The Core Workflow Loop

The typical workflow through the dashboard follows this pattern:

```
1. Spec tab    → Write or review your project spec
2. Kanban tab  → Click "What's Next?" → approve a recommendation
3. Kanban tab  → Watch Claude execute the task
4. Kanban tab  → Review changes → approve merge
5. Repeat from step 2
```

### Step-by-step

**1. Create a project.** Click "New Project" in the project selector. Give it a name, goal, and repository path.

**2. Click "What's Next?"** in the Kanban tab's action bar. NERV sends your project state (goal, spec, tasks, learnings) to Claude and gets back 2-3 ranked recommendations.

**3. Approve a recommendation.** Each recommendation card shows a phase badge, action type, title, and description. Click "Approve" to execute. NERV creates cycles, tasks, or other resources automatically.

**4. Start a task.** Click "Start Task" in the action bar. NERV creates an isolated git worktree, generates a `NERV.md` context file, and spawns Claude in the CLIs tab.

**5. Monitor progress.** The task card updates in real time. Switch to the CLIs tab to watch Claude's terminal output. Permission requests appear in the Approval Queue.

**6. Review and merge.** When Claude finishes, the task moves to "Review" status. Click the task card to see the diff, Claude's summary, and acceptance criteria. Approve to merge changes into your main branch.

**7. Record learnings.** After merging, NERV prompts you to capture learnings that carry forward to the next cycle.

**8. Repeat.** Click "What's Next?" again. Claude's recommendations evolve based on completed work and recorded learnings.

## YOLO Mode

For autonomous operation, enable **YOLO mode** from the "More" dropdown → YOLO/Benchmark panel. YOLO mode automates the entire loop:

- **Auto-build** — Claude works through tasks without waiting for manual start
- **Auto-recommend** — "What's Next?" runs automatically between tasks
- **Auto-audit** — code health checks run every N cycles
- **Auto-review** — AI review agents approve or reject changes

Configure end criteria (spec completion %, max cycles, cost limit) before enabling. You can intervene at any time by stopping a task or disabling YOLO mode.

See [YOLO Mode](/features/yolo-mode) for configuration details.

## Secondary Panels

These panels are accessible from the **"More" dropdown** in the header:

| Panel | Purpose |
|-------|---------|
| **Cycle Panel** | View cycle history, create new cycles manually |
| **Knowledge Base** | Learnings, decisions, and context accumulated across cycles |
| **Worktree Panel** | View active worktrees (managed automatically by NERV) |
| **Settings** | Global and project-level configuration |
| **Cost Dashboard** | Per-model spending, budget tracking, per-project costs |
| **Audit Logs** | Agent actions, MCP calls, file operations, worktree events |
| **Export/Import** | Backup and restore project data |
| **Repos Panel** | Manage multi-repo project directories |
| **Active Sessions** | View and manage running Claude sessions |

## CLI Equivalents

Every dashboard action has a CLI equivalent:

| Dashboard Action | CLI Command |
|-----------------|-------------|
| Create project | `nerv project create "name" --goal "..."` |
| Click "What's Next?" | `nerv recommend` |
| Approve recommendation | `nerv recommend --direction "focus on auth"` |
| Start task | `nerv start <taskId>` |
| Review task | `nerv task review <taskId>` |
| Run audit | `nerv audit` |
| Record learning | `nerv learn "insight here"` |
| Enable YOLO | `nerv yolo --cycles 10 --budget 50` |

## Next Steps

- [Core Concepts](/guide/concepts) — projects, tasks, cycles, and worktrees in depth
- [What's Next? Feature](/features/recommend) — the recommendation engine
- [Advanced Workflows](/guide/advanced-workflows) — multi-repo, YOLO, custom agents
- [YOLO Mode](/features/yolo-mode) — autonomous development configuration
