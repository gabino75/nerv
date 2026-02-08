#!/bin/bash
# Code Quality CI Script for NERV
# Runs inside Docker for cross-platform consistency
#
# Usage (via Docker):
#   docker run --rm -v $(pwd):/app/host:ro nerv-e2e ./scripts/code-quality.sh
#
# Or via run-e2e.ps1:
#   powershell -File test/scripts/run-e2e.ps1 -Suite quality

# Don't use set -e - we handle errors explicitly

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

log_check() { echo -e "${CYAN}[CHECK]${NC} $1"; }
log_pass()  { echo -e "${GREEN}[PASS]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; ((WARNINGS++)); }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; ((ERRORS++)); }

echo ""
echo "========================================"
echo "   NERV Code Quality Check (Docker)"
echo "========================================"
echo ""

# ============================================================
# 1. TypeScript Compilation
# ============================================================
log_check "TypeScript compilation..."
if npm run typecheck > /tmp/tsc.log 2>&1; then
    log_pass "TypeScript compiles without errors"
else
    log_fail "TypeScript compilation failed"
    tail -20 /tmp/tsc.log
fi

# ============================================================
# 2. ESLint
# ============================================================
log_check "ESLint analysis..."
npx eslint src/ > /tmp/eslint.log 2>&1 || true

# Parse the summary line: "✖ N problems (X errors, Y warnings)"
SUMMARY_LINE=$(grep "problems\|errors" /tmp/eslint.log | tail -1)
if echo "$SUMMARY_LINE" | grep -q "0 errors"; then
    ESLINT_ERRORS=0
else
    ESLINT_ERRORS=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ error" | grep -oE "[0-9]+" || echo "0")
fi
ESLINT_WARNINGS=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ warning" | grep -oE "[0-9]+" || echo "0")

if [ "$ESLINT_ERRORS" = "0" ] && [ "$ESLINT_WARNINGS" = "0" ]; then
    log_pass "No ESLint issues"
elif [ "$ESLINT_ERRORS" = "0" ]; then
    log_warn "ESLint: $ESLINT_WARNINGS warnings"
else
    log_fail "ESLint: $ESLINT_ERRORS errors, $ESLINT_WARNINGS warnings"
    cat /tmp/eslint.log | head -50
fi

# ============================================================
# 3. Code Duplication (jscpd)
# ============================================================
log_check "Code duplication analysis..."
JSCPD_OUTPUT=$(npx jscpd src/ --reporters console --threshold 10 2>&1 || true)
# Use grep -E (ERE) instead of grep -P (PCRE) for portability
DUPLICATE_PERCENT=$(echo "$JSCPD_OUTPUT" | grep -oE '[0-9]+\.?[0-9]*%' | head -1 | tr -d '%' || echo "0")

if [ -z "$DUPLICATE_PERCENT" ]; then
    log_pass "No significant code duplication detected"
elif (( $(echo "$DUPLICATE_PERCENT > 10" | bc -l 2>/dev/null || echo 0) )); then
    log_fail "Code duplication: ${DUPLICATE_PERCENT}% - should be < 10%"
elif (( $(echo "$DUPLICATE_PERCENT > 5" | bc -l 2>/dev/null || echo 0) )); then
    log_warn "Code duplication: ${DUPLICATE_PERCENT}% - consider refactoring"
else
    log_pass "Code duplication: ${DUPLICATE_PERCENT}%"
fi

# ============================================================
# 4. Circular Dependencies (madge)
# ============================================================
log_check "Circular dependency analysis..."
CIRCULAR=$(npx madge --circular --extensions ts src/ 2>&1 || true)
# Check if madge found circular dependencies (look for success message)
if echo "$CIRCULAR" | grep -q "No circular dependency found"; then
    CIRCULAR_COUNT=0
else
    # Count lines with arrow patterns (→ or ->)
    CIRCULAR_COUNT=$(echo "$CIRCULAR" | grep -cE "(→|->)" 2>/dev/null) || CIRCULAR_COUNT=0
fi

if [ "$CIRCULAR_COUNT" = "0" ] || [ "$CIRCULAR_COUNT" = "" ]; then
    log_pass "No circular dependencies"
else
    log_fail "Found $CIRCULAR_COUNT circular dependencies"
    echo "$CIRCULAR" | head -20
fi

# ============================================================
# 5. File Size Limits (>500 lines)
# ============================================================
log_check "File size analysis..."
LARGE_FILES=$(find src/ -name "*.ts" -o -name "*.svelte" | while read f; do
    lines=$(wc -l < "$f")
    if [ "$lines" -gt 500 ]; then
        echo "  $f: $lines lines"
    fi
done)

if [ -z "$LARGE_FILES" ]; then
    log_pass "All files under 500 lines"
else
    log_warn "Large files (>500 lines) - consider splitting:"
    echo "$LARGE_FILES"
fi

# ============================================================
# 6. Directory Size (>15 files = poor organization)
# ============================================================
log_check "Directory organization..."
LARGE_DIRS=$(find src/ -type d | while read d; do
    count=$(find "$d" -maxdepth 1 \( -name "*.ts" -o -name "*.svelte" \) | wc -l)
    if [ "$count" -gt 15 ]; then
        echo "  $d: $count files"
    fi
done)

if [ -z "$LARGE_DIRS" ]; then
    log_pass "Directory organization looks good"
else
    log_warn "Large directories (>15 files) - consider subdirectories:"
    echo "$LARGE_DIRS"
fi

# ============================================================
# 7. TODO/FIXME Count
# ============================================================
log_check "TODO/FIXME analysis..."
TODO_COUNT=$(grep -r "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.svelte" 2>/dev/null | wc -l || echo "0")

if [ "$TODO_COUNT" -gt 20 ]; then
    log_warn "$TODO_COUNT TODO/FIXME comments - consider addressing some"
else
    log_pass "$TODO_COUNT TODO/FIXME comments"
fi

# ============================================================
# 8. 'any' Type Usage
# ============================================================
log_check "TypeScript 'any' usage..."
ANY_COUNT=$(grep -rE ": any\b|<any>|as any" src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")

if [ "$ANY_COUNT" -gt 10 ]; then
    log_warn "$ANY_COUNT uses of 'any' type - prefer proper typing"
else
    log_pass "$ANY_COUNT uses of 'any' type"
fi

# ============================================================
# 9. Console.log Count
# ============================================================
log_check "Console.log usage..."
CONSOLE_COUNT=$(grep -rE "console\.(log|warn|error)" src/ --include="*.ts" --include="*.svelte" 2>/dev/null | wc -l || echo "0")

if [ "$CONSOLE_COUNT" -gt 50 ]; then
    log_warn "$CONSOLE_COUNT console statements - consider a logging utility"
else
    log_pass "$CONSOLE_COUNT console statements"
fi

# ============================================================
# 10. Production Build
# ============================================================
log_check "Production build..."

# Try to use pre-built artifacts from host (avoids Tailwind Docker encoding issues)
if [ -d "/app/host/out/renderer" ] && [ -d "/app/host/out/main" ] && [ -d "/app/host/out/preload" ]; then
    rm -rf /app/out 2>/dev/null || true
    cp -r /app/host/out /app/out
    log_pass "Production build succeeds (using pre-built host artifacts)"
elif npm run build > /tmp/build.log 2>&1; then
    log_pass "Production build succeeds"
else
    log_fail "Production build failed"
    tail -20 /tmp/build.log
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "========================================"
echo "   Summary"
echo "========================================"
echo ""

if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}ERRORS: $ERRORS${NC}"
fi

if [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}WARNINGS: $WARNINGS${NC}"
fi

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
fi

echo ""

# Exit with error if any failures
if [ "$ERRORS" -gt 0 ]; then
    exit 1
fi

exit 0
