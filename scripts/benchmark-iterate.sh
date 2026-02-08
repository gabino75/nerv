#!/bin/bash
# NERV Benchmark Iteration Loop
#
# Runs the full benchmark → score → fix cycle until ALL score dimensions
# reach the target threshold. The benchmark pipeline runs in Docker (needs
# native modules), while scoring and fix iterations run on the host.
#
# Usage:
#   ./scripts/benchmark-iterate.sh [options]
#
# Options:
#   --spec <file>       Spec file to benchmark (default: specs/todo-app.md)
#   --target <score>    Target score for ALL dimensions (default: 7)
#   --budget <usd>      Per-benchmark Claude budget (default: 5)
#   --fix-budget <usd>  Budget for fix iteration Claude session (default: 3)
#   --rebuild           Force rebuild Docker image
#   --help              Show this help

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/benchmark-iterate.log"

# Defaults
SPEC_FILE="specs/todo-app.md"
TARGET_SCORE=7
BUDGET_PER_ITER=15
FIX_BUDGET=10
REBUILD_IMAGE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log() { echo -e "${CYAN}[BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
ok() { echo -e "${GREEN}[BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
err() { echo -e "${RED}[BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
phase() { echo -e "\n${MAGENTA}--- $* ---${NC}" | tee -a "$LOG_FILE"; }

usage() {
    cat <<'EOF'
NERV Benchmark Iteration Loop

Runs benchmark in Docker, scores on host, fixes with Claude. Repeats
until ALL score dimensions reach the target.

Usage: ./scripts/benchmark-iterate.sh [options]

Options:
  --spec <file>       Spec file (default: specs/todo-app.md)
  --target <score>    Target for ALL dimensions, 1-10 (default: 7)
  --budget <usd>      Claude budget per benchmark run (default: 5)
  --fix-budget <usd>  Claude budget per fix iteration (default: 3)
  --rebuild           Force rebuild Docker image
  --help              Show this help
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --spec) SPEC_FILE="$2"; shift 2 ;;
        --target) TARGET_SCORE="$2"; shift 2 ;;
        --budget) BUDGET_PER_ITER="$2"; shift 2 ;;
        --fix-budget) FIX_BUDGET="$2"; shift 2 ;;
        --rebuild) REBUILD_IMAGE=true; shift ;;
        --help) usage ;;
        *) err "Unknown option: $1"; usage ;;
    esac
done

# Resolve spec file path (relative to project root)
SPEC_PATH="$PROJECT_ROOT/$SPEC_FILE"
if [[ ! -f "$SPEC_PATH" ]]; then
    err "Spec file not found: $SPEC_PATH"
    exit 1
fi

# ============================================================================
# Initialize
# ============================================================================

: > "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "  NERV Benchmark Iteration Loop - $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "  Target: ALL dimensions >= $TARGET_SCORE/10" | tee -a "$LOG_FILE"
echo "  Iterations: UNLIMITED (until target met)" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
log "Spec:        $SPEC_FILE"
log "Budget/run:  \$$BUDGET_PER_ITER"
log "Fix budget:  \$$FIX_BUDGET"
log "Docker:      yes (native modules)"
echo ""
echo -e "${DIM}Tail output: tail -f $LOG_FILE${NC}"
echo ""

# ============================================================================
# Prerequisites
# ============================================================================

phase "Prerequisites"

# Typecheck
log "Running typecheck..."
if ! npm run typecheck --prefix "$PROJECT_ROOT" > /dev/null 2>&1; then
    err "Typecheck failed! Fix errors first."
    npm run typecheck --prefix "$PROJECT_ROOT" 2>&1 | tail -20
    exit 1
fi
ok "Typecheck: clean"

# Unit tests
log "Running unit tests..."
TEST_OUTPUT=$(cd "$PROJECT_ROOT" && npx vitest run 2>&1)
if [[ $? -ne 0 ]]; then
    err "Unit tests failed!"
    echo "$TEST_OUTPUT" | tail -20
    exit 1
fi
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+ passed' | head -1 || echo "?")
ok "Unit tests: $TEST_COUNT"

# Claude CLI
if ! command -v claude &> /dev/null; then
    err "Claude Code CLI not found."
    exit 1
fi
ok "Claude CLI: available"

# Docker
if ! command -v docker &> /dev/null; then
    err "Docker not found."
    exit 1
fi
ok "Docker: available"

# ============================================================================
# Build Docker image (if needed)
# ============================================================================

phase "Docker Image"

IMAGE_EXISTS=$(docker images -q nerv-e2e 2>/dev/null)
if [[ -z "$IMAGE_EXISTS" || "$REBUILD_IMAGE" == "true" ]]; then
    log "Building Docker image (this takes a few minutes)..."
    docker build -t nerv-e2e -f "$PROJECT_ROOT/test/e2e/Dockerfile" "$PROJECT_ROOT" 2>&1 | tee -a "$LOG_FILE"
    ok "Docker image built"
else
    ok "Docker image: nerv-e2e (exists)"
fi

# ============================================================================
# Build app for Docker to use
# ============================================================================

phase "Building App"

log "Building NERV app..."
cd "$PROJECT_ROOT"
if npm run build > /tmp/nerv-build.log 2>&1; then
    ok "App built successfully"
else
    warn "Build failed (Docker will try building inside container)"
    cat /tmp/nerv-build.log | tail -20
fi

# ============================================================================
# Credential setup for real Claude inside Docker
# ============================================================================

CLAUDE_MOUNT_ARGS=""
CLAUDE_DIR="$HOME/.claude"
ANTHROPIC_DIR="$HOME/.anthropic"

if [[ -d "$CLAUDE_DIR" ]]; then
    CLAUDE_MOUNT_ARGS="$CLAUDE_MOUNT_ARGS -v $CLAUDE_DIR:/root/.claude"
    ok "Claude credentials: mounted"
fi
if [[ -d "$ANTHROPIC_DIR" ]]; then
    CLAUDE_MOUNT_ARGS="$CLAUDE_MOUNT_ARGS -v $ANTHROPIC_DIR:/root/.anthropic:ro"
    ok "Anthropic credentials: mounted"
fi
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    CLAUDE_MOUNT_ARGS="$CLAUDE_MOUNT_ARGS -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    ok "API key: passed"
fi

# ============================================================================
# Helper: check if all dimensions meet target
# ============================================================================

check_all_dimensions() {
    local report_file="$1"
    local target="$2"

    if [[ ! -f "$report_file" ]]; then
        echo "NO_REPORT"
        return
    fi

    # Extract all dimension scores using node
    local result
    result=$(node -e "
        const r = JSON.parse(require('fs').readFileSync('$report_file', 'utf-8'));
        const nervOps10 = r.combined?.nervOpsScore || 0;
        const impl = r.codeQuality?.implementation?.score || 0;
        const func = r.codeQuality?.functionality?.score || 0;
        const ux = r.codeQuality?.ux?.score || 0;
        const overall = r.combined?.overallScore || 0;
        const target = $target;

        const dims = {
            'NERV Ops': nervOps10,
            'Implementation': impl,
            'Functionality': func,
            'UX': ux,
            'Overall': overall
        };

        let allPass = true;
        let lowest = { name: '', score: 11 };
        const lines = [];

        for (const [name, score] of Object.entries(dims)) {
            const pass = score >= target;
            if (!pass) allPass = false;
            if (score < lowest.score) lowest = { name, score };
            lines.push(pass ? 'PASS' : 'FAIL' + '|' + name + '|' + score);
        }

        console.log(allPass ? 'ALL_PASS' : 'NOT_MET');
        lines.forEach(l => console.log(l));
        console.log('LOWEST|' + lowest.name + '|' + lowest.score);
    " 2>/dev/null)

    echo "$result"
}

# ============================================================================
# Main Loop - UNLIMITED iterations until ALL dimensions >= target
# ============================================================================

ITERATION=0
BEST_OVERALL=0
START_TIME=$(date +%s)

while true; do
    ITERATION=$((ITERATION + 1))
    ITER_START=$(date +%s)

    echo ""
    echo -e "${BOLD}==================== ITERATION $ITERATION ====================${NC}" | tee -a "$LOG_FILE"
    echo ""

    # ------------------------------------------------------------------
    # Phase 1: Run benchmark in Docker
    # ------------------------------------------------------------------
    phase "Benchmark (Docker)"

    TIMESTAMP=$(date +%Y%m%d%H%M%S)
    RESULTS_DIR="test-results/benchmark-iter-$TIMESTAMP"

    log "Running benchmark pipeline in Docker..."
    log "Spec: $SPEC_FILE | Budget: \$$BUDGET_PER_ITER"

    # The Docker container:
    # 1. Syncs source from /app/host
    # 2. Rebuilds native modules for system Node (not Electron)
    # 3. Runs the benchmark CLI command
    # Results are written to the mounted test-results directory
    #
    # NOTE: The Docker image compiles native modules for Electron's Node ABI.
    # The CLI runs under system Node, so we need to rebuild better-sqlite3.
    # Claude CLI refuses --dangerously-skip-permissions when running as root.
    # Create a non-root user inside the container to run the benchmark.
    BENCHMARK_CMD="
        useradd -m -s /bin/bash benchuser 2>/dev/null || true && \
        cp -r /root/.claude /home/benchuser/.claude 2>/dev/null || true && \
        chown -R benchuser:benchuser /home/benchuser/.claude 2>/dev/null || true && \
        chown -R benchuser:benchuser /app && \
        mkdir -p /app/test-results && chown -R benchuser:benchuser /app/test-results && \
        su benchuser -c '
            cd /app && \
            git config --global user.email \"benchmark@nerv.local\" && \
            git config --global user.name \"NERV Benchmark\" && \
            rm -rf src test scripts specs && \
            cp -r /app/host/src /app/host/test /app/host/scripts /app/host/specs . 2>/dev/null; \
            for f in package.json tsconfig.json tsconfig.node.json tsconfig.web.json tsconfig.cli.json; do \
                [ -f /app/host/\$f ] && cp /app/host/\$f .; \
            done && \
            npm rebuild better-sqlite3 2>&1 && \
            npx tsx src/cli/index.ts benchmark specs/$(basename $SPEC_FILE) --max-cost $BUDGET_PER_ITER --dangerously-skip-permissions 2>&1; \
            cp -r test-results/* /app/host/test-results/ 2>/dev/null || true
        '
    "

    set +e
    docker run --rm \
        --shm-size=2gb \
        -v "$PROJECT_ROOT:/app/host" \
        -e "NERV_MOCK_CLAUDE=false" \
        -e "NERV_TEST_MODE=false" \
        -e "HOME=/root" \
        $CLAUDE_MOUNT_ARGS \
        --entrypoint bash \
        nerv-e2e \
        -c "$BENCHMARK_CMD" 2>&1 | tee -a "$LOG_FILE"
    BENCH_EXIT=$?
    set -e

    if [[ $BENCH_EXIT -ne 0 ]]; then
        warn "Benchmark exited with code $BENCH_EXIT"
    fi

    # Find the latest benchmark results directory (search all possible locations)
    LATEST_DIR=""
    LATEST_MTIME=0
    for pattern in \
        "$PROJECT_ROOT/test-results/benchmark/run-"* \
        "$PROJECT_ROOT/test-results/benchmark-"* \
        "$PROJECT_ROOT/test-results/docker/benchmark/run-"* \
        "$PROJECT_ROOT/test-results/docker/benchmark-"*; do
        for dir in $pattern; do
            if [[ -d "$dir" && -f "$dir/summary.json" ]]; then
                MTIME=$(stat -c %Y "$dir/summary.json" 2>/dev/null || echo 0)
                if [[ $MTIME -gt $LATEST_MTIME ]]; then
                    LATEST_MTIME=$MTIME
                    LATEST_DIR="$dir"
                fi
            fi
        done
    done

    if [[ -z "$LATEST_DIR" ]]; then
        err "No benchmark results found after run."
        log "Skipping to fix iteration..."
        # Still try a fix iteration to see if Claude can diagnose the issue
    else
        log "Results: $LATEST_DIR"
    fi

    # ------------------------------------------------------------------
    # Phase 2: Score on host (no native deps needed)
    # ------------------------------------------------------------------
    phase "Scoring"

    SCORE_REPORT=""
    DIM_RESULT=""
    FIRST_LINE=""

    if [[ -n "$LATEST_DIR" ]]; then
        log "Scoring benchmark results..."

        set +e
        node "$PROJECT_ROOT/scripts/score-benchmark.js" \
            "$LATEST_DIR" \
            --spec "$SPEC_PATH" \
            --no-visual \
            2>&1 | tee -a "$LOG_FILE"
        set -e

        SCORE_REPORT="$LATEST_DIR/score-report.json"

        if [[ -f "$SCORE_REPORT" ]]; then
            DIM_RESULT=$(check_all_dimensions "$SCORE_REPORT" "$TARGET_SCORE")
            FIRST_LINE=$(echo "$DIM_RESULT" | head -1)

            # Print dimension breakdown
            echo ""
            echo -e "${BOLD}  Score Breakdown vs Target ($TARGET_SCORE):${NC}" | tee -a "$LOG_FILE"
            echo "$DIM_RESULT" | tail -n +2 | while IFS='|' read -r status name score; do
                if [[ "$status" == "PASS" ]]; then
                    echo -e "    ${GREEN}PASS${NC}  $name: $score" | tee -a "$LOG_FILE"
                elif [[ "$status" == "FAIL" ]]; then
                    echo -e "    ${RED}FAIL${NC}  $name: $score" | tee -a "$LOG_FILE"
                elif [[ "$status" == "LOWEST" ]]; then
                    echo -e "    ${YELLOW}>>    Weakest: $name ($score)${NC}" | tee -a "$LOG_FILE"
                fi
            done
            echo ""

            # Extract overall for tracking
            OVERALL=$(node -e "const r=JSON.parse(require('fs').readFileSync('$SCORE_REPORT','utf-8')); console.log(r.combined?.overallScore||0)" 2>/dev/null || echo "0")
            if (( $(echo "$OVERALL > $BEST_OVERALL" | bc -l 2>/dev/null || echo 0) )); then
                BEST_OVERALL=$OVERALL
            fi
        fi
    fi

    # ------------------------------------------------------------------
    # Phase 3: Check if ALL dimensions meet target
    # ------------------------------------------------------------------

    if [[ "$FIRST_LINE" == "ALL_PASS" ]]; then
        echo ""
        ok "============================================================"
        ok "ALL DIMENSIONS >= $TARGET_SCORE! BENCHMARK TARGET MET!"
        ok "============================================================"
        ok "Results: $LATEST_DIR"
        ok "Report:  $SCORE_REPORT"
        ok "Iterations: $ITERATION"
        TOTAL_TIME=$(( $(date +%s) - START_TIME ))
        ok "Total time: ${TOTAL_TIME}s"
        exit 0
    fi

    # Find the weakest dimension for the fix prompt
    LOWEST_DIM=""
    LOWEST_SCORE=""
    if [[ -n "$DIM_RESULT" ]]; then
        LOWEST_LINE=$(echo "$DIM_RESULT" | grep "^LOWEST" | head -1)
        LOWEST_DIM=$(echo "$LOWEST_LINE" | cut -d'|' -f2)
        LOWEST_SCORE=$(echo "$LOWEST_LINE" | cut -d'|' -f3)
    fi

    log "Weakest dimension: $LOWEST_DIM ($LOWEST_SCORE) - target: $TARGET_SCORE"

    # ------------------------------------------------------------------
    # Phase 4: Fix iteration (Claude on host)
    # ------------------------------------------------------------------
    phase "Fix Iteration (Claude Opus)"

    REPORT_CONTENT=""
    if [[ -f "$SCORE_REPORT" ]]; then
        REPORT_CONTENT=$(cat "$SCORE_REPORT")
    fi

    FIX_PROMPT="# NERV Benchmark Fix - Iteration $ITERATION

The NERV benchmark scored below target. ALL dimensions must reach $TARGET_SCORE/10.

## Weakest Dimension: $LOWEST_DIM ($LOWEST_SCORE/10)

Focus your fix on improving **$LOWEST_DIM**.

## Full Score Report
$REPORT_CONTENT

## What the Scores Mean

**NERV Ops** - How well NERV uses its own features during the benchmark:
- Worktree usage: Are git worktrees being created per task?
- Parallelism: Are tasks running concurrently?
- Cycle management: Are spec cycles being processed?
- Review process: Is the review agent running and producing decisions?
- Error handling: Are there too many errors or stuck loops?
- Cost efficiency: Is spend proportional to output?

**Code Quality** - Quality of the app that NERV built:
- Implementation: Code structure, types, patterns
- Functionality: Do features actually work?
- UX: UI quality, error states, polish

## Your Task

1. Identify why **$LOWEST_DIM** is scoring $LOWEST_SCORE (below $TARGET_SCORE)
2. Read the relevant NERV source code
3. Fix ONE issue that will most improve this dimension
4. Run \`npm run typecheck\` and \`npx vitest run\` to verify no regressions
5. Commit your changes

## Key Files
- \`src/cli/commands/benchmark.ts\` - Benchmark pipeline (worktrees, cycles, tasks, review)
- \`src/core/spec-parser.ts\` - Spec parsing into cycles/subtasks
- \`src/core/benchmark-worktree.ts\` - Git worktree operations
- \`src/core/benchmark-review.ts\` - Review agent
- \`src/core/benchmark-scoring.ts\` - Deterministic NERV ops scoring
- \`scripts/score-benchmark.js\` - Two-dimension scoring script
- \`src/shared/types/benchmark.ts\` - Benchmark types

## Rules
- Fix ONE thing. The loop continues automatically.
- Focus on NERV's code, not the scoring system.
- Verify with typecheck + tests before committing.
- Do NOT create .ralph-complete or marker files.
"

    log "Spawning Claude to fix $LOWEST_DIM..."

    set +e
    cd "$PROJECT_ROOT"
    claude --model opus \
        --print \
        --dangerously-skip-permissions \
        --max-budget-usd "$FIX_BUDGET" \
        "$FIX_PROMPT" \
        2>&1 | tee -a "$LOG_FILE"
    FIX_EXIT=$?
    set -e

    if [[ $FIX_EXIT -ne 0 ]]; then
        warn "Fix session exited with code $FIX_EXIT"
    fi

    # Verify fix
    phase "Verification"

    set +e
    npm run typecheck --prefix "$PROJECT_ROOT" > /dev/null 2>&1
    TC_OK=$?
    cd "$PROJECT_ROOT" && npx vitest run > /dev/null 2>&1
    UT_OK=$?
    set -e

    if [[ $TC_OK -ne 0 ]]; then
        warn "Typecheck failed after fix!"
    elif [[ $UT_OK -ne 0 ]]; then
        warn "Unit tests failed after fix!"
    else
        ok "Fix verified: typecheck clean, tests passing"
    fi

    # Timing
    ITER_END=$(date +%s)
    ITER_DURATION=$((ITER_END - ITER_START))
    TOTAL_ELAPSED=$((ITER_END - START_TIME))
    log "Iteration $ITERATION: ${ITER_DURATION}s (total: ${TOTAL_ELAPSED}s, best overall: $BEST_OVERALL)"

    # Brief pause
    sleep 3
done
