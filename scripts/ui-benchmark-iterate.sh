#!/bin/bash
# NERV UI Benchmark Iteration Loop
#
# Runs the full UI benchmark pipeline in Docker:
#   1. Build the app in Docker (Node 22)
#   2. Run the Playwright UI benchmark test
#   3. Verify all output artifacts (result.json, event-log, video, grades)
#   4. Print comprehensive workflow summary
#   5. If grades < target, fix with Claude and iterate
#
# Usage:
#   ./scripts/ui-benchmark-iterate.sh [options]
#
# Options:
#   --target <score>    Target score for ALL dimensions (default: 8)
#   --max-iters <n>     Maximum iterations (default: 10)
#   --fix-budget <usd>  Claude budget per fix iteration (default: 10)
#   --rebuild           Force rebuild Docker image
#   --no-record         Disable video recording
#   --help              Show this help

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/ui-benchmark-iterate.log"
SUMMARY_FILE="$PROJECT_ROOT/ui-benchmark-summary.json"

# Defaults
TARGET_SCORE=8
MAX_ITERS=10
REBUILD_IMAGE=false
RECORD_VIDEO=true
FIX_BUDGET=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log() { echo -e "${CYAN}[UI-BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
ok() { echo -e "${GREEN}[UI-BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[UI-BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
err() { echo -e "${RED}[UI-BENCH]${NC} $*" | tee -a "$LOG_FILE"; }
phase() { echo -e "\n${MAGENTA}--- $* ---${NC}" | tee -a "$LOG_FILE"; }

usage() {
    cat <<'EOF'
NERV UI Benchmark Iteration Loop

Runs the Playwright UI benchmark in Docker, verifies all output artifacts
(video, logs, grades), and iterates with Claude fixes until ALL dimensions
reach the target score.

Usage: ./scripts/ui-benchmark-iterate.sh [options]

Options:
  --target <score>    Target for ALL dimensions, 1-10 (default: 8)
  --max-iters <n>     Maximum iterations (default: 10)
  --fix-budget <usd>  Claude budget per fix iteration (default: 10)
  --rebuild           Force rebuild Docker image
  --no-record         Disable video recording
  --help              Show this help

Output:
  ui-benchmark-iterate.log    Full log of all iterations
  ui-benchmark-summary.json   JSON summary of all iteration results
  test-results/ui-benchmark/  Per-iteration output directories
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target) TARGET_SCORE="$2"; shift 2 ;;
        --max-iters) MAX_ITERS="$2"; shift 2 ;;
        --fix-budget) FIX_BUDGET="$2"; shift 2 ;;
        --rebuild) REBUILD_IMAGE=true; shift ;;
        --no-record) RECORD_VIDEO=false; shift ;;
        --help) usage ;;
        *) err "Unknown option: $1"; usage ;;
    esac
done

# ============================================================================
# Initialize
# ============================================================================

: > "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "  NERV UI Benchmark Iteration - $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "  Target: ALL dimensions >= $TARGET_SCORE/10" | tee -a "$LOG_FILE"
echo "  Max iterations: $MAX_ITERS" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
log "Fix budget:   \$$FIX_BUDGET/iter"
log "Record video: $RECORD_VIDEO"
log "Docker:       yes (Node 22 for native modules)"
echo ""
echo -e "${DIM}Tail output: tail -f $LOG_FILE${NC}"
echo ""

# Initialize summary JSON
echo '{"iterations": [], "startTime": "'$(date -Iseconds)'", "target": '$TARGET_SCORE'}' > "$SUMMARY_FILE"

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

# Docker
if ! command -v docker &> /dev/null; then
    err "Docker not found."
    exit 1
fi
ok "Docker: available"

# ============================================================================
# Build/Check Docker Image
# ============================================================================

phase "Docker Image"

IMAGE_EXISTS=$(docker images -q nerv-e2e 2>/dev/null)
if [[ -z "$IMAGE_EXISTS" || "$REBUILD_IMAGE" == "true" ]]; then
    log "Building Docker image (this takes several minutes)..."
    docker build -t nerv-e2e -f "$PROJECT_ROOT/test/e2e/Dockerfile" "$PROJECT_ROOT" 2>&1 | tee -a "$LOG_FILE"
    ok "Docker image built"
else
    ok "Docker image: nerv-e2e (exists)"
fi

# ============================================================================
# Credential setup for Claude inside Docker
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
# Helper: Extract grades from UI benchmark result.json
# ============================================================================

check_grades() {
    local result_file="$1"
    local target="$2"

    if [[ ! -f "$result_file" ]]; then
        echo "NO_RESULT"
        return
    fi

    node -e "
        const r = JSON.parse(require('fs').readFileSync('$result_file', 'utf-8'));
        const dims = {
            'Planning': r.grade?.planningScore || 0,
            'Code': r.grade?.codeScore || 0,
            'NERV Ops': r.grade?.nervOpsScore || 0,
            'Overall': r.grade?.overallScore || 0,
        };

        let allPass = true;
        let lowest = { name: '', score: 11 };

        for (const [name, score] of Object.entries(dims)) {
            const pass = score >= $target;
            if (!pass) allPass = false;
            if (score < lowest.score) lowest = { name, score };
            console.log((pass ? 'PASS' : 'FAIL') + '|' + name + '|' + score);
        }

        console.log('LOWEST|' + lowest.name + '|' + lowest.score);
        console.log(allPass ? 'ALL_PASS' : 'NOT_MET');

        // Build info
        if (r.build) {
            console.log('BUILD|cycles=' + (r.build.cyclesCompleted||0) +
                        '|tasks=' + (r.build.tasksCompleted||0) +
                        '|failed=' + (r.build.tasksFailed||0) +
                        '|success=' + (r.build.success||false) +
                        '|duration=' + Math.round((r.build.durationMs||0)/1000) + 's');
        }
        if (r.setup) {
            console.log('SETUP|success=' + (r.setup.success||false) +
                        '|taskIds=' + (r.setup.taskIds?.length||0) +
                        '|duration=' + Math.round((r.setup.durationMs||0)/1000) + 's' +
                        '|error=' + (r.setup.error||'none'));
        }
        // Total duration
        console.log('TOTAL|duration=' + Math.round((r.totalDurationMs||0)/1000) + 's');
    " 2>/dev/null
}

# ============================================================================
# Helper: Verify output artifacts and write summary
# ============================================================================

verify_artifacts() {
    local result_dir="$1"
    local output_dir="$2"
    local iteration="$3"

    echo "" | tee -a "$LOG_FILE"
    echo -e "${BOLD}  Artifact Verification:${NC}" | tee -a "$LOG_FILE"

    local artifacts_ok=true

    # 1. result.json
    if [[ -f "$result_dir/result.json" ]]; then
        local rsize=$(stat -c %s "$result_dir/result.json" 2>/dev/null || echo 0)
        echo -e "    ${GREEN}OK${NC}  result.json (${rsize} bytes)" | tee -a "$LOG_FILE"
        cp "$result_dir/result.json" "$output_dir/" 2>/dev/null || true
    else
        echo -e "    ${RED}MISSING${NC}  result.json" | tee -a "$LOG_FILE"
        artifacts_ok=false
    fi

    # 2. event-log.jsonl
    if [[ -f "$result_dir/event-log.jsonl" ]]; then
        local event_count=$(wc -l < "$result_dir/event-log.jsonl" 2>/dev/null || echo 0)
        echo -e "    ${GREEN}OK${NC}  event-log.jsonl ($event_count events)" | tee -a "$LOG_FILE"
        cp "$result_dir/event-log.jsonl" "$output_dir/" 2>/dev/null || true

        # Show key events
        echo -e "    ${DIM}   Events:${NC}" | tee -a "$LOG_FILE"
        node -e "
            const fs = require('fs');
            const lines = fs.readFileSync('$result_dir/event-log.jsonl', 'utf-8').trim().split('\n');
            const events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean);
            const keyEvents = events.filter(e =>
                e.event.includes('start') || e.event.includes('complete') ||
                e.event.includes('error') || e.event.includes('timeout') ||
                e.event.includes('grading')
            );
            keyEvents.slice(0, 15).forEach(e => {
                const ts = (e.t/1000).toFixed(1) + 's';
                console.log('      ' + ts.padEnd(8) + ' ' + e.event + (e.label ? ' - ' + e.label : ''));
            });
            if (keyEvents.length > 15) console.log('      ... and ' + (keyEvents.length - 15) + ' more events');
        " 2>/dev/null | tee -a "$LOG_FILE"
    else
        echo -e "    ${RED}MISSING${NC}  event-log.jsonl" | tee -a "$LOG_FILE"
        artifacts_ok=false
    fi

    # 3. grade.json
    if [[ -f "$result_dir/grade.json" ]]; then
        local gsize=$(stat -c %s "$result_dir/grade.json" 2>/dev/null || echo 0)
        echo -e "    ${GREEN}OK${NC}  grade.json (${gsize} bytes)" | tee -a "$LOG_FILE"
        cp "$result_dir/grade.json" "$output_dir/" 2>/dev/null || true
    else
        echo -e "    ${YELLOW}MISSING${NC}  grade.json (may be in result.json)" | tee -a "$LOG_FILE"
    fi

    # 4. spec.md
    if [[ -f "$result_dir/spec.md" ]]; then
        echo -e "    ${GREEN}OK${NC}  spec.md" | tee -a "$LOG_FILE"
        cp "$result_dir/spec.md" "$output_dir/" 2>/dev/null || true
    else
        echo -e "    ${YELLOW}MISSING${NC}  spec.md" | tee -a "$LOG_FILE"
    fi

    # 5. Video files
    local video_found=false
    local video_path=""
    local video_size=0
    local video_duration=""

    # Search multiple locations for video files
    for vf in "$result_dir"/video/*.mp4 "$result_dir"/video/*.webm \
              "$result_dir"/*.mp4 "$result_dir"/*.webm \
              "$PROJECT_ROOT"/test-results/docker/recording.mp4 \
              "$PROJECT_ROOT"/test-results/artifacts/**/video/*.webm; do
        if [[ -f "$vf" ]]; then
            video_size=$(stat -c %s "$vf" 2>/dev/null || echo 0)
            if [[ $video_size -gt 10000 ]]; then
                video_found=true
                video_path="$vf"

                # Try to get duration with ffprobe
                video_duration=$(ffprobe -v quiet -show_entries format=duration \
                    -of csv="p=0" "$vf" 2>/dev/null || echo "unknown")
                if [[ "$video_duration" != "unknown" ]]; then
                    video_duration=$(printf "%.1fs" "$video_duration")
                fi

                echo -e "    ${GREEN}OK${NC}  Video: $(basename "$vf") ($(( video_size / 1024 ))KB, $video_duration)" | tee -a "$LOG_FILE"

                # Copy to output dir
                mkdir -p "$output_dir/video"
                cp "$vf" "$output_dir/video/" 2>/dev/null || true
                break
            fi
        fi
    done

    if [[ "$video_found" == "false" ]]; then
        if [[ "$RECORD_VIDEO" == "true" ]]; then
            echo -e "    ${RED}MISSING${NC}  Video (recording was enabled but no file found)" | tee -a "$LOG_FILE"
            artifacts_ok=false
        else
            echo -e "    ${DIM}SKIP${NC}  Video (recording disabled)" | tee -a "$LOG_FILE"
        fi
    fi

    # 6. Test log (Docker output)
    local docker_log="$PROJECT_ROOT/test-results/docker/test-output.log"
    if [[ -f "$docker_log" ]]; then
        local log_size=$(stat -c %s "$docker_log" 2>/dev/null || echo 0)
        local log_lines=$(wc -l < "$docker_log" 2>/dev/null || echo 0)
        echo -e "    ${GREEN}OK${NC}  Docker test log ($log_lines lines, $(( log_size / 1024 ))KB)" | tee -a "$LOG_FILE"
        cp "$docker_log" "$output_dir/docker-test-output.log" 2>/dev/null || true

        # Show last errors if any
        local error_lines=$(grep -ic "error\|fail\|exception" "$docker_log" 2>/dev/null || echo 0)
        if [[ $error_lines -gt 0 ]]; then
            echo -e "    ${YELLOW}   $error_lines error/fail lines found in log${NC}" | tee -a "$LOG_FILE"
        fi
    else
        echo -e "    ${YELLOW}MISSING${NC}  Docker test log" | tee -a "$LOG_FILE"
    fi

    # 7. Electron console log
    for eclog in "$result_dir/electron-console.log" "$PROJECT_ROOT"/test-results/docker/ui-benchmark/run-*/electron-console.log; do
        if [[ -f "$eclog" ]]; then
            local eclog_lines=$(wc -l < "$eclog" 2>/dev/null || echo 0)
            echo -e "    ${GREEN}OK${NC}  electron-console.log ($eclog_lines lines)" | tee -a "$LOG_FILE"
            cp "$eclog" "$output_dir/" 2>/dev/null || true

            # Show NERV-related errors
            local nerv_errors=$(grep -c "\[NERV\].*error\|Error\|Failed" "$eclog" 2>/dev/null | head -1 || echo 0)
            if [[ $nerv_errors -gt 0 ]]; then
                echo -e "    ${YELLOW}   $nerv_errors NERV error lines:${NC}" | tee -a "$LOG_FILE"
                grep "\[NERV\].*error\|Error\|Failed" "$eclog" 2>/dev/null | head -5 | while read -r line; do
                    echo -e "      ${DIM}$line${NC}" | tee -a "$LOG_FILE"
                done
            fi
            break
        fi
    done

    # 8. Playwright trace (for debugging)
    local trace_count=0
    for tf in "$PROJECT_ROOT"/test-results/artifacts/**/*.zip; do
        if [[ -f "$tf" ]]; then
            trace_count=$((trace_count + 1))
        fi
    done
    if [[ $trace_count -gt 0 ]]; then
        echo -e "    ${GREEN}OK${NC}  Playwright traces ($trace_count files)" | tee -a "$LOG_FILE"
    fi

    echo "" | tee -a "$LOG_FILE"
    # Write result to a temp file to avoid stdout pollution from tee
    echo "$artifacts_ok" > /tmp/nerv-artifacts-ok
}

# ============================================================================
# Helper: Print iteration workflow summary
# ============================================================================

print_workflow_summary() {
    local result_file="$1"
    local iteration="$2"
    local iter_duration="$3"

    echo "" | tee -a "$LOG_FILE"
    echo -e "${BOLD}  ┌─────────────────────────────────────────────────────────┐${NC}" | tee -a "$LOG_FILE"
    echo -e "${BOLD}  │         ITERATION $iteration WORKFLOW SUMMARY                   │${NC}" | tee -a "$LOG_FILE"
    echo -e "${BOLD}  └─────────────────────────────────────────────────────────┘${NC}" | tee -a "$LOG_FILE"

    if [[ ! -f "$result_file" ]]; then
        echo -e "  No result file available" | tee -a "$LOG_FILE"
        return
    fi

    node -e "
        const fs = require('fs');
        const r = JSON.parse(fs.readFileSync('$result_file', 'utf-8'));

        // Phase summary
        console.log('');
        console.log('  Phase Timeline:');
        console.log('  ─────────────────────────────────────────────────');

        if (r.setup) {
            const dur = Math.round((r.setup.durationMs || 0) / 1000);
            const icon = r.setup.success ? '✓' : '✗';
            console.log('  ' + icon + ' Setup     ' + dur + 's  tasks: ' + (r.setup.taskIds?.length || 0) + (r.setup.error ? '  ERROR: ' + r.setup.error : ''));
        }

        if (r.build) {
            const dur = Math.round((r.build.durationMs || 0) / 1000);
            const icon = r.build.success ? '✓' : '✗';
            console.log('  ' + icon + ' Build     ' + dur + 's  cycles: ' + (r.build.cyclesCompleted || 0) +
                ', tasks: ' + (r.build.tasksCompleted || 0) + '/' + ((r.build.tasksCompleted || 0) + (r.build.tasksFailed || 0)) +
                (r.build.totalCostUsd > 0 ? '  cost: \$' + r.build.totalCostUsd.toFixed(2) : '') +
                (r.build.error ? '  ERROR: ' + r.build.error : ''));
        }

        if (r.grade) {
            const dur = Math.round((r.grade.durationMs || 0) / 1000);
            const icon = r.grade.success ? '✓' : '✗';
            console.log('  ' + icon + ' Grade     ' + dur + 's  overall: ' + (r.grade.overallScore || 0) + '/10' +
                (r.grade.error ? '  ERROR: ' + r.grade.error : ''));
        }

        const totalDur = Math.round((r.totalDurationMs || 0) / 1000);
        console.log('  ─────────────────────────────────────────────────');
        console.log('    Total benchmark: ' + totalDur + 's (' + Math.round(totalDur/60) + ' min)');

        // Score card
        console.log('');
        console.log('  Score Card:');
        console.log('  ─────────────────────────────────────────────────');
        const scores = {
            'Planning Quality': r.grade?.planningScore || 0,
            'Code Quality':     r.grade?.codeScore || 0,
            'NERV Operations':  r.grade?.nervOpsScore || 0,
        };
        for (const [name, score] of Object.entries(scores)) {
            const bar = '█'.repeat(Math.round(score)) + '░'.repeat(10 - Math.round(score));
            const status = score >= $TARGET_SCORE ? '✓' : '✗';
            console.log('  ' + status + ' ' + name.padEnd(20) + bar + ' ' + score + '/10');
        }
        const overall = r.grade?.overallScore || 0;
        const obar = '█'.repeat(Math.round(overall)) + '░'.repeat(10 - Math.round(overall));
        const ostatus = overall >= $TARGET_SCORE ? '✓' : '✗';
        console.log('  ─────────────────────────────────────────────────');
        console.log('  ' + ostatus + ' ' + 'OVERALL'.padEnd(20) + obar + ' ' + overall + '/10  (target: $TARGET_SCORE)');

        // Workflow quality indicators
        console.log('');
        console.log('  Workflow Indicators:');
        console.log('  ─────────────────────────────────────────────────');

        const checks = [
            ['Project created',     r.setup?.success === true],
            ['Cycle management',    (r.build?.cyclesCompleted || 0) >= 1],
            ['Task execution',      (r.build?.tasksCompleted || 0) >= 1],
            ['No task failures',    (r.build?.tasksFailed || 0) === 0],
            ['Grading completed',   r.grade?.success === true],
            ['Multi-cycle',         (r.build?.cyclesCompleted || 0) >= 2],
            ['Build success',       r.build?.success === true],
        ];

        for (const [label, ok] of checks) {
            console.log('  ' + (ok ? '✓' : '✗') + ' ' + label);
        }

        console.log('');
    " 2>/dev/null | tee -a "$LOG_FILE"
}

# ============================================================================
# Helper: Update summary JSON
# ============================================================================

update_summary() {
    local iteration="$1"
    local result_file="$2"
    local video_path="$3"
    local artifacts_ok="$4"
    local iter_duration="$5"

    node -e "
        const fs = require('fs');
        const summary = JSON.parse(fs.readFileSync('$SUMMARY_FILE', 'utf-8'));
        let result = {};
        try { result = JSON.parse(fs.readFileSync('$result_file', 'utf-8')); } catch {}

        summary.iterations.push({
            iteration: $iteration,
            timestamp: new Date().toISOString(),
            durationSec: $iter_duration,
            scores: {
                planning: result.grade?.planningScore || 0,
                code: result.grade?.codeScore || 0,
                nervOps: result.grade?.nervOpsScore || 0,
                overall: result.grade?.overallScore || 0,
            },
            build: {
                success: result.build?.success || false,
                cyclesCompleted: result.build?.cyclesCompleted || 0,
                tasksCompleted: result.build?.tasksCompleted || 0,
                tasksFailed: result.build?.tasksFailed || 0,
            },
            artifacts: {
                resultJson: !!result.grade,
                eventLog: fs.existsSync('${result_file}'.replace('result.json', 'event-log.jsonl')),
                video: '$video_path' !== '',
                artifactsOk: '$artifacts_ok' === 'true',
            },
        });

        summary.lastUpdate = new Date().toISOString();
        summary.totalIterations = summary.iterations.length;
        summary.bestOverall = Math.max(...summary.iterations.map(i => i.scores.overall));

        fs.writeFileSync('$SUMMARY_FILE', JSON.stringify(summary, null, 2));
    " 2>/dev/null || warn "Failed to update summary JSON"
}

# ============================================================================
# Main Loop
# ============================================================================

ITERATION=0
BEST_OVERALL=0
START_TIME=$(date +%s)

while [[ $ITERATION -lt $MAX_ITERS ]]; do
    ITERATION=$((ITERATION + 1))
    ITER_START=$(date +%s)

    echo ""
    echo -e "${BOLD}==================== ITERATION $ITERATION / $MAX_ITERS ====================${NC}" | tee -a "$LOG_FILE"
    echo ""

    # ------------------------------------------------------------------
    # Phase 1: Run UI Benchmark in Docker
    # ------------------------------------------------------------------
    phase "UI Benchmark (Docker)"

    TIMESTAMP=$(date +%Y%m%d%H%M%S)
    OUTPUT_DIR="$PROJECT_ROOT/test-results/ui-benchmark/iter-$ITERATION-$TIMESTAMP"
    mkdir -p "$OUTPUT_DIR"

    # Environment variables for the Docker container
    ENV_VARS="-e NERV_MOCK_CLAUDE=${NERV_MOCK_CLAUDE:-true}"
    ENV_VARS="$ENV_VARS -e NERV_TEST_MODE=true"
    ENV_VARS="$ENV_VARS -e NODE_ENV=test"

    if [[ "$RECORD_VIDEO" == "true" ]]; then
        ENV_VARS="$ENV_VARS -e NERV_RECORD_ALL=true -e NERV_RECORD_VIDEO=true"
    fi

    # Always remove host build artifacts so Docker rebuilds from source
    # (out/ may be stale from a previous host build or different iteration)
    if [[ -d "$PROJECT_ROOT/out" ]]; then
        log "Removing host out/ to force Docker rebuild from source..."
        rm -rf "$PROJECT_ROOT/out"
    fi

    log "Running UI benchmark in Docker..."
    log "Output: $OUTPUT_DIR"

    # Save the Docker command for debugging
    DOCKER_CMD="docker run --rm --shm-size=2gb -v $PROJECT_ROOT:/app/host $ENV_VARS $CLAUDE_MOUNT_ARGS nerv-e2e npx playwright test --config=test/e2e/playwright.config.ts test/e2e/ui-benchmark.spec.ts --timeout=3600000"
    echo "$DOCKER_CMD" > "$OUTPUT_DIR/docker-cmd.txt"

    set +e
    docker run --rm \
        --shm-size=2gb \
        -v "$PROJECT_ROOT:/app/host" \
        $ENV_VARS \
        $CLAUDE_MOUNT_ARGS \
        nerv-e2e \
        "npx playwright test --config=test/e2e/playwright.config.ts test/e2e/ui-benchmark.spec.ts --timeout=3600000" \
        2>&1 | tee -a "$LOG_FILE" | tee "$OUTPUT_DIR/docker-output.log"
    BENCH_EXIT=$?
    set -e

    if [[ $BENCH_EXIT -ne 0 ]]; then
        warn "UI benchmark exited with code $BENCH_EXIT"
    else
        ok "UI benchmark completed successfully"
    fi

    # ------------------------------------------------------------------
    # Phase 2: Find results and verify artifacts
    # ------------------------------------------------------------------
    phase "Finding Results & Verifying Artifacts"

    # Find the latest UI benchmark result.json
    LATEST_RESULT=""
    LATEST_MTIME=0

    for result_file in "$PROJECT_ROOT"/test-results/ui-benchmark/run-*/result.json \
                       "$PROJECT_ROOT"/test-results/docker/ui-benchmark/run-*/result.json \
                       "$PROJECT_ROOT"/test-results/ui-benchmark/iter-*/result.json \
                       "$PROJECT_ROOT"/test-results/docker/*/result.json; do
        if [[ -f "$result_file" ]]; then
            MTIME=$(stat -c %Y "$result_file" 2>/dev/null || echo 0)
            if [[ $MTIME -gt $LATEST_MTIME ]]; then
                LATEST_MTIME=$MTIME
                LATEST_RESULT="$result_file"
            fi
        fi
    done

    if [[ -z "$LATEST_RESULT" ]]; then
        err "No result.json found after benchmark run."
        log "Searching for any output..."

        # Show what we do have
        echo -e "  ${DIM}Docker test-results contents:${NC}" | tee -a "$LOG_FILE"
        ls -la "$PROJECT_ROOT/test-results/docker/" 2>/dev/null | head -20 | tee -a "$LOG_FILE"
        echo -e "  ${DIM}UI benchmark contents:${NC}" | tee -a "$LOG_FILE"
        ls -la "$PROJECT_ROOT/test-results/ui-benchmark/" 2>/dev/null | head -20 | tee -a "$LOG_FILE"

        # Save docker output as the main artifact
        cp "$OUTPUT_DIR/docker-output.log" "$OUTPUT_DIR/error-log.txt" 2>/dev/null || true

        GRADES_OUTPUT="NO_RESULT"
        RESULT_DIR=""
        VIDEO_PATH=""
        ARTIFACTS_OK="false"
    else
        RESULT_DIR=$(dirname "$LATEST_RESULT")
        log "Result: $LATEST_RESULT"

        # Verify all output artifacts
        verify_artifacts "$RESULT_DIR" "$OUTPUT_DIR" "$ITERATION"
        ARTIFACTS_OK=$(cat /tmp/nerv-artifacts-ok 2>/dev/null || echo "false")

        # Find video path for summary
        VIDEO_PATH=""
        for vf in "$RESULT_DIR"/video/*.mp4 "$RESULT_DIR"/video/*.webm \
                  "$PROJECT_ROOT"/test-results/docker/recording.mp4; do
            if [[ -f "$vf" ]]; then
                vsize=$(stat -c %s "$vf" 2>/dev/null || echo 0)
                if [[ $vsize -gt 10000 ]]; then
                    VIDEO_PATH="$vf"
                    break
                fi
            fi
        done

        # Check grades
        GRADES_OUTPUT=$(check_grades "$LATEST_RESULT" "$TARGET_SCORE")
    fi

    # ------------------------------------------------------------------
    # Phase 3: Display grades
    # ------------------------------------------------------------------
    phase "Grades"

    if [[ "$GRADES_OUTPUT" == "NO_RESULT" ]]; then
        err "No grades available - benchmark didn't produce results"
    else
        echo ""
        echo -e "${BOLD}  Grade Breakdown (target: $TARGET_SCORE/10):${NC}" | tee -a "$LOG_FILE"
        echo "$GRADES_OUTPUT" | while IFS='|' read -r status rest; do
            case "$status" in
                PASS)
                    name=$(echo "$rest" | cut -d'|' -f1)
                    score=$(echo "$rest" | cut -d'|' -f2)
                    echo -e "    ${GREEN}PASS${NC}  $name: $score" | tee -a "$LOG_FILE"
                    ;;
                FAIL)
                    name=$(echo "$rest" | cut -d'|' -f1)
                    score=$(echo "$rest" | cut -d'|' -f2)
                    echo -e "    ${RED}FAIL${NC}  $name: $score" | tee -a "$LOG_FILE"
                    ;;
                LOWEST)
                    name=$(echo "$rest" | cut -d'|' -f1)
                    score=$(echo "$rest" | cut -d'|' -f2)
                    echo -e "    ${YELLOW}>>    Weakest: $name ($score)${NC}" | tee -a "$LOG_FILE"
                    ;;
                BUILD)
                    echo -e "    ${DIM}Build: $rest${NC}" | tee -a "$LOG_FILE"
                    ;;
                SETUP)
                    echo -e "    ${DIM}Setup: $rest${NC}" | tee -a "$LOG_FILE"
                    ;;
                TOTAL)
                    echo -e "    ${DIM}$rest${NC}" | tee -a "$LOG_FILE"
                    ;;
            esac
        done
        echo ""

        # Extract overall for tracking
        OVERALL=$(echo "$GRADES_OUTPUT" | grep "Overall" | head -1 | cut -d'|' -f3)
        if [[ -n "$OVERALL" ]]; then
            COMPARE=$(echo "$OVERALL > $BEST_OVERALL" | bc -l 2>/dev/null || echo 0)
            if [[ "$COMPARE" == "1" ]]; then
                BEST_OVERALL=$OVERALL
            fi
        fi
    fi

    # ------------------------------------------------------------------
    # Phase 4: Workflow Summary
    # ------------------------------------------------------------------
    phase "Workflow Summary"

    ITER_END_PARTIAL=$(date +%s)
    ITER_DURATION_PARTIAL=$((ITER_END_PARTIAL - ITER_START))

    if [[ -n "$LATEST_RESULT" && -f "$LATEST_RESULT" ]]; then
        print_workflow_summary "$LATEST_RESULT" "$ITERATION" "$ITER_DURATION_PARTIAL"
    fi

    # Update summary JSON
    update_summary "$ITERATION" "${LATEST_RESULT:-/dev/null}" "${VIDEO_PATH:-}" "${ARTIFACTS_OK:-false}" "$ITER_DURATION_PARTIAL"

    # ------------------------------------------------------------------
    # Phase 5: Check if ALL dimensions meet target
    # ------------------------------------------------------------------

    if [[ "$GRADES_OUTPUT" != "NO_RESULT" ]] && echo "$GRADES_OUTPUT" | grep -q "^ALL_PASS"; then
        echo ""
        ok "============================================================"
        ok "ALL DIMENSIONS >= $TARGET_SCORE! TARGET MET!"
        ok "============================================================"
        ok "Result:     $LATEST_RESULT"
        ok "Iterations: $ITERATION"
        ok "Summary:    $SUMMARY_FILE"

        if [[ -n "$VIDEO_PATH" ]]; then
            ok "Video:      $VIDEO_PATH"
        fi

        TOTAL_TIME=$(( $(date +%s) - START_TIME ))
        ok "Total time: ${TOTAL_TIME}s ($(( TOTAL_TIME / 60 )) min)"

        # Final full summary
        phase "Final Summary"
        echo -e "${BOLD}  Score History Across Iterations:${NC}" | tee -a "$LOG_FILE"
        node -e "
            const fs = require('fs');
            const s = JSON.parse(fs.readFileSync('$SUMMARY_FILE', 'utf-8'));
            s.iterations.forEach(i => {
                const scores = i.scores;
                console.log('  Iter ' + i.iteration + ': ' +
                    'P=' + scores.planning + ' C=' + scores.code +
                    ' N=' + scores.nervOps + ' O=' + scores.overall +
                    ' | build=' + (i.build.success ? 'OK' : 'FAIL') +
                    ' cycles=' + i.build.cyclesCompleted +
                    ' tasks=' + i.build.tasksCompleted +
                    ' | ' + i.durationSec + 's');
            });
        " 2>/dev/null | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"

        exit 0
    fi

    # ------------------------------------------------------------------
    # Phase 6: Fix iteration with Claude
    # ------------------------------------------------------------------

    LOWEST_DIM=""
    LOWEST_SCORE=""
    if [[ "$GRADES_OUTPUT" != "NO_RESULT" ]]; then
        LOWEST_LINE=$(echo "$GRADES_OUTPUT" | grep "^LOWEST" | head -1)
        LOWEST_DIM=$(echo "$LOWEST_LINE" | cut -d'|' -f2)
        LOWEST_SCORE=$(echo "$LOWEST_LINE" | cut -d'|' -f3)
    fi

    SETUP_INFO=$(echo "$GRADES_OUTPUT" | grep "^SETUP" | head -1 || echo "")
    BUILD_INFO=$(echo "$GRADES_OUTPUT" | grep "^BUILD" | head -1 || echo "")

    phase "Fix Iteration (Claude)"

    REPORT_CONTENT=""
    if [[ -n "$LATEST_RESULT" && -f "$LATEST_RESULT" ]]; then
        REPORT_CONTENT=$(cat "$LATEST_RESULT")
    fi

    # Include docker output tail for debugging context
    DOCKER_OUTPUT_TAIL=""
    if [[ -f "$OUTPUT_DIR/docker-output.log" ]]; then
        DOCKER_OUTPUT_TAIL=$(tail -80 "$OUTPUT_DIR/docker-output.log")
    fi

    # Include Electron console log if available
    ELECTRON_CONSOLE=""
    if [[ -n "$RESULT_DIR" ]]; then
        for eclog in "$RESULT_DIR/electron-console.log" "$PROJECT_ROOT"/test-results/docker/ui-benchmark/run-*/electron-console.log; do
            if [[ -f "$eclog" ]]; then
                ELECTRON_CONSOLE=$(tail -100 "$eclog")
                break
            fi
        done
    fi

    FIX_PROMPT="# NERV UI Benchmark Fix - Iteration $ITERATION

The NERV UI benchmark scored below target. ALL dimensions must reach $TARGET_SCORE/10.

## Current Scores
$(echo "$GRADES_OUTPUT" | grep -E "^(PASS|FAIL)" | while IFS='|' read -r s n v; do echo "- $n: $v/10 ($s)"; done)

## Weakest Dimension: $LOWEST_DIM ($LOWEST_SCORE/10)

## Build Status
$BUILD_INFO
$SETUP_INFO

## Docker Test Output (last 80 lines)
\`\`\`
$DOCKER_OUTPUT_TAIL
\`\`\`

## Electron Console Log (NERV internal logs)
\`\`\`
$ELECTRON_CONSOLE
\`\`\`

## Result JSON
\`\`\`json
$REPORT_CONTENT
\`\`\`

## What to Fix

The UI benchmark drives the real NERV Electron app with Playwright:
1. Phase 1 (Setup): Creates project, adds repo, starts cycle 0, creates tasks
2. Phase 2 (Build): Clicks tasks, starts Claude sessions, waits for completion
3. Phase 3 (Grade): Scores planning, code quality, NERV ops

### If Setup failed:
- Check \`test/e2e/helpers/actions.ts\` - project creation UI flow
- Check \`test/e2e/helpers/ui-benchmark.ts\` - startCycle0(), createInitialTasks()
- Check selectors in \`test/e2e/helpers/selectors.ts\` match actual UI
- Verify \`src/renderer/\` components have correct data-testid attributes

### If Build failed or tasks not completing:
- Check \`test/e2e/helpers/ui-benchmark.ts\` - executeTask() polling loop
- Check permission auto-approval in checkAndApprovePermissions()
- Check the mock Claude scenario handles the benchmark flow
- Ensure TaskBoard.svelte has data-task-id attributes on task cards

### If Scores are low:
- Planning score: Needs cycles >= 3 (4pts), tasks >= 3 (3pts), no failures (3pts)
- Code score: Currently hardcoded to 7 if build.success - needs real grading
- NERV Ops score: Needs cycles >= 2 (4pts), tasks >= 3 (3pts), build.success (3pts)

## Key Files
- \`test/e2e/ui-benchmark.spec.ts\` - Main Playwright test
- \`test/e2e/helpers/ui-benchmark.ts\` - UIBenchmarkRunner class (~660 lines)
- \`test/e2e/helpers/actions.ts\` - UI interaction helpers
- \`test/e2e/helpers/selectors.ts\` - Element selectors
- \`test/e2e/helpers/launch.ts\` - App launch utilities
- \`src/renderer/src/components/TaskBoard.svelte\` - Task board UI
- \`src/renderer/src/components/CyclePanel.svelte\` - Cycle management UI
- \`src/renderer/src/components/ActionBar.svelte\` - Task action buttons

## Rules
- Fix ONE issue per iteration. The loop continues automatically.
- Run \`npm run typecheck\` and \`npx vitest run\` to verify.
- Focus on making the Playwright test pass end-to-end.
- Do NOT create .ralph-complete or marker files.
- Commit your changes with a descriptive message.
"

    log "Spawning Claude to fix: $LOWEST_DIM ($LOWEST_SCORE)..."

    set +e
    cd "$PROJECT_ROOT"

    if command -v claude &> /dev/null; then
        claude --model opus \
            --print \
            --dangerously-skip-permissions \
            --max-budget-usd "$FIX_BUDGET" \
            "$FIX_PROMPT" \
            2>&1 | tee -a "$LOG_FILE"
        FIX_EXIT=$?
    else
        warn "Claude CLI not available, skipping fix iteration"
        warn "Install with: npm install -g @anthropic-ai/claude-code"
        FIX_EXIT=1
    fi
    set -e

    if [[ $FIX_EXIT -ne 0 ]]; then
        warn "Fix session exited with code $FIX_EXIT"
    fi

    # Verify fix
    phase "Post-Fix Verification"

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
    log "Iteration $ITERATION complete: ${ITER_DURATION}s (total: ${TOTAL_ELAPSED}s, best: $BEST_OVERALL)"

    sleep 3
done

# ============================================================================
# Max iterations reached
# ============================================================================

echo ""
err "============================================================"
err "MAX ITERATIONS ($MAX_ITERS) REACHED - TARGET NOT MET"
err "============================================================"
err "Best overall score: $BEST_OVERALL"
TOTAL_TIME=$(( $(date +%s) - START_TIME ))
err "Total time: ${TOTAL_TIME}s ($(( TOTAL_TIME / 60 )) min)"
echo ""

# Print score history
echo -e "${BOLD}Score History:${NC}" | tee -a "$LOG_FILE"
node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$SUMMARY_FILE', 'utf-8'));
    s.iterations.forEach(i => {
        const scores = i.scores;
        console.log('  Iter ' + i.iteration + ': ' +
            'P=' + scores.planning + ' C=' + scores.code +
            ' N=' + scores.nervOps + ' O=' + scores.overall +
            ' | build=' + (i.build.success ? 'OK' : 'FAIL') +
            ' | artifacts=' + (i.artifacts.artifactsOk ? 'OK' : 'INCOMPLETE') +
            ' | ' + i.durationSec + 's');
    });
" 2>/dev/null | tee -a "$LOG_FILE"
echo ""
err "Summary: $SUMMARY_FILE"
err "Log: $LOG_FILE"

exit 1
