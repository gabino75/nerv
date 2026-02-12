<script lang="ts">
  /**
   * TaskReviewModal - Modal for reviewing tasks before merge (PRD Section 2, Review Modes section)
   *
   * Shows task details, diff, test results, and Claude's summary for informed review.
   * Allows approving (merge to done) or rejecting (send back for more work).
   * For debug tasks, also shows structured findings with suggested fixes (PRD Section 3).
   *
   * Debug-to-fix handoff: "Create Fix Task" button generates an implementation
   * task from the debug findings (PRD Section 3).
   */

  import Modal from '../shared/Modal.svelte'
  import Button from '../shared/Button.svelte'
  import FormGroup from '../shared/FormGroup.svelte'
  import DebugFindingsPanel from './DebugFindingsPanel.svelte'
  import type { Task, DebugFinding, ReviewContext } from '../../../../shared/types'
  import { appStore } from '../../stores/appState'

  interface Props {
    task: Task
    isOpen: boolean
    onClose: () => void
  }

  let { task, isOpen, onClose }: Props = $props()

  // Check if this is a debug task
  let isDebugTask = $derived(task.task_type === 'debug')

  let reviewNotes = $state('')
  let isApproving = $state(false)
  let isRejecting = $state(false)
  let isCreatingFix = $state(false)
  let fixTaskCreated = $state(false)

  // Review context (diff, test results) for Normal mode (PRD Review Modes section)
  let reviewContext = $state<ReviewContext | null>(null)
  let isLoadingContext = $state(false)
  let showDiff = $state(false)

  // Load review context when modal opens (once per open)
  let lastFetchedTaskId = ''
  $effect(() => {
    if (isOpen && task.worktree_path && task.id !== lastFetchedTaskId) {
      lastFetchedTaskId = task.id
      loadReviewContext()
    }
  })

  async function loadReviewContext() {
    if (isLoadingContext) return
    isLoadingContext = true
    try {
      reviewContext = await window.api.reviews.getContext(task.id)
    } catch (error) {
      console.error('[TaskReviewModal] Failed to load review context:', error)
      reviewContext = null
    } finally {
      isLoadingContext = false
    }
  }

  async function handleApprove() {
    isApproving = true
    try {
      // Approve the review
      await window.api.reviews.approve(task.id, reviewNotes || undefined)
      // Move task to done
      await window.api.db.tasks.updateStatus(task.id, 'done')
      // Reload tasks
      await appStore.loadTasks(task.project_id)
      onClose()
    } catch (error) {
      console.error('[TaskReviewModal] Failed to approve:', error)
    } finally {
      isApproving = false
    }
  }

  async function handleReject() {
    if (!reviewNotes.trim()) {
      return // Notes required for rejection
    }
    isRejecting = true
    try {
      // Reject the review
      await window.api.reviews.reject(task.id, reviewNotes)
      // Move task back to in_progress
      await window.api.db.tasks.updateStatus(task.id, 'in_progress')
      // Reload tasks
      await appStore.loadTasks(task.project_id)
      onClose()
    } catch (error) {
      console.error('[TaskReviewModal] Failed to reject:', error)
    } finally {
      isRejecting = false
    }
  }

  /**
   * Create a fix task from debug findings (PRD Section 3 handoff)
   * Builds task description from root causes and suggested fixes.
   */
  async function handleCreateFixTask() {
    isCreatingFix = true
    try {
      // Load findings for this debug task
      const findings: DebugFinding[] = await window.api.findings.getForTask(task.id)

      // Build fix task description from findings
      const rootCauses = findings.filter(f => f.finding_type === 'root_cause')
      const suggestedFixes = findings.filter(f => f.finding_type === 'suggested_fix')
      const affectedComponents = findings.filter(f => f.finding_type === 'affected_component')

      let description = `Fix task created from debug investigation: "${task.title}"\n\n`

      if (rootCauses.length > 0) {
        description += '## Root Cause(s)\n'
        for (const rc of rootCauses) {
          description += `- **${rc.title}**: ${rc.content}\n`
          if (rc.file_path) description += `  - File: ${rc.file_path}\n`
        }
        description += '\n'
      }

      if (affectedComponents.length > 0) {
        description += '## Affected Components\n'
        for (const ac of affectedComponents) {
          description += `- ${ac.title}`
          if (ac.file_path) description += ` (${ac.file_path})`
          description += '\n'
        }
        description += '\n'
      }

      if (suggestedFixes.length > 0) {
        description += '## Suggested Fixes\n'
        for (const sf of suggestedFixes) {
          description += `### ${sf.title}\n${sf.content}\n`
          if (sf.code_snippet) {
            description += '```\n' + sf.code_snippet + '\n```\n'
          }
          description += '\n'
        }
      }

      description += `\n---\nDebug task reference: ${task.id}`

      // Derive fix task title from debug task title
      const fixTitle = task.title.replace(/^Debug:\s*/i, 'Fix: ')

      // Create the fix task
      await window.api.db.tasks.create(
        task.project_id,
        fixTitle,
        description
      )

      fixTaskCreated = true

      // Reload tasks
      await appStore.loadTasks(task.project_id)
    } catch (error) {
      console.error('[TaskReviewModal] Failed to create fix task:', error)
    } finally {
      isCreatingFix = false
    }
  }

  function resetAndClose() {
    reviewNotes = ''
    fixTaskCreated = false
    showDiff = false
    reviewContext = null
    onClose()
  }
</script>

<Modal isOpen={isOpen} onClose={resetAndClose} title={isDebugTask ? 'Review Debug Findings' : 'Review Task'}>
  <div class="review-content">
    <div class="task-info">
      <div class="task-header">
        <span class="task-title">{task.title}</span>
        {#if isDebugTask}
          <span class="debug-badge">Debug</span>
        {/if}
      </div>
      {#if task.description}
        <div class="task-description">{task.description}</div>
      {/if}
    </div>

    <!-- Review context: diff, test results (PRD Review Modes section) -->
    {#if task.worktree_path && !isDebugTask}
      <div class="review-context" data-testid="review-context">
        <div class="context-header">
          <span class="context-label">Code Changes</span>
          {#if isLoadingContext}
            <span class="loading-indicator">Loading...</span>
          {:else if reviewContext?.error}
            <span class="error-indicator">{reviewContext.error}</span>
          {:else if reviewContext?.gitDiffStats}
            <button
              class="toggle-diff-btn"
              onclick={() => showDiff = !showDiff}
              data-testid="toggle-diff-btn"
            >
              {showDiff ? 'Hide' : 'Show'} Diff
            </button>
          {/if}
        </div>

        {#if reviewContext && !isLoadingContext}
          <!-- Diff stats summary -->
          {#if reviewContext.gitDiffStats}
            <div class="diff-stats" data-testid="diff-stats">
              <pre>{reviewContext.gitDiffStats}</pre>
            </div>
          {/if}

          <!-- Full diff (collapsible) -->
          {#if showDiff && reviewContext.gitDiff}
            <div class="diff-content" data-testid="diff-content">
              <pre>{reviewContext.gitDiff}</pre>
            </div>
          {/if}

          <!-- Test results -->
          {#if reviewContext.testResults !== null}
            <div class="test-results" data-testid="test-results">
              <span class="test-label">Tests:</span>
              {#if reviewContext.testsPass === true}
                <span class="test-pass">Passing</span>
              {:else if reviewContext.testsPass === false}
                <span class="test-fail">Failing</span>
              {:else}
                <span class="test-unknown">Unknown</span>
              {/if}
              {#if reviewContext.testResults}
                <pre class="test-output">{reviewContext.testResults}</pre>
              {/if}
            </div>
          {/if}

          <!-- Claude summary -->
          {#if reviewContext.claudeSummary}
            <div class="claude-summary" data-testid="claude-summary">
              <span class="summary-label">Claude's Summary:</span>
              <p>{reviewContext.claudeSummary}</p>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if isDebugTask}
      <div class="findings-section">
        <DebugFindingsPanel taskId={task.id} editable={true} />
      </div>
    {/if}

    <FormGroup label="Review Notes" hint="Required for rejection, optional for approval">
      <textarea
        bind:value={reviewNotes}
        placeholder="Add feedback or notes about this task..."
        rows="4"
        data-testid="review-notes-input"
      ></textarea>
    </FormGroup>
  </div>

  {#snippet actions()}
    <Button variant="secondary" onclick={resetAndClose}>Cancel</Button>
    {#if isDebugTask}
      <Button
        variant="secondary"
        onclick={handleCreateFixTask}
        disabled={isCreatingFix || fixTaskCreated}
        data-testid="create-fix-task-btn"
      >
        {#if fixTaskCreated}
          Fix Task Created
        {:else if isCreatingFix}
          Creating...
        {:else}
          Create Fix Task
        {/if}
      </Button>
    {/if}
    <Button
      variant="danger"
      onclick={handleReject}
      disabled={!reviewNotes.trim() || isRejecting || isApproving}
      data-testid="reject-review-btn"
    >
      {isRejecting ? 'Rejecting...' : 'Request Changes'}
    </Button>
    <Button
      variant="primary"
      onclick={handleApprove}
      disabled={isApproving || isRejecting}
      data-testid="approve-review-btn"
    >
      {isApproving ? 'Approving...' : 'Approve & Complete'}
    </Button>
  {/snippet}
</Modal>

<style>
  .review-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .task-info {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .task-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-nerv-text);
  }

  .debug-badge {
    background: var(--color-nerv-warning, #f59e0b);
    color: #000;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .task-description {
    font-size: 12px;
    color: var(--color-nerv-text-dim);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .findings-section {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
  }

  textarea {
    width: 100%;
    padding: 10px 12px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    color: var(--color-nerv-text);
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    min-height: 80px;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  textarea::placeholder {
    color: var(--color-nerv-text-dim);
  }

  /* Review context styles (PRD Review Modes section) */
  .review-context {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
  }

  .context-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .context-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-nerv-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .loading-indicator {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
  }

  .error-indicator {
    font-size: 11px;
    color: var(--color-nerv-danger, #ef4444);
  }

  .toggle-diff-btn {
    padding: 4px 8px;
    font-size: 11px;
    background: var(--color-nerv-bg-light);
    border: 1px solid var(--color-nerv-border);
    border-radius: 4px;
    color: var(--color-nerv-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-diff-btn:hover {
    border-color: var(--color-nerv-primary);
    color: var(--color-nerv-primary);
  }

  .diff-stats {
    margin-bottom: 8px;
  }

  .diff-stats pre,
  .diff-content pre,
  .test-output {
    margin: 0;
    padding: 8px;
    background: var(--color-nerv-bg-dark, #0a0a0f);
    border: 1px solid var(--color-nerv-border);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-nerv-text-dim);
    overflow-x: auto;
    white-space: pre;
  }

  .diff-content {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 8px;
  }

  .test-results {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-nerv-border);
  }

  .test-label,
  .summary-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-nerv-text-secondary);
    margin-right: 6px;
  }

  .test-pass {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-nerv-success, #22c55e);
  }

  .test-fail {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-nerv-danger, #ef4444);
  }

  .test-unknown {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
  }

  .test-output {
    margin-top: 6px;
    max-height: 150px;
  }

  .claude-summary {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-nerv-border);
  }

  .claude-summary p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-nerv-text-dim);
    line-height: 1.4;
  }
</style>
