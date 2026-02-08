<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appStore } from '../stores/appState'

  // Dialog visibility
  let showDialog = $state(false)

  // Integrity report
  let report: IntegrityReport | null = $state(null)

  // Track resolved issues
  let resolvedIssues = $state<Set<string>>(new Set())

  // Loading states per task
  let loadingStates = $state<Map<string, boolean>>(new Map())

  // Check for interrupted tasks on mount
  onMount(async () => {
    try {
      const integrityReport = await window.api.recovery.checkIntegrity()
      if (integrityReport.hasInterruptedTasks) {
        report = integrityReport
        showDialog = true
      }
    } catch (error) {
      console.error('Failed to check integrity:', error)
    }
  })

  // Handle resume action
  async function handleResume(task: Task) {
    if (!task) return

    loadingStates.set(task.id, true)
    loadingStates = loadingStates // Trigger reactivity

    try {
      // Update task status back to in_progress
      await window.api.db.tasks.updateStatus(task.id, 'in_progress')

      // Mark as resolved
      resolvedIssues.add(task.id)
      resolvedIssues = resolvedIssues

      // Refresh the store
      await appStore.init()

      checkAllResolved()
    } catch (error) {
      console.error('Failed to resume task:', error)
    } finally {
      loadingStates.set(task.id, false)
      loadingStates = loadingStates
    }
  }

  // Handle start fresh action
  async function handleStartFresh(task: Task) {
    if (!task) return

    loadingStates.set(task.id, true)
    loadingStates = loadingStates

    try {
      // Reset task to todo status, clear session
      await window.api.db.tasks.updateStatus(task.id, 'todo')

      // Mark as resolved
      resolvedIssues.add(task.id)
      resolvedIssues = resolvedIssues

      // Refresh the store
      await appStore.init()

      checkAllResolved()
    } catch (error) {
      console.error('Failed to start fresh:', error)
    } finally {
      loadingStates.set(task.id, false)
      loadingStates = loadingStates
    }
  }

  // Handle abandon action
  async function handleAbandon(task: Task) {
    if (!task) return

    loadingStates.set(task.id, true)
    loadingStates = loadingStates

    try {
      await window.api.recovery.abandonTask(task.id)

      // Mark as resolved
      resolvedIssues.add(task.id)
      resolvedIssues = resolvedIssues

      // Refresh the store
      await appStore.init()

      checkAllResolved()
    } catch (error) {
      console.error('Failed to abandon task:', error)
    } finally {
      loadingStates.set(task.id, false)
      loadingStates = loadingStates
    }
  }

  // Check if all issues are resolved and close dialog
  function checkAllResolved() {
    if (!report) return

    const allResolved = report.issues.every(
      issue => !issue.task || resolvedIssues.has(issue.task.id)
    )

    if (allResolved) {
      showDialog = false
    }
  }

  // Dismiss dialog without action
  function dismissAll() {
    showDialog = false
  }

  // Format time since
  function formatTimeSince(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    return 'just now'
  }
</script>

{#if showDialog && report}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-title" data-testid="recovery-dialog">
    <div class="dialog">
      <header class="dialog-header">
        <h2 id="recovery-title">Recovery Required</h2>
        <p class="subtitle">NERV was not shut down cleanly. The following tasks need attention:</p>
      </header>

      <div class="issues-list">
        {#each report.issues as issue}
          {#if issue.task && !resolvedIssues.has(issue.task.id)}
            <div class="issue-card" class:warning={issue.level === 'warning'} class:error={issue.level === 'error'}>
              <div class="issue-header">
                <span class="issue-icon">{issue.level === 'error' ? '❌' : '⚠️'}</span>
                <h3 class="issue-title">{issue.task.title}</h3>
              </div>

              <div class="issue-details">
                <div class="detail-row">
                  <span class="label">Status:</span>
                  <span class="value status-{issue.task.status}">{issue.task.status}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Worktree:</span>
                  <span class="value">{issue.worktreeExists ? '✅ Exists' : '❌ Missing'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Session:</span>
                  <span class="value">{issue.canResume ? '✅ Can be resumed' : '❌ No session'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Started:</span>
                  <span class="value">{formatTimeSince(issue.task.created_at)}</span>
                </div>
              </div>

              <div class="issue-actions">
                {#if issue.actions.includes('resume')}
                  <button
                    class="action-btn resume"
                    onclick={() => handleResume(issue.task!)}
                    disabled={loadingStates.get(issue.task.id)}
                  >
                    {loadingStates.get(issue.task.id) ? 'Resuming...' : 'Resume Session'}
                  </button>
                {/if}
                {#if issue.actions.includes('start_fresh')}
                  <button
                    class="action-btn fresh"
                    onclick={() => handleStartFresh(issue.task!)}
                    disabled={loadingStates.get(issue.task.id)}
                  >
                    Start Fresh
                  </button>
                {/if}
                {#if issue.actions.includes('abandon')}
                  <button
                    class="action-btn abandon"
                    onclick={() => handleAbandon(issue.task!)}
                    disabled={loadingStates.get(issue.task.id)}
                  >
                    Abandon
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <footer class="dialog-footer">
        <button class="dismiss-btn" onclick={dismissAll}>
          Dismiss (Handle Later)
        </button>
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
    z-index: 2000;
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    padding: 20px 24px;
    border-bottom: 1px solid #2a2a3a;
    background: linear-gradient(135deg, #1a1a24 0%, #252535 100%);
  }

  .dialog-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #ff6b35;
    margin-bottom: 6px;
  }

  .subtitle {
    font-size: 13px;
    color: #888;
  }

  .issues-list {
    padding: 16px 24px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .issue-card {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
  }

  .issue-card.warning {
    border-left: 3px solid #f0ad4e;
  }

  .issue-card.error {
    border-left: 3px solid #d9534f;
  }

  .issue-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .issue-icon {
    font-size: 16px;
  }

  .issue-title {
    font-size: 14px;
    font-weight: 500;
    color: #e0e0e0;
  }

  .issue-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 12px;
  }

  .detail-row {
    display: flex;
    gap: 8px;
  }

  .label {
    color: #666;
  }

  .value {
    color: #aaa;
  }

  .status-in_progress {
    color: #5bc0de;
  }

  .status-interrupted {
    color: #f0ad4e;
  }

  .issue-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 8px 14px;
    border-radius: 6px;
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.resume {
    background: #4a90d9;
    color: white;
  }

  .action-btn.resume:hover:not(:disabled) {
    background: #5aa0e9;
  }

  .action-btn.fresh {
    background: #2a2a3a;
    color: #e0e0e0;
    border: 1px solid #3a3a4a;
  }

  .action-btn.fresh:hover:not(:disabled) {
    background: #3a3a4a;
  }

  .action-btn.abandon {
    background: transparent;
    color: #888;
    border: 1px solid #3a3a4a;
  }

  .action-btn.abandon:hover:not(:disabled) {
    background: rgba(217, 83, 79, 0.1);
    color: #d9534f;
    border-color: #d9534f;
  }

  .dialog-footer {
    padding: 16px 24px;
    border-top: 1px solid #2a2a3a;
    display: flex;
    justify-content: flex-end;
  }

  .dismiss-btn {
    background: transparent;
    color: #666;
    border: none;
    padding: 8px 16px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 6px;
  }

  .dismiss-btn:hover {
    color: #888;
    background: rgba(255, 255, 255, 0.05);
  }
</style>
