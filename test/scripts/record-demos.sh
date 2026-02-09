#!/bin/bash
# NERV Demo Video Recorder
#
# Records professional demo videos using Playwright in Docker.
# Outputs .webm videos to docs-site/public/demos/ for VitePress embedding.
# Optionally generates .gif versions for README embedding.
#
# Usage:
#   ./test/scripts/record-demos.sh                 # Record all demos
#   ./test/scripts/record-demos.sh --demo quick-start  # Record specific demo
#   ./test/scripts/record-demos.sh --gif           # Also generate GIF versions
#   ./test/scripts/record-demos.sh --rebuild       # Rebuild Docker image first

set -e

# Defaults
DEMO_NAME=""
GENERATE_GIF=false
REBUILD_IMAGE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --demo|-d)
            DEMO_NAME="$2"
            shift 2
            ;;
        --gif|-g)
            GENERATE_GIF=true
            shift
            ;;
        --rebuild)
            REBUILD_IMAGE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --demo NAME    Record specific demo: quick-start, yolo-mode, multi-repo"
            echo "  --gif, -g      Also generate GIF versions for README"
            echo "  --rebuild      Force rebuild Docker image"
            echo "  --help, -h     Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Convert to Windows path if running in Git Bash/MINGW
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
    PROJECT_ROOT="$(cygpath -m "$PROJECT_ROOT")"
fi

DEMOS_DIR="$PROJECT_ROOT/docs-site/public/demos"

echo ""
echo "============================================================"
echo "   NERV Demo Video Recorder"
echo "============================================================"
echo ""

# Ensure output directory exists
mkdir -p "$DEMOS_DIR"

# Rebuild image if requested
if [[ "$REBUILD_IMAGE" == "true" ]]; then
    echo "[BUILD] Rebuilding Docker image..."
    docker build -t nerv-e2e -f "$PROJECT_ROOT/test/Dockerfile" "$PROJECT_ROOT"
    echo ""
fi

# Build the test grep filter
if [[ -n "$DEMO_NAME" ]]; then
    GREP_FILTER="--grep demo_${DEMO_NAME//-/_}"
    echo "[CONFIG] Recording: $DEMO_NAME"
else
    GREP_FILTER="--grep demo_"
    echo "[CONFIG] Recording: ALL demos"
fi

echo "[CONFIG] Output: $DEMOS_DIR"
echo "[CONFIG] GIF generation: $GENERATE_GIF"
echo ""

# Build the app first (needed for demo recording)
echo "[BUILD] Building NERV app..."
docker run --rm \
    --shm-size=2gb \
    -v "$PROJECT_ROOT:/app/host" \
    -e NERV_TEST_MODE=true \
    -e NERV_MOCK_CLAUDE=true \
    nerv-e2e \
    "npm run build" 2>&1 | tail -5
echo ""

# Run demo recordings in Docker
echo "[RECORD] Starting demo recordings..."
echo ""

docker run --rm \
    --shm-size=2gb \
    -v "$PROJECT_ROOT:/app/host" \
    -e NERV_TEST_MODE=true \
    -e NERV_MOCK_CLAUDE=true \
    -e MOCK_CLAUDE_SCENARIO=benchmark \
    -e NERV_RECORD_ALL=true \
    nerv-e2e \
    "npx playwright test --config=test/e2e/playwright.config.ts test/e2e/docs-demos.spec.ts $GREP_FILTER --timeout=120000" 2>&1

RECORD_EXIT=$?

if [[ $RECORD_EXIT -ne 0 ]]; then
    echo ""
    echo "[WARN] Some demo recordings may have failed (exit code $RECORD_EXIT)"
    echo "[WARN] Check test-results/demos/ for partial output"
fi

# Copy recorded videos to docs-site/public/demos/
echo ""
echo "[COPY] Moving videos to docs-site/public/demos/..."

for video in "$PROJECT_ROOT/test-results/docker/demos/"*.webm "$PROJECT_ROOT/test-results/demos/"*.webm; do
    if [[ -f "$video" ]]; then
        basename=$(basename "$video")
        cp "$video" "$DEMOS_DIR/$basename"
        echo "  -> $basename"
    fi
done

# Generate GIF versions if requested
if [[ "$GENERATE_GIF" == "true" ]]; then
    echo ""
    echo "[GIF] Generating GIF versions..."

    # Check if ffmpeg is available
    if command -v ffmpeg &> /dev/null; then
        for video in "$DEMOS_DIR/"*.webm; do
            if [[ -f "$video" ]]; then
                basename=$(basename "$video" .webm)
                echo "  Converting $basename.webm -> $basename.gif..."

                # Two-pass GIF generation for optimal quality
                # Pass 1: Generate palette
                ffmpeg -y -i "$video" \
                    -vf "fps=10,scale=640:-1:flags=lanczos,palettegen=stats_mode=diff" \
                    -t 15 \
                    "/tmp/palette_${basename}.png" 2>/dev/null

                # Pass 2: Generate GIF with palette
                ffmpeg -y -i "$video" -i "/tmp/palette_${basename}.png" \
                    -lavfi "fps=10,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3" \
                    -t 15 \
                    "$DEMOS_DIR/$basename.gif" 2>/dev/null

                rm -f "/tmp/palette_${basename}.png"
                echo "  -> $basename.gif"
            fi
        done
    else
        echo "  [SKIP] ffmpeg not found — install it for GIF generation"
        echo "  Tip: Run inside Docker or install locally: apt install ffmpeg"
    fi
fi

# Also convert to mp4 for broader browser support
echo ""
echo "[MP4] Converting to MP4 for browser compatibility..."

if command -v ffmpeg &> /dev/null; then
    for video in "$DEMOS_DIR/"*.webm; do
        if [[ -f "$video" ]]; then
            basename=$(basename "$video" .webm)
            ffmpeg -y -i "$video" \
                -c:v libx264 -preset medium -crf 23 \
                -c:a aac -b:a 128k \
                -movflags +faststart \
                "$DEMOS_DIR/$basename.mp4" 2>/dev/null
            echo "  -> $basename.mp4"
        fi
    done
else
    echo "  [SKIP] ffmpeg not found — install for MP4 conversion"
fi

echo ""
echo "============================================================"
echo "   Demo Recording Complete"
echo "============================================================"
echo ""
echo "Files in $DEMOS_DIR:"
ls -lh "$DEMOS_DIR/" 2>/dev/null || echo "  (empty)"
echo ""
echo "To preview: open docs-site/public/demos/ in a browser"
echo "To deploy: commit and push — GitHub Pages will pick them up"
echo ""
