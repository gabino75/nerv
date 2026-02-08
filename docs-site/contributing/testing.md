# Testing

NERV has a comprehensive testing strategy with three layers: unit tests, E2E tests, and quality checks.

## Test Suites

| Suite | Tool | Location | Purpose |
|-------|------|----------|---------|
| Unit | Vitest | `test/unit/` | Fast, isolated tests for utilities and business logic |
| E2E | Playwright | `test/e2e/` | Tests against the running Electron app |
| Quality | Custom scripts | `test/e2e/quality/` | Code duplication, type coverage, circular dependencies |

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npx vitest --watch

# Run a specific test file
npx vitest test/unit/settings.test.ts
```

Unit tests are fast (< 10s total) and should always be run before committing.

### E2E Tests

E2E tests run in Docker to ensure a consistent environment:

```bash
# All E2E tests
powershell -File test/scripts/run-e2e.ps1 -Suite all

# Quality checks only
powershell -File test/scripts/run-e2e.ps1 -Suite quality

# Workflow tests (full UI flow)
powershell -File test/scripts/run-e2e.ps1 -Suite workflow

# Benchmark tests
powershell -File test/scripts/run-e2e.ps1 -Suite benchmark

# With real Claude (requires API access)
powershell -File test/scripts/run-e2e.ps1 -Suite claude -RealClaude

# With Claude grading after benchmark
powershell -File test/scripts/run-e2e.ps1 -Suite benchmark -RealClaude -GradeClaude
```

On Linux, E2E tests can also be run directly with xvfb:

```bash
xvfb-run --auto-servernum -- npx playwright test --config=test/e2e/playwright.config.ts
```

### Test Infrastructure

- Tests run in Docker by default for consistency
- The Docker container has Xvfb for headless Electron testing
- Mock Claude is used by default (`NERV_MOCK_CLAUDE=true`)
- For real Claude tests, use the `-RealClaude` flag

## Writing Unit Tests

Unit tests live in `test/unit/` and use Vitest:

```typescript
import { describe, it, expect } from 'vitest'
import { generateId } from '../../src/shared/constants'

describe('generateId', () => {
  it('generates unique IDs with prefix', () => {
    const id = generateId('task')
    expect(id).toMatch(/^task_\d+-[a-z0-9]+$/)
  })
})
```

### Guidelines

- Test real behavior, not just UI presence
- Mock external dependencies (database, Claude CLI, filesystem)
- Use descriptive test names that explain the expected behavior
- Group related tests with `describe` blocks
- Keep tests independent — no shared mutable state

## Writing E2E Tests

E2E tests live in `test/e2e/` and use Playwright:

```typescript
import { test, expect } from '@playwright/test'
import { launchApp, cleanup } from './helpers/launch'

test.describe('Feature', () => {
  test('does something', async () => {
    const { app, page } = await launchApp()
    try {
      await expect(page.locator('.dashboard')).toBeVisible()
      // ... test logic
    } finally {
      await cleanup(app)
    }
  })
})
```

### Guidelines

- Always clean up in a `finally` block
- Use `data-testid` attributes for element selection
- Wait for elements to be visible before interacting
- Use the mock Claude for deterministic tests
- Only use real Claude in the `-RealClaude` suite

## Benchmark Testing

Benchmark tests verify that NERV can orchestrate Claude to build an app from a spec:

```bash
# Run benchmark with mock Claude
powershell -File test/scripts/run-e2e.ps1 -Suite benchmark

# Run with real Claude and grade the output
powershell -File test/scripts/run-e2e.ps1 -Suite benchmark -RealClaude -GradeClaude

# Score an existing benchmark result
node scripts/score-benchmark.js test-results/benchmark-<timestamp>/
```

See [Benchmarking](/benchmarking/overview) for full details on specs and scoring.

## Pre-Commit Checklist

Before every commit, run:

```bash
npm run build      # Must pass
npm run typecheck  # No errors
npm run test:unit  # All tests pass
```
