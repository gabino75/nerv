/**
 * Shared Recording Utilities for Demo Videos and Benchmark Recordings
 *
 * Extracted from docs-demos.spec.ts to be reusable across:
 * - Demo recordings (docs-demos.spec.ts)
 * - Benchmark recordings (benchmark.spec.ts with NERV_RECORD_ALL=true)
 * - Full workflow recordings (full-workflow.spec.ts)
 */

import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import os from 'os'

// Default recording settings
export const RECORDING_DEFAULTS = {
  viewport: { width: 1280, height: 720 },
  actionDelay: 800,
  typingSpeed: 50,
}

/**
 * Inject a visible cursor overlay into the page.
 * Playwright headless mode doesn't render the OS cursor, so we create
 * a CSS dot that follows mouse movements for professional demo recordings.
 */
export async function injectCursorOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(255, 80, 80, 0.7);
      border: 2px solid rgba(255, 255, 255, 0.9);
      pointer-events: none;
      z-index: 999999;
      transform: translate(-50%, -50%);
      transition: width 0.15s, height 0.15s, background 0.15s;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    `
    document.body.appendChild(cursor)

    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
    })

    document.addEventListener('mousedown', () => {
      cursor.style.width = '28px'
      cursor.style.height = '28px'
      cursor.style.background = 'rgba(255, 40, 40, 0.9)'
    })
    document.addEventListener('mouseup', () => {
      cursor.style.width = '20px'
      cursor.style.height = '20px'
      cursor.style.background = 'rgba(255, 80, 80, 0.7)'
    })
  })
}

/**
 * Smoothly move the visible cursor to a target element.
 * Creates a human-like glide motion before clicking.
 */
export async function glideToElement(page: Page, selector: string, steps = 15): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox()
  if (!box) return

  const targetX = box.x + box.width / 2
  const targetY = box.y + box.height / 2

  await page.mouse.move(targetX, targetY, { steps })
  await page.waitForTimeout(200)
}

/**
 * Zoom into a region of the page for emphasis.
 * Applies CSS transform to zoom into a specific element,
 * holds for the specified duration, then zooms back out.
 */
export async function zoomInto(page: Page, selector: string, holdMs = 2000, scale = 1.8): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox()
  if (!box) return

  const originX = box.x + box.width / 2
  const originY = box.y + box.height / 2

  await page.evaluate(({ originX, originY, scale }) => {
    const app = document.querySelector('[data-testid="app"]') as HTMLElement || document.body
    app.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
    app.style.transformOrigin = `${originX}px ${originY}px`
    app.style.transform = `scale(${scale})`
  }, { originX, originY, scale })

  await page.waitForTimeout(holdMs)

  await page.evaluate(() => {
    const app = document.querySelector('[data-testid="app"]') as HTMLElement || document.body
    app.style.transform = 'scale(1)'
  })
  await page.waitForTimeout(700)
}

/**
 * Slowly type text (for demo visibility)
 */
export async function slowType(page: Page, selector: string, text: string, speed = RECORDING_DEFAULTS.typingSpeed): Promise<void> {
  const element = page.locator(selector)
  await element.click()
  for (const char of text) {
    await element.press(char === ' ' ? 'Space' : char)
    await page.waitForTimeout(speed)
  }
}

/**
 * Wait and log (for demo pacing)
 */
export async function demoWait(page: Page, label: string, ms: number = RECORDING_DEFAULTS.actionDelay): Promise<void> {
  console.log(`[Demo] ${label}`)
  await page.waitForTimeout(ms)
}

/**
 * Move/copy video file to a destination with proper naming
 */
export function moveVideo(videoPath: string, destDir: string, demoName: string): string {
  const destPath = path.join(destDir, `${demoName}.webm`)

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  fs.copyFileSync(videoPath, destPath)
  console.log(`Video saved: ${destPath}`)
  return destPath
}

/**
 * Create a temporary git repository for testing
 */
export function createTestRepo(name: string, files: Record<string, string> = {}): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `nerv-demo-${name}-`))

  execSync('git init -b main', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.email "demo@nerv.local"', { cwd: tempDir, stdio: 'pipe' })
  execSync('git config user.name "NERV Demo"', { cwd: tempDir, stdio: 'pipe' })

  const defaultFiles: Record<string, string> = {
    'README.md': `# ${name}\n\nA demo project for NERV documentation.\n`,
    'package.json': JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      scripts: {
        test: 'echo "Tests pass"',
        build: 'echo "Build complete"'
      }
    }, null, 2),
    ...files
  }

  for (const [filePath, content] of Object.entries(defaultFiles)) {
    const fullPath = path.join(tempDir, filePath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content)
  }

  execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' })

  return tempDir
}

/**
 * Clean up test repository
 */
export function cleanupTestRepo(repoPath: string): void {
  try {
    const worktreesDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-worktrees`)
    if (fs.existsSync(worktreesDir)) {
      fs.rmSync(worktreesDir, { recursive: true, force: true })
    }
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch (e) {
    console.error(`Failed to cleanup test repo: ${e}`)
  }
}

/**
 * Show a text caption overlay with fade in/out.
 * Used for narrating demo videos — appears as a semi-transparent bar
 * at the specified position with styled text.
 *
 * @param position - 'top' | 'center' | 'bottom' (default: 'bottom')
 * @param durationMs - how long to display before fading out (default: 3000ms)
 */
export async function showCaption(
  page: Page,
  text: string,
  position: 'top' | 'center' | 'bottom' = 'bottom',
  durationMs = 3000
): Promise<void> {
  const positionStyles: Record<string, string> = {
    top: 'top: 40px; bottom: auto;',
    center: 'top: 50%; bottom: auto; transform: translate(-50%, -50%);',
    bottom: 'bottom: 40px; top: auto;',
  }

  await page.evaluate(({ text, posStyle, durationMs }) => {
    const caption = document.createElement('div')
    caption.className = 'nerv-demo-caption'
    caption.textContent = text
    caption.style.cssText = `
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      ${posStyle}
      padding: 12px 28px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.3px;
      border-radius: 8px;
      z-index: 999998;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
      max-width: 80%;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `
    document.body.appendChild(caption)

    // Fade in
    requestAnimationFrame(() => {
      caption.style.opacity = '1'
    })

    // Fade out and remove
    setTimeout(() => {
      caption.style.opacity = '0'
      setTimeout(() => caption.remove(), 500)
    }, durationMs)
  }, { text, posStyle: positionStyles[position], durationMs })

  // Wait for the caption to be visible plus a small buffer
  await page.waitForTimeout(durationMs + 600)
}

/**
 * Show a speed indicator badge (e.g. "2x", "4x") during fast-forwarded segments.
 * Appears as a small pill in the top-right corner. Call with speed=null or 0 to remove.
 *
 * @param speed - multiplier to display (e.g. 2 for "2x"), or null/0 to remove
 */
export async function showSpeedIndicator(page: Page, speed: number | null): Promise<void> {
  await page.evaluate((speed) => {
    // Remove existing indicator
    document.getElementById('nerv-speed-indicator')?.remove()

    if (!speed) return

    const badge = document.createElement('div')
    badge.id = 'nerv-speed-indicator'
    badge.textContent = `${speed}x`
    badge.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 4px 12px;
      background: rgba(255, 160, 0, 0.9);
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 700;
      border-radius: 12px;
      z-index: 999998;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `
    document.body.appendChild(badge)

    requestAnimationFrame(() => {
      badge.style.opacity = '1'
    })
  }, speed)
}

/**
 * Show a numbered step label (e.g. "Step 1: Create project").
 * Appears as a prominent label in the top-left area. Auto-removes after duration.
 *
 * @param stepNum - step number to display
 * @param text - description of the step
 * @param durationMs - how long to display (default: 4000ms)
 */
export async function showStepLabel(
  page: Page,
  stepNum: number,
  text: string,
  durationMs = 4000
): Promise<void> {
  await page.evaluate(({ stepNum, text, durationMs }) => {
    // Remove any existing step label
    document.getElementById('nerv-step-label')?.remove()

    const label = document.createElement('div')
    label.id = 'nerv-step-label'
    label.innerHTML = `<span style="
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #6366f1;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      margin-right: 10px;
      flex-shrink: 0;
    ">${stepNum}</span><span>${text}</span>`
    label.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      padding: 10px 20px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 16px;
      font-weight: 500;
      border-radius: 8px;
      z-index: 999998;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `
    document.body.appendChild(label)

    requestAnimationFrame(() => {
      label.style.opacity = '1'
    })

    setTimeout(() => {
      label.style.opacity = '0'
      setTimeout(() => label.remove(), 500)
    }, durationMs)
  }, { stepNum, text, durationMs })

  // Wait for the label to be visible plus buffer
  await page.waitForTimeout(durationMs + 600)
}

/**
 * Ensure recording directories exist
 */
export function ensureRecordingDirs(...dirs: string[]): void {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}
