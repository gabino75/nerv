# Troubleshooting & FAQ

## Common Issues

### Claude Code Not Found

```
Error: claude command not found
```

NERV requires the Claude Code CLI. Install it and verify it's in your PATH:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

If installed but not found, check that the npm global bin directory is in your PATH:

```bash
npm config get prefix
# Add {prefix}/bin to your PATH
```

### Claude Code Not Authenticated

```
Error: Not authenticated. Run 'claude auth' first.
```

Claude Code requires an active subscription. Authenticate:

```bash
claude auth
```

Follow the browser prompts to sign in. NERV uses your Claude Code subscription — it does not require a separate Anthropic API key.

### Native Module Errors (better-sqlite3, node-pty)

```
Error: Could not find module 'better-sqlite3'
Error: The module was compiled against a different Node.js version
```

Native modules must match your Electron version. Rebuild them:

```bash
npm run rebuild
```

If that fails, remove `node_modules` and reinstall:

```bash
rm -rf node_modules
npm install
npm run rebuild
```

### Database Locked

```
Error: SQLITE_BUSY: database is locked
```

This happens when multiple NERV instances access the same database. Close other NERV windows or processes:

```bash
# Check for running NERV processes
ps aux | grep -i nerv
```

NERV stores its database at `~/.nerv/state.db`. Only one instance should write to it at a time.

### Git Worktree Errors

```
Error: fatal: '<path>' is already checked out at '<worktree>'
```

A worktree already exists for that branch. NERV manages worktrees automatically, but stale worktrees can accumulate if NERV crashes mid-task:

```bash
# List worktrees
git worktree list

# Remove stale worktrees
git worktree prune
```

### Permission Hook Timeout

```
Error: Permission hook timed out after 30s
```

The Go-based permission hook binary failed to respond. Check that it's built:

```bash
ls src/hooks/nerv-hooks
```

If missing, rebuild:

```bash
cd src/hooks && go build -o nerv-hooks
```

### Task Stuck in "in_progress"

A task can get stuck if Claude's session crashes or the terminal is closed mid-work.

**From the UI:** Click the task card, then click **Stop** to cancel the running session. The task moves to `interrupted` status and can be resumed.

**From the CLI:**

```bash
# List tasks to find the stuck one
nerv task list

# Reset to interrupted
nerv task update <taskId> --status interrupted

# Resume later
nerv resume <taskId>
```

### Blank Screen on Launch

If NERV launches but shows a blank window:

1. Check the developer console: `Ctrl+Shift+I` (or `Cmd+Option+I` on macOS)
2. Look for errors in the Console tab
3. Common causes:
   - Missing build: run `npm run build` then relaunch
   - Port conflict: another Electron app using the same dev port
   - Corrupted state: delete `~/.nerv/state.db` and restart (you'll lose project data)

### Docker E2E Tests Failing

For contributors running the E2E test suite:

```bash
# Rebuild the Docker image after code changes
npm run build
docker build -t nerv-e2e -f test/e2e/Dockerfile .

# Run tests with verbose output
docker run --rm --shm-size=2gb \
  -v "$(pwd):/app/host" \
  -e NERV_MOCK_CLAUDE=true \
  nerv-e2e \
  "npx playwright test --config=test/e2e/playwright.config.ts --reporter=list"
```

Common Docker issues:
- **Shared memory**: Always use `--shm-size=2gb` — Electron needs shared memory for rendering
- **Image stale**: Rebuild the image when dependencies change; the entrypoint syncs source code from the host mount
- **Windows line endings**: If on WSL, ensure git uses LF endings (`git config core.autocrlf input`)

---

## FAQ

### What is the difference between YOLO mode and benchmarking?

**YOLO mode** is a user-facing feature. It runs autonomous cycles — Claude builds, an AI reviewer checks the work, tests run, and approved changes merge automatically. You configure it from the Kanban tab and watch it work.

**Benchmarking** is test infrastructure. It uses YOLO mode under the hood but adds headless automation, grading prompts, and scoring. Benchmarks run in Docker via `npx playwright test` and produce scores — they are not part of the UI.

### Does NERV require an Anthropic API key?

No. NERV uses the **Claude Code CLI**, which requires a Claude Code subscription (billed through Anthropic). You authenticate with `claude auth`. NERV never calls the Anthropic API directly.

### Can I use NERV with multiple repositories?

Yes. When creating a project, add multiple repository directories. NERV passes `--add-dir` flags to Claude Code so it can see all repos in a single session. The multi-repo demo shows this workflow.

### How does NERV track costs?

NERV reads cost data from Claude Code's session output. It stores per-task and per-session costs in the SQLite database and displays them in the Cost Dashboard (accessible from the "More" menu). Set budget limits with:

```bash
nerv config set monthly_budget_usd 50
```

### What happens when context gets too large?

Claude Code automatically compacts long conversations. NERV tracks token usage and displays it in the Context Monitor. When compaction occurs, NERV logs it and continues. The `NERV.md` context file is regenerated each task to keep it focused.

### Can I run NERV headless (no UI)?

Yes, via the CLI:

```bash
# Recommend-driven workflow
nerv recommend
nerv recommend --direction "focus on auth"

# Manual workflow
nerv cycle create "Auth MVP"
nerv task create "Login endpoint" --type implementation
nerv start <taskId>
```

The CLI provides full feature parity with the UI.

### How do I reset a project?

There is no dedicated reset command. To start fresh:

```bash
# Delete the project
nerv project delete <projectId>

# Or delete all NERV data
rm ~/.nerv/state.db
```

NERV will recreate the database on next launch.

### Where are learnings stored?

Learnings are stored in the SQLite database (`~/.nerv/state.db`) and included in the `NERV.md` context file that Claude receives for each task. Record learnings after completing a cycle:

```bash
nerv learn "Use bcrypt with low rounds in test env for speed"
```

The last 5 learnings are included in recommendation context, so Claude can avoid repeating mistakes.

### How do I update NERV?

Pull the latest source and rebuild:

```bash
git pull
npm install
npm run build
```

Your data in `~/.nerv/state.db` is preserved across updates. Database migrations run automatically on launch.
