<script lang="ts">
  import { appStore } from '../stores/appState'

  // Props
  interface Props {
    task: Task
    projectId: string
    onComplete?: () => void
  }
  let { task, projectId, onComplete }: Props = $props()

  // State
  let isOpen = $state(false)
  let learnings = $state('')
  let addToClaudeMd = $state(true)
  let addToCycleLearnings = $state(true)
  let isSaving = $state(false)

  // Open the dialog
  export function open() {
    learnings = ''
    addToClaudeMd = true
    addToCycleLearnings = true
    isOpen = true
  }

  // Close the dialog
  function close() {
    isOpen = false
    learnings = ''
  }

  // Save learnings
  async function saveLearnings() {
    if (!learnings.trim()) {
      close()
      onComplete?.()
      return
    }

    isSaving = true
    try {
      // Add to CLAUDE.md if selected
      if (addToClaudeMd) {
        await window.api.claudeMd.appendNote(projectId, `[${task.title}] ${learnings}`)
      }

      // Add to task description for future reference
      const existingDescription = task.description || ''
      const newDescription = existingDescription +
        (existingDescription ? '\n\n' : '') +
        `## Learnings\n${learnings}`
      await window.api.tasksExtended.updateDescription(task.id, newDescription)

      // Log the learning capture
      await window.api.db.audit.log(task.id, 'learning_captured', JSON.stringify({ learnings, addToClaudeMd, addToCycleLearnings }))

      close()
      onComplete?.()
    } catch (error) {
      console.error('Failed to save learnings:', error)
    } finally {
      isSaving = false
    }
  }

  // Skip capturing learnings
  function skipLearnings() {
    close()
    onComplete?.()
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="dialog-header">
        <h2>Capture Learnings</h2>
        <p class="task-name">Task: {task.title}</p>
      </div>

      <div class="dialog-content">
        <p class="description">
          What did you learn from this task? This helps Claude and future you.
        </p>

        <div class="form-group">
          <label for="learnings">Learnings & Discoveries</label>
          <textarea
            id="learnings"
            bind:value={learnings}
            placeholder="e.g., Auth0 token response includes id_token we weren't expecting. Their rate limits are aggressive in dev mode."
            disabled={isSaving}
            rows="4"
          ></textarea>
        </div>

        <div class="options">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={addToClaudeMd} disabled={isSaving} />
            Add to project CLAUDE.md (for Claude's context)
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={addToCycleLearnings} disabled={isSaving} />
            Add to cycle learnings (for cycle review)
          </label>
        </div>

        <div class="suggestions">
          <h4>What to capture:</h4>
          <ul>
            <li>Unexpected behaviors or edge cases discovered</li>
            <li>Decisions made and their rationale</li>
            <li>Things to watch out for in future work</li>
            <li>API quirks or undocumented features</li>
          </ul>
        </div>
      </div>

      <div class="dialog-actions">
        <button class="btn-skip" onclick={skipLearnings} disabled={isSaving}>
          Skip
        </button>
        <button
          class="btn-save"
          onclick={saveLearnings}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Learnings'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    padding: 1rem;
    border-bottom: 1px solid var(--color-border, #2a2a3a);
  }

  .dialog-header h2 {
    margin: 0 0 0.25rem;
    color: var(--color-primary, #ff6b35);
    font-size: 1.1rem;
  }

  .task-name {
    margin: 0;
    color: var(--color-muted, #666);
    font-size: 0.85rem;
  }

  .dialog-content {
    padding: 1rem;
    overflow-y: auto;
    flex: 1;
  }

  .description {
    margin: 0 0 1rem;
    color: var(--color-text, #e0e0e0);
    font-size: 0.9rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--color-muted, #666);
    font-size: 0.85rem;
  }

  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.9rem;
    line-height: 1.5;
    background: var(--color-bg, #0a0a0f);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 6px;
    color: var(--color-text, #e0e0e0);
    resize: vertical;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary, #ff6b35);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--color-text, #e0e0e0);
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-primary, #ff6b35);
  }

  .suggestions {
    background: var(--color-bg, #0a0a0f);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .suggestions h4 {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: var(--color-muted, #666);
  }

  .suggestions ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
    color: var(--color-text, #e0e0e0);
  }

  .suggestions li {
    margin-bottom: 0.25rem;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border, #2a2a3a);
  }

  .btn-skip,
  .btn-save {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    border: 1px solid;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-skip {
    border-color: var(--color-border, #2a2a3a);
    background: transparent;
    color: var(--color-muted, #666);
  }

  .btn-skip:hover:not(:disabled) {
    color: var(--color-text, #e0e0e0);
    background: var(--color-bg, #0a0a0f);
  }

  .btn-save {
    border-color: var(--color-success, #4ade80);
    background: var(--color-success, #4ade80);
    color: #000;
  }

  .btn-save:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-skip:disabled,
  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
