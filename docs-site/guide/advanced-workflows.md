# Advanced Workflows

Once you're comfortable with the basics, these workflows show how to combine NERV's features for complex development scenarios.

## Multi-Repo Development

NERV can coordinate work across multiple repositories — for example, updating an API and its frontend simultaneously.

### Setting Up a Multi-Repo Project

```bash
# Create a project that spans repos
nerv project create "OAuth Feature" \
  --add-dir /path/to/api-server \
  --add-dir /path/to/web-frontend \
  --add-dir /path/to/shared-types
```

Claude sessions in this project see all three codebases. When NERV creates worktrees for tasks, each repo gets its own isolated branch, so changes in the API don't conflict with frontend changes until you're ready to merge.

### Coordinating Cross-Repo Tasks

Break the work into tasks that target specific repos:

1. **Task 1**: "Add OAuth endpoints to api-server" — Claude works in the API worktree
2. **Task 2**: "Add login page to web-frontend" — Claude works in the frontend worktree
3. **Task 3**: "Add shared OAuth types" — Claude works in shared-types worktree

NERV runs these in separate worktrees with isolated branches. Each task's Claude session receives context about the other repos via NERV.md, so the API types match what the frontend expects.

### Cross-Repo Context Sharing

Learnings from one task flow into the next via NERV.md:

```
Cycle 1, Task 1 learning: "OAuth tokens use RS256, stored in HttpOnly cookies"
→ Task 2 receives this context automatically
→ Frontend knows to check cookies, not localStorage
```

This eliminates the "left hand doesn't know what the right hand is doing" problem that plagues multi-repo development.

## YOLO Mode + Recommendations

YOLO mode and the recommendation engine work together for fully autonomous development.

### The Autonomous Loop

```
┌─────────────────────────────────────────────┐
│  1. "What's Next?" generates recommendations │
│  2. YOLO auto-approves the top recommendation │
│  3. NERV creates cycle/task/worktree          │
│  4. Claude builds the feature                 │
│  5. Review agent evaluates the code           │
│  6. Auto-merge if tests pass                  │
│  7. Loop back to step 1                       │
└─────────────────────────────────────────────┘
```

### Configuring the Loop

From the Kanban tab, enable YOLO mode and set safety limits:

```bash
# CLI equivalent
nerv config set yolo_max_cycles 10
nerv config set yolo_max_cost_usd 5.00
nerv config set yolo_auto_approve_review true
```

Then start YOLO from the UI or CLI:

```bash
nerv yolo
```

NERV will:
1. Ask "What's Next?" to determine the highest-priority work
2. Create a cycle and task automatically
3. Spawn Claude in a worktree to build it
4. Run an AI review when Claude finishes
5. Auto-merge on approval, then repeat

### When to Use Autonomous Mode

| Scenario | Recommended Settings |
|----------|---------------------|
| Overnight prototyping | `max_cycles: 20`, `max_cost: 10.00` |
| Spec-driven MVP | `max_cycles: 5`, `stop_on_failure: true` |
| Continuous improvement | `max_cycles: 3`, review manually between runs |

### Monitoring While YOLO Runs

Even in autonomous mode, you can watch progress:

- **Kanban tab**: Task cards update in real-time as work progresses
- **CLIs tab**: Switch to the active Claude session to see what it's doing
- **Cost dashboard** (via More menu): Track spending against budget
- **Intervene anytime**: Click "Stop" to pause, review, and adjust

## Custom Agent Specialization

Different tasks benefit from different agent configurations. Here's how to set up a team of specialized agents.

### The Four-Agent Pattern

```bash
# 1. Planner: designs architecture, creates tasks
nerv agent create planner
# System prompt: "You are a senior architect. Break requirements into
#   small, testable tasks. Focus on API design and data flow."
# Model: opus | Temperature: 0.3

# 2. Builder: implements features
nerv agent create builder
# System prompt: "You are a focused implementer. Write clean, tested code.
#   Follow existing patterns. Don't over-engineer."
# Model: sonnet | Temperature: 0.2

# 3. Reviewer: evaluates code quality
nerv agent create reviewer
# System prompt: "Review code for bugs, security issues, and style.
#   Check test coverage. Be specific in feedback."
# Model: opus | Temperature: 0.1

# 4. Researcher: explores and documents
nerv agent create researcher
# System prompt: "Research the codebase and external docs. Summarize
#   findings clearly. Identify risks and dependencies."
# Model: sonnet | Temperature: 0.5
```

### Assigning Agents to Tasks

```bash
# Planning phase
nerv start <task-id> --agent planner

# Implementation phase
nerv start <task-id> --agent builder

# Review phase — automatic in YOLO mode, or manual:
nerv start <task-id> --agent reviewer
```

In the UI, select the agent from the dropdown when starting a task. NERV remembers which agent was used for each task, so you can analyze which configurations produce the best results.

### Tuning Agent Performance

After running several cycles, review which agents perform best:

- Check benchmark scores per agent configuration
- Look at review feedback patterns — are certain agents producing more rejected code?
- Adjust temperature and prompts based on observed behavior
- Lower temperature for deterministic tasks (tests, reviews), higher for creative tasks (architecture, research)

## Spec-Driven Development

Specs define what to build. NERV's recommendation engine reads the spec to prioritize work.

### Writing Effective Specs

A good spec uses checkboxes that NERV can track:

```markdown
# E-Commerce Platform

## Core Features

### Product Catalog
- [ ] Product listing with pagination
- [ ] Search with filters (category, price, rating)
- [ ] Product detail page with images
- [ ] Related products section

### Shopping Cart
- [ ] Add/remove items
- [ ] Update quantities
- [ ] Persist cart across sessions
- [ ] Price calculation with tax

### Checkout
- [ ] Address form with validation
- [ ] Payment integration (Stripe)
- [ ] Order confirmation email
- [ ] Order history page
```

### How NERV Uses the Spec

1. **Recommendations**: "What's Next?" reads unchecked items to suggest the highest-value task
2. **Task creation**: Each recommendation maps to one or more checkbox items
3. **Progress tracking**: As Claude completes work, it checks off items in the spec
4. **Completion detection**: When all checkboxes are checked, NERV marks the project complete

### Spec Review and Iteration

Use the Spec tab to review and evolve your spec:

- **Review Spec**: Claude analyzes the spec for gaps, contradictions, and missing acceptance criteria
- **Rewrite Spec**: Claude rewrites the spec based on what was learned during development
- **Add Documentation**: Claude adds technical design notes inline with requirements

## Parallel Task Execution

Run multiple tasks simultaneously using NERV's worktree isolation.

### How It Works

Each task gets:
- Its own git worktree (isolated branch)
- Its own Claude session (isolated context)
- Its own terminal tab in the CLIs view

Tasks running in parallel don't interfere with each other because worktrees provide complete filesystem isolation.

### Starting Parallel Tasks

```bash
# Start multiple tasks (each gets its own worktree + Claude session)
nerv start <task-1-id>
nerv start <task-2-id>
nerv start <task-3-id>
```

In the UI, click "Start" on multiple tasks from the Kanban board. NERV creates worktrees and spawns Claude sessions for each.

### Merge Order Matters

When parallel tasks finish, merge them in dependency order:

1. Merge shared types / data model changes first
2. Merge backend changes
3. Merge frontend changes last (they depend on the API)

NERV's review agent checks for merge conflicts. If Task B conflicts with the already-merged Task A, NERV flags it for resolution before merging.

## Context Preservation

NERV maintains context across sessions so Claude doesn't lose track of decisions and learnings.

### Automatic Context via NERV.md

Every Claude session receives a NERV.md file containing:

- **Current task**: What to build, acceptance criteria
- **Project goal**: The high-level objective
- **Cycle focus**: What this cycle is trying to accomplish
- **Learnings**: Key decisions from previous cycles
- **ADRs**: Architecture Decision Records

### Recording Learnings

After each cycle, record what was learned:

```bash
nerv cycle complete --learnings "PostgreSQL chosen over SQLite for concurrent writes. Connection pooling via pgbouncer."
```

These learnings appear in NERV.md for all future sessions, preventing Claude from re-debating settled decisions.

### Managing Context Size

As projects grow, context can get large. NERV manages this automatically:

- Old learnings are summarized to save tokens
- Irrelevant context is pruned
- The Context Monitor (via More menu) shows token usage and compaction history

If you notice Claude repeating old mistakes, check the Context Monitor — important context may have been compacted. Re-record critical learnings to ensure they persist.

## Audit and Health Monitoring

Track code quality across cycles with NERV's audit system.

### Running Audits

```bash
# After completing a cycle
nerv cycle audit
```

Audits check:
- **Spec drift**: Are requirements still aligned with implementation?
- **Code health**: Test coverage, complexity, duplication
- **Dependency freshness**: Outdated or vulnerable packages
- **Architecture consistency**: Does the code follow established patterns?

### Scheduling Audits in YOLO Mode

In YOLO mode, audits run automatically at configurable intervals:

```bash
nerv config set yolo_audit_every_n_cycles 3
```

This runs an audit every 3 cycles, catching drift before it compounds.

### Acting on Audit Results

Audit findings feed back into the recommendation engine:

- High-priority findings become recommended tasks
- "What's Next?" weighs audit issues alongside spec items
- Critical security findings pause YOLO mode for human review
