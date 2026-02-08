<script lang="ts">
  // MergeBranchDialog - UI for merging branch sessions back to main with learnings
  import type { Branch } from '../../../shared/types'

  // Props
  interface Props {
    onMergeComplete?: (branchId: string, summary: string) => void
    onClose?: () => void
  }
  let { onMergeComplete, onClose }: Props = $props()

  // Component state
  let isOpen = $state(false)
  let isMerging = $state(false)
  let branch = $state<Branch | null>(null)
  let summary = $state('')

  // Open the dialog with a branch
  export function open(branchToMerge: Branch) {
    branch = branchToMerge
    isOpen = true
    summary = ''
  }

  // Close the dialog
  function close() {
    isOpen = false
    branch = null
    onClose?.()
  }

  // Merge the branch
  async function mergeBranch() {
    if (!branch) return

    isMerging = true

    try {
      const result = await window.api.branching.merge(branch.id, summary)

      if (result) {
        // Log to audit
        await window.api.db.audit.log(branch.task_id, 'branch_session_merged', JSON.stringify({
          branchId: branch.id,
          summary
        }))

        onMergeComplete?.(branch.id, summary)
        close()
      }
    } catch (error) {
      console.error('Failed to merge branch:', error)
    } finally {
      isMerging = false
    }
  }

  // Discard the branch
  async function discardBranch() {
    if (!branch) return

    isMerging = true

    try {
      const result = await window.api.branching.discard(branch.id, 'User discarded via UI')

      if (result) {
        // Log to audit
        await window.api.db.audit.log(branch.task_id, 'branch_session_discarded', JSON.stringify({
          branchId: branch.id
        }))

        close()
      }
    } catch (error) {
      console.error('Failed to discard branch:', error)
    } finally {
      isMerging = false
    }
  }
</script>

{#if isOpen && branch}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" data-testid="merge-branch-dialog-overlay" onclick={close} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" data-testid="merge-branch-dialog" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="dialog-header">
        <h2>Merge Branch</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>

      <div class="dialog-content">
        <p class="description">
          Merge learnings from this branch session back to the main context.
        </p>

        <div class="section">
          <h3>What did you learn from this experiment?</h3>
          <textarea
            bind:value={summary}
            data-testid="merge-summary-input"
            placeholder="Describe the solution or learnings from this branch..."
            rows={5}
          ></textarea>
        </div>

        <div class="info-box">
          <strong>What happens when you merge:</strong>
          <ul>
            <li>Branch learnings are recorded</li>
            <li>Branch is marked as merged</li>
            <li>Learnings become part of project knowledge</li>
          </ul>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          class="discard-btn"
          data-testid="discard-branch-btn"
          onclick={discardBranch}
          disabled={isMerging}
          title="Discard this branch without saving learnings"
        >
          Discard
        </button>
        <button class="cancel-btn" onclick={close} disabled={isMerging}>Cancel</button>
        <button
          class="merge-btn"
          data-testid="merge-complete-btn"
          onclick={mergeBranch}
          disabled={isMerging || !summary.trim()}
        >
          {isMerging ? 'Merging...' : 'Merge Branch'}
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
    border-color: #88ffbb;
  }

  .info-box {
    background: #0a2a1a;
    border: 1px solid #1a5a3a;
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 12px;
    color: #88ffbb;
  }

  .info-box strong {
    display: block;
    margin-bottom: 8px;
    color: #aaffcc;
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

  .discard-btn {
    background: #2a1a1a;
    border: 1px solid #5a2a2a;
    color: #ff8888;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    margin-right: auto;
  }

  .discard-btn:hover:not(:disabled) {
    background: #3a1a1a;
    border-color: #7a3a3a;
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

  .merge-btn {
    background: #1a5a3a;
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .merge-btn:hover:not(:disabled) {
    background: #2a7a4a;
  }

  .merge-btn:disabled,
  .cancel-btn:disabled,
  .discard-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
