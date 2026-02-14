# Scoring System

Default scoring is **rule-based**. Use `--grade-claude` for AI-graded evaluation. Scores are computed across four categories.

## Score Command

```bash
nerv benchmark score test-results/benchmark-20260101/
```

You can also use the standalone scoring script:

```bash
node scripts/score-benchmark.js test-results/benchmark-20260101/ --spec specs/todo-app.md
```

## Scoring Categories

| Category | Weight | What's Evaluated |
|----------|--------|------------------|
| Implementation Quality | 30% | Code organization, functionality, type safety, test coverage, DRY principles |
| Workflow Quality | 20% | Cycle progression, task decomposition, spec coverage, progressive delivery |
| Efficiency | 20% | Token usage, compaction frequency, cost efficiency, task completion speed |
| User Experience | 30% | UX quality, documentation, review process, merge compliance |

Each category is scored 1-10, with per-criterion scoring guides to ensure consistency.

### Implementation Quality (30%)

Evaluates the produced code directly:

- Code organization, naming, type safety
- Spec requirements met, API correctness
- Tests present and passing
- DRY principles, no dead code

### Workflow Quality (20%)

Evaluates how well the benchmark run planned and decomposed work:

- Did spec completion increase across cycles?
- Were tasks well-scoped and achievable?
- Was there progressive delivery (each cycle adds value)?
- Did task descriptions align with spec requirements?

### Efficiency (20%)

Evaluates resource usage and speed:

- Token usage relative to task complexity
- Compaction frequency (lower is better)
- Cost efficiency (cost per completed task)
- Task completion speed

### User Experience (30%)

Evaluates the end-user impact:

- UX quality (if applicable)
- Worktree isolation (each task in its own worktree)
- Review process (reviews run before merges)
- Merge compliance (clean merges back to main)
- Permission handling (hooks respected)

## Score Output

```
============================================================
  NERV Benchmark Scores
============================================================

  Implementation Quality   8/10  (30%)
  Workflow Quality         8/10  (20%)
  Efficiency               7/10  (20%)
  User Experience          9/10  (30%)
  Overall Score            ████████░░ 8.1/10

------------------------------------------------------------
  Pass threshold: 7/10
  Result: PASS
============================================================
```

The overall score is a weighted average: `Implementation × 0.30 + Workflow × 0.20 + Efficiency × 0.20 + UX × 0.30`.

Exit code is 0 if overall score >= 7, or 1 if below.

## Mock Mode

When `NERV_MOCK_CLAUDE=1` or `NERV_TEST_MODE=1`, the scoring script returns fixed scores (8/10 for all categories) without calling Claude. This validates test infrastructure only — mock scores prove nothing about code quality.

## How Grading Works

By default, scoring is **rule-based** (deterministic). With `--grade-claude`, the scoring script (`scripts/score-benchmark.js`) makes 4 separate `claude --print` calls:

1. **Implementation Quality call** — receives the git diff of all changes, evaluates code quality
2. **Workflow Quality call** — receives the event log (`event-log.jsonl`) and spec file, evaluates planning
3. **Efficiency call** — receives token usage and cost data, evaluates resource efficiency
4. **User Experience call** — receives the event log and a PRD excerpt, evaluates UX and workflow compliance

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
