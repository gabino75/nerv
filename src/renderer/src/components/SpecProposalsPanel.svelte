<script lang="ts">
  /**
   * SpecProposalsPanel - Display and resolve spec update proposals from Claude
   *
   * PRD Section 5, lines 896-924: When Claude calls update_spec() via MCP,
   * proposals are queued for human review with [Approve] [Edit & Approve] [Reject] buttons.
   */

  import { onMount, onDestroy } from 'svelte'
  import type { SpecProposal, SpecProposalStatus } from '../../../shared/types'

  // Props
  interface Props {
    projectId: string
  }
  let { projectId }: Props = $props()

  // State
  let proposals = $state<SpecProposal[]>([])
  let expandedId: number | null = $state(null)
  let editingId: number | null = $state(null)
  let editedContent = $state('')
  let resolutionNotes = $state('')
  let isLoading = $state(false)
  let pollInterval: ReturnType<typeof setInterval> | null = null

  // Poll for new proposals
  const POLL_INTERVAL = 2000

  onMount(() => {
    loadProposals()
    pollInterval = setInterval(loadProposals, POLL_INTERVAL)
  })

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval)
    }
  })

  async function loadProposals() {
    try {
      proposals = await window.api.specProposals.getPending(projectId)
    } catch (error) {
      console.error('Failed to load spec proposals:', error)
    }
  }

  function toggleExpand(id: number) {
    if (expandedId === id) {
      expandedId = null
      editingId = null
      editedContent = ''
      resolutionNotes = ''
    } else {
      expandedId = id
      const proposal = proposals.find(p => p.id === id)
      if (proposal) {
        editedContent = proposal.content
      }
    }
  }

  function startEditing(proposal: SpecProposal) {
    editingId = proposal.id
    editedContent = proposal.content
  }

  function cancelEditing() {
    editingId = null
    const proposal = proposals.find(p => p.id === expandedId)
    if (proposal) {
      editedContent = proposal.content
    }
  }

  async function resolveProposal(id: number, status: SpecProposalStatus, content?: string) {
    isLoading = true
    try {
      await window.api.specProposals.resolve(
        id,
        status,
        resolutionNotes || undefined,
        content
      )
      await loadProposals()
      expandedId = null
      editingId = null
      editedContent = ''
      resolutionNotes = ''
    } catch (error) {
      console.error('Failed to resolve spec proposal:', error)
    } finally {
      isLoading = false
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }
</script>

{#if proposals.length > 0}
  <section class="panel spec-proposals" data-testid="spec-proposals-panel">
    <div class="panel-header">
      <h2>Proposed Spec Updates</h2>
      <span class="count-badge">{proposals.length}</span>
    </div>

    <div class="proposal-list">
      {#each proposals as proposal (proposal.id)}
        <div class="proposal-item" class:expanded={expandedId === proposal.id}>
          <button
            class="proposal-header"
            onclick={() => toggleExpand(proposal.id)}
            type="button"
          >
            <span class="section-name">{proposal.section}</span>
            <span class="timestamp">{formatDate(proposal.timestamp)}</span>
            <span class="expand-icon">{expandedId === proposal.id ? '−' : '+'}</span>
          </button>

          {#if expandedId === proposal.id}
            <div class="proposal-details">
              <div class="content-section">
                <label>Proposed Content:</label>
                {#if editingId === proposal.id}
                  <textarea
                    bind:value={editedContent}
                    rows="6"
                    class="content-editor"
                    placeholder="Edit the proposed content..."
                  ></textarea>
                {:else}
                  <pre class="content-preview">{proposal.content}</pre>
                {/if}
              </div>

              <div class="notes-section">
                <label for="notes-{proposal.id}">Resolution Notes (optional):</label>
                <input
                  id="notes-{proposal.id}"
                  type="text"
                  bind:value={resolutionNotes}
                  placeholder="Add a note about this decision..."
                />
              </div>

              <div class="actions">
                {#if editingId === proposal.id}
                  <button
                    class="btn btn-primary"
                    onclick={() => resolveProposal(proposal.id, 'edited', editedContent)}
                    disabled={isLoading}
                  >
                    Save & Approve
                  </button>
                  <button
                    class="btn btn-secondary"
                    onclick={cancelEditing}
                    disabled={isLoading}
                  >
                    Cancel Edit
                  </button>
                {:else}
                  <button
                    class="btn btn-success"
                    onclick={() => resolveProposal(proposal.id, 'approved')}
                    disabled={isLoading}
                  >
                    Approve
                  </button>
                  <button
                    class="btn btn-primary"
                    onclick={() => startEditing(proposal)}
                    disabled={isLoading}
                  >
                    Edit & Approve
                  </button>
                  <button
                    class="btn btn-danger"
                    onclick={() => resolveProposal(proposal.id, 'rejected')}
                    disabled={isLoading}
                  >
                    Reject
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .panel {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-header h2 {
    font-size: 13px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .count-badge {
    font-size: 11px;
    padding: 2px 8px;
    background: #3b82f6;
    border-radius: 10px;
    color: white;
    font-weight: 600;
  }

  .proposal-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .proposal-item {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    overflow: hidden;
  }

  .proposal-item.expanded {
    border-color: #3b82f6;
  }

  .proposal-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #e0e0e0;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }

  .proposal-header:hover {
    background: #252530;
  }

  .section-name {
    font-weight: 500;
    color: #3b82f6;
  }

  .timestamp {
    font-size: 11px;
    color: #666;
  }

  .expand-icon {
    font-size: 16px;
    color: #666;
  }

  .proposal-details {
    padding: 12px;
    border-top: 1px solid #2a2a3a;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .content-section label,
  .notes-section label {
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .content-preview {
    background: #0d0d12;
    padding: 10px;
    border-radius: 4px;
    font-size: 12px;
    color: #c0c0c0;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .content-editor {
    width: 100%;
    background: #0d0d12;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    padding: 10px;
    font-size: 12px;
    color: #e0e0e0;
    font-family: monospace;
    resize: vertical;
  }

  .notes-section input {
    width: 100%;
    background: #0d0d12;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
    color: #e0e0e0;
  }

  .notes-section input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-success {
    background: #22c55e;
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background: #16a34a;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-secondary {
    background: #4a4a5a;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #5a5a6a;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }
</style>
