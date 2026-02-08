# Scoring System

Benchmark scoring has two dimensions: deterministic NERV operations metrics and Claude-graded code quality.

## Score Command

```bash
nerv benchmark score test-results/benchmark-20260101/
```

You can also use the standalone scoring script:

```bash
node scripts/score-benchmark.js test-results/benchmark-20260101/ --spec specs/todo-app.md
```

## NERV Operations Score (Deterministic)

Scored automatically from `summary.json` metrics:

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Worktree Usage | 25% | Worktrees created, merged, per-task isolation |
| Parallelism | 15% | Parallel tasks run, coverage ratio |
| Cycle Management | 20% | Cycles completed, spec completion %, tasks done |
| Review Process | 15% | Reviews run and approved, coverage |
| Error Handling | 10% | Tool errors, loops detected, stuck states |
| Cost Efficiency | 15% | Total cost, cost per spec item, duration |

## Code Quality Score (Claude-Graded)

A separate Claude Code session evaluates the produced code:

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Implementation | 35% | Code organization, naming, tests, type safety, DRY |
| Functionality | 35% | Spec requirements met, API correctness, edge cases |
| User Experience | 30% | App works, intuitive UI, proper feedback, matches README |

## Score Output

```
============================================================
  NERV Benchmark Scores
============================================================

  --- NERV Operations (Deterministic) ---
  NERV Ops Total           78/100

    Worktree Usage (25%)   8/10
    Parallelism (15%)      6/10
    Cycle Mgmt (20%)       9/10
    Review Process (15%)   8/10
    Error Handling (10%)   10/10
    Cost Efficiency (15%)  7/10

  --- Code Quality (Claude Graded) ---

    Implementation (35%)   9/10
    Functionality (35%)    8/10
    User Experience (30%)  10/10

------------------------------------------------------------
  NERV Ops Score             7.8/10
  Code Quality Score         8.9/10
  Overall Score              8.4/10
============================================================
```

Exit code is 0 if overall score >= 7, or 1 if below.

## Grading with Claude

The `-GradeClaude` flag on the test runner triggers automatic Claude scoring after successful test runs:

```bash
# Via test runner
powershell -File test/scripts/run-e2e.ps1 -Suite benchmark -RealClaude -GradeClaude
```

This only runs if all tests pass and benchmark output exists with the required files.

## Required Files for Grading

The scoring script requires specific files in the benchmark results directory:

| File | Required | Purpose |
|------|----------|---------|
| `summary.json` | Yes | Overall metrics, updated with scores |
| `spec.md` | Yes | Original spec for context |
| `timeline.jsonl` | Yes | Event log for workflow analysis |
| `tasks/*/metrics.json` | Yes | Per-task metrics |
| `tasks/*/tools.jsonl` | Yes | Tool usage for efficiency analysis |
| `tasks/*/git-diff.patch` | No | Code changes for implementation analysis |
| `tasks/*/errors.json` | No | Error analysis |

If required files are missing, the scorer outputs warnings but still attempts partial scoring.

## Manual Scoring

```bash
node scripts/score-benchmark.js test-results/benchmark-20260202-143052/
```

Results are saved to `summary.json` in the benchmark directory and appended to `~/.nerv/benchmarks/history.jsonl`.
