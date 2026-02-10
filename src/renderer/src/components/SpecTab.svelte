<script lang="ts">
  // SpecTab - Project specification viewer/editor
  // Tab 1: Define WHAT to build
  // Shows spec markdown, action buttons for AI agents, spec proposals

  import { selectedProject } from '../stores/appState'
  import { appStore } from '../stores/appState'
  import type { Project } from '../../../shared/types'

  let project = $state<Project | null>(null)
  let specContent = $state('')
  let isEditing = $state(false)
  let editContent = $state('')
  let agentStatus = $state<{ id: string; type: string }[]>([])

  selectedProject.subscribe(p => { project = p })

  // Track active subagents from store
  appStore.subscribe(state => {
    agentStatus = state.activeSubagents || []
  })

  // Derive spec content from project goal
  $effect(() => {
    if (project) {
      specContent = project.goal
        ? `# ${project.name}\n\n${project.goal}`
        : `# ${project.name}\n\nNo specification found. Use **Build Spec** to generate one from your project goal.`
    } else {
      specContent = ''
    }
  })

  function startEditing() {
    editContent = specContent
    isEditing = true
  }

  function saveSpec() {
    specContent = editContent
    isEditing = false
  }

  function cancelEditing() {
    isEditing = false
    editContent = ''
  }

  // Spec action handlers - dispatch custom events for future wiring
  function handleSpecAction(action: string) {
    if (!project?.id) return
    window.dispatchEvent(new CustomEvent('nerv-spec-action', {
      detail: { action, projectId: project.id }
    }))
  }
</script>

<div class="spec-tab" data-testid="spec-tab">
  {#if !project}
    <div class="spec-empty">
      <div class="empty-icon">S</div>
      <h3>No Project Selected</h3>
      <p>Select or create a project to view its specification.</p>
    </div>
  {:else}
    <div class="spec-header">
      <div class="spec-title">
        <h2>{specFile || 'Project Spec'}</h2>
        {#if specFile}
          <span class="spec-file-badge">{specFile}</span>
        {/if}
      </div>
      <div class="spec-actions">
        {#if isEditing}
          <button class="spec-btn save" onclick={saveSpec}>Save</button>
          <button class="spec-btn cancel" onclick={cancelEditing}>Cancel</button>
        {:else}
          <button class="spec-btn" onclick={startEditing} title="Edit specification">
            Edit
          </button>
          <button class="spec-btn primary" onclick={() => handleSpecAction('build_spec')} title="Generate spec from project goal">
            Build Spec
          </button>
          <button class="spec-btn" onclick={() => handleSpecAction('review_spec')} title="AI review of current spec">
            Review Spec
          </button>
          <button class="spec-btn" onclick={() => handleSpecAction('rewrite_spec')} title="Rewrite spec based on feedback">
            Rewrite
          </button>
        {/if}
      </div>
    </div>

    {#if agentStatus.length > 0}
      <div class="agent-status-bar" data-testid="spec-agent-status">
        {#each agentStatus as agent}
          <span class="agent-badge">
            <span class="agent-dot"></span>
            {agent.type || 'agent'}
          </span>
        {/each}
      </div>
    {/if}

    <div class="spec-content">
      {#if isEditing}
        <textarea
          class="spec-editor"
          bind:value={editContent}
          data-testid="spec-editor"
          spellcheck="false"
        ></textarea>
      {:else}
        <div class="spec-markdown" data-testid="spec-markdown">
          <pre class="spec-pre">{specContent}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .spec-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 8px;
    padding: 8px;
  }

  .spec-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-nerv-text-muted, #888);
    gap: 12px;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    color: var(--color-nerv-primary, #ff6b35);
    border: 2px dashed var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-lg, 8px);
  }

  .spec-empty h3 {
    font-size: 16px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .spec-empty p {
    font-size: 13px;
  }

  .spec-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 12px;
    flex-wrap: wrap;
  }

  .spec-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .spec-title h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .spec-file-badge {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-muted, #888);
    font-family: monospace;
  }

  .spec-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .spec-btn {
    padding: 5px 12px;
    font-size: 12px;
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-muted, #888);
    cursor: pointer;
    transition: all var(--transition-nerv-fast, 0.15s ease);
  }

  .spec-btn:hover {
    background: var(--color-nerv-panel-hover, #1a1a24);
    border-color: var(--color-nerv-border-hover, #3a3a4a);
    color: var(--color-nerv-text, #e0e0e0);
  }

  .spec-btn.primary {
    background: var(--color-nerv-primary, #ff6b35);
    border-color: var(--color-nerv-primary, #ff6b35);
    color: white;
    font-weight: 500;
  }

  .spec-btn.primary:hover {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .spec-btn.save {
    background: var(--color-nerv-success, #6bcb77);
    border-color: var(--color-nerv-success, #6bcb77);
    color: white;
  }

  .spec-btn.cancel {
    color: var(--color-nerv-text-muted, #888);
  }

  .agent-status-bar {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
  }

  .agent-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-nerv-text-muted, #888);
  }

  .agent-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-nerv-success, #6bcb77);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .spec-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--color-nerv-panel-alt, #0d0d12);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
  }

  .spec-editor {
    width: 100%;
    height: 100%;
    padding: 16px;
    background: transparent;
    border: none;
    color: var(--color-nerv-text, #e0e0e0);
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    line-height: 1.6;
    resize: none;
    outline: none;
  }

  .spec-markdown {
    padding: 16px;
    height: 100%;
    overflow: auto;
  }

  .spec-pre {
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-nerv-text, #e0e0e0);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
