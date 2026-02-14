<script lang="ts">
  /**
   * RecommendButton - "What's Next?" actionable recommendation panel
   *
   * Asks Claude to analyze the current project state and recommend
   * 2-3 ranked next steps. Users can approve/execute recommendations
   * directly, or provide direction to steer suggestions.
   */

  import { selectedProject } from '../stores/appState'
  import type { Project } from '../stores/appState'
  import type { Recommendation } from '../../../shared/prompts/recommend'

  interface Props {
    onExecuteAction?: (action: string, data?: Record<string, unknown>) => void
  }

  let { onExecuteAction }: Props = $props()

  let currentProject = $state<Project | null>(null)
  $effect(() => {
    const unsub = selectedProject.subscribe(p => { currentProject = p })
    return () => unsub()
  })

  let isLoading = $state(false)
  let recommendations = $state<Recommendation[]>([])
  let error = $state<string | null>(null)
  let showPanel = $state(false)
  let direction = $state('')
  let executeSuccess = $state<string | null>(null)
  let executingIndex = $state<number | null>(null)

  async function handleAsk() {
    if (!currentProject || isLoading) return

    isLoading = true
    error = null
    recommendations = []
    executeSuccess = null
    showPanel = true

    try {
      const results = await window.api.recommend.getNextWithDirection(
        currentProject.id,
        direction.trim() || undefined
      )
      console.log(`[Recommend] Got ${results.length} recommendations`)
      if (results.length > 0) {
        recommendations = results
      } else {
        error = 'Could not generate recommendations. Is Claude CLI installed?'
      }
    } catch (err) {
      console.log(`[Recommend] Ask ERROR: ${err instanceof Error ? err.message : String(err)}`)
      error = err instanceof Error ? err.message : 'Failed to get recommendations'
    } finally {
      isLoading = false
    }
  }

  async function handleApprove(index: number) {
    if (!currentProject || executingIndex !== null) return

    const rec = recommendations[index]
    if (!rec) return

    executingIndex = index

    try {
      // Clone rec to plain object — Svelte 5 reactive proxies can't be cloned across IPC
      const plainRec = JSON.parse(JSON.stringify(rec))
      const result = await window.api.recommend.execute(currentProject.id, plainRec)
      if (result.success) {
        executeSuccess = `${rec.title}`

        // Handle UI-level actions via callback
        if (result.data?.uiAction && onExecuteAction) {
          onExecuteAction(result.data.uiAction as string, result.data)
        }

        // Auto-dismiss after a short delay
        setTimeout(() => {
          showPanel = false
          recommendations = []
          executeSuccess = null
          direction = ''
        }, 1500)
      } else {
        error = result.error || 'Failed to execute recommendation'
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Execution failed'
    } finally {
      executingIndex = null
    }
  }

  function dismiss() {
    showPanel = false
    recommendations = []
    error = null
    executeSuccess = null
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleAsk()
    }
  }

  const phaseLabels: Record<string, string> = {
    discovery: 'Discovery',
    mvp: 'MVP',
    building: 'Building',
    polish: 'Polish',
    done: 'Complete',
  }
</script>

<div class="recommend-wrapper">
  <button
    class="recommend-btn"
    data-testid="recommend-btn"
    onclick={() => { if (showPanel) { dismiss() } else { showPanel = true } }}
    disabled={!currentProject}
    title="Ask Claude what you should do next"
  >
    What's Next?
  </button>

  {#if showPanel}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="recommend-backdrop" onclick={dismiss}></div>
    <div class="recommend-panel" data-testid="recommend-panel">
      <!-- Direction input -->
      <div class="direction-row">
        <input
          type="text"
          class="direction-input"
          data-testid="recommend-direction-input"
          placeholder="Optional: steer direction (e.g. 'focus on tests')"
          bind:value={direction}
          onkeydown={handleKeydown}
          disabled={isLoading}
        />
        <button
          class="ask-btn"
          data-testid="recommend-ask-btn"
          onclick={handleAsk}
          disabled={!currentProject || isLoading}
        >
          {isLoading ? '...' : 'Ask'}
        </button>
      </div>

      <!-- Success message -->
      {#if executeSuccess}
        <div class="execute-success" data-testid="recommend-execute-success">
          <span class="success-icon">&#10003;</span> {executeSuccess}
        </div>
      {/if}

      <!-- Loading state -->
      {#if isLoading}
        <div class="recommend-loading">
          <div class="spinner"></div>
          <p>Analyzing project state...</p>
        </div>
      {:else if error}
        <div class="recommend-error">
          <p class="error-title">Recommendation unavailable</p>
          <p class="error-msg">{error}</p>
          <button class="dismiss-btn" onclick={dismiss}>Dismiss</button>
        </div>
      {:else if recommendations.length > 0}
        <div class="recommend-cards">
          {#each recommendations as rec, i}
            <div class="recommend-card" data-testid="recommend-card-{i}">
              <div class="card-header">
                <span class="phase-badge phase-{rec.phase}">
                  {phaseLabels[rec.phase] || rec.phase}
                </span>
                <span class="card-action">{rec.action.replace(/_/g, ' ')}</span>
              </div>
              <h4 class="card-title">{rec.title}</h4>
              <p class="card-desc">{rec.description}</p>
              <button
                class="approve-btn"
                data-testid="recommend-approve-{i}"
                onclick={() => handleApprove(i)}
                disabled={executingIndex !== null}
              >
                {executingIndex === i ? 'Executing...' : 'Approve'}
              </button>
            </div>
          {/each}
        </div>
      {:else if !isLoading && !error}
        <div class="recommend-empty">
          <p>Click <strong>Ask</strong> to get recommendations</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recommend-wrapper {
    position: relative;
  }

  .recommend-btn {
    position: relative;
    z-index: 101;
    padding: 8px 16px;
    border: 1px solid #3a6a7a;
    border-radius: var(--radius-nerv-md, 6px);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    background: #1a2a30;
    color: #6bcbcb;
  }

  .recommend-btn:hover:not(:disabled) {
    background: #1a3a40;
    border-color: #4a8a9a;
    color: #8bebeb;
  }

  .recommend-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .recommend-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .recommend-panel {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: #1a1a24;
    border: 1px solid #3a3a5a;
    border-radius: 8px;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
    z-index: 100;
    min-width: 380px;
    max-width: 480px;
    overflow: hidden;
  }

  /* Direction input row */
  .direction-row {
    display: flex;
    gap: 0;
    padding: 10px 12px;
    border-bottom: 1px solid #2a2a3a;
  }

  .direction-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #2a2a3a;
    border-radius: 6px 0 0 6px;
    background: #12121a;
    color: #e0e0e0;
    font-size: 12px;
  }

  .direction-input::placeholder {
    color: #555;
  }

  .direction-input:focus {
    outline: none;
    border-color: #6bcbcb;
  }

  .direction-input:disabled {
    opacity: 0.5;
  }

  .ask-btn {
    padding: 8px 16px;
    background: #1a3a40;
    border: 1px solid #3a6a7a;
    border-left: none;
    border-radius: 0 6px 6px 0;
    color: #6bcbcb;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ask-btn:hover:not(:disabled) {
    background: #1a4a50;
    color: #8bebeb;
  }

  .ask-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Success */
  .execute-success {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(107, 203, 119, 0.1);
    border-bottom: 1px solid rgba(107, 203, 119, 0.2);
    color: #6bcb77;
    font-size: 13px;
    font-weight: 500;
  }

  .success-icon {
    font-size: 16px;
  }

  /* Loading */
  .recommend-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    color: #888;
    font-size: 13px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #2a2a3a;
    border-top-color: #6bcbcb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error */
  .recommend-error {
    padding: 20px;
    text-align: center;
  }

  .error-title {
    color: var(--color-nerv-error, #ff6b6b);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .error-msg {
    color: #888;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .dismiss-btn {
    display: block;
    width: 100%;
    padding: 8px;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    border-radius: 6px;
    color: #ccc;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .dismiss-btn:hover {
    background: #3a3a4a;
    color: #fff;
  }

  /* Cards */
  .recommend-cards {
    display: flex;
    flex-direction: column;
    max-height: 360px;
    overflow-y: auto;
  }

  .recommend-card {
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a3a;
    transition: background 0.1s;
  }

  .recommend-card:last-child {
    border-bottom: none;
  }

  .recommend-card:hover {
    background: #1e1e2a;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .phase-badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .phase-discovery { background: #1a2a3a; color: #4d96ff; }
  .phase-mvp { background: #1a3a1a; color: #6bcb77; }
  .phase-building { background: #1a2a30; color: #6bcbcb; }
  .phase-polish { background: #2a1a3a; color: #c77dff; }
  .phase-done { background: #1a3a1a; color: #6bcb77; }

  .card-action {
    font-size: 10px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
    margin-bottom: 4px;
  }

  .card-desc {
    font-size: 12px;
    color: #999;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .approve-btn {
    padding: 5px 14px;
    background: rgba(107, 203, 203, 0.1);
    border: 1px solid #3a6a7a;
    border-radius: 5px;
    color: #6bcbcb;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .approve-btn:hover:not(:disabled) {
    background: rgba(107, 203, 203, 0.2);
    border-color: #4a8a9a;
    color: #8bebeb;
  }

  .approve-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Empty state */
  .recommend-empty {
    padding: 20px;
    text-align: center;
    color: #666;
    font-size: 13px;
  }

  .recommend-empty strong {
    color: #6bcbcb;
  }
</style>
