# Demo Videos

Video walkthroughs demonstrating NERV features in action.

## Quick Start

A 2-minute introduction to getting started with NERV.

**What you'll see:**
- Launching NERV and exploring the dashboard
- Creating a new project with name and goal
- Creating a task on the Kanban board
- Starting a Claude session for the task
- Terminal showing Claude working on your code

<video controls width="100%" poster="/nerv/demos/quick-start-poster.png">
  <source src="/nerv/demos/quick-start.webm" type="video/webm">
  <source src="/nerv/demos/quick-start.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

::: tip Not loading?
If the video doesn't appear, [record the demos locally](#recording-demos) and rebuild the docs.
:::

---

## YOLO Mode

Watch NERV autonomously complete a benchmark task with AI review.

**What you'll see:**
- Creating a project for autonomous development
- Enabling the YOLO mode toggle
- Starting the autonomous development loop
- Tasks progressing automatically through the Kanban board
- AI-powered code review and auto-merge

<video controls width="100%">
  <source src="/nerv/demos/yolo-mode.webm" type="video/webm">
  <source src="/nerv/demos/yolo-mode.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Multi-Repository Workflow

Managing tasks across multiple connected repositories.

**What you'll see:**
- Setting up a project with 3 repos (shared-types, API, frontend)
- Repo panel for managing multiple repositories
- Multiple terminal tabs for different repos
- Cross-repo task coordination on the Kanban board
- Split view for working on repos side by side

<video controls width="100%">
  <source src="/nerv/demos/multi-repo.webm" type="video/webm">
  <source src="/nerv/demos/multi-repo.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Recording Demos

NERV uses Playwright to record demos inside Docker with a virtual display.

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

1. **Docker + Xvfb** — Electron runs in a headless virtual display
2. **Playwright recording** — Built-in video capture at 1280x720
3. **Cursor overlay** — A CSS-injected cursor dot follows mouse movements with click animations
4. **Zoom effects** — Key UI elements zoom in for emphasis during the recording
5. **Slow typing** — Text is entered character-by-character for natural pacing
6. **Post-processing** — Optional ffmpeg conversion to MP4 + GIF

### Custom Demos

Create a test file that uses the demo helpers:

```typescript
// test/e2e/docs-demos.spec.ts
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
