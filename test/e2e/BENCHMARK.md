# NERV Benchmark Tests

## Purpose

These E2E tests verify that NERV correctly implements the features described in the PRD. Tests use mock Claude for speed and determinism, but verify real NERV functionality.

## Current Coverage

### Implemented & Passing ✅ (16 tests)
- `real_worktree_creation` - Git worktrees created on filesystem
- `real_claude_process_spawning` - Mock Claude process starts correctly
- `real_permission_dialog` - Permission queue shows requests
- `real_database_state` - SQLite CRUD operations work
- `real_context_tracking` - Token usage displayed
- `real_parallel_execution` - Multiple tasks can run
- `benchmark_full_real_workflow` - Combined workflow test
- `real_cycle_management` - Create/complete cycles, assign tasks to cycles
- `real_nervmd_generation` - Context file with goal/cycle/tasks/learnings/decisions
- `real_session_id_capture` - Parse session ID from Claude output
- `real_learnings_system` - Record and persist learnings per cycle
- `real_review_gate` - Task status flow (todo → in_progress → review → done)
- `real_audit_system` - Audit logging for code health checks
- `real_session_branching` - Branch/merge sessions for experimentation
- `real_loop_detection` - Detect and record repeated action patterns
- `real_multi_repo_support` - Multiple repos per project with NERV.md integration

### Not Yet Implemented ❌
- None - all major PRD features are covered!

## Running Tests

```bash
# Run benchmark tests (Docker required)
npm run test:e2e:benchmark

# With video recording + slow mode
npm run test:e2e:benchmark:record
```

## Adding New Tests

When adding tests for new PRD features:

1. Read the relevant PRD section
2. Add a test that exercises the feature
3. The test should FAIL initially (TDD)
4. Implement the feature until the test passes
5. Update this file's coverage list

### Test Structure

```typescript
test('feature_name - Description of what it tests', async () => {
  const { app, window, testRepoPath } = await launchNervBenchmark('scenario')

  try {
    // Setup
    const project = await setupBenchmarkProjectWithRepo(window, testRepoPath)

    // Action
    // ... interact with NERV ...

    // Verify REAL behavior (not just UI)
    const dbResult = await window.evaluate(async () => {
      return await window.api.db.someTable.get(id)
    })

    expect(dbResult).toBeDefined()
    expect(dbResult.field).toBe(expectedValue)

  } finally {
    cleanupTestRepo(testRepoPath)
    await app.close()
  }
})
```

## Mock Claude Scenarios

The mock Claude (`scripts/mock-claude.js`) supports different scenarios:

| Scenario | Description |
|----------|-------------|
| `simple_task` | Quick completion, no permissions |
| `permission_required` | Triggers permission dialog |
| `long_running` | Extended session with token output |
| `benchmark_full` | Complete workflow simulation |

## Output

Test results are saved to `test-results/docker/`:
- `recording.mp4` - Video (if `--record`)
- `test-output.log` - Console output
- `benchmark/` - JSON results

## Goal

The end goal is **real Claude Code benchmarking** - measuring how well NERV orchestrates actual Claude sessions. Mock tests validate the orchestration works correctly before using real API calls.
