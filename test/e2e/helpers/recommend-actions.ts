/**
 * Recommend Action Helpers for E2E Tests
 *
 * Utilities for driving the "What's Next?" recommendation panel
 * in Playwright E2E tests. Used by recommend-driven benchmarks
 * and full-workflow tests.
 */

import type { Page } from '@playwright/test'
import { TIMEOUT } from './selectors'

export interface RecommendResult {
  action: string
  title: string
  approved: boolean
}

export interface RecommendLoopResult {
  steps: RecommendResult[]
  completed: boolean
}

/**
 * Open the recommend panel, optionally provide direction, wait for results,
 * and approve a recommendation card.
 */
export async function askAndApproveRecommendation(
  window: Page,
  direction?: string,
  cardIndex = 0
): Promise<RecommendResult> {
  // Open the panel
  const recommendBtn = window.locator('[data-testid="recommend-btn"]')
  await recommendBtn.click()
  await window.waitForTimeout(300)

  // Wait for panel to appear
  await window.locator('[data-testid="recommend-panel"]').waitFor({ timeout: TIMEOUT.ui })

  // Fill direction if provided
  if (direction) {
    const dirInput = window.locator('[data-testid="recommend-direction-input"]')
    await dirInput.fill(direction)
  }

  // Click Ask
  const askBtn = window.locator('[data-testid="recommend-ask-btn"]')
  await askBtn.click()

  // Wait for recommendations to appear (loading → cards)
  const card = window.locator(`[data-testid="recommend-card-${cardIndex}"]`)
  await card.waitFor({ timeout: TIMEOUT.task })

  // Extract info from the card
  const title = await card.locator('.card-title').textContent() || ''
  const actionText = await card.locator('.card-action').textContent() || ''
  const action = actionText.trim().replace(/\s+/g, '_')

  // Approve
  const approveBtn = window.locator(`[data-testid="recommend-approve-${cardIndex}"]`)
  await approveBtn.click()

  // Wait for success message or panel dismissal
  try {
    await window.locator('[data-testid="recommend-execute-success"]').waitFor({ timeout: 5000 })
  } catch {
    // Panel may have already auto-dismissed
  }

  // Wait for auto-dismiss
  await window.waitForTimeout(2000)

  return { action, title: title.trim(), approved: true }
}

/**
 * Drive the workflow through repeated "What's Next?" → Approve cycles.
 * Stops when maxSteps is reached, or when a 'done' phase is recommended,
 * or when recommendations fail.
 */
export async function recommendDrivenLoop(
  window: Page,
  maxSteps: number,
  options: {
    direction?: string
    cardIndex?: number
    delayBetweenSteps?: number
    onStep?: (step: RecommendResult, index: number) => void
  } = {}
): Promise<RecommendLoopResult> {
  const { cardIndex = 0, delayBetweenSteps = 1000, onStep } = options
  const steps: RecommendResult[] = []
  let completed = false

  for (let i = 0; i < maxSteps; i++) {
    try {
      const result = await askAndApproveRecommendation(
        window,
        i === 0 ? options.direction : undefined, // Only provide direction on first step
        cardIndex
      )

      steps.push(result)

      if (onStep) {
        onStep(result, i)
      }

      // Check if we hit a "done" state
      if (result.action === 'done' || result.action.includes('complete')) {
        completed = true
        break
      }

      // Delay between steps
      await window.waitForTimeout(delayBetweenSteps)
    } catch (err) {
      console.log(`[Recommend Loop] Step ${i + 1} failed:`, err)
      break
    }
  }

  return { steps, completed }
}

/**
 * Wait for the recommend panel to be fully dismissed.
 */
export async function waitForRecommendDismissed(window: Page): Promise<void> {
  try {
    await window.locator('[data-testid="recommend-panel"]').waitFor({
      state: 'detached',
      timeout: 5000,
    })
  } catch {
    // Panel may not be present at all
  }
}
