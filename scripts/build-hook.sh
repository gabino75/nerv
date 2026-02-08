#!/bin/bash
# Build nerv-hook binary for all platforms
#
# Output follows electron-builder naming conventions:
# - nerv-hook-windows-amd64.exe (Windows x64)
# - nerv-hook-darwin-x64 (macOS Intel)
# - nerv-hook-darwin-arm64 (macOS Apple Silicon)
# - nerv-hook-linux-x64 (Linux x64)
# - nerv-hook-linux-arm64 (Linux ARM64)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOK_DIR="$PROJECT_ROOT/cmd/nerv-hook"
OUT_DIR="$PROJECT_ROOT/resources"

cd "$HOOK_DIR"

echo "Building nerv-hook for all platforms..."

# Windows amd64
echo "  - windows/amd64"
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT_DIR/nerv-hook-windows-amd64.exe" .

# macOS amd64 (Intel)
echo "  - darwin/amd64"
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT_DIR/nerv-hook-darwin-x64" .

# macOS arm64 (Apple Silicon)
echo "  - darwin/arm64"
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "$OUT_DIR/nerv-hook-darwin-arm64" .

# Linux amd64
echo "  - linux/amd64"
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT_DIR/nerv-hook-linux-x64" .

# Linux arm64
echo "  - linux/arm64"
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o "$OUT_DIR/nerv-hook-linux-arm64" .

echo ""
echo "Build complete! Binaries in $OUT_DIR:"
ls -la "$OUT_DIR"/nerv-hook-*
