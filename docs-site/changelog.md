# Changelog

All notable changes to NERV are documented here.

## [1.0.0] - 2026-02-04

### Added

#### Core Features
- Single-app dashboard for managing Claude Code sessions
- Multi-tab terminal interface with split view support
- Kanban task board with 5 statuses (todo, in_progress, interrupted, review, done)
- Git worktree isolation per task
- NERV.md context generation with token management
- Session resume and recovery

#### Permission System
- Go-based hook binary for command interception
- Pattern-based permission rules
- Approval queue with Always Allow/Deny options
- Permission learning from approval history

#### CLI
- Full CLI-first architecture
- Project management (create, list, switch, info)
- Task management (create, list, update)
- Session management (start, resume, yolo)
- Configuration management (get, set, list)
- Benchmark commands (run, score, history)

#### YOLO Mode
- Autonomous benchmark mode
- Configurable limits (cycles, cost, duration)
- AI-powered review agent
- Auto-merge on success

#### Database
- SQLite with WAL mode
- 18 tables for complete state management
- Automatic migrations
- Audit logging

#### Organization Support
- Organization configuration via git/local repos
- Settings hierarchy (env > project > org > global > default)
- Org-defined agents, skills, and terminal profiles
- Auto-sync with configurable interval

#### Auto-Update
- electron-updater integration
- Release channels (stable, beta, alpha)
- Organization update policies
- Offline/air-gapped mode support

### Developer Features
- TypeScript throughout
- Svelte 5 with reactive runes
- Comprehensive E2E tests (120 tests)
- Unit tests (123 tests)
- Docker-based test infrastructure
- Quality checks (TypeScript, ESLint, duplication, circular deps)

## [0.1.0] - 2025-12-01

### Added
- Initial prototype
- Basic terminal integration
- Project and task management
- Simple permission handling
