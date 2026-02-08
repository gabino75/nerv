<script lang="ts">
  // ClearWithSummary - UI for resetting context while preserving key learnings
  import { onDestroy } from 'svelte'
  import { currentTask, selectedProject } from '../stores/appState'

  // Props
  interface Props {
    onClearComplete?: (clearContext: string) => void
    onClose?: () => void
  }
  let { onClearComplete, onClose }: Props = $props()

  // Component state
  let isOpen = $state(false)
  let isClearing = $state(false)
  let task = $state<Task | null>(null)
  let projectId = $state<string | null>(null)

  // Summary inputs
  let attemptedApproaches = $state<string[]>([])
  let keyLearnings = $state<string[]>([])
  let nextStepsToTry = $state<string[]>([])

  // Input fields for adding items
  let newApproach = $state('')
  let newLearning = $state('')
  let newStep = $state('')

  // Subscribe to current task and project
  const unsubTask = currentTask.subscribe(t => {
    task = t
  })

  const unsubProject = selectedProject.subscribe(p => {
    projectId = p?.id ?? null
  })

  onDestroy(() => {
    unsubTask()
    unsubProject()
  })

  // Open the dialog
  export function open() {
    isOpen = true
    // Reset inputs
    attemptedApproaches = []
    keyLearnings = []
    nextStepsToTry = []
    newApproach = ''
    newLearning = ''
    newStep = ''
  }

  // Close the dialog
  function close() {
    isOpen = false
    onClose?.()
  }

  // Add/remove helpers for lists
  function addApproach() {
    if (newApproach.trim()) {
      attemptedApproaches = [...attemptedApproaches, newApproach.trim()]
      newApproach = ''
    }
  }

  function removeApproach(index: number) {
    attemptedApproaches = attemptedApproaches.filter((_, i) => i !== index)
  }

  function addLearning() {
    if (newLearning.trim()) {
      keyLearnings = [...keyLearnings, newLearning.trim()]
      newLearning = ''
    }
  }

  function removeLearning(index: number) {
    keyLearnings = keyLearnings.filter((_, i) => i !== index)
  }

  function addStep() {
    if (newStep.trim()) {
      nextStepsToTry = [...nextStepsToTry, newStep.trim()]
      newStep = ''
    }
  }

  function removeStep(index: number) {
    nextStepsToTry = nextStepsToTry.filter((_, i) => i !== index)
  }

  // Generate preview of the summary
  let summaryPreview = $derived(() => {
    const parts: string[] = []

    if (attemptedApproaches.length > 0) {
      parts.push('Attempted approaches:')
      attemptedApproaches.forEach((a, i) => {
        parts.push(`${i + 1}. ${a}`)
      })
      parts.push('')
    }

    if (keyLearnings.length > 0) {
      parts.push('Key learnings:')
      keyLearnings.forEach(l => {
        parts.push(`- ${l}`)
      })
      parts.push('')
    }

    if (nextStepsToTry.length > 0) {
      parts.push('Next steps to try:')
      nextStepsToTry.forEach(s => {
        parts.push(`- ${s}`)
      })
    }

    return parts.join('\n')
  })

  // Clear and restart with summary
  async function clearWithSummary() {
    if (!task || !projectId) return

    isClearing = true

    try {
      const summary = {
        attemptedApproaches,
        keyLearnings,
        nextStepsToTry
      }

      // Generate the clear context
      const clearContext = await window.api.branching.generateClearContext(task.id, summary)

      // PRD Section 6: Reset compactions since last /clear counter
      await window.api.db.metrics.resetCompactionsSinceClear(task.id)

      // Log to audit
      await window.api.db.audit.log(task.id, 'context_cleared_with_summary', JSON.stringify(summary))

      onClearComplete?.(clearContext)
      close()
    } catch (error) {
      console.error('Failed to clear with summary:', error)
    } finally {
      isClearing = false
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="dialog-header">
        <h2>Clear with Summary</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>

      <div class="dialog-content">
        <p class="description">
          This will clear the conversation context and restart with a summary of key learnings.
          Fill in the sections below to preserve important information.
        </p>

        <!-- Attempted Approaches -->
        <div class="section">
          <h3>Attempted approaches:</h3>
          <p class="hint">What has been tried so far? What worked and what didn't?</p>

          <div class="item-list">
            {#each attemptedApproaches as approach, index}
              <div class="item">
                <span class="item-number">{index + 1}.</span>
                <span class="item-text">{approach}</span>
                <button class="remove-btn" onclick={() => removeApproach(index)}>&times;</button>
              </div>
            {/each}
          </div>

          <div class="item-input">
            <input
              type="text"
              bind:value={newApproach}
              placeholder="e.g., Proxy config - didn't work, CORS still failing"
              onkeydown={(e) => e.key === 'Enter' && addApproach()}
            />
            <button onclick={addApproach} disabled={!newApproach.trim()}>Add</button>
          </div>
        </div>

        <!-- Key Learnings -->
        <div class="section">
          <h3>Key learnings:</h3>
          <p class="hint">Important discoveries about the system, API, or problem space.</p>

          <div class="item-list">
            {#each keyLearnings as learning, index}
              <div class="item learning">
                <span class="item-bullet">-</span>
                <span class="item-text">{learning}</span>
                <button class="remove-btn" onclick={() => removeLearning(index)}>&times;</button>
              </div>
            {/each}
          </div>

          <div class="item-input">
            <input
              type="text"
              bind:value={newLearning}
              placeholder="e.g., Server requires specific Origin header"
              onkeydown={(e) => e.key === 'Enter' && addLearning()}
            />
            <button onclick={addLearning} disabled={!newLearning.trim()}>Add</button>
          </div>
        </div>

        <!-- Next Steps -->
        <div class="section">
          <h3>Next steps to try:</h3>
          <p class="hint">Ideas for what to try next based on what was learned.</p>

          <div class="item-list">
            {#each nextStepsToTry as step, index}
              <div class="item step">
                <span class="item-bullet">-</span>
                <span class="item-text">{step}</span>
                <button class="remove-btn" onclick={() => removeStep(index)}>&times;</button>
              </div>
            {/each}
          </div>

          <div class="item-input">
            <input
              type="text"
              bind:value={newStep}
              placeholder="e.g., Check server CORS config directly"
              onkeydown={(e) => e.key === 'Enter' && addStep()}
            />
            <button onclick={addStep} disabled={!newStep.trim()}>Add</button>
          </div>
        </div>

        <!-- Preview -->
        {#if summaryPreview()}
          <div class="section preview-section">
            <h3>Summary preview:</h3>
            <div class="preview">
              <pre>{summaryPreview()}</pre>
            </div>
          </div>
        {/if}
      </div>

      <div class="dialog-footer">
        <button class="cancel-btn" onclick={close} disabled={isClearing}>Cancel</button>
        <button
          class="clear-btn"
          onclick={clearWithSummary}
          disabled={isClearing || !task}
        >
          {isClearing ? 'Clearing...' : 'Clear and Restart'}
        </button>
      </div>
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
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: #1a1a2e;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    width: 550px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .dialog-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .dialog-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .description {
    font-size: 13px;
    color: #888;
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .section {
    margin-bottom: 20px;
  }

  .section h3 {
    font-size: 13px;
    font-weight: 600;
    color: #e0e0e0;
    margin-bottom: 4px;
  }

  .hint {
    font-size: 11px;
    color: #666;
    margin-bottom: 10px;
  }

  .item-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .item.learning {
    border-color: #2a3a2a;
  }

  .item.step {
    border-color: #2a2a3a;
  }

  .item-number {
    color: #666;
    font-weight: 500;
    min-width: 16px;
  }

  .item-bullet {
    color: #666;
    min-width: 12px;
  }

  .item-text {
    flex: 1;
    color: #ccc;
    word-break: break-word;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 16px;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    color: #e88;
  }

  .item-input {
    display: flex;
    gap: 8px;
  }

  .item-input input {
    flex: 1;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 8px 10px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .item-input input:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .item-input button {
    background: #2a2a3a;
    border: none;
    color: #e0e0e0;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .item-input button:hover:not(:disabled) {
    background: #3a3a4a;
  }

  .item-input button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview-section {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #2a2a3a;
  }

  .preview {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 12px;
    max-height: 150px;
    overflow-y: auto;
  }

  .preview pre {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 11px;
    color: #aaa;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid #2a2a3a;
  }

  .cancel-btn {
    background: #2a2a3a;
    border: none;
    color: #e0e0e0;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .cancel-btn:hover:not(:disabled) {
    background: #3a3a4a;
  }

  .clear-btn {
    background: #4a8;
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .clear-btn:hover:not(:disabled) {
    background: #5b9;
  }

  .clear-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
