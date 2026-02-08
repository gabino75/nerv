#!/bin/bash
# NERV E2E Test Docker Entrypoint
# Starts Xvfb for headless Electron testing and runs the test command

set -e

echo "=== NERV E2E Test Environment ==="
echo "Starting Xvfb virtual display..."

# Start Xvfb in the background
Xvfb :99 -screen 0 1920x1080x24 &
XVFB_PID=$!

# Wait for Xvfb to start
sleep 2

# Verify Xvfb is running
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb failed to start"
    exit 1
fi

echo "Xvfb started on display :99"
export DISPLAY=:99

# Print environment info
echo "=== Environment ==="
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"
echo "Display: $DISPLAY"
echo "PWD: $(pwd)"
echo "Test Mode: $NERV_TEST_MODE"
echo "Mock Claude: $NERV_MOCK_CLAUDE"

# Run the actual command passed to docker
echo "=== Running: $@ ==="
exec "$@"

# Cleanup
kill $XVFB_PID 2>/dev/null || true
