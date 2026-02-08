# Command Line Tools (`cmd/`)

Go binaries that support NERV's runtime operations.

## Purpose

This directory contains Go programs that are compiled into native binaries:
- Cross-platform support (Linux, macOS, Windows)
- Low latency for permission hook calls
- No Node.js runtime dependency

## Modules

### `nerv-hook/`

The permission hook binary that intercepts Claude Code tool calls.

| File | Description |
|------|-------------|
| `main.go` | Hook implementation with JSON parsing |
| `go.mod` | Go module definition |
| `go.sum` | Dependency checksums |

## How It Works

### Permission Hook Flow

1. Claude Code calls a tool (Read, Write, Bash, etc.)
2. Claude Code invokes `nerv-hook` with JSON payload
3. Hook checks permission rules in `~/.nerv/permissions.json`
4. If not pre-approved, hook communicates with NERV dashboard
5. User approves/denies in UI
6. Hook returns decision to Claude Code

### Hook Events

The hook handles these Claude Code events:

| Event | Description |
|-------|-------------|
| `PreToolUse` | Before a tool executes (can block) |
| `PostToolUse` | After tool completes (logging) |
| `Stop` | Session is ending (cleanup) |

### Permission Rules

Rules use pattern matching syntax:

```
Tool(pattern)

Examples:
Bash(npm test:*)     - Any npm test command
Read(~/.ssh/*)       - SSH key files
Write(src/**/*.ts)   - TypeScript source files
```

## API/Exports

The hook reads/writes:

**Input**: JSON via stdin
```json
{
  "event": "PreToolUse",
  "tool": "Bash",
  "args": {"command": "npm test"}
}
```

**Output**: JSON to stdout
```json
{
  "allow": true,
  "reason": "Matched rule: Bash(npm test:*)"
}
```

## Dependencies

- Go 1.21+
- `github.com/tidwall/gjson` - JSON parsing
- `github.com/tidwall/sjson` - JSON modification

## Building

### Local build

```bash
cd cmd/nerv-hook
go build -o nerv-hook
```

### Cross-compile for all platforms

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o nerv-hook-linux-amd64
GOOS=linux GOARCH=arm64 go build -o nerv-hook-linux-arm64

# macOS
GOOS=darwin GOARCH=amd64 go build -o nerv-hook-darwin-amd64
GOOS=darwin GOARCH=arm64 go build -o nerv-hook-darwin-arm64

# Windows
GOOS=windows GOARCH=amd64 go build -o nerv-hook-windows-amd64.exe
GOOS=windows GOARCH=arm64 go build -o nerv-hook-windows-arm64.exe
```

### CI build

The CI workflow builds for all platforms automatically. See `.github/workflows/ci.yml`.

## Testing

### Unit tests

```bash
cd cmd/nerv-hook
go test ./...
```

### Manual testing

```bash
# Test with sample input
echo '{"event":"PreToolUse","tool":"Bash","args":{"command":"ls"}}' | ./nerv-hook
```

## Common Tasks

### Adding a new permission pattern

1. Add pattern to `DEFAULT_PERMISSIONS` in `src/main/hooks.ts`
2. Update pattern matching in `main.go` if needed
3. Document in permission rule examples

### Debugging hook issues

1. Enable debug logging: `NERV_HOOK_DEBUG=1`
2. Check hook binary path: `~/.nerv/bin/nerv-hook`
3. Verify JSON input/output format
4. Check permission file: `~/.nerv/permissions.json`

### Adding a new hook event

1. Add event type to `main.go` switch statement
2. Implement handler logic
3. Update TypeScript types in `src/shared/types/hooks.ts`
4. Add IPC handler in `src/main/ipc/hooks-handlers.ts`
