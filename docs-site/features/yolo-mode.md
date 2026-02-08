# YOLO Mode

YOLO (You Only Live Once) mode enables autonomous operation for benchmarking and rapid prototyping.

## What is YOLO Mode?

In YOLO mode:

- Claude works through tasks without human review
- An AI review agent evaluates completed work
- Tests are run automatically
- Auto-merges if tests pass and criteria met
- Flags uncertain cases for human review

## When to Use YOLO

YOLO mode is best for:

- **Benchmarking** - Testing NERV's prompt effectiveness
- **Rapid prototyping** - When you have clear specs
- **Overnight processing** - Unattended task processing
- **Well-defined features** - Test-driven development

## Configuration

### Via UI

Open Settings > YOLO to configure:

| Setting | Description |
|---------|-------------|
| Max Cycles | Stop after N cycles |
| Max Cost | Stop at cost threshold (USD) |
| Stop on Failure | Halt on first failed task |
| Auto-Merge | Merge automatically on success |

### Via CLI

```bash
# Set YOLO settings
nerv config set yolo_max_cycles 10
nerv config set yolo_max_cost_usd 5.00
nerv config set yolo_auto_approve_review true
```

### Via Environment

```bash
NERV_YOLO_MAX_CYCLES=10 nerv yolo
NERV_YOLO_MAX_COST_USD=5.00 nerv yolo
```

## Running YOLO Mode

### From UI

1. Enable YOLO mode in project settings
2. Click **"Start YOLO"**
3. Monitor progress in the dashboard

### From CLI

```bash
# Basic YOLO run
nerv yolo

# With limits
nerv yolo --cycles 5 --max-cost 10.00

# Stop on failure
nerv yolo --stop-on-failure
```

## Benchmarking

YOLO mode is commonly used for benchmarking with spec files:

```bash
# Run benchmark
nerv benchmark specs/todo-app.md --cycles 5

# Score results
nerv benchmark score test-results/benchmark/
```

### Spec File Format

Benchmark specs define what to build:

```markdown
# Todo App Specification

## Requirements

- [ ] Create, read, update, delete todos
- [ ] Mark todos as complete
- [ ] Filter by status

## Acceptance Criteria

1. All CRUD operations work
2. State persists across sessions
3. Tests pass with >80% coverage
```

### Scoring

NERV scores benchmarks on 5 categories:

| Category | Weight |
|----------|--------|
| Requirements Met | 30% |
| Test Coverage | 25% |
| Code Quality | 20% |
| Documentation | 15% |
| Performance | 10% |

## Safety Features

### Cost Limits

YOLO mode respects cost limits:

```bash
nerv config set yolo_max_cost_usd 5.00
```

When the limit is reached, YOLO stops gracefully.

### Cycle Limits

Prevent runaway sessions:

```bash
nerv config set yolo_max_cycles 10
```

### Duration Limits

Set a maximum runtime:

```bash
nerv config set yolo_max_duration_ms 3600000  # 1 hour
```

### Stop on Failure

Halt when tests fail:

```bash
nerv yolo --stop-on-failure
```

## Monitoring

### Dashboard

The YOLO dashboard shows:
- Current cycle and task
- Cost accumulation
- Test results
- Session history

### Logs

View detailed logs:

```bash
# Tail logs
tail -f ~/.nerv/logs/yolo.log

# Or via CLI
nerv logs --follow
```

## Best Practices

1. **Start small** - Use low cycle/cost limits initially
2. **Write good specs** - Clear requirements = better results
3. **Include tests** - YOLO relies on tests for validation
4. **Review results** - Check flagged cases manually
5. **Iterate on specs** - Improve based on benchmark scores
