#!/bin/bash
# NERV Benchmark Runner
# Runs benchmark scenarios against the NERV application and generates reports

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCHMARK_DIR="$PROJECT_ROOT/test/benchmarks"
RESULTS_DIR="$PROJECT_ROOT/test-results/benchmarks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== NERV Benchmark Runner ==="
echo "Project root: $PROJECT_ROOT"
echo "Benchmark directory: $BENCHMARK_DIR"
echo ""

# Parse arguments
SCENARIO="all"
GRADE=false
VERBOSE=false
OUTPUT_FORMAT="json"

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --scenario <name>    Run specific scenario (simple, medium, complex, all)"
    echo "  --grade              Run Claude grading on results"
    echo "  --verbose            Show detailed output"
    echo "  --format <format>    Output format (json, text)"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Run all scenarios"
    echo "  $0 --scenario simple         # Run only simple scenario"
    echo "  $0 --grade                   # Run all and grade with Claude"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --scenario)
            SCENARIO="$2"
            shift 2
            ;;
        --grade)
            GRADE=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

# Check if build exists
if [ ! -f "$PROJECT_ROOT/out/main/index.js" ]; then
    echo -e "${YELLOW}Built app not found. Building...${NC}"
    cd "$PROJECT_ROOT"
    npm run build
fi

# Create results directory
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="$RESULTS_DIR/run_$TIMESTAMP"
mkdir -p "$RUN_DIR"

echo "Results will be saved to: $RUN_DIR"
echo ""

# Run benchmark scenarios using vitest
echo -e "${GREEN}Running benchmark scenarios...${NC}"

cd "$PROJECT_ROOT"

# Set environment variables for benchmarks
export NERV_BENCHMARK_MODE=true
export NERV_BENCHMARK_SCENARIO="$SCENARIO"
export NERV_BENCHMARK_RESULTS_DIR="$RUN_DIR"
export NERV_BENCHMARK_VERBOSE="$VERBOSE"

# Run the benchmark test suite
if [ "$VERBOSE" = true ]; then
    npx vitest run test/benchmarks/scenarios.test.ts --reporter=verbose 2>&1 | tee "$RUN_DIR/benchmark.log"
else
    npx vitest run test/benchmarks/scenarios.test.ts --reporter=default 2>&1 | tee "$RUN_DIR/benchmark.log"
fi

BENCHMARK_EXIT=$?

echo ""

# Generate summary
if [ -f "$RUN_DIR/results.json" ]; then
    echo -e "${GREEN}Benchmark results saved to: $RUN_DIR/results.json${NC}"

    if [ "$OUTPUT_FORMAT" = "text" ]; then
        echo ""
        echo "=== Summary ==="
        node -e "
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('$RUN_DIR/results.json', 'utf-8'));
            console.log('Scenarios run:', results.scenarios?.length || 0);
            console.log('Passed:', results.passed || 0);
            console.log('Failed:', results.failed || 0);
            if (results.metrics) {
                console.log('Total duration:', results.metrics.totalDuration, 'ms');
            }
        " 2>/dev/null || echo "Could not parse results"
    fi
else
    echo -e "${YELLOW}No results.json found${NC}"
fi

# Run grading if requested
if [ "$GRADE" = true ]; then
    echo ""
    echo -e "${GREEN}Running Claude grading...${NC}"

    if [ -f "$RUN_DIR/benchmark.log" ]; then
        # Run the grader
        npx ts-node "$BENCHMARK_DIR/grader.ts" \
            --input "$RUN_DIR/benchmark.log" \
            --results "$RUN_DIR/results.json" \
            --output "$RUN_DIR/grade_report.json"

        if [ -f "$RUN_DIR/grade_report.json" ]; then
            echo -e "${GREEN}Grade report saved to: $RUN_DIR/grade_report.json${NC}"

            if [ "$OUTPUT_FORMAT" = "text" ]; then
                echo ""
                echo "=== Grade Report ==="
                node -e "
                    const fs = require('fs');
                    const report = JSON.parse(fs.readFileSync('$RUN_DIR/grade_report.json', 'utf-8'));
                    console.log('Overall Score:', report.overallScore || 'N/A');
                    console.log('Issues Found:', report.issues?.length || 0);
                    if (report.suggestions?.length) {
                        console.log('Suggestions:', report.suggestions.length);
                    }
                " 2>/dev/null || echo "Could not parse grade report"
            fi
        fi
    else
        echo -e "${YELLOW}No benchmark log found for grading${NC}"
    fi
fi

echo ""
echo "=== Benchmark Complete ==="
echo "Results directory: $RUN_DIR"

if [ $BENCHMARK_EXIT -ne 0 ]; then
    echo -e "${RED}Benchmarks failed with exit code: $BENCHMARK_EXIT${NC}"
    exit $BENCHMARK_EXIT
fi

echo -e "${GREEN}All benchmarks completed successfully${NC}"
exit 0
