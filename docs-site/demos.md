<script setup>
import { withBase } from 'vitepress'
</script>

# Demo Videos

Video walkthroughs demonstrating NERV features in action.

::: tip Recording Demos
All demos are recorded using Playwright's built-in video capture inside Docker. See [Recording Demos](#recording-demos) below.
:::

## Quick Start

A walkthrough of the core NERV workflow: project creation, cycle planning, and the "What's Next?" recommendation-driven flow.

**What you'll see:**
- Launching NERV and the clean empty dashboard
- Creating a new project with name and goal
- **"What's Next?" round 1** — Claude recommends starting a cycle → approve → cycle created
- Viewing the active cycle in the cycle panel
- **"What's Next?" round 2** — Claude recommends implementing a task → approve → task created
- Task appearing on the board, starting it with Claude
- Claude working in the terminal, task completing automatically

<video controls width="100%" preload="metadata">
  <source :src="withBase('/demos/quick-start.webm')" type="video/webm">
  Your browser does not support WebM video.
</video>

---

## YOLO Mode

Run autonomous benchmarks from a spec file. NERV configures the YOLO loop, launches Claude, and tracks cycles, cost, and test results in real time.

**What you'll see:**
- Creating a project and opening the YOLO panel from the Workflow menu
- Configuring a benchmark: spec file, test command, max cycles, auto-approve
- Saving the configuration and starting the benchmark
- **Running tab** — live progress showing cycles completed, tasks, cost, and duration
- **Results tab** — final metrics including spec completion and test pass rate

<video controls width="100%" preload="metadata">
  <source :src="withBase('/demos/yolo-mode.webm')" type="video/webm">
  Your browser does not support WebM video.
</video>

---

## Multi-Repo + Knowledge

Manage multiple repositories and knowledge bases within a single NERV project. Worktrees, CLAUDE.md files, and connected repos are all accessible from the dashboard.

**What you'll see:**
- Creating a multi-repo project (shared-types + API backend)
- Opening the **Worktree panel** from the Workflow menu to manage git worktrees
- Opening the **Knowledge Base** to view CLAUDE.md and project context
- Opening the **Repos panel** to see connected repositories

<video controls width="100%" preload="metadata">
  <source :src="withBase('/demos/multi-repo.webm')" type="video/webm">
  Your browser does not support WebM video.
</video>

---

## Audit & Code Health

Monitor code quality, detect spec drift, and review audit logs — all from the Audit panel.

**What you'll see:**
- Opening the Audit panel
- **Code Health tab** — test coverage, DRY violations, type errors, dead code, complexity metrics
- Running a health check and viewing metric cards (healthy/unhealthy indicators)
- **Spec Drift tab** — detecting missing features, stale tasks, and spec mismatches
- **Logs tab** — filtered audit events by task and event type

<video controls width="100%" preload="metadata">
  <source :src="withBase('/demos/audit-health.webm')" type="video/webm">
  Your browser does not support WebM video.
</video>

---

## Cost & Context

Track token usage, session costs, and budget across all projects. The context monitor shows real-time token consumption while the Cost Dashboard provides historical analytics.

**What you'll see:**
- The **Context Monitor** bar showing model, token usage, and compaction count
- Opening the **Cost Dashboard** from the Settings menu
- Summary cards with total cost, session count, and average cost
- Budget progress bar showing spend vs. limit
- Cost breakdown by model and by project

<video controls width="100%" preload="metadata">
  <source :src="withBase('/demos/cost-context.webm')" type="video/webm">
  Your browser does not support WebM video.
</video>

---

## Recording Demos

NERV uses Playwright's built-in video recording inside Docker with a virtual display (Xvfb).

### Quick Record

```bash
# Record all demos
./test/scripts/record-demos.sh

# Record a specific demo
./test/scripts/record-demos.sh --demo quick-start

# Record + generate GIFs for README
./test/scripts/record-demos.sh --gif
```

### How It Works

1. **Docker + Xvfb** — Electron runs in a headless virtual display at 1920x1080
2. **Playwright video** — Built-in `recordVideo` option captures at 1280x720
3. **Cursor overlay** — CSS-injected cursor dot follows mouse movements with click animations
4. **Slow typing** — Text entered character-by-character for natural pacing
5. **Post-processing** — Optional ffmpeg conversion to GIF for README

### Custom Demos

Create a Playwright test file that uses the demo helpers:

```typescript
import { test } from '@playwright/test'

// Slowly type text character-by-character
async function slowType(page, selector, text) {
  const element = page.locator(selector)
  await element.click()
  for (const char of text) {
    await element.press(char === ' ' ? 'Space' : char)
    await page.waitForTimeout(50)
  }
}

// Labeled pause for demo pacing
async function demoWait(page, label, ms = 800) {
  console.log(`[Demo] ${label}`)
  await page.waitForTimeout(ms)
}

test('demo_my_feature', async () => {
  // Launch Electron with recordVideo option
  // Use slowType() for text input
  // Use demoWait() between steps
  // Use glideToElement() for smooth cursor movement
  // Use zoomInto() for emphasis on UI elements
})
```

Run with:
```bash
./test/scripts/record-demos.sh --demo my_feature
```

::: tip Recording Tips
- Use `slowType()` for text input to show characters appearing naturally
- Use `glideToElement()` before clicks for smooth cursor movement
- Use `zoomInto()` to highlight important UI elements
- Use `demoWait()` between actions with descriptive labels
- Keep demos under 3 minutes for optimal engagement
- 1280x720 resolution balances quality and file size
:::
