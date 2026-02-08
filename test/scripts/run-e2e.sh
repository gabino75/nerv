#!/bin/bash
# NERV E2E Test Runner (Linux/macOS)
#
# Usage:
#   ./test/scripts/run-e2e.sh                     # Fast benchmark, mock Claude
#   ./test/scripts/run-e2e.sh --record            # Record video of all tests
#   ./test/scripts/run-e2e.sh --slow              # 4s delays between actions
#   ./test/scripts/run-e2e.sh --real-claude       # Use real Claude API
#   ./test/scripts/run-e2e.sh --suite basic       # Run basic tests instead
#   ./test/scripts/run-e2e.sh --shards 4          # Run in 4 parallel containers
#   ./test/scripts/run-e2e.sh --record --slow     # Combine flags

set -e

# Defaults
RECORD=false
SLOW=false
SLOW_DELAY=4000
REAL_CLAUDE=false
REBUILD_IMAGE=false
SUITE="benchmark"
SHARDS=4

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --record|-r)
            RECORD=true
            shift
            ;;
        --slow|-s)
            SLOW=true
            shift
            ;;
        --slow-delay)
            SLOW_DELAY="$2"
            shift 2
            ;;
        --real-claude)
            REAL_CLAUDE=true
            shift
            ;;
        --rebuild)
            REBUILD_IMAGE=true
            shift
            ;;
        --suite)
            SUITE="$2"
            shift 2
            ;;
        --shards)
            SHARDS="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --record, -r       Record video/screenshots of all tests"
            echo "  --slow, -s         Add delays between actions (4s default)"
            echo "  --slow-delay MS    Set delay in milliseconds (default: 4000)"
            echo "  --real-claude      Use real Claude API (requires ANTHROPIC_API_KEY)"
            echo "  --rebuild          Force rebuild Docker image"
            echo "  --suite NAME       Test suite: benchmark, basic, workflow, all (default: benchmark)"
            echo "  --shards N         Number of parallel containers (default: 4)"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Convert to Windows path if running in Git Bash/MINGW (for Docker volume mount)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
    # Convert /c/Users/... to C:/Users/...
    PROJECT_ROOT="$(cygpath -m "$PROJECT_ROOT")"
fi

echo ""
echo "============================================================"
echo "   NERV E2E Test Runner (Docker - Sharded)"
echo "============================================================"
echo ""

# Build environment variables
ENV_VARS="-e NERV_MOCK_CLAUDE=$([[ "$REAL_CLAUDE" == "true" ]] && echo "false" || echo "true")"

if [[ "$RECORD" == "true" ]]; then
    ENV_VARS="$ENV_VARS -e NERV_RECORD_VIDEO=true"
    echo "[CONFIG] Video recording: ON"
fi

if [[ "$SLOW" == "true" ]]; then
    ENV_VARS="$ENV_VARS -e NERV_SLOW_MODE=true -e NERV_SLOW_DELAY=$SLOW_DELAY"
    echo "[CONFIG] Slow mode: ON (${SLOW_DELAY}ms delays)"
fi

if [[ "$REAL_CLAUDE" == "true" ]]; then
    if [[ -z "$ANTHROPIC_API_KEY" ]]; then
        echo "ERROR: ANTHROPIC_API_KEY environment variable required for real Claude"
        exit 1
    fi
    ENV_VARS="$ENV_VARS -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    echo "[CONFIG] Claude: REAL API"
else
    echo "[CONFIG] Claude: Mock"
fi

echo "[CONFIG] Test suite: $SUITE"
echo "[CONFIG] Shards: $SHARDS parallel containers"
echo ""

# Determine test file based on suite
case $SUITE in
    benchmark)
        TEST_FILE="test/e2e/benchmark.spec.ts"
        ;;
    basic)
        TEST_FILE="test/e2e/basic.spec.ts"
        ;;
    workflow)
        TEST_FILE="test/e2e/workflow.spec.ts"
        ;;
    all)
        TEST_FILE=""
        ;;
    *)
        echo "Unknown suite: $SUITE"
        exit 1
        ;;
esac

# Rebuild image if requested
if [[ "$REBUILD_IMAGE" == "true" ]]; then
    echo "Rebuilding Docker image..."
    cd "$PROJECT_ROOT"
    docker build -t nerv-e2e -f test/e2e/Dockerfile .
    echo ""
fi

# Run tests in parallel shards
echo "Running tests in $SHARDS parallel Docker containers..."
echo ""

PIDS=()
RESULTS_DIR=$(mktemp -d)

for i in $(seq 1 $SHARDS); do
    SHARD_SPEC="$i/$SHARDS"

    if [[ -n "$TEST_FILE" ]]; then
        TEST_CMD="npx playwright test --config=test/e2e/playwright.config.ts $TEST_FILE --shard=$SHARD_SPEC"
    else
        TEST_CMD="npx playwright test --config=test/e2e/playwright.config.ts --shard=$SHARD_SPEC"
    fi

    echo "[SHARD $SHARD_SPEC] Starting..."

    # Run each shard in background
    (
        docker run --rm \
            --shm-size=2gb \
            -v "$PROJECT_ROOT:/app/host" \
            $ENV_VARS \
            nerv-e2e \
            "$TEST_CMD" > "$RESULTS_DIR/shard_$i.log" 2>&1
        echo $? > "$RESULTS_DIR/shard_$i.exit"
    ) &

    PIDS+=($!)
done

echo ""
echo "Waiting for all shards to complete..."
echo ""

# Wait for all shards
TOTAL_PASSED=0
TOTAL_FAILED=0
ANY_FAILED=false

for i in $(seq 1 $SHARDS); do
    wait ${PIDS[$i-1]}
    EXIT_CODE=$(cat "$RESULTS_DIR/shard_$i.exit")

    if [[ "$EXIT_CODE" == "0" ]]; then
        echo "[SHARD $i/$SHARDS] PASSED"
    else
        echo "[SHARD $i/$SHARDS] FAILED"
        ANY_FAILED=true
        echo "--- Shard $i Output ---"
        tail -30 "$RESULTS_DIR/shard_$i.log"
        echo "--- End Shard $i ---"
    fi

    # Parse test counts
    if grep -q "passed" "$RESULTS_DIR/shard_$i.log"; then
        PASSED=$(grep -oP '\d+(?= passed)' "$RESULTS_DIR/shard_$i.log" | tail -1)
        TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    fi
    if grep -q "failed" "$RESULTS_DIR/shard_$i.log"; then
        FAILED=$(grep -oP '\d+(?= failed)' "$RESULTS_DIR/shard_$i.log" | tail -1)
        TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
    fi
done

# Cleanup
rm -rf "$RESULTS_DIR"

echo ""
echo "============================================================"
if [[ "$ANY_FAILED" == "false" ]]; then
    echo "   ALL SHARDS PASSED"
else
    echo "   SOME SHARDS FAILED"
fi
echo "============================================================"
echo ""
echo "Summary:"
echo "  - Total passed: $TOTAL_PASSED"
echo "  - Total failed: $TOTAL_FAILED"
echo "  - Shards: $SHARDS containers"
echo ""
echo "Results available at:"
echo "  - Videos/Screenshots: $PROJECT_ROOT/test-results/docker/artifacts/"
echo "  - HTML Report:        $PROJECT_ROOT/test-results/docker/html/index.html"
echo ""

if [[ "$ANY_FAILED" == "true" ]]; then
    exit 1
else
    exit 0
fi
