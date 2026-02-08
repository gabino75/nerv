<script lang="ts">
  // BranchingDialog - UI for creating branch sessions to experiment without polluting main context
  import { onDestroy } from 'svelte'
  import { currentTask, selectedProject } from '../stores/appState'

  // Props
  interface Props {
    onBranchCreated?: (branchId: string, branchContext: string) => void
    onClose?: () => void
  }
  let { onBranchCreated, onClose }: Props = $props()

  // Component state
  let isOpen = $state(false)
  let isCreating = $state(false)
  let task = $state<Task | null>(null)
  let projectId = $state<string | null>(null)

  // Branch context options
  let includeTaskDescription = $state(true)
  let includeWorkSummary = $state(true)
  let includeRecentErrors = $state(true)
  let includeFullHistory = $state(false)

  // User inputs
  let workSummary = $state('')
  let recentErrors = $state<string[]>([])
  let newError = $state('')

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
    workSummary = ''
    recentErrors = []
    newError = ''
    includeTaskDescription = true
    includeWorkSummary = true
    includeRecentErrors = true
    includeFullHistory = false
  }

  // Close the dialog
  function close() {
    isOpen = false
    onClose?.()
  }

  // Add an error to the list
  function addError() {
    if (newError.trim()) {
      recentErrors = [...recentErrors, newError.trim()]
      newError = ''
    }
  }

  // Remove an error
  function removeError(index: number) {
    recentErrors = recentErrors.filter((_, i) => i !== index)
  }

  // Create the branch
  async function createBranch() {
    if (!task || !projectId) return

    isCreating = true

    try {
      const sessionInfo = await window.api.claude.getInfo(task.session_id || '')
      const parentSessionId = sessionInfo?.claudeSessionId || null

      const context = {
        taskDescription: includeTaskDescription ? (task.description || task.title) : '',
        workSummary: includeWorkSummary ? workSummary : '',
        recentErrors: includeRecentErrors ? recentErrors : [],
        includeFullHistory
      }

      const result = await window.api.branching.create(task.id, parentSessionId, context)

      // Log to audit
      await window.api.db.audit.log(task.id, 'branch_session_started', JSON.stringify({
        branchId: result.branch.id
      }))

      onBranchCreated?.(result.branch.id, result.branchContext)
      close()
    } catch (error) {
      console.error('Failed to create branch:', error)
    } finally {
      isCreating = false
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" data-testid="branching-dialog-overlay" onclick={close} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" data-testid="branching-dialog" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="dialog-header">
        <h2>Branch Session</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>

      <div class="dialog-content">
        <p class="description">
          Create a branch to experiment without affecting main session.
          If a solution is found, learnings can be merged back.
        </p>

        <div class="section">
          <h3>Branch context will include:</h3>

          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeTaskDescription} />
            <span>Current task description</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeWorkSummary} />
            <span>Summary of work so far</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeRecentErrors} />
            <span>Recent error messages</span>
          </label>

          <label class="checkbox-option not-recommended">
            <input type="checkbox" bind:checked={includeFullHistory} />
            <span>Full conversation history (not recommended)</span>
          </label>
        </div>

        {#if includeWorkSummary}
          <div class="section">
            <h3>Summary of work so far:</h3>
            <textarea
              bind:value={workSummary}
              placeholder="Describe what has been attempted and the current state..."
              rows={4}
            ></textarea>
          </div>
        {/if}

        {#if includeRecentErrors}
          <div class="section">
            <h3>Recent errors:</h3>
            <div class="error-list">
              {#each recentErrors as error, index}
                <div class="error-item">
                  <span class="error-text">{error}</span>
                  <button class="remove-btn" onclick={() => removeError(index)}>&times;</button>
                </div>
              {/each}
            </div>
            <div class="error-input">
              <input
                type="text"
                bind:value={newError}
                placeholder="Add an error message..."
                onkeydown={(e) => e.key === 'Enter' && addError()}
              />
              <button onclick={addError} disabled={!newError.trim()}>Add</button>
            </div>
          </div>
        {/if}

        <div class="info-box">
          <strong>After branching, you can:</strong>
          <ul>
            <li>Experiment freely</li>
            <li>If solution found: merge learnings back to main</li>
            <li>If not: discard branch, no pollution to main context</li>
          </ul>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="cancel-btn" data-testid="branch-cancel-btn" onclick={close} disabled={isCreating}>Cancel</button>
        <button
          class="create-btn"
          data-testid="branch-create-btn"
          onclick={createBranch}
          disabled={isCreating || !task}
        >
          {isCreating ? 'Creating...' : 'Create Branch'}
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
    width: 500px;
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
    margin-bottom: 10px;
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    cursor: pointer;
    font-size: 13px;
    color: #ccc;
  }

  .checkbox-option input[type="checkbox"] {
    accent-color: #ff6b35;
  }

  .checkbox-option.not-recommended span {
    color: #888;
  }

  textarea {
    width: 100%;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 10px;
    color: #e0e0e0;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .error-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .error-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0a0a0f;
    border: 1px solid #3a2020;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
  }

  .error-text {
    flex: 1;
    color: #e88;
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
  }

  .remove-btn:hover {
    color: #e88;
  }

  .error-input {
    display: flex;
    gap: 8px;
  }

  .error-input input {
    flex: 1;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 8px 10px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .error-input input:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .error-input button {
    background: #2a2a3a;
    border: none;
    color: #e0e0e0;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .error-input button:hover:not(:disabled) {
    background: #3a3a4a;
  }

  .error-input button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .info-box {
    background: #0a1a2a;
    border: 1px solid #1a3a5a;
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 12px;
    color: #88c0ff;
  }

  .info-box strong {
    display: block;
    margin-bottom: 8px;
    color: #aad4ff;
  }

  .info-box ul {
    margin: 0;
    padding-left: 20px;
  }

  .info-box li {
    margin: 4px 0;
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

  .create-btn {
    background: #ff6b35;
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .create-btn:hover:not(:disabled) {
    background: #ff7f4f;
  }

  .create-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
