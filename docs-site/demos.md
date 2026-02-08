# Demo Videos

Video walkthroughs demonstrating NERV features in action.

## Available Demos

### Quick Start

A 2-minute introduction to getting started with NERV.

**What you'll see:**
- Launching NERV and exploring the dashboard
- Creating a new project with name and goal
- Creating a task on the Kanban board
- Starting a Claude session for the task
- Terminal showing Claude working on your code

<video controls width="100%">
  <source src="/nerv/demos/quick-start.webm" type="video/webm">
  Your browser does not support the video tag.
</video>

---

### YOLO Mode

Watch NERV autonomously complete a benchmark task with AI review.

**What you'll see:**
- Creating a project for autonomous development
- Enabling the YOLO mode toggle
- Starting the autonomous development loop
- Tasks progressing automatically through the Kanban board
- AI-powered code review and auto-merge

<video controls width="100%">
  <source src="/nerv/demos/yolo-mode.webm" type="video/webm">
  Your browser does not support the video tag.
</video>

---

### Multi-Repository Workflow

Managing tasks across multiple connected repositories.

**What you'll see:**
- Setting up a project with 3 repos (shared-types, API, frontend)
- Repo panel for managing multiple repositories
- Multiple terminal tabs for different repos
- Cross-repo task coordination on the Kanban board
- Split view for working on repos side by side

<video controls width="100%">
  <source src="/nerv/demos/multi-repo.webm" type="video/webm">
  Your browser does not support the video tag.
</video>

---

## Recording Demos

NERV uses Playwright's built-in video recording to capture demos. To record a demo:

### 1. Configure Playwright

Add a video-enabled project to `playwright.config.ts`:

```typescript
{
  name: 'demo-custom',
  use: {
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 }
    }
  },
  testMatch: 'test/e2e/demos/custom.spec.ts'
}
```

### 2. Write the Demo Script

Create a test file that performs the actions you want to record. Use the `slowType()` and `demoWait()` helper functions for natural pacing:

```typescript
// test/e2e/docs-demos.spec.ts
import { test } from '@playwright/test'

// Slowly type text character-by-character (for demo visibility)
async function slowType(page, selector, text) {
  const element = page.locator(selector)
  await element.click()
  for (const char of text) {
    await element.press(char === ' ' ? 'Space' : char)
    await page.waitForTimeout(50) // Typing speed
  }
}

// Wait with a labeled pause (for demo pacing)
async function demoWait(page, label, ms = 800) {
  console.log(`[Demo] ${label}`)
  await page.waitForTimeout(ms)
}

test('custom demo', async () => {
  // Launch Electron with recordVideo option
  // ...

  // Use slowType for realistic text entry
  await slowType(window, '[data-testid="project-name-input"]', 'My Project')
  await demoWait(window, 'Project name entered', 800)

  // Use demoWait between steps for viewer comprehension
  await demoWait(window, 'About to create project', 600)
  await page.click('[data-testid="create-project-btn"]')
  await demoWait(window, 'Project created successfully', 1500)
})
```

### 3. Run the Recording

```bash
npm run test:e2e -- --project=demo-custom
```

Videos are saved to `test-results/` with the test name.

### 4. Add to Documentation

Move the recorded video to `docs-site/public/demos/`:

```bash
cp test-results/custom-demo/video.mp4 docs-site/public/demos/custom.mp4
```

Then embed in this page using HTML:

```html
<video controls width="100%">
  <source src="/nerv/demos/custom.mp4" type="video/mp4">
</video>
```

::: tip Recording Tips
- Use `slowType()` for text input to show characters appearing naturally
- Use `demoWait()` between actions for labeled pauses with console logging
- Use 1280x720 resolution for good quality at reasonable file sizes
- Keep demos under 3 minutes for optimal engagement
- Use descriptive test names that become video filenames
:::
