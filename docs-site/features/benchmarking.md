# Benchmarking

Run and score benchmarks to measure NERV's effectiveness.

## Overview

NERV benchmarks measure how well Claude can build software from specifications:

1. **Create a spec** - Define what to build
2. **Run benchmark** - Claude builds it autonomously
3. **Score results** - Evaluate the output
4. **Track history** - Compare over time

## Running Benchmarks

### Basic Run

```bash
nerv benchmark specs/todo-app.md
```

### With Limits

```bash
nerv benchmark specs/todo-app.md --cycles 5 --max-cost 2.00
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--cycles` | Maximum cycles | 10 |
| `--max-cost` | Cost limit (USD) | 5.00 |
| `--output` | Results directory | `test-results/benchmark-{timestamp}` |

## Spec File Format

Benchmark specs define what to build:

```markdown
# Todo App Specification

## Overview

Build a simple todo application with CRUD operations.

## Requirements

### Functional
- [ ] Create new todos with title and description
- [ ] List all todos with pagination
- [ ] Update todo title, description, and status
- [ ] Delete todos
- [ ] Mark todos as complete/incomplete
- [ ] Filter by status (all, active, completed)

### Non-Functional
- [ ] Persist data to SQLite database
- [ ] Handle errors gracefully
- [ ] Validate input data

## Tech Stack

- Node.js with Express
- SQLite with better-sqlite3
- TypeScript

## Acceptance Criteria

1. All CRUD endpoints work correctly
2. Data persists across restarts
3. Tests pass with >80% coverage
4. No TypeScript errors
5. Proper error responses (4xx, 5xx)
```

## Scoring

All scoring is **Claude-graded** — a separate Claude instance evaluates the benchmark output across three categories.

### Score Command

```bash
nerv benchmark score test-results/benchmark-20260101/
```

You can also use the standalone scoring script:

```bash
node scripts/score-benchmark.js test-results/benchmark-20260101/ --spec specs/todo-app.md
```

### Scoring Categories

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Planning | 15% | Cycle progression, task decomposition, spec coverage |
| Code Quality | 50% | Implementation, functionality, UX, test coverage |
| NERV Ops | 35% | Workflow patterns vs PRD — worktree isolation, cycle management, review process |

Each category is scored 1-10 by Claude. The overall score is the weighted average.

### Score Output

```
============================================================
  NERV Benchmark Scores (All Claude Graded)
============================================================

  Planning Score           8/10
  Code Quality Score       8/10
  NERV Ops Score           9/10
  Overall Score            ████████░░ 8.5/10

------------------------------------------------------------
  Pass threshold: 7/10
  Result: PASS
============================================================
```

Exit code is 0 if overall score >= 7, or 1 if below.

::: tip Mock Mode
When `NERV_MOCK_CLAUDE=1`, scoring returns fixed 8/10 for all categories. Mock scores validate test infrastructure only.
:::

## History Tracking

### View History

```bash
nerv benchmark history
```

### History Storage

History is appended to `~/.nerv/benchmarks/history.jsonl` after each scored run.

## Creating Good Specs

### Be Specific

Bad:
```markdown
Build a todo app.
```

Good:
```markdown
Build a todo app with:
- CRUD operations via REST API
- SQLite persistence
- Input validation
- Error handling
- 80% test coverage
```

### Use Checkboxes

NERV counts completed checkboxes for spec completion tracking:

```markdown
## Requirements
- [ ] Create todos
- [ ] Read todos
- [ ] Update todos
- [ ] Delete todos
```

### Define Tech Stack

Specify the technologies to use:

```markdown
## Tech Stack
- Node.js 20+
- Express 4.x
- SQLite via better-sqlite3
- TypeScript 5.x
- Vitest for testing
```

### Include Acceptance Criteria

Define what "done" means:

```markdown
## Acceptance Criteria
1. npm run test passes
2. npm run build succeeds
3. No TypeScript errors
4. API responds in <100ms
```

## Comparing Benchmarks

### Multiple Specs

Run different specs and compare:

```bash
nerv benchmark specs/simple-todo.md --output results/simple
nerv benchmark specs/complex-todo.md --output results/complex

nerv benchmark score results/simple
nerv benchmark score results/complex
```

### Spec Iterations

Improve specs based on scores:

1. Run benchmark with initial spec
2. Analyze where points were lost
3. Clarify spec in those areas
4. Run benchmark again
5. Compare scores

## Best Practices

1. **Start simple** - Begin with small specs
2. **Be explicit** - Ambiguity hurts scores
3. **Include tests** - Test coverage is weighted
4. **Set limits** - Use cost/cycle limits
5. **Track history** - Compare over time
6. **Iterate** - Improve specs based on results
