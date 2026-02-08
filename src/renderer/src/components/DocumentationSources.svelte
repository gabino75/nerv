<script lang="ts">
  import { onMount } from 'svelte'

  // Props
  interface Props {
    projectId: string
  }
  let { projectId }: Props = $props()

  // State
  let sources = $state<DocumentationSource[]>([])
  let isLoading = $state(true)
  let showAddForm = $state(false)
  let newSourceName = $state('')
  let newSourceUrl = $state('')
  let editingId = $state<string | null>(null)
  let editName = $state('')
  let editUrl = $state('')
  let isSaving = $state(false)

  // Load sources
  async function loadSources() {
    isLoading = true
    try {
      sources = await window.api.db.docSources.getForProject(projectId)
    } catch (error) {
      console.error('Failed to load documentation sources:', error)
    } finally {
      isLoading = false
    }
  }

  // Add new source
  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return

    isSaving = true
    try {
      const source = await window.api.db.docSources.create(projectId, newSourceName, newSourceUrl)
      sources = [...sources, source]
      newSourceName = ''
      newSourceUrl = ''
      showAddForm = false
    } catch (error) {
      console.error('Failed to add documentation source:', error)
    } finally {
      isSaving = false
    }
  }

  // Start editing a source
  function startEdit(source: DocumentationSource) {
    editingId = source.id
    editName = source.name
    editUrl = source.url_pattern
  }

  // Cancel editing
  function cancelEdit() {
    editingId = null
    editName = ''
    editUrl = ''
  }

  // Save edit
  async function saveEdit() {
    if (!editingId || !editName.trim() || !editUrl.trim()) return

    isSaving = true
    try {
      const updated = await window.api.db.docSources.update(editingId, {
        name: editName,
        urlPattern: editUrl
      })
      if (updated) {
        sources = sources.map(s => s.id === editingId ? updated : s)
      }
      cancelEdit()
    } catch (error) {
      console.error('Failed to update documentation source:', error)
    } finally {
      isSaving = false
    }
  }

  // Delete source
  async function deleteSource(id: string) {
    if (!confirm('Remove this documentation source?')) return

    try {
      await window.api.db.docSources.delete(id)
      sources = sources.filter(s => s.id !== id)
    } catch (error) {
      console.error('Failed to delete documentation source:', error)
    }
  }

  onMount(() => {
    loadSources()
  })

  // Reload when project changes
  $effect(() => {
    if (projectId) {
      loadSources()
    }
  })
</script>

<div class="doc-sources">
  <div class="header">
    <h3>Documentation Sources</h3>
    <p class="subtitle">Configure external documentation Claude can search</p>
    <button
      class="btn-add"
      onclick={() => showAddForm = true}
      disabled={showAddForm}
    >
      + Add Source
    </button>
  </div>

  {#if isLoading}
    <div class="loading">
      <span class="spinner"></span>
      Loading...
    </div>
  {:else}
    {#if showAddForm}
      <div class="add-form">
        <div class="form-group">
          <label for="source-name">Name</label>
          <input
            id="source-name"
            type="text"
            placeholder="e.g., Auth0 API Reference"
            bind:value={newSourceName}
            disabled={isSaving}
          />
        </div>
        <div class="form-group">
          <label for="source-url">URL Pattern</label>
          <input
            id="source-url"
            type="text"
            placeholder="e.g., auth0.com/docs"
            bind:value={newSourceUrl}
            disabled={isSaving}
          />
        </div>
        <div class="form-actions">
          <button
            class="btn-cancel"
            onclick={() => { showAddForm = false; newSourceName = ''; newSourceUrl = '' }}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            class="btn-save"
            onclick={addSource}
            disabled={isSaving || !newSourceName.trim() || !newSourceUrl.trim()}
          >
            {isSaving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    {/if}

    <div class="sources-list">
      {#if sources.length === 0}
        <div class="empty-state">
          No documentation sources configured yet.
          Add external documentation URLs to enable Claude to search them during tasks.
        </div>
      {:else}
        {#each sources as source}
          <div class="source-item" class:editing={editingId === source.id}>
            {#if editingId === source.id}
              <div class="edit-form">
                <input
                  type="text"
                  bind:value={editName}
                  placeholder="Name"
                  disabled={isSaving}
                />
                <input
                  type="text"
                  bind:value={editUrl}
                  placeholder="URL Pattern"
                  disabled={isSaving}
                />
                <div class="edit-actions">
                  <button class="btn-cancel" onclick={cancelEdit} disabled={isSaving}>Cancel</button>
                  <button
                    class="btn-save"
                    onclick={saveEdit}
                    disabled={isSaving || !editName.trim() || !editUrl.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            {:else}
              <div class="source-info">
                <span class="source-name">{source.name}</span>
                <span class="source-url">{source.url_pattern}</span>
              </div>
              <div class="source-actions">
                <button class="btn-edit" onclick={() => startEdit(source)}>Edit</button>
                <button class="btn-delete" onclick={() => deleteSource(source.id)}>Remove</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="help-text">
      <p>Claude can search these documentation sources during tasks.</p>
      <p>Examples:</p>
      <ul>
        <li><code>docs.aws.amazon.com/cognito</code> - AWS Cognito docs</li>
        <li><code>auth0.com/docs</code> - Auth0 documentation</li>
        <li><code>react.dev</code> - React documentation</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .doc-sources {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--color-surface, #12121a);
    border-radius: 8px;
  }

  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .header h3 {
    margin: 0;
    color: var(--color-primary, #ff6b35);
    font-size: 1rem;
  }

  .subtitle {
    flex: 1;
    margin: 0;
    color: var(--color-muted, #666);
    font-size: 0.75rem;
  }

  .btn-add {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-success, #4ade80);
    border-radius: 4px;
    background: transparent;
    color: var(--color-success, #4ade80);
    cursor: pointer;
  }

  .btn-add:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.1);
  }

  .btn-add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--color-muted, #666);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border, #2a2a3a);
    border-top-color: var(--color-primary, #ff6b35);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .add-form {
    background: var(--color-bg, #0a0a0f);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .form-group {
    margin-bottom: 0.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-muted, #666);
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem;
    font-size: 0.85rem;
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    color: var(--color-text, #e0e0e0);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary, #ff6b35);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .btn-cancel,
  .btn-save {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-cancel {
    border-color: var(--color-border, #2a2a3a);
    background: transparent;
    color: var(--color-muted, #666);
  }

  .btn-save {
    border-color: var(--color-success, #4ade80);
    background: var(--color-success, #4ade80);
    color: #000;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--color-muted, #666);
    font-size: 0.85rem;
    background: var(--color-bg, #0a0a0f);
    border-radius: 6px;
  }

  .source-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-bg, #0a0a0f);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 6px;
  }

  .source-item.editing {
    flex-direction: column;
    align-items: stretch;
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .source-name {
    font-weight: 500;
    color: var(--color-text, #e0e0e0);
  }

  .source-url {
    font-size: 0.75rem;
    color: var(--color-primary, #ff6b35);
    font-family: 'Fira Code', 'Monaco', monospace;
  }

  .source-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-edit,
  .btn-delete {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
  }

  .btn-edit {
    color: var(--color-muted, #666);
  }

  .btn-edit:hover {
    color: var(--color-text, #e0e0e0);
    background: var(--color-surface, #12121a);
  }

  .btn-delete {
    color: var(--color-error, #ef4444);
  }

  .btn-delete:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .edit-form input {
    padding: 0.5rem;
    font-size: 0.85rem;
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    color: var(--color-text, #e0e0e0);
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .help-text {
    padding: 0.75rem;
    background: var(--color-bg, #0a0a0f);
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--color-muted, #666);
  }

  .help-text p {
    margin: 0 0 0.5rem;
  }

  .help-text ul {
    margin: 0;
    padding-left: 1rem;
  }

  .help-text li {
    margin-bottom: 0.25rem;
  }

  .help-text code {
    background: var(--color-surface, #12121a);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-family: 'Fira Code', 'Monaco', monospace;
    color: var(--color-primary, #ff6b35);
  }
</style>
