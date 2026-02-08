<script lang="ts">
  import { appStore, selectedProject } from '../stores/appState'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let activeTab = $state<'export' | 'import'>('export')
  let projectId = $state<string | null>(null)
  let isExporting = $state(false)
  let isImporting = $state(false)
  let importText = $state('')
  let error = $state<string | null>(null)
  let success = $state<string | null>(null)

  selectedProject.subscribe(p => { projectId = p?.id ?? null })

  async function handleExport() {
    if (!projectId) {
      error = 'No project selected'
      return
    }

    isExporting = true
    error = null
    success = null

    try {
      const data = await window.api.projectIO.export(projectId)
      if (!data) {
        error = 'Failed to export project'
        return
      }

      // Create a downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nerv-project-${data.project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      success = `Exported "${data.project.name}" successfully`
    } catch (err) {
      error = err instanceof Error ? err.message : 'Export failed'
    } finally {
      isExporting = false
    }
  }

  async function handleImport() {
    if (!importText.trim()) {
      error = 'Please paste project data to import'
      return
    }

    isImporting = true
    error = null
    success = null

    try {
      const data = JSON.parse(importText)

      // Validate the data structure
      if (!data.project?.name) {
        error = 'Invalid project data: missing project name'
        return
      }

      const project = await window.api.projectIO.import(data)
      success = `Imported "${project.name}" successfully`

      // Refresh the projects list
      await appStore.init()

      // Clear import text
      importText = ''
    } catch (err) {
      if (err instanceof SyntaxError) {
        error = 'Invalid JSON format'
      } else {
        error = err instanceof Error ? err.message : 'Import failed'
      }
    } finally {
      isImporting = false
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      importText = e.target?.result as string
    }
    reader.onerror = () => {
      error = 'Failed to read file'
    }
    reader.readAsText(file)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      onClose()
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      onClose()
    }
  }

  function clearMessages() {
    error = null
    success = null
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal">
      <header class="modal-header">
        <h2>Export / Import Project</h2>
        <button class="close-btn" onclick={onClose} title="Close">x</button>
      </header>

      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'export'}
          onclick={() => { activeTab = 'export'; clearMessages() }}
        >
          Export
        </button>
        <button
          class="tab"
          class:active={activeTab === 'import'}
          onclick={() => { activeTab = 'import'; clearMessages() }}
        >
          Import
        </button>
      </div>

      <div class="modal-content">
        {#if error}
          <div class="message error">{error}</div>
        {/if}
        {#if success}
          <div class="message success">{success}</div>
        {/if}

        {#if activeTab === 'export'}
          <div class="section">
            <p class="description">
              Export the current project including all tasks, cycles, decisions, repositories, and documentation sources.
            </p>

            {#if projectId}
              <button
                class="btn-primary"
                onclick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? 'Exporting...' : 'Export Project'}
              </button>
            {:else}
              <p class="no-project">Select a project first to export</p>
            {/if}
          </div>
        {:else}
          <div class="section">
            <p class="description">
              Import a project from an exported JSON file. This will create a new project with the imported data.
            </p>

            <div class="file-input-wrapper">
              <label class="file-label">
                <input
                  type="file"
                  accept=".json"
                  onchange={handleFileSelect}
                />
                <span class="file-btn">Choose File</span>
              </label>
              <span class="file-hint">or paste JSON below</span>
            </div>

            <textarea
              class="import-textarea"
              bind:value={importText}
              placeholder='Paste exported project JSON here...'
              rows="10"
            ></textarea>

            <button
              class="btn-primary"
              onclick={handleImport}
              disabled={isImporting || !importText.trim()}
            >
              {isImporting ? 'Importing...' : 'Import Project'}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
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

  .modal {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #2a2a3a;
  }

  .tab {
    flex: 1;
    padding: 12px;
    background: none;
    border: none;
    color: #888;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    color: #e0e0e0;
  }

  .tab.active {
    color: #ff6b35;
    border-bottom-color: #ff6b35;
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
  }

  .message {
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .message.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .message.success {
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.3);
    color: #4ade80;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .description {
    font-size: 13px;
    color: #888;
    line-height: 1.5;
  }

  .no-project {
    font-size: 13px;
    color: #666;
    text-align: center;
    padding: 20px;
    background: #0a0a0f;
    border-radius: 6px;
  }

  .file-input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .file-label {
    cursor: pointer;
  }

  .file-label input {
    display: none;
  }

  .file-btn {
    display: inline-block;
    padding: 8px 16px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    transition: all 0.15s;
  }

  .file-btn:hover {
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .file-hint {
    font-size: 12px;
    color: #555;
  }

  .import-textarea {
    width: 100%;
    padding: 12px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    resize: vertical;
  }

  .import-textarea:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .import-textarea::placeholder {
    color: #444;
  }

  .btn-primary {
    padding: 10px 20px;
    background: #ff6b35;
    border: none;
    border-radius: 6px;
    color: #0a0a0f;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    align-self: flex-start;
  }

  .btn-primary:hover:not(:disabled) {
    background: #ff8c5a;
  }

  .btn-primary:disabled {
    background: #3a3a4a;
    color: #666;
    cursor: not-allowed;
  }
</style>
