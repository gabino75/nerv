<script lang="ts">
  /**
   * Repositories Panel (PRD Section 25: Repository Management)
   * Lists all repositories for the current project with ability to view context for each.
   */
  import { onMount } from 'svelte'
  import type { Repo } from '../../../shared/types'
  import RepoContextPanel from './RepoContextPanel.svelte'

  interface Props {
    projectId: string | null
    isOpen: boolean
    onClose: () => void
  }

  let { projectId, isOpen, onClose }: Props = $props()

  let repos = $state<Repo[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let selectedRepo = $state<Repo | null>(null)
  let showContextPanel = $state(false)

  async function loadRepos() {
    if (!projectId) {
      repos = []
      return
    }

    loading = true
    error = null
    try {
      repos = await window.api.db.repos.getForProject(projectId)
    } catch (err) {
      console.error('Failed to load repos:', err)
      error = err instanceof Error ? err.message : 'Failed to load repositories'
    } finally {
      loading = false
    }
  }

  function handleViewContext(repo: Repo) {
    selectedRepo = repo
    showContextPanel = true
  }

  function closeContextPanel() {
    showContextPanel = false
    selectedRepo = null
  }

  $effect(() => {
    if (isOpen && projectId) {
      loadRepos()
    }
  })
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="panel-overlay" onclick={onClose} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel-container" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="panel-header">
        <h2>Repositories</h2>
        <button class="close-btn" onclick={onClose}>&times;</button>
      </div>

      <div class="panel-body">
        {#if loading}
          <div class="loading">Loading repositories...</div>
        {:else if error}
          <div class="error">{error}</div>
        {:else if repos.length === 0}
          <div class="empty">
            <p>No repositories added to this project.</p>
            <p class="hint">Add a repository from the Task Board to start working.</p>
          </div>
        {:else}
          <div class="repo-list">
            {#each repos as repo}
              <div class="repo-card">
                <div class="repo-header">
                  <span class="repo-name">{repo.name}</span>
                  {#if repo.source_type}
                    <span class="repo-badge" class:remote={repo.source_type === 'remote'}>
                      {repo.source_type}
                    </span>
                  {/if}
                </div>
                <div class="repo-path" title={repo.path}>{repo.path}</div>
                {#if repo.stack}
                  <div class="repo-stack">{repo.stack}</div>
                {/if}
                {#if repo.base_branch}
                  <div class="repo-branch">
                    <span class="branch-icon">&#x1F500;</span> {repo.base_branch}
                  </div>
                {/if}
                <div class="repo-settings">
                  {#if repo.fetch_before_worktree}
                    <span class="setting-badge" title="Fetches before creating worktrees">fetch on worktree</span>
                  {/if}
                  {#if repo.auto_fetch_on_open}
                    <span class="setting-badge" title="Auto-fetches when project opens">auto-fetch</span>
                  {/if}
                </div>
                <div class="repo-actions">
                  <button class="action-btn" onclick={() => handleViewContext(repo)}>
                    View Context
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="panel-footer">
        <span class="repo-count">{repos.length} repositor{repos.length === 1 ? 'y' : 'ies'}</span>
        <button class="btn-secondary" onclick={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<!-- Repo Context Panel -->
{#if selectedRepo}
  <RepoContextPanel
    repo={selectedRepo}
    isOpen={showContextPanel}
    onClose={closeContextPanel}
  />
{/if}

<style>
  .panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal, 1000);
  }

  .panel-container {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #2a2a3a;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #e0e0e0;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .panel-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #2a2a3a;
  }

  .repo-count {
    font-size: 0.85rem;
    color: #888;
  }

  .btn-secondary {
    padding: 8px 16px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #888;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #252530;
    color: #e0e0e0;
  }

  .loading, .error, .empty {
    padding: 32px;
    text-align: center;
    color: #888;
  }

  .error {
    color: #f44336;
  }

  .empty .hint {
    margin-top: 8px;
    font-size: 0.85rem;
    color: #666;
  }

  .repo-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .repo-card {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    padding: 12px;
  }

  .repo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .repo-name {
    font-weight: 600;
    color: #e0e0e0;
    font-size: 1rem;
  }

  .repo-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: #2a2a3a;
    color: #888;
    text-transform: uppercase;
  }

  .repo-badge.remote {
    background: #1a3a4a;
    color: #4fc3f7;
  }

  .repo-path {
    font-size: 0.8rem;
    color: #666;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 8px;
  }

  .repo-stack {
    font-size: 0.85rem;
    color: #888;
    margin-bottom: 4px;
  }

  .repo-branch {
    font-size: 0.8rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }

  .branch-icon {
    font-size: 0.9rem;
  }

  .repo-settings {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }

  .setting-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: #252530;
    color: #666;
  }

  .repo-actions {
    display: flex;
    justify-content: flex-end;
  }

  .action-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid #4fc3f7;
    color: #4fc3f7;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .action-btn:hover {
    background: #1a3a4a;
  }
</style>
