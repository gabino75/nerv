# Scoring System

All benchmark scoring is **Claude-graded** — a separate Claude Code session evaluates the benchmark output across three categories.

## Score Command

```bash
nerv benchmark score test-results/benchmark-20260101/
```

You can also use the standalone scoring script:

```bash
node scripts/score-benchmark.js test-results/benchmark-20260101/ --spec specs/todo-app.md
```

## Scoring Categories

All three categories are evaluated by Claude (no deterministic scoring):

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Planning | 15% | Cycle progression, task decomposition, spec coverage, progressive delivery |
| Code Quality | 50% | Implementation quality, functionality, UX, test coverage, code organization |
| NERV Ops | 35% | Workflow patterns compared against PRD — worktree isolation, cycle management, review process, error handling |

Each category is scored 1-10 by Claude, with per-criterion scoring guides to ensure consistency.

### Planning (15%)

Claude evaluates how well the benchmark run planned and decomposed work:

- Did spec completion increase across cycles?
- Were tasks well-scoped and achievable?
- Was there progressive delivery (each cycle adds value)?
- Did task descriptions align with spec requirements?

### Code Quality (50%)

Claude evaluates the produced code directly:

- Code organization, naming, type safety
- Spec requirements met, API correctness
- Tests present and passing
- User experience (if applicable)
- DRY principles, no dead code

### NERV Ops (35%)

Claude compares the workflow against the PRD's expected patterns:

- Worktree isolation (each task in its own worktree)
- Cycle management (proper cycle progression)
- Review process (reviews run before merges)
- Merge compliance (clean merges back to main)
- Permission handling (hooks respected)

## Score Output

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

The overall score is a weighted average: `Planning × 0.15 + Code × 0.50 + NERV Ops × 0.35`.

Exit code is 0 if overall score >= 7, or 1 if below.

## Mock Mode

When `NERV_MOCK_CLAUDE=1` or `NERV_TEST_MODE=1`, the scoring script returns fixed scores (8/10 for all categories) without calling Claude. This validates test infrastructure only — mock scores prove nothing about code quality.

## How Grading Works

The scoring script (`scripts/score-benchmark.js`) makes 3 separate `claude --print` calls:

1. **Planning call** — receives the event log (`event-log.jsonl`) and spec file, evaluates planning quality
2. **Code Quality call** — receives the git diff of all changes, evaluates implementation
3. **NERV Ops call** — receives the event log and a PRD excerpt, evaluates workflow compliance

Each call returns a JSON object with `score` (1-10), `strengths`, `weaknesses`, and `evidence`.

## Required Files for Grading

The scoring script reads from the benchmark results directory:

| File | Required | Purpose |
|------|----------|---------|
| `event-log.jsonl` | Yes | Timeline of all benchmark events |
| `spec.md` | Yes | Original spec for context |
| `score-report.json` | Output | Scores written here after grading |

## Manual Scoring

```bash
node scripts/score-benchmark.js test-results/benchmark-20260202-143052/ --spec specs/todo-app.md
```

Results are saved to `score-report.json` in the benchmark directory and appended to `~/.nerv/benchmarks/history.jsonl`.
