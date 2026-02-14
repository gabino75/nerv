<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { selectedProject } from '../stores/appState'
  import type { Project } from '../stores/appState'
  import type { WorktreeInfo, WorktreeStatus, ProjectWorktrees } from '../../../shared/types'
  import AddRepoDialog from './AddRepoDialog.svelte'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let currentProject = $state<Project | null>(null)
  let projectWorktrees = $state<ProjectWorktrees[]>([])
  let worktreeStatuses = $state<Map<string, WorktreeStatus>>(new Map())
  let loading = $state(false)
  let selectedWorktree = $state<string | null>(null)
  let cleaningUp = $state(false)
  let showAddRepoDialog = $state(false)

  $effect(() => {
    const unsub = selectedProject.subscribe(p => { currentProject = p })
    return () => unsub()
  })

  async function loadWorktrees() {
    if (!currentProject) return

    loading = true
    try {
      projectWorktrees = await window.api.worktree.listForProject(currentProject.id)

      // Collect all worktree paths
      const allWorktrees = projectWorktrees.flatMap(repo => repo.worktrees)

      // Fetch all statuses in parallel then batch update
      const statusPromises = allWorktrees.map(async wt => {
        try {
          const status = await window.api.worktree.getStatus(wt.path)
          return { path: wt.path, status }
        } catch (err) {
          console.error(`Failed to get status for ${wt.path}:`, err)
          return null
        }
      })

      const results = await Promise.all(statusPromises)

      // Single batch update to avoid multiple re-renders
      const newStatuses = new Map<string, WorktreeStatus>()
      for (const result of results) {
        if (result) newStatuses.set(result.path, result.status)
      }
      worktreeStatuses = newStatuses
    } catch (err) {
      console.error('Failed to load worktrees:', err)
    } finally {
      loading = false
    }
  }

  async function handleRemoveWorktree(worktreePath: string) {
    const status = worktreeStatuses.get(worktreePath)

    // Warn if there are uncommitted changes
    if (status?.hasChanges) {
      const confirmed = confirm(
        'This worktree has uncommitted changes that will be lost. Are you sure you want to remove it?'
      )
      if (!confirmed) return
    }

    try {
      await window.api.worktree.remove(worktreePath)
      // Reload worktrees
      await loadWorktrees()
    } catch (err) {
      console.error('Failed to remove worktree:', err)
      alert(`Failed to remove worktree: ${err}`)
    }
  }

  async function handleCleanupRepo(repoPath: string) {
    cleaningUp = true
    try {
      const cleaned = await window.api.worktree.cleanup(repoPath)
      if (cleaned.length > 0) {
        alert(`Cleaned up ${cleaned.length} worktree(s)`)
      } else {
        alert('No worktrees to clean up')
      }
      await loadWorktrees()
    } catch (err) {
      console.error('Failed to cleanup worktrees:', err)
      alert(`Failed to cleanup: ${err}`)
    } finally {
      cleaningUp = false
    }
  }

  function extractTaskId(branch: string): string | null {
    const match = branch.match(/^nerv\/([^-]+)-/)
    return match ? match[1] : null
  }

  function formatPath(path: string): string {
    // Shorten path for display
    const parts = path.replace(/\\/g, '/').split('/')
    if (parts.length > 3) {
      return '.../' + parts.slice(-3).join('/')
    }
    return path
  }

  $effect(() => {
    if (isOpen && currentProject) {
      loadWorktrees()
    }
  })
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" data-testid="worktree-panel" onclick={onClose} role="dialog" aria-modal="true" tabindex="-1">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-content" onclick={(e) => e.stopPropagation()} role="presentation">
    <div class="modal-header">
      <h2>Worktree Management</h2>
      <div class="header-actions">
        <button
          class="btn-add-sm"
          data-testid="add-repo-header-btn"
          onclick={() => showAddRepoDialog = true}
        >
          + Add Repo
        </button>
        <button class="close-btn" onclick={onClose}>x</button>
      </div>
    </div>

    <div class="modal-body">
      {#if loading}
        <div class="loading">Loading worktrees...</div>
      {:else if projectWorktrees.length === 0}
        <div class="empty-state">
          <p>No repositories configured for this project.</p>
          <p class="hint">Add repositories to enable worktree management.</p>
          <button
            class="btn-add-repo"
            data-testid="add-repo-btn"
            onclick={() => showAddRepoDialog = true}
          >
            + Add Repository
          </button>
        </div>
      {:else}
        {#each projectWorktrees as repo}
          <div class="repo-section">
            <div class="repo-header">
              <div class="repo-info">
                <span class="repo-name">{repo.repoName}</span>
                <span class="repo-path">{formatPath(repo.repoPath)}</span>
              </div>
              <button
                class="cleanup-btn"
                data-testid="cleanup-worktrees-btn"
                onclick={() => handleCleanupRepo(repo.repoPath)}
                disabled={cleaningUp || repo.worktrees.length === 0}
                title="Remove worktrees for completed/abandoned tasks"
              >
                {cleaningUp ? 'Cleaning...' : 'Cleanup'}
              </button>
            </div>

            {#if repo.worktrees.length === 0}
              <div class="no-worktrees">No active worktrees</div>
            {:else}
              <div class="worktree-list">
                {#each repo.worktrees as wt}
                  {@const status = worktreeStatuses.get(wt.path)}
                  {@const taskId = extractTaskId(wt.branch)}
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                  <div
                    class="worktree-item"
                    class:selected={selectedWorktree === wt.path}
                    data-testid="worktree-item"
                    data-worktree-path={wt.path}
                    onclick={() => selectedWorktree = wt.path === selectedWorktree ? null : wt.path}
                    role="button"
                    tabindex="0"
                  >
                    <div class="worktree-main">
                      <div class="worktree-branch">
                        <span class="branch-name">{wt.branch}</span>
                        {#if taskId}
                          <span class="task-badge">{taskId}</span>
                        {/if}
                      </div>
                      <div class="worktree-status">
                        {#if status?.hasChanges}
                          <span class="status-badge changes" title="Has uncommitted changes">
                            {status.files.length} change{status.files.length !== 1 ? 's' : ''}
                          </span>
                        {/if}
                        {#if status && status.ahead > 0}
                          <span class="status-badge ahead" title="Commits ahead of remote">
                            +{status.ahead}
                          </span>
                        {/if}
                        {#if status && status.behind > 0}
                          <span class="status-badge behind" title="Commits behind remote">
                            -{status.behind}
                          </span>
                        {/if}
                      </div>
                    </div>

                    {#if selectedWorktree === wt.path}
                      <div class="worktree-details">
                        <div class="detail-row">
                          <span class="detail-label">Path:</span>
                          <span class="detail-value">{wt.path}</span>
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">Commit:</span>
                          <span class="detail-value mono">{wt.commit.substring(0, 8)}</span>
                        </div>
                        {#if status?.hasChanges && status.files.length > 0}
                          <div class="changed-files">
                            <span class="detail-label">Changed files:</span>
                            <ul>
                              {#each status.files.slice(0, 5) as file}
                                <li>{file}</li>
                              {/each}
                              {#if status.files.length > 5}
                                <li class="more">...and {status.files.length - 5} more</li>
                              {/if}
                            </ul>
                          </div>
                        {/if}
                        <div class="worktree-actions">
                          <button
                            class="remove-btn"
                            data-testid="remove-worktree-btn"
                            onclick={(e) => { e.stopPropagation(); handleRemoveWorktree(wt.path) }}
                          >
                            Remove Worktree
                          </button>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="modal-footer">
      <div class="help-text">
        Worktrees are created automatically when starting tasks. Clean up removes worktrees for completed tasks.
      </div>
      <button class="btn-secondary" onclick={onClose}>Close</button>
    </div>
  </div>
</div>
{/if}

{#if currentProject}
  <AddRepoDialog
    isOpen={showAddRepoDialog}
    projectId={currentProject.id}
    onClose={() => showAddRepoDialog = false}
    onRepoAdded={() => loadWorktrees()}
  />
{/if}

<style>
  .modal-overlay {
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

  .modal-content {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: #e0e0e0;
    background: #2a2a3a;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .loading, .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #666;
  }

  .empty-state .hint {
    font-size: 12px;
    margin-top: 8px;
  }

  .repo-section {
    margin-bottom: 20px;
  }

  .repo-section:last-child {
    margin-bottom: 0;
  }

  .repo-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #1a1a24;
    border-radius: 8px 8px 0 0;
    border: 1px solid #2a2a3a;
    border-bottom: none;
  }

  .repo-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .repo-name {
    font-weight: 600;
    color: #e0e0e0;
    font-size: 14px;
  }

  .repo-path {
    font-size: 11px;
    color: #666;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .cleanup-btn {
    padding: 6px 12px;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    border-radius: 4px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
  }

  .cleanup-btn:hover:not(:disabled) {
    background: #3a3a4a;
    color: #e0e0e0;
  }

  .cleanup-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-worktrees {
    padding: 20px;
    text-align: center;
    color: #555;
    font-size: 13px;
    font-style: italic;
    background: #0d0d12;
    border: 1px solid #2a2a3a;
    border-radius: 0 0 8px 8px;
  }

  .worktree-list {
    border: 1px solid #2a2a3a;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }

  .worktree-item {
    padding: 12px;
    background: #0d0d12;
    border-bottom: 1px solid #2a2a3a;
    cursor: pointer;
    transition: background 0.15s;
  }

  .worktree-item:last-child {
    border-bottom: none;
  }

  .worktree-item:hover {
    background: #151520;
  }

  .worktree-item.selected {
    background: #1a1a28;
  }

  .worktree-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .worktree-branch {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .branch-name {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
    color: #88c0ff;
  }

  .task-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: #2a2a4a;
    border-radius: 4px;
    color: #888;
  }

  .worktree-status {
    display: flex;
    gap: 6px;
  }

  .status-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .status-badge.changes {
    background: #3a2a1a;
    color: #ffd93d;
  }

  .status-badge.ahead {
    background: #1a3a2a;
    color: #6bcb77;
  }

  .status-badge.behind {
    background: #3a1a1a;
    color: #ff6b6b;
  }

  .worktree-details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #2a2a3a;
  }

  .detail-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .detail-label {
    color: #666;
    min-width: 60px;
  }

  .detail-value {
    color: #aaa;
    word-break: break-all;
  }

  .detail-value.mono {
    font-family: 'SF Mono', Monaco, monospace;
  }

  .changed-files {
    margin-top: 8px;
  }

  .changed-files ul {
    margin: 4px 0 0 16px;
    padding: 0;
    font-size: 11px;
    color: #888;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .changed-files li {
    margin-bottom: 2px;
  }

  .changed-files .more {
    color: #666;
    font-style: italic;
  }

  .worktree-actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
  }

  .remove-btn {
    padding: 6px 12px;
    background: #2a1a1a;
    border: 1px solid #4a2a2a;
    border-radius: 4px;
    color: #ff6b6b;
    font-size: 12px;
    cursor: pointer;
  }

  .remove-btn:hover {
    background: #3a1a1a;
    border-color: #5a3a3a;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-top: 1px solid #2a2a3a;
    background: #0d0d12;
  }

  .help-text {
    font-size: 11px;
    color: #555;
    max-width: 400px;
  }

  .btn-secondary {
    padding: 8px 16px;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #3a3a4a;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-add-sm {
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed #3a3a4a;
    border-radius: 4px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-add-sm:hover {
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .btn-add-repo {
    margin-top: 16px;
    padding: 10px 20px;
    background: #ff6b35;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-add-repo:hover {
    background: #ff8555;
  }
</style>
