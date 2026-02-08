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

### Score Command

```bash
nerv benchmark score test-results/benchmark-20260101/
```

### Scoring Categories

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Requirements Met | 30% | Checkboxes completed in spec |
| Test Coverage | 25% | Code coverage percentage |
| Code Quality | 20% | Linting, type safety |
| Documentation | 15% | Comments, README |
| Performance | 10% | Build time, test speed |

### Score Output

```
Benchmark Score: 8.5/10

Requirements Met:     9/10  (27/30 points)
Test Coverage:        8/10  (20/25 points)
Code Quality:         9/10  (18/20 points)
Documentation:        7/10  (10.5/15 points)
Performance:          9/10  (9/10 points)

Total: 84.5/100 points
```

## History Tracking

### View History

```bash
nerv benchmark history
```

### Output

```
Benchmark History

Date       | Spec              | Score | Cycles | Cost
-----------|-------------------|-------|--------|-------
2026-01-15 | todo-app.md       | 8.5   | 5      | $1.23
2026-01-14 | todo-app.md       | 7.2   | 8      | $2.45
2026-01-13 | chat-app.md       | 9.1   | 4      | $0.98
```

### History File

History is stored in `~/.nerv/benchmarks/history.jsonl`:

```json
{"date":"2026-01-15","spec":"todo-app.md","score":8.5,"cycles":5,"cost":1.23}
{"date":"2026-01-14","spec":"todo-app.md","score":7.2,"cycles":8,"cost":2.45}
```

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

NERV counts completed checkboxes for scoring:

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
