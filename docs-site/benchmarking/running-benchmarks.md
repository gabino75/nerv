# Running Benchmarks

## Basic Run

```bash
nerv benchmark specs/todo-app.md
```

This launches Claude Code to build the application defined in the spec file.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--cycles` | Maximum cycles | 10 |
| `--max-cost` | Cost limit (USD) | 5.00 |
| `--output` | Results directory | `test-results/benchmark-{timestamp}` |

### With Limits

```bash
nerv benchmark specs/todo-app.md --cycles 5 --max-cost 2.00
```

### Custom Output Directory

```bash
nerv benchmark specs/todo-app.md --output results/my-run
```

## Comparing Runs

Run different specs and compare:

```bash
nerv benchmark specs/simple-todo.md --output results/simple
nerv benchmark specs/complex-todo.md --output results/complex

nerv benchmark score results/simple
nerv benchmark score results/complex
```

## Iterating on Specs

Improve specs based on scores:

1. Run benchmark with initial spec
2. Analyze where points were lost
3. Clarify the spec in those areas
4. Run benchmark again
5. Compare scores

## History Tracking

### View History

```bash
nerv benchmark history
```

### History Storage

History is appended to `~/.nerv/benchmarks/history.jsonl` after each scored run. Each entry includes benchmark ID, timestamp, spec, scores, duration, and cost.

## Best Practices

1. **Start simple** - Begin with small specs to validate the pipeline
2. **Set limits** - Use cost and cycle limits to avoid runaway runs
3. **Track history** - Compare scores over time to spot regressions
4. **Iterate** - Improve specs based on where points are lost
