#!/bin/bash
# NERV Demo Post-Processing Script
#
# Polishes raw Playwright recordings into professional demo videos:
#   1. Detects "frozen" segments (no UI changes for >2s) and speeds them up 2-4x
#   2. Adds text overlays from sidecar .captions files (ffmpeg drawtext)
#   3. Normalizes to consistent 1280x720 @ 30fps VP9/webm
#   4. Outputs polished files to docs-site/public/demos/
#
# Usage:
#   ./test/scripts/process-demos.sh                        # Process all demos
#   ./test/scripts/process-demos.sh --demo quick-start     # Process single demo
#   ./test/scripts/process-demos.sh --speed 3              # Custom speedup factor
#   ./test/scripts/process-demos.sh --no-speed             # Skip speed processing
#   ./test/scripts/process-demos.sh --no-captions          # Skip caption overlays
#   ./test/scripts/process-demos.sh --dry-run              # Show what would happen
#
# Caption files:
#   Place a .captions file next to the .webm with the same base name:
#     docs-site/public/demos/quick-start.captions
#   Format (one line per caption):
#     START_SEC END_SEC POSITION TEXT
#   Example:
#     0.0 3.0 bottom Welcome to NERV
#     5.0 8.0 top Creating your first project
#     12.5 15.0 center Watch Claude work!
#   Positions: top, center, bottom

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────

DEMO_NAME=""
SPEED_FACTOR=3           # Speed multiplier for frozen segments
FREEZE_THRESHOLD=2.0     # Seconds of no change before speeding up
FREEZE_NOISE=0.003       # Pixel noise tolerance for freeze detection
TARGET_WIDTH=1280
TARGET_HEIGHT=720
TARGET_FPS=30
SKIP_SPEED=false
SKIP_CAPTIONS=false
DRY_RUN=false

# ─── Argument parsing ────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case $1 in
        --demo|-d)
            DEMO_NAME="$2"
            shift 2
            ;;
        --speed|-s)
            SPEED_FACTOR="$2"
            shift 2
            ;;
        --no-speed)
            SKIP_SPEED=true
            shift
            ;;
        --no-captions)
            SKIP_CAPTIONS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --demo NAME       Process specific demo (e.g., quick-start)"
            echo "  --speed N         Speedup factor for frozen segments (default: 3)"
            echo "  --no-speed        Skip freeze detection / speedup"
            echo "  --no-captions     Skip caption overlay"
            echo "  --dry-run         Show commands without executing"
            echo "  --help, -h        Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─── Paths ───────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEMOS_DIR="$PROJECT_ROOT/docs-site/public/demos"
WORK_DIR="$PROJECT_ROOT/test-results/demo-processing"

# ─── Preflight ───────────────────────────────────────────────────────────────

if ! command -v ffmpeg &>/dev/null; then
    echo "ERROR: ffmpeg not found. Install it or run inside Docker."
    echo "  apt install ffmpeg    # Linux"
    echo "  brew install ffmpeg   # macOS"
    exit 1
fi

if ! command -v ffprobe &>/dev/null; then
    echo "ERROR: ffprobe not found (usually bundled with ffmpeg)."
    exit 1
fi

echo ""
echo "============================================================"
echo "   NERV Demo Post-Processor"
echo "============================================================"
echo ""

mkdir -p "$WORK_DIR"

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Get video duration in seconds
get_duration() {
    ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$1"
}

# Detect frozen segments — returns list of "start,end" pairs
detect_freezes() {
    local input="$1"
    local threshold="$FREEZE_THRESHOLD"
    local noise="$FREEZE_NOISE"

    ffmpeg -i "$input" \
        -vf "freezedetect=n=${noise}:d=${threshold}" \
        -f null - 2>&1 \
    | grep -E "freeze_(start|end)" \
    | awk '
        /freeze_start/ { start = $NF; gsub(/.*freeze_start: /, "", start) }
        /freeze_end/   { end = $NF; gsub(/.*freeze_end: /, "", end); print start "," end }
    '
}

# Build ffmpeg filter for speeding up frozen segments
# Strategy: split video into segments, speed up frozen ones, concat
build_speed_filter() {
    local input="$1"
    local output="$2"
    local freezes="$3"
    local duration
    duration=$(get_duration "$input")

    if [[ -z "$freezes" ]]; then
        echo "    No frozen segments detected — copying as-is"
        if [[ "$DRY_RUN" == "false" ]]; then
            cp "$input" "$output"
        fi
        return 0
    fi

    # Build a complex filtergraph that:
    # - Passes normal segments at 1x
    # - Passes frozen segments at Nx speed
    # We use the select+setpts+asetpts approach with trim filters

    local segments=()
    local prev_end=0
    local seg_idx=0
    local filter=""
    local concat_inputs=""

    while IFS=',' read -r start end; do
        # Normal segment before this freeze
        if (( $(echo "$start > $prev_end" | bc -l) )); then
            filter+="[0:v]trim=start=${prev_end}:end=${start},setpts=PTS-STARTPTS[v${seg_idx}];"
            concat_inputs+="[v${seg_idx}]"
            seg_idx=$((seg_idx + 1))
        fi

        # Frozen segment — speed up
        local pts_factor
        pts_factor=$(echo "scale=4; 1.0 / $SPEED_FACTOR" | bc -l)
        filter+="[0:v]trim=start=${start}:end=${end},setpts=${pts_factor}*(PTS-STARTPTS)[v${seg_idx}];"
        concat_inputs+="[v${seg_idx}]"
        seg_idx=$((seg_idx + 1))

        prev_end="$end"
    done <<< "$freezes"

    # Final normal segment after last freeze
    if (( $(echo "$prev_end < $duration" | bc -l) )); then
        filter+="[0:v]trim=start=${prev_end},setpts=PTS-STARTPTS[v${seg_idx}];"
        concat_inputs+="[v${seg_idx}]"
        seg_idx=$((seg_idx + 1))
    fi

    # Concat all segments
    filter+="${concat_inputs}concat=n=${seg_idx}:v=1:a=0[outv]"

    local freeze_count
    freeze_count=$(echo "$freezes" | wc -l)
    echo "    Speeding up $freeze_count frozen segment(s) at ${SPEED_FACTOR}x"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "    [dry-run] ffmpeg -i $input -filter_complex '...' $output"
        return 0
    fi

    ffmpeg -y -i "$input" \
        -filter_complex "$filter" \
        -map "[outv]" \
        -c:v libvpx-vp9 -crf 30 -b:v 2M \
        -r "$TARGET_FPS" \
        "$output" 2>/dev/null

    local orig_dur new_dur savings
    orig_dur=$(get_duration "$input")
    new_dur=$(get_duration "$output")
    savings=$(echo "scale=1; (1 - $new_dur / $orig_dur) * 100" | bc -l)
    echo "    Duration: ${orig_dur}s → ${new_dur}s (${savings}% shorter)"
}

# Build drawtext filter chain from .captions file
build_caption_filter() {
    local captions_file="$1"
    local filter=""
    local first=true

    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" == \#* ]] && continue

        local start end position text
        start=$(echo "$line" | awk '{print $1}')
        end=$(echo "$line" | awk '{print $2}')
        position=$(echo "$line" | awk '{print $3}')
        text=$(echo "$line" | awk '{$1=$2=$3=""; print}' | sed 's/^ *//')

        # Escape special characters for ffmpeg drawtext
        text=$(echo "$text" | sed "s/'/\\\\'/g" | sed 's/:/\\:/g')

        # Position mapping
        local y_expr
        case "$position" in
            top)    y_expr="h*0.08" ;;
            center) y_expr="(h-text_h)/2" ;;
            bottom) y_expr="h*0.85" ;;
            *)      y_expr="h*0.85" ;;  # default to bottom
        esac

        # Alpha fade: 0.3s fade in, hold, 0.3s fade out
        local fade_in fade_out
        fade_in=$(echo "$start + 0.3" | bc -l)
        fade_out=$(echo "$end - 0.3" | bc -l)

        local alpha="if(lt(t\\,$start)\\,0\\, if(lt(t\\,$fade_in)\\, (t-$start)/0.3\\, if(lt(t\\,$fade_out)\\,1\\, if(lt(t\\,$end)\\, 1-(t-$fade_out)/0.3\\, 0))))"

        if [[ "$first" == "true" ]]; then
            first=false
        else
            filter+=","
        fi

        filter+="drawtext=text='${text}'"
        filter+=":fontsize=28"
        filter+=":fontcolor=white"
        filter+=":borderw=2"
        filter+=":bordercolor=black"
        filter+=":x=(w-text_w)/2"
        filter+=":y=${y_expr}"
        filter+=":alpha='${alpha}'"
        filter+=":enable='between(t\\,${start}\\,${end})'"

    done < "$captions_file"

    echo "$filter"
}

# ─── Main processing loop ───────────────────────────────────────────────────

process_demo() {
    local input="$1"
    local basename
    basename=$(basename "$input" .webm)

    echo "  Processing: $basename"

    local current="$input"
    local step=0

    # Step 1: Speed up frozen segments
    if [[ "$SKIP_SPEED" == "false" ]]; then
        echo "  [1/3] Detecting frozen segments..."
        local freezes
        freezes=$(detect_freezes "$current")

        local sped_up="$WORK_DIR/${basename}_speed.webm"
        build_speed_filter "$current" "$sped_up" "$freezes"

        if [[ -f "$sped_up" ]]; then
            current="$sped_up"
        fi
    else
        echo "  [1/3] Speed processing: skipped"
    fi

    # Step 2: Add caption overlays
    local captions_file="$DEMOS_DIR/${basename}.captions"
    if [[ "$SKIP_CAPTIONS" == "false" && -f "$captions_file" ]]; then
        echo "  [2/3] Adding caption overlays..."
        local caption_filter
        caption_filter=$(build_caption_filter "$captions_file")

        if [[ -n "$caption_filter" ]]; then
            local captioned="$WORK_DIR/${basename}_captions.webm"
            local caption_count
            caption_count=$(grep -cE '^[0-9]' "$captions_file" || true)
            echo "    Found $caption_count caption(s)"

            if [[ "$DRY_RUN" == "false" ]]; then
                ffmpeg -y -i "$current" \
                    -vf "$caption_filter" \
                    -c:v libvpx-vp9 -crf 30 -b:v 2M \
                    -r "$TARGET_FPS" \
                    "$captioned" 2>/dev/null
                current="$captioned"
            else
                echo "    [dry-run] Would apply drawtext filters"
            fi
        fi
    elif [[ "$SKIP_CAPTIONS" == "false" ]]; then
        echo "  [2/3] No .captions file found — skipping overlays"
    else
        echo "  [2/3] Caption overlays: skipped"
    fi

    # Step 3: Normalize resolution/framerate/codec
    echo "  [3/3] Normalizing to ${TARGET_WIDTH}x${TARGET_HEIGHT} @ ${TARGET_FPS}fps..."
    local output="$WORK_DIR/${basename}_final.webm"

    if [[ "$DRY_RUN" == "false" ]]; then
        ffmpeg -y -i "$current" \
            -vf "scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black" \
            -c:v libvpx-vp9 -crf 30 -b:v 2M \
            -r "$TARGET_FPS" \
            -an \
            "$output" 2>/dev/null

        # Copy final output to demos directory
        cp "$output" "$DEMOS_DIR/${basename}.webm"

        local final_size
        final_size=$(du -h "$DEMOS_DIR/${basename}.webm" | cut -f1)
        local final_dur
        final_dur=$(get_duration "$DEMOS_DIR/${basename}.webm")
        echo "    Output: ${basename}.webm (${final_size}, ${final_dur}s)"
    else
        echo "    [dry-run] Would write to $DEMOS_DIR/${basename}.webm"
    fi

    echo ""
}

# ─── Run ─────────────────────────────────────────────────────────────────────

processed=0

if [[ -n "$DEMO_NAME" ]]; then
    # Single demo
    input="$DEMOS_DIR/${DEMO_NAME}.webm"
    if [[ ! -f "$input" ]]; then
        echo "ERROR: Demo not found: $input"
        echo "Available demos:"
        ls "$DEMOS_DIR/"*.webm 2>/dev/null | while read -r f; do
            echo "  $(basename "$f" .webm)"
        done
        exit 1
    fi
    process_demo "$input"
    processed=1
else
    # All demos
    for input in "$DEMOS_DIR/"*.webm; do
        [[ -f "$input" ]] || continue
        process_demo "$input"
        processed=$((processed + 1))
    done
fi

# ─── Cleanup ─────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "false" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
fi

echo "============================================================"
echo "   Post-Processing Complete ($processed demo(s))"
echo "============================================================"
echo ""
echo "Output directory: $DEMOS_DIR"
if [[ "$DRY_RUN" == "false" ]]; then
    ls -lh "$DEMOS_DIR/"*.webm 2>/dev/null || echo "  (no webm files)"
fi
echo ""
echo "Caption files (create to add text overlays on next run):"
for f in "$DEMOS_DIR/"*.webm; do
    [[ -f "$f" ]] || continue
    local_base=$(basename "$f" .webm)
    cap="$DEMOS_DIR/${local_base}.captions"
    if [[ -f "$cap" ]]; then
        echo "  [exists] ${local_base}.captions"
    else
        echo "  [create] ${local_base}.captions"
    fi
done
echo ""
