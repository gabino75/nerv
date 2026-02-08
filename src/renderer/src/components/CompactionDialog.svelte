<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  // PRD Section 6 / lines 1012-1035: Compaction notification dialog
  // Shows when compactionsSinceClear >= 2, indicating the session is getting long

  const COMPACTION_DIALOG_THRESHOLD = 2

  let showDialog = $state(false)
  let sessionId = $state<string | null>(null)
  let taskId = $state<string | null>(null)
  let compactionCount = $state(0)
  let compactionsSinceClear = $state(0)
  let isActioning = $state(false)

  onMount(() => {
    window.api.recovery.onCompactionNotice((sid, tid, count, sinceClear) => {
      // Only show dialog at threshold; toast handles the rest
      if (sinceClear >= COMPACTION_DIALOG_THRESHOLD) {
        sessionId = sid
        taskId = tid
        compactionCount = count
        compactionsSinceClear = sinceClear
        showDialog = true
      }
    })
  })

  onDestroy(() => {
    // Cleanup handled by recovery.removeAllListeners in parent
  })

  async function handleContinue() {
    if (taskId) {
      try {
        await window.api.db.audit.log(taskId, 'compaction_continued', JSON.stringify({
          compactionCount,
          compactionsSinceClear
        }))
      } catch {
        // Non-critical
      }
    }
    showDialog = false
  }

  async function handleBranchSession() {
    if (!taskId || !sessionId) return
    isActioning = true
    try {
      await window.api.branching.create(taskId, sessionId, {
        reason: 'compaction',
        summary: `Context compacted ${compactionCount} times (${compactionsSinceClear} since last /clear)`,
        parentBranch: null
      })
      await window.api.db.audit.log(taskId, 'compaction_branch_session', JSON.stringify({
        compactionCount,
        compactionsSinceClear
      }))
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
        attemptedApproaches: [],
        keyLearnings: [`Session compacted ${compactionCount} times — context may be losing earlier work`],
        nextStepsToTry: ['Review task progress and continue with fresh context']
      }
      await window.api.branching.generateClearContext(taskId, summary)
      await window.api.db.metrics.resetCompactionsSinceClear(taskId)
      await window.api.db.audit.log(taskId, 'compaction_clear_with_summary', JSON.stringify({
        compactionCount,
        compactionsSinceClear
      }))
      showDialog = false
    } catch (error) {
      console.error('Failed to clear with summary:', error)
    } finally {
      isActioning = false
    }
  }

  function dismiss() {
    if (!isActioning) {
      showDialog = false
    }
  }
</script>

{#if showDialog}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={dismiss} role="dialog" aria-modal="true" aria-labelledby="compaction-title" data-testid="compaction-dialog">
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
          <h2 id="compaction-title">Context Compacted</h2>
          <p class="subtitle">
            Claude Code automatically compacted the context window.
            This is normal for long sessions.
          </p>
        </div>
      </header>

      <div class="dialog-body">
        <section class="stats-section">
          <div class="stat-row">
            <span class="stat-label">Compactions this session:</span>
            <span class="stat-value">{compactionCount}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Since last /clear:</span>
            <span class="stat-value">{compactionsSinceClear}</span>
          </div>
        </section>

        <section class="advice-section">
          <p class="advice-text">
            If Claude seems to be forgetting things or repeating itself, consider:
          </p>
          <ul class="advice-list">
            <li>Using <strong>Branch</strong> to experiment in a fresh context</li>
            <li>Using <strong>Clear with Summary</strong> to reset with key learnings</li>
          </ul>
        </section>
      </div>

      <footer class="dialog-footer">
        <div class="action-row">
          <button
            class="action-btn continue"
            onclick={handleContinue}
            disabled={isActioning}
            data-testid="compaction-continue-btn"
          >
            Continue
          </button>
          <button
            class="action-btn branch"
            onclick={handleBranchSession}
            disabled={isActioning}
            data-testid="compaction-branch-btn"
          >
            Branch Session
          </button>
          <button
            class="action-btn clear"
            onclick={handleClearWithSummary}
            disabled={isActioning}
            data-testid="compaction-clear-btn"
          >
            Clear with Summary
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
    max-width: 500px;
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

  .stats-section {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }

  .stat-label {
    color: var(--color-nerv-text-muted);
  }

  .stat-value {
    color: var(--color-nerv-warning);
    font-weight: 600;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  .advice-section {
    margin: 0;
  }

  .advice-text {
    font-size: 13px;
    color: var(--color-nerv-text);
    margin: 0 0 10px;
    line-height: 1.4;
  }

  .advice-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--color-nerv-text-muted);
    line-height: 1.4;
  }

  .advice-list li::before {
    content: '\2022';
    margin-right: 8px;
    color: var(--color-nerv-text-dim);
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

  .action-btn.continue {
    background: var(--color-nerv-border);
    color: var(--color-nerv-text);
    border: 1px solid transparent;
  }

  .action-btn.continue:hover:not(:disabled) {
    background: var(--color-nerv-border-hover);
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
</style>
