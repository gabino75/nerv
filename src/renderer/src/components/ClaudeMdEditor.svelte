<script lang="ts">
  import { onMount } from 'svelte'
  import { appStore } from '../stores/appState'

  // Props
  interface Props {
    projectId: string
  }
  let { projectId }: Props = $props()

  // State
  let content = $state<string>('')
  let sections = $state<ClaudeMdSection[]>([])
  let suggestions = $state<ClaudeMdSuggestions | null>(null)
  let isEditing = $state(false)
  let editingSection = $state<string | null>(null)
  let editContent = $state('')
  let isSaving = $state(false)
  let isLoading = $state(true)
  let showSuggestions = $state(false)
  let hasChanges = $state(false)
  let saveMessage = $state<{ type: 'success' | 'error', text: string } | null>(null)

  // Load CLAUDE.md content
  async function loadContent() {
    isLoading = true
    try {
      const exists = await window.api.claudeMd.exists(projectId)
      if (exists) {
        const rawContent = await window.api.claudeMd.read(projectId)
        if (rawContent) {
          content = rawContent
          sections = await window.api.claudeMd.parse(rawContent)
        }
      } else {
        // Initialize with discovered content
        await window.api.claudeMd.initialize(projectId)
        const rawContent = await window.api.claudeMd.read(projectId)
        if (rawContent) {
          content = rawContent
          sections = await window.api.claudeMd.parse(rawContent)
        }
      }
      // Get suggestions for this project
      suggestions = await window.api.claudeMd.getSuggestions(projectId)
    } catch (error) {
      console.error('Failed to load CLAUDE.md:', error)
    } finally {
      isLoading = false
    }
  }

  // Start editing a section
  function startEdit(sectionName: string) {
    const section = sections.find(s => s.name === sectionName)
    if (section) {
      editingSection = sectionName
      editContent = section.content
      isEditing = true
    }
  }

  // Cancel editing
  function cancelEdit() {
    isEditing = false
    editingSection = null
    editContent = ''
  }

  // Save section changes
  async function saveSection() {
    if (!editingSection) return

    isSaving = true
    try {
      const newContent = await window.api.claudeMd.updateSection(projectId, editingSection, editContent)
      content = newContent
      sections = await window.api.claudeMd.parse(newContent)
      saveMessage = { type: 'success', text: 'Section saved' }
      isEditing = false
      editingSection = null
      editContent = ''
      setTimeout(() => saveMessage = null, 3000)
    } catch (error) {
      console.error('Failed to save section:', error)
      saveMessage = { type: 'error', text: 'Failed to save' }
    } finally {
      isSaving = false
    }
  }

  // Save full content
  async function saveFullContent() {
    isSaving = true
    try {
      await window.api.claudeMd.save(projectId, content)
      sections = await window.api.claudeMd.parse(content)
      hasChanges = false
      saveMessage = { type: 'success', text: 'CLAUDE.md saved' }
      setTimeout(() => saveMessage = null, 3000)
    } catch (error) {
      console.error('Failed to save CLAUDE.md:', error)
      saveMessage = { type: 'error', text: 'Failed to save' }
    } finally {
      isSaving = false
    }
  }

  // Apply a suggestion to a section
  async function applySuggestion(sectionName: string, items: string[]) {
    const section = sections.find(s => s.name === sectionName)
    const newItems = items.map(item => `- ${item}`).join('\n')
    const newContent = section ? section.content + '\n' + newItems : newItems

    try {
      const updatedContent = await window.api.claudeMd.updateSection(projectId, sectionName, newContent.trim())
      content = updatedContent
      sections = await window.api.claudeMd.parse(updatedContent)
      saveMessage = { type: 'success', text: 'Suggestions applied' }
      setTimeout(() => saveMessage = null, 3000)
    } catch (error) {
      console.error('Failed to apply suggestions:', error)
    }
  }

  // Regenerate with fresh discovery
  async function regenerate() {
    if (!confirm('This will regenerate CLAUDE.md based on your repos. Any manual edits will be lost. Continue?')) {
      return
    }

    isLoading = true
    try {
      await window.api.claudeMd.initialize(projectId)
      const rawContent = await window.api.claudeMd.read(projectId)
      if (rawContent) {
        content = rawContent
        sections = await window.api.claudeMd.parse(rawContent)
      }
      saveMessage = { type: 'success', text: 'CLAUDE.md regenerated' }
      setTimeout(() => saveMessage = null, 3000)
    } catch (error) {
      console.error('Failed to regenerate:', error)
      saveMessage = { type: 'error', text: 'Failed to regenerate' }
    } finally {
      isLoading = false
    }
  }

  // Handle textarea content changes
  function handleContentChange(event: Event) {
    const target = event.target as HTMLTextAreaElement
    content = target.value
    hasChanges = true
  }

  onMount(() => {
    loadContent()
  })

  // Reload when project changes
  $effect(() => {
    if (projectId) {
      loadContent()
    }
  })
</script>

<div class="claude-md-editor">
  <div class="editor-header">
    <h3>CLAUDE.md</h3>
    <div class="header-info">
      Project conventions for Claude
    </div>
    <div class="header-actions">
      {#if suggestions?.detected && suggestions.detected.length > 0}
        <button
          class="btn-suggestions"
          onclick={() => showSuggestions = !showSuggestions}
          title="Show auto-detected suggestions"
        >
          Suggestions ({suggestions.detected.length})
        </button>
      {/if}
      <button class="btn-regenerate" onclick={regenerate} disabled={isLoading}>
        Regenerate
      </button>
    </div>
  </div>

  {#if isLoading}
    <div class="loading">
      <span class="spinner"></span>
      Loading CLAUDE.md...
    </div>
  {:else}
    {#if showSuggestions && suggestions}
      <div class="suggestions-panel">
        <div class="suggestions-header">
          <span>Detected: {suggestions.detected.join(', ')}</span>
          <button class="btn-close" onclick={() => showSuggestions = false}>Close</button>
        </div>
        <div class="suggestions-grid">
          {#if Object.keys(suggestions.suggestions.commands).length > 0}
            <div class="suggestion-group">
              <h4>Commands</h4>
              <ul>
                {#each Object.entries(suggestions.suggestions.commands) as [cmd, desc]}
                  <li><code>{cmd}</code> - {desc}</li>
                {/each}
              </ul>
              <button
                class="btn-apply"
                onclick={() => applySuggestion('Commands', Object.entries(suggestions!.suggestions.commands).map(([cmd, desc]) => `\`${cmd}\` - ${desc}`))}
              >
                Apply All
              </button>
            </div>
          {/if}
          {#if suggestions.suggestions.environment.length > 0}
            <div class="suggestion-group">
              <h4>Environment</h4>
              <ul>
                {#each suggestions.suggestions.environment as env}
                  <li>{env}</li>
                {/each}
              </ul>
              <button
                class="btn-apply"
                onclick={() => applySuggestion('Environment', suggestions!.suggestions.environment)}
              >
                Apply All
              </button>
            </div>
          {/if}
          {#if suggestions.suggestions.codeStyle.length > 0}
            <div class="suggestion-group">
              <h4>Code Style</h4>
              <ul>
                {#each suggestions.suggestions.codeStyle as style}
                  <li>{style}</li>
                {/each}
              </ul>
              <button
                class="btn-apply"
                onclick={() => applySuggestion('Code Style', suggestions!.suggestions.codeStyle)}
              >
                Apply All
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if saveMessage}
      <div class="save-message {saveMessage.type}">
        {saveMessage.text}
      </div>
    {/if}

    {#if isEditing && editingSection}
      <div class="edit-panel">
        <div class="edit-header">
          <h4>Editing: {editingSection}</h4>
          <div class="edit-actions">
            <button class="btn-cancel" onclick={cancelEdit} disabled={isSaving}>Cancel</button>
            <button class="btn-save" onclick={saveSection} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Section'}
            </button>
          </div>
        </div>
        <textarea
          class="section-editor"
          bind:value={editContent}
          disabled={isSaving}
        ></textarea>
      </div>
    {:else}
      <div class="sections-view">
        {#each sections as section}
          <div class="section">
            <div class="section-header">
              <h4>{section.name}</h4>
              <button class="btn-edit" onclick={() => startEdit(section.name)}>Edit</button>
            </div>
            <pre class="section-content">{section.content || '(empty)'}</pre>
          </div>
        {/each}
      </div>

      <div class="raw-editor">
        <div class="raw-header">
          <h4>Raw Content</h4>
          {#if hasChanges}
            <button class="btn-save" onclick={saveFullContent} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          {/if}
        </div>
        <textarea
          class="content-textarea"
          value={content}
          oninput={handleContentChange}
          disabled={isSaving}
        ></textarea>
      </div>
    {/if}
  {/if}
</div>

<style>
  .claude-md-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface, #12121a);
    border-radius: 8px;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--color-bg, #0a0a0f);
    border-bottom: 1px solid var(--color-border, #2a2a3a);
  }

  .editor-header h3 {
    margin: 0;
    color: var(--color-primary, #ff6b35);
    font-size: 1rem;
  }

  .header-info {
    color: var(--color-muted, #666);
    font-size: 0.75rem;
    flex: 1;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-suggestions,
  .btn-regenerate {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    background: var(--color-surface, #12121a);
    color: var(--color-text, #e0e0e0);
    cursor: pointer;
  }

  .btn-suggestions:hover,
  .btn-regenerate:hover {
    background: var(--color-bg-hover, #1a1a2a);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--color-muted, #666);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border, #2a2a3a);
    border-top-color: var(--color-primary, #ff6b35);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .suggestions-panel {
    background: var(--color-bg, #0a0a0f);
    border-bottom: 1px solid var(--color-border, #2a2a3a);
    padding: 0.75rem;
  }

  .suggestions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
    color: var(--color-muted, #666);
  }

  .btn-close {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 3px;
    background: transparent;
    color: var(--color-text, #e0e0e0);
    cursor: pointer;
  }

  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .suggestion-group {
    background: var(--color-surface, #12121a);
    border-radius: 4px;
    padding: 0.5rem;
  }

  .suggestion-group h4 {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: var(--color-primary, #ff6b35);
  }

  .suggestion-group ul {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.75rem;
    color: var(--color-text, #e0e0e0);
    list-style: disc;
  }

  .suggestion-group li {
    margin-bottom: 0.25rem;
  }

  .suggestion-group code {
    background: var(--color-bg, #0a0a0f);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .btn-apply {
    display: block;
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.35rem;
    font-size: 0.7rem;
    border: 1px solid var(--color-success, #4ade80);
    border-radius: 3px;
    background: transparent;
    color: var(--color-success, #4ade80);
    cursor: pointer;
  }

  .btn-apply:hover {
    background: rgba(74, 222, 128, 0.1);
  }

  .save-message {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    text-align: center;
  }

  .save-message.success {
    background: rgba(74, 222, 128, 0.1);
    color: var(--color-success, #4ade80);
  }

  .save-message.error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-error, #ef4444);
  }

  .edit-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    overflow: hidden;
  }

  .edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .edit-header h4 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text, #e0e0e0);
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-cancel,
  .btn-save,
  .btn-edit {
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

  .btn-edit {
    border-color: var(--color-border, #2a2a3a);
    background: transparent;
    color: var(--color-muted, #666);
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
  }

  .btn-edit:hover {
    color: var(--color-text, #e0e0e0);
    background: var(--color-bg-hover, #1a1a2a);
  }

  .section-editor {
    flex: 1;
    padding: 0.75rem;
    font-family: 'Fira Code', 'Monaco', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    background: var(--color-bg, #0a0a0f);
    color: var(--color-text, #e0e0e0);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    resize: none;
  }

  .sections-view {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .section {
    background: var(--color-bg, #0a0a0f);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--color-surface, #12121a);
    border-bottom: 1px solid var(--color-border, #2a2a3a);
  }

  .section-header h4 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-primary, #ff6b35);
  }

  .section-content {
    margin: 0;
    padding: 0.75rem;
    font-family: 'Fira Code', 'Monaco', monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-text, #e0e0e0);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .raw-editor {
    border-top: 1px solid var(--color-border, #2a2a3a);
    padding: 0.75rem;
  }

  .raw-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .raw-header h4 {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-muted, #666);
  }

  .content-textarea {
    width: 100%;
    height: 200px;
    padding: 0.75rem;
    font-family: 'Fira Code', 'Monaco', monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    background: var(--color-bg, #0a0a0f);
    color: var(--color-text, #e0e0e0);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    resize: vertical;
  }
</style>
