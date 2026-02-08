# Creating Specs

Benchmark specs are markdown files that define what Claude should build. Good specs produce consistent, scoreable results.

## Spec File Format

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

## Writing Good Specs

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

Specify the technologies to use so Claude doesn't have to guess:

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

## Existing Specs

NERV ships with example specs in the `specs/` directory:

| Spec | Complexity | Description |
|------|-----------|-------------|
| `todo-app.md` | Simple | Basic CRUD todo application |
| `api-dashboard.md` | Medium | Dashboard with API integrations |

## Tips

1. **Start simple** - Begin with small, well-defined specs
2. **Be explicit** - Ambiguity hurts scores
3. **Include tests** - Test coverage is weighted in scoring
4. **Define boundaries** - Say what's out of scope
5. **Iterate** - Refine specs based on benchmark results
