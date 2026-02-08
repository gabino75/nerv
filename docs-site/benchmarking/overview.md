# Benchmarking Overview

NERV benchmarks measure how well Claude can build software from specifications. They provide a repeatable way to evaluate performance across different specs and configurations.

## How It Works

1. **Create a spec** - Define what to build in a markdown file
2. **Run benchmark** - Claude builds it autonomously in an isolated worktree
3. **Score results** - Evaluate with deterministic metrics and Claude-graded code quality
4. **Track history** - Compare scores over time

## Benchmark Flow

```
spec.md → nerv benchmark → Claude builds → score → history.jsonl
```

Each benchmark run:

- Creates an isolated git worktree
- Launches Claude Code with the spec as context
- Tracks cycles, cost, tokens, and tool usage
- Produces results in `test-results/benchmark-{timestamp}/`

## When to Use Benchmarks

- **Regression testing** - Ensure NERV updates don't degrade performance
- **Spec quality** - Validate that specs are clear enough for Claude
- **Configuration tuning** - Compare different cycle limits, cost caps, or agent configs
- **Model comparison** - Test different Claude models on the same spec

## Required Files

After a benchmark run, the results directory contains:

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
