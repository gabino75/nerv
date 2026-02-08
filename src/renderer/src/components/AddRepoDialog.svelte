<script lang="ts">
  /**
   * AddRepoDialog - Dialog for adding a repository to a project (PRD Section 25)
   *
   * Supports:
   * - Remote URL: NERV clones to project folder
   * - Local path: NERV uses existing repo as-is
   * - Base branch configuration
   * - Fetch settings
   *
   * Usage:
   * <AddRepoDialog
   *   isOpen={showDialog}
   *   projectId={currentProject.id}
   *   onClose={() => showDialog = false}
   *   onRepoAdded={handleRepoAdded}
   * />
   */
  import Modal from './shared/Modal.svelte'
  import FormGroup from './shared/FormGroup.svelte'
  import Button from './shared/Button.svelte'

  type RepoSourceType = 'local' | 'remote'

  interface Props {
    isOpen: boolean
    projectId: string
    onClose: () => void
    onRepoAdded?: (repo: { id: string; name: string; path: string; stack: string | null }) => void
  }

  let { isOpen, projectId, onClose, onRepoAdded }: Props = $props()

  let sourceType = $state<RepoSourceType>('local')
  let repoName = $state('')
  let repoPath = $state('')  // Path for local, URL for remote
  let baseBranch = $state('main')
  let repoStack = $state('')
  let fetchBeforeWorktree = $state(true)
  let autoFetchOnOpen = $state(true)
  let loading = $state(false)
  let error = $state<string | null>(null)

  const stackOptions = [
    { value: '', label: 'Select stack (optional)' },
    { value: 'node', label: 'Node.js' },
    { value: 'react', label: 'React' },
    { value: 'python', label: 'Python' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'java', label: 'Java' },
    { value: 'other', label: 'Other' }
  ]

  function resetForm() {
    sourceType = 'local'
    repoName = ''
    repoPath = ''
    baseBranch = 'main'
    repoStack = ''
    fetchBeforeWorktree = true
    autoFetchOnOpen = true
    error = null
    loading = false
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleBrowse() {
    try {
      const result = await window.api.dialog.selectDirectory()
      if (result) {
        repoPath = result
        // Auto-fill name from path if not set
        if (!repoName) {
          const parts = result.replace(/\\/g, '/').split('/')
          repoName = parts[parts.length - 1] || ''
        }
      }
    } catch (err) {
      console.error('Failed to select directory:', err)
    }
  }

  async function handleSubmit() {
    if (!repoName.trim() || !repoPath.trim()) {
      error = 'Repository name and path are required'
      return
    }

    loading = true
    error = null

    try {
      const repo = await window.api.db.repos.create(
        projectId,
        repoName.trim(),
        repoPath.trim(),
        {
          stack: repoStack || undefined,
          sourceType,
          baseBranch: baseBranch.trim() || 'main',
          fetchBeforeWorktree,
          autoFetchOnOpen
        }
      )
      onRepoAdded?.(repo)
      handleClose()
    } catch (err) {
      error = `Failed to add repository: ${err}`
    } finally {
      loading = false
    }
  }
</script>

<Modal {isOpen} onClose={handleClose} title="Add Repository">
  <!-- Source Type (PRD Section 25) -->
  <FormGroup label="Source" id="source-type">
    <div class="radio-group">
      <label class="radio-option">
        <input
          type="radio"
          name="source-type"
          value="remote"
          bind:group={sourceType}
          disabled={loading}
        />
        Remote URL
      </label>
      <label class="radio-option">
        <input
          type="radio"
          name="source-type"
          value="local"
          bind:group={sourceType}
          disabled={loading}
        />
        Local Path
      </label>
    </div>
  </FormGroup>

  <!-- URL/Path input -->
  <FormGroup label={sourceType === 'remote' ? 'Repository URL' : 'Repository Path'} id="repo-path">
    <div class="path-input">
      <input
        id="repo-path"
        data-testid="repo-path"
        type="text"
        bind:value={repoPath}
        placeholder={sourceType === 'remote' ? 'https://github.com/user/repo' : '/path/to/repository'}
        disabled={loading}
      />
      {#if sourceType === 'local'}
        <Button variant="small" onclick={handleBrowse} disabled={loading}>
          Browse
        </Button>
      {/if}
    </div>
  </FormGroup>

  <FormGroup label="Repository Name" id="repo-name">
    <input
      id="repo-name"
      data-testid="repo-name"
      type="text"
      bind:value={repoName}
      placeholder="e.g., backend, frontend"
      disabled={loading}
    />
  </FormGroup>

  <!-- Base Branch (PRD Section 25) -->
  <FormGroup label="Base Branch" id="base-branch">
    <input
      id="base-branch"
      data-testid="base-branch"
      type="text"
      bind:value={baseBranch}
      placeholder="main"
      disabled={loading}
    />
    <span class="hint">Branch to base features from</span>
  </FormGroup>

  <FormGroup label="Technology Stack" id="repo-stack">
    <select
      id="repo-stack"
      data-testid="repo-stack"
      bind:value={repoStack}
      disabled={loading}
    >
      {#each stackOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </FormGroup>

  <!-- Fetch Settings (PRD Section 25) -->
  <div class="checkbox-group">
    <label class="checkbox-option">
      <input
        type="checkbox"
        bind:checked={fetchBeforeWorktree}
        disabled={loading}
      />
      Fetch latest before creating worktrees
    </label>
    <label class="checkbox-option">
      <input
        type="checkbox"
        bind:checked={autoFetchOnOpen}
        disabled={loading}
      />
      Auto-fetch on project open
    </label>
  </div>

  {#if error}
    <p class="error-message">{error}</p>
  {/if}

  {#snippet actions()}
    <Button variant="secondary" onclick={handleClose} disabled={loading}>
      Cancel
    </Button>
    <Button
      variant="primary"
      onclick={handleSubmit}
      disabled={loading || !repoName.trim() || !repoPath.trim()}
    >
      {loading ? 'Adding...' : 'Add Repository'}
    </Button>
  {/snippet}
</Modal>

<style>
  .path-input {
    display: flex;
    gap: 8px;
  }

  .path-input input {
    flex: 1;
  }

  .error-message {
    color: var(--color-nerv-error);
    font-size: 12px;
    margin: 8px 0;
  }

  .radio-group {
    display: flex;
    gap: 24px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--color-nerv-text);
  }

  .radio-option input[type="radio"] {
    cursor: pointer;
    accent-color: var(--color-nerv-primary);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    padding: 12px;
    background: var(--color-nerv-bg-secondary);
    border-radius: var(--radius-nerv-sm);
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--color-nerv-text);
  }

  .checkbox-option input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--color-nerv-primary);
  }

  .hint {
    display: block;
    font-size: 11px;
    color: var(--color-nerv-text-secondary);
    margin-top: 4px;
  }

  select {
    width: 100%;
    padding: 10px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 13px;
    font-family: inherit;
  }

  select:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  select:disabled {
    opacity: 0.5;
  }
</style>
