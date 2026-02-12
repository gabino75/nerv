#!/bin/bash
# NERV E2E Test Docker Entrypoint
#
# Environment variables:
#   NERV_MOCK_CLAUDE   - Use mock Claude (default: true)
#   NERV_RECORD_VIDEO  - Record screen to video file (default: false)
#   NERV_SLOW_MODE     - Add delays for observation (default: false)
#
# Output:
#   /app/host/test-results/docker/test-output.log  - Structured test log
#   /app/host/test-results/docker/recording.mp4    - Screen recording (if enabled)

set -e

# ============================================================
# Configuration
# ============================================================
RECORD_VIDEO="${NERV_RECORD_VIDEO:-false}"
VIDEO_FILE="/app/test-results/recording.mp4"

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

log_section() {
    echo ""
    echo "================================================================"
    echo "  $1"
    echo "================================================================"
}

# ============================================================
# Header
# ============================================================
log_section "NERV E2E Tests (Docker)"
log "Mock Claude: ${NERV_MOCK_CLAUDE:-true}"
log "Record Video: ${RECORD_VIDEO}"
log "Slow Mode: ${NERV_SLOW_MODE:-false}"

# Show Claude auth status when using real Claude
if [ "${NERV_MOCK_CLAUDE:-true}" = "false" ]; then
    log "Claude Auth Status:"
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        log "  - ANTHROPIC_API_KEY: Set"
    fi
    if [ -d "/root/.claude" ] && [ "$(ls -A /root/.claude 2>/dev/null)" ]; then
        log "  - ~/.claude: Mounted (Claude CLI auth)"
    fi
    if [ -d "/root/.anthropic" ] && [ "$(ls -A /root/.anthropic 2>/dev/null)" ]; then
        log "  - ~/.anthropic: Mounted (API credentials)"
    fi
fi

# ============================================================
# Sync files from mounted host
# ============================================================
log_section "Syncing Files"

if [ ! -d "/app/host" ]; then
    log "ERROR: No host mount at /app/host"
    log "Run with: -v \$(pwd):/app/host"
    exit 1
fi

# Remove and copy directories
rm -rf /app/src /app/test /app/resources /app/scripts /app/cmd /app/specs

for dir in src test resources scripts cmd specs; do
    if [ -d "/app/host/$dir" ]; then
        cp -r "/app/host/$dir" "/app/$dir"
        log "Synced $dir/"
    fi
done

# Fix potential Windows line endings in CSS files (can cause postcss issues)
find /app/src -name "*.css" -type f -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
find /app/src -name "*.svelte" -type f -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
find /app/src -name "*.ts" -type f -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
log "Fixed line endings"

# Copy config files (including package.json for updated scripts)
for file in package.json README.md ARCHITECTURE.md CLAUDE.md tsconfig.json tsconfig.node.json tsconfig.web.json tsconfig.cli.json electron.vite.config.ts svelte.config.js postcss.config.js eslint.config.js .jscpd.json; do
    if [ -f "/app/host/$file" ]; then
        cp "/app/host/$file" /app/
        log "Synced $file"
    else
        log "WARNING: $file not found in host"
    fi
done

mkdir -p /app/host/test-results/docker
log "Sync complete"

# ============================================================
# Initialize Test Fixtures as Git Repos
# ============================================================
log_section "Initializing Test Fixtures"

# Always reinitialize git repos — host .git dirs have Windows paths and stale worktree refs
init_fixture_git() {
    local fixture_path="$1"
    if [ -d "$fixture_path" ]; then
        # Remove stale .git dir (may have Windows paths from host)
        if [ -d "$fixture_path/.git" ]; then
            rm -rf "$fixture_path/.git"
            log "Removed stale .git from $fixture_path"
        fi
        # Remove stale worktree directories (created by previous runs with Windows paths)
        local worktrees_dir="${fixture_path}-worktrees"
        if [ -d "$worktrees_dir" ]; then
            rm -rf "$worktrees_dir"
            log "Removed stale worktrees dir: $worktrees_dir"
        fi
        log "Initializing git repo in $fixture_path"
        cd "$fixture_path"
        git init -b main
        git config user.email "test@nerv.local"
        git config user.name "NERV Test"
        git add .
        git commit -m "Initial commit for E2E tests"
        cd /app
        log "Git repo initialized: $fixture_path"
    fi
}

# Initialize simple-node-app fixture
init_fixture_git "/app/test/fixtures/simple-node-app"

# Initialize multi-repo benchmark fixtures
init_fixture_git "/app/test/fixtures/nerv-todo-benchmark/todo-shared"
init_fixture_git "/app/test/fixtures/nerv-todo-benchmark/todo-backend"
init_fixture_git "/app/test/fixtures/nerv-todo-benchmark/todo-frontend"

# Initialize yolo-benchmark-project fixture
init_fixture_git "/app/test/fixtures/yolo-benchmark-project"

# ============================================================
# Build
# ============================================================
log_section "Building App"

# Try to use pre-built artifacts from host first (avoids Tailwind Docker issues)
if [ -d "/app/host/out/renderer" ] && [ -d "/app/host/out/main" ] && [ -d "/app/host/out/preload" ]; then
    log "Using pre-built artifacts from host..."
    rm -rf /app/out
    cp -r /app/host/out /app/out
    log "Build complete (using host artifacts)"
elif ! npm run build > /tmp/build.log 2>&1; then
    log "ERROR: Build failed"
    cat /tmp/build.log
    cp /tmp/build.log /app/host/test-results/docker/
    exit 1
else
    log "Build complete"
fi

# ============================================================
# Setup Display (Xvfb)
# ============================================================
log_section "Setting Up Display"

# Always use Xvfb for recording consistency
log "Starting Xvfb on :99..."
Xvfb :99 -screen 0 1920x1080x24 &
XVFB_PID=$!
sleep 2

if ! kill -0 $XVFB_PID 2>/dev/null; then
    log "ERROR: Xvfb failed to start"
    exit 1
fi
export DISPLAY=:99
log "Display ready"

# ============================================================
# Start Video Recording (if enabled)
# ============================================================
FFMPEG_PID=""

if [ "$RECORD_VIDEO" = "true" ]; then
    log_section "Starting Video Recording"

    # Record X11 display to MP4 (H.264 - Windows Media Player compatible)
    ffmpeg -y -f x11grab -video_size 1920x1080 -framerate 10 -i :99 \
        -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
        "$VIDEO_FILE" > /tmp/ffmpeg.log 2>&1 &
    FFMPEG_PID=$!
    sleep 1

    if kill -0 $FFMPEG_PID 2>/dev/null; then
        log "Recording to: $VIDEO_FILE"
    else
        log "WARNING: ffmpeg failed to start"
        cat /tmp/ffmpeg.log
        FFMPEG_PID=""
    fi
fi

# ============================================================
# Electron Warmup
# ============================================================
log "Warming up Electron..."
timeout 30 npx electron --no-sandbox --disable-gpu -e "setTimeout(() => process.exit(0), 2000)" 2>/dev/null || true

# ============================================================
# Run Tests
# ============================================================
log_section "Running Tests"

mkdir -p /app/test-results
TEST_LOG="/tmp/test-output.log"

# Run tests, capture output
# Use bash -c because the command may be passed as a single string with spaces
set +e
if [ $# -eq 1 ]; then
    # Single argument - likely a command string like "npm run test:e2e:local"
    bash -c "$1" 2>&1 | tee "$TEST_LOG"
else
    # Multiple arguments - pass directly
    "$@" 2>&1 | tee "$TEST_LOG"
fi
TEST_EXIT=${PIPESTATUS[0]}
set -e

# ============================================================
# Stop Recording
# ============================================================
if [ -n "$FFMPEG_PID" ] && kill -0 $FFMPEG_PID 2>/dev/null; then
    log "Stopping video recording..."
    kill -INT $FFMPEG_PID 2>/dev/null || true
    sleep 2
    kill -9 $FFMPEG_PID 2>/dev/null || true
fi

# ============================================================
# Copy Results to Host
# ============================================================
log_section "Saving Results"

cp -r /app/test-results/* /app/host/test-results/docker/ 2>/dev/null || true
cp "$TEST_LOG" /app/host/test-results/docker/test-output.log

# Copy demo videos to docs-site on host (when recording demos)
if [ -d "/app/docs-site/public/demos" ] && ls /app/docs-site/public/demos/*.webm >/dev/null 2>&1; then
    mkdir -p /app/host/docs-site/public/demos
    cp /app/docs-site/public/demos/*.webm /app/host/docs-site/public/demos/
    log "Demos: docs-site/public/demos/"
fi

if [ -f "$VIDEO_FILE" ]; then
    cp "$VIDEO_FILE" /app/host/test-results/docker/
    log "Video: test-results/docker/recording.mp4"
fi

log "Log: test-results/docker/test-output.log"

# ============================================================
# Summary
# ============================================================
log_section "Complete"

if [ $TEST_EXIT -eq 0 ]; then
    log "RESULT: PASSED"
else
    log "RESULT: FAILED (exit code: $TEST_EXIT)"
fi

exit $TEST_EXIT
