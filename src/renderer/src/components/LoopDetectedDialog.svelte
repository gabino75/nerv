<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { LoopResult } from '../../../shared/types'
  import { LOOP_DETECTION } from '../../../shared/constants'

  // Dialog state
  let showDialog = $state(false)
  let loopResult = $state<LoopResult | null>(null)
  let sessionId = $state<string | null>(null)
  let taskId = $state<string | null>(null)
  let isActioning = $state(false)

  // Listen for loop detection events from main process
  onMount(() => {
    window.api.recovery.onLoopDetected((sid, tid, result) => {
      sessionId = sid
      taskId = tid
      loopResult = result
      showDialog = true
    })
  })

  onDestroy(() => {
    // Cleanup handled by recovery.removeAllListeners in parent
  })

  // Action handlers
  async function handleBranchSession() {
    if (!taskId || !sessionId) return
    isActioning = true
    try {
      await window.api.branching.create(taskId, sessionId, {
        reason: 'loop_detected',
        summary: `Loop detected: ${loopResult?.type ?? 'unknown'} pattern`,
        parentBranch: null
      })
      await window.api.db.audit.log(taskId, 'loop_branch_session', JSON.stringify(loopResult))
      showDialog = false
    } catch (error) {
      console.error('Failed to branch session:', error)
    } finally {
      isActioning = false
    }
  }

  async function handleClearWithSummary() {
    if (!taskId) return
    isActioning = true
    try {
      const summary = {
        attemptedApproaches: loopResult?.pattern ?? [],
        keyLearnings: [`Loop detected: ${loopResult?.type} with ${loopResult?.count ?? 0} repetitions`],
        nextStepsToTry: ['Try a different approach to avoid the detected loop pattern']
      }
      await window.api.branching.generateClearContext(taskId, summary)
      await window.api.db.metrics.resetCompactionsSinceClear(taskId)
      await window.api.db.audit.log(taskId, 'loop_clear_with_summary', JSON.stringify(loopResult))
      showDialog = false
    } catch (error) {
      console.error('Failed to clear with summary:', error)
    } finally {
      isActioning = false
    }
  }

  async function handleContinue() {
    if (!taskId) return
    try {
      await window.api.db.audit.log(taskId, 'loop_continued', JSON.stringify(loopResult))
    } catch {
      // Non-critical
    }
    showDialog = false
  }

  async function handleStopTask() {
    if (!taskId || !sessionId) return
    isActioning = true
    try {
      await window.api.claude.kill(sessionId)
      await window.api.db.tasks.updateStatus(taskId, 'interrupted')
      await window.api.db.audit.log(taskId, 'loop_stopped_task', JSON.stringify(loopResult))
      showDialog = false
    } catch (error) {
      console.error('Failed to stop task:', error)
    } finally {
      isActioning = false
    }
  }

  function dismiss() {
    if (!isActioning) {
      showDialog = false
    }
  }

  function getLoopTypeLabel(type: string): string {
    switch (type) {
      case 'repetition': return 'Repetitive Actions'
      case 'oscillation': return 'Oscillating Pattern'
      default: return 'Loop Detected'
    }
  }
</script>

{#if showDialog && loopResult}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={dismiss} role="dialog" aria-modal="true" aria-labelledby="loop-title" data-testid="loop-detected-dialog">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="presentation">
      <header class="dialog-header">
        <div class="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="header-text">
          <h2 id="loop-title">{getLoopTypeLabel(loopResult.type)}</h2>
          <p class="subtitle">
            Claude has attempted similar actions {loopResult.count ?? LOOP_DETECTION.repeatThreshold} times
            in the last {LOOP_DETECTION.recentWindow} actions
          </p>
        </div>
      </header>

      <div class="dialog-body">
        <!-- Possible causes -->
        <section class="causes-section">
          <h3 class="section-title">Possible causes</h3>
          <ul class="causes-list">
            <li>
              <span class="cause-icon">1</span>
              <span class="cause-text">Current approach is not working and Claude keeps retrying the same strategy</span>
            </li>
            <li>
              <span class="cause-icon">2</span>
              <span class="cause-text">Missing context or information needed to make progress</span>
            </li>
            <li>
              <span class="cause-icon">3</span>
              <span class="cause-text">Task needs human guidance to move past the current obstacle</span>
            </li>
          </ul>
        </section>

        <!-- Pattern details -->
        {#if loopResult.pattern && loopResult.pattern.length > 0}
          <section class="pattern-section">
            <h3 class="section-title">Detected pattern</h3>
            <div class="pattern-list">
              {#each loopResult.pattern.slice(0, 5) as action, i}
                <div class="pattern-item">
                  <span class="pattern-index">{i + 1}</span>
                  <span class="pattern-action">{action}</span>
                </div>
              {/each}
              {#if loopResult.pattern.length > 5}
                <div class="pattern-more">+ {loopResult.pattern.length - 5} more actions</div>
              {/if}
            </div>
          </section>
        {/if}
      </div>

      <footer class="dialog-footer">
        <div class="action-row">
          <button
            class="action-btn branch"
            onclick={handleBranchSession}
            disabled={isActioning}
            data-testid="loop-branch-btn"
          >
            Branch Session
          </button>
          <button
            class="action-btn clear"
            onclick={handleClearWithSummary}
            disabled={isActioning}
            data-testid="loop-clear-btn"
          >
            Clear with Summary
          </button>
          <button
            class="action-btn continue"
            onclick={handleContinue}
            disabled={isActioning}
            data-testid="loop-continue-btn"
          >
            Continue
          </button>
          <button
            class="action-btn stop"
            onclick={handleStopTask}
            disabled={isActioning}
            data-testid="loop-stop-btn"
          >
            Stop Task
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal-overlay);
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-xl);
    width: 90%;
    max-width: 540px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-nerv-border);
    background: linear-gradient(135deg, var(--color-nerv-panel) 0%, var(--color-nerv-panel-hover) 100%);
  }

  .header-icon {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-nerv-warning-bg);
    border-radius: var(--radius-nerv-md);
    color: var(--color-nerv-warning);
  }

  .header-text {
    flex: 1;
  }

  .header-text h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-nerv-warning);
    margin: 0 0 4px;
  }

  .subtitle {
    font-size: 13px;
    color: var(--color-nerv-text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .dialog-body {
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-nerv-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px;
  }

  .causes-section {
    margin-bottom: 20px;
  }

  .causes-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .causes-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: var(--color-nerv-text);
    line-height: 1.4;
  }

  .cause-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: 50%;
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    font-weight: 500;
  }

  .cause-text {
    flex: 1;
  }

  .pattern-section {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
  }

  .pattern-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pattern-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: var(--radius-nerv-sm);
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  .pattern-index {
    color: var(--color-nerv-text-dim);
    min-width: 16px;
  }

  .pattern-action {
    color: var(--color-nerv-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pattern-more {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    padding: 4px 8px;
    font-style: italic;
  }

  .dialog-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--color-nerv-border);
  }

  .action-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-btn {
    flex: 1;
    min-width: 100px;
    padding: 10px 14px;
    border-radius: var(--radius-nerv-md);
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
    white-space: nowrap;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.branch {
    background: var(--color-nerv-info-bg);
    color: var(--color-nerv-info);
    border: 1px solid var(--color-nerv-info-border);
  }

  .action-btn.branch:hover:not(:disabled) {
    background: var(--color-nerv-info-bg-hover);
  }

  .action-btn.clear {
    background: var(--color-nerv-success-bg);
    color: var(--color-nerv-success);
    border: 1px solid transparent;
  }

  .action-btn.clear:hover:not(:disabled) {
    background: var(--color-nerv-success-bg-hover);
  }

  .action-btn.continue {
    background: var(--color-nerv-border);
    color: var(--color-nerv-text);
    border: 1px solid transparent;
  }

  .action-btn.continue:hover:not(:disabled) {
    background: var(--color-nerv-border-hover);
  }

  .action-btn.stop {
    background: var(--color-nerv-error-bg);
    color: var(--color-nerv-error);
    border: 1px solid var(--color-nerv-error-border);
  }

  .action-btn.stop:hover:not(:disabled) {
    background: var(--color-nerv-error-bg-hover);
  }
</style>
