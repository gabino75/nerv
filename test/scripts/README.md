# NERV E2E Test Scripts

Cross-platform scripts for running E2E tests in Docker containers.

## Quick Start

```bash
# First time: build the Docker image
npm run test:e2e:build

# Run benchmark tests (fast, mock Claude)
npm run test:e2e:benchmark

# Run with video recording
npm run test:e2e:benchmark:record
```

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run test:e2e:build` | Build Docker image |
| `npm run test:e2e` | Run all E2E tests |
| `npm run test:e2e:benchmark` | Run benchmark tests only |
| `npm run test:e2e:benchmark:record` | Benchmark with video + slow mode |

## Direct Script Usage

### Linux/macOS/Git Bash

```bash
./test/scripts/run-e2e.sh [options]

Options:
  --record, -r       Record video of tests
  --slow, -s         Add delays between actions (2s default)
  --slow-delay MS    Set delay in milliseconds
  --real-claude      Use real Claude API (requires ANTHROPIC_API_KEY)
  --rebuild          Force rebuild Docker image
  --suite NAME       Test suite: benchmark, basic, workflow, all
  --help, -h         Show help
```

### Windows PowerShell

```powershell
.\test\scripts\run-e2e.ps1 [options]

Options:
  -Record            Record video of tests
  -Slow              Add delays between actions
  -SlowDelay MS      Set delay in milliseconds
  -RealClaude        Use real Claude API
  -RebuildImage      Force rebuild Docker image
  -Suite NAME        Test suite: benchmark, basic, workflow, all
```

## Examples

```bash
# Record video with slow mode
npm run test:e2e:benchmark:record

# Or directly:
./test/scripts/run-e2e.sh --record --slow

# Windows:
.\test\scripts\run-e2e.ps1 -Record -Slow
```

## Test Output

Results are saved to `test-results/docker/`:

| Path | Description |
|------|-------------|
| `recording.mp4` | Video recording (if enabled) |
| `test-output.log` | Full test console output |
| `benchmark/` | Benchmark-specific results |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NERV_MOCK_CLAUDE` | Use mock Claude | `true` |
| `NERV_SLOW_MODE` | Enable delays | `false` |
| `NERV_SLOW_DELAY` | Delay in ms | `2000` |
| `NERV_RECORD_VIDEO` | Record screen | `false` |

## Troubleshooting

### Docker image not found
```bash
npm run test:e2e:build
```

### Tests timeout or hang
Ensure Docker has enough shared memory:
```bash
docker run --shm-size=2gb ...
```
