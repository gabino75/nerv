# Benchmark Commands

Run and score benchmarks.

## `nerv benchmark`

Run a benchmark with a specification file.

```bash
nerv benchmark <spec> [options]
```

**Arguments:**
- `<spec>` - Spec file path (required)

**Options:**
- `--cycles <n>` - Maximum cycles (default: 10)
- `--max-cost <usd>` - Cost limit (default: 5.00)
- `--output <dir>` - Results directory

**Examples:**
```bash
# Basic run
nerv benchmark specs/todo-app.md

# With limits
nerv benchmark specs/todo-app.md --cycles 5 --max-cost 2.00

# Custom output
nerv benchmark specs/complex-app.md --output results/run-1
```

**Output:**
```
Starting benchmark: todo-app.md
Max cycles: 5, Max cost: $2.00

Cycle 1/5: Creating project structure...
Cycle 2/5: Implementing CRUD operations...
Cycle 3/5: Adding tests...
Cycle 4/5: Fixing test failures...

Benchmark complete!
- Cycles: 4
- Duration: 23m 45s
- Cost: $1.23
- Results: test-results/benchmark-20260115-143022/
```

## `nerv benchmark score`

Score benchmark results.

```bash
nerv benchmark score <dir>
```

**Arguments:**
- `<dir>` - Results directory

**Example:**
```bash
nerv benchmark score test-results/benchmark-20260115/
```

**Output:**
```
Benchmark Score: 8.5/10

Category          Score    Points
────────────────  ───────  ───────
Requirements Met  9/10     27/30
Test Coverage     8/10     20/25
Code Quality      9/10     18/20
Documentation     7/10     10.5/15
Performance       9/10     9/10

Total: 84.5/100 points

Details:
✓ 27/30 requirements completed
✓ 82% test coverage
✓ 0 TypeScript errors
✓ 3 ESLint warnings
✗ Missing README.md
✓ Build time: 12s (target: <30s)
```

## `nerv benchmark history`

View benchmark history.

```bash
nerv benchmark history [--limit <n>]
```

**Options:**
- `--limit <n>` - Number of entries to show (default: 20)

**Output:**
```
Benchmark History

Date        Spec              Score  Cycles  Cost    Duration
──────────  ────────────────  ─────  ──────  ──────  ────────
2026-01-15  todo-app.md       8.5    4       $1.23   23m
2026-01-14  todo-app.md       7.2    8       $2.45   45m
2026-01-13  chat-app.md       9.1    3       $0.98   18m
2026-01-12  todo-app.md       6.5    10      $3.12   52m
```

## `nerv benchmark compare`

Compare two benchmark runs.

```bash
nerv benchmark compare <dir1> <dir2>
```

**Example:**
```bash
nerv benchmark compare results/run-1 results/run-2
```

**Output:**
```
Comparison: run-1 vs run-2

Category          Run 1   Run 2   Change
────────────────  ──────  ──────  ────────
Requirements Met  7/10    9/10    +2
Test Coverage     6/10    8/10    +2
Code Quality      8/10    9/10    +1
Documentation     5/10    7/10    +2
Performance       9/10    9/10    0

Overall: 7.0 → 8.5 (+1.5)
```

## Spec File Format

Benchmark specs are Markdown files that define what to build:

```markdown
# Todo App Specification

## Overview

Build a simple todo application with CRUD operations.

## Requirements

### Functional
- [ ] Create new todos with title and description
- [ ] List all todos with pagination
- [ ] Update todo status (complete/incomplete)
- [ ] Delete todos
- [ ] Filter by status

### Non-Functional
- [ ] Persist data to SQLite
- [ ] Handle errors gracefully
- [ ] Validate input data

## Tech Stack

- Node.js with Express
- SQLite with better-sqlite3
- TypeScript

## Acceptance Criteria

1. All CRUD endpoints work
2. Tests pass with >80% coverage
3. No TypeScript errors
4. Proper error responses
```

### Spec Best Practices

1. **Use checkboxes** - NERV counts completed `- [ ]` items
2. **Be specific** - Clear requirements = better scores
3. **Define tech stack** - Specify languages and frameworks
4. **Include acceptance criteria** - Define what "done" means
5. **Keep it focused** - One feature per spec

## Scoring Categories

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Requirements Met | 30% | Completed checkboxes in spec |
| Test Coverage | 25% | Code coverage percentage |
| Code Quality | 20% | TypeScript errors, linting |
| Documentation | 15% | Comments, README, API docs |
| Performance | 10% | Build time, test speed |

## History Storage

Benchmark history is stored in `~/.nerv/benchmarks/history.jsonl`:

```json
{"date":"2026-01-15","spec":"todo-app.md","score":8.5,"cycles":4,"cost":1.23,"duration":1425000}
{"date":"2026-01-14","spec":"todo-app.md","score":7.2,"cycles":8,"cost":2.45,"duration":2700000}
```

## Tips for Better Scores

1. **Write clear specs** - Ambiguity hurts scores
2. **Include test requirements** - Coverage is weighted
3. **Start simple** - Begin with small specs
4. **Iterate on specs** - Improve based on results
5. **Track history** - Compare performance over time
