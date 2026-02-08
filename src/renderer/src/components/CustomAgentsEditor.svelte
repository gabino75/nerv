<script lang="ts">
  import { onMount } from 'svelte'
  import type { CustomAgentDefinition, CustomAgentsConfig } from '../../../shared/types'

  // Props
  interface Props {
    projectId: string
  }
  let { projectId }: Props = $props()

  // State
  let agents = $state<Record<string, CustomAgentDefinition>>({})
  let isLoading = $state(true)
  let showAddForm = $state(false)
  let newAgentName = $state('')
  let newAgentDescription = $state('')
  let newAgentPrompt = $state('')
  let newAgentTools = $state('')
  let newAgentModel = $state('')
  let editingName = $state<string | null>(null)
  let editDescription = $state('')
  let editPrompt = $state('')
  let editTools = $state('')
  let editModel = $state('')
  let isSaving = $state(false)

  // Load agents from project
  async function loadAgents() {
    isLoading = true
    try {
      const project = await window.api.db.projects.get(projectId)
      if (project?.custom_agents) {
        agents = JSON.parse(project.custom_agents) as CustomAgentsConfig
      } else {
        agents = {}
      }
    } catch (error) {
      console.error('Failed to load custom agents:', error)
      agents = {}
    } finally {
      isLoading = false
    }
  }

  // Save agents to project
  async function saveAgents() {
    isSaving = true
    try {
      const agentsJson = Object.keys(agents).length > 0 ? JSON.stringify(agents) : null
      await window.api.db.projects.update(projectId, { custom_agents: agentsJson })
    } catch (error) {
      console.error('Failed to save custom agents:', error)
    } finally {
      isSaving = false
    }
  }

  // Add new agent
  async function addAgent() {
    if (!newAgentName.trim() || !newAgentDescription.trim() || !newAgentPrompt.trim()) return

    const agentDef: CustomAgentDefinition = {
      description: newAgentDescription.trim(),
      prompt: newAgentPrompt.trim()
    }

    if (newAgentTools.trim()) {
      agentDef.tools = newAgentTools.split(',').map(t => t.trim()).filter(t => t)
    }
    if (newAgentModel.trim()) {
      agentDef.model = newAgentModel.trim()
    }

    agents = { ...agents, [newAgentName.trim()]: agentDef }
    await saveAgents()

    // Reset form
    newAgentName = ''
    newAgentDescription = ''
    newAgentPrompt = ''
    newAgentTools = ''
    newAgentModel = ''
    showAddForm = false
  }

  // Start editing an agent
  function startEdit(name: string) {
    const agent = agents[name]
    if (!agent) return
    editingName = name
    editDescription = agent.description
    editPrompt = agent.prompt
    editTools = agent.tools?.join(', ') || ''
    editModel = agent.model || ''
  }

  // Cancel editing
  function cancelEdit() {
    editingName = null
    editDescription = ''
    editPrompt = ''
    editTools = ''
    editModel = ''
  }

  // Save edit
  async function saveEdit() {
    if (!editingName || !editDescription.trim() || !editPrompt.trim()) return

    const agentDef: CustomAgentDefinition = {
      description: editDescription.trim(),
      prompt: editPrompt.trim()
    }

    if (editTools.trim()) {
      agentDef.tools = editTools.split(',').map(t => t.trim()).filter(t => t)
    }
    if (editModel.trim()) {
      agentDef.model = editModel.trim()
    }

    agents = { ...agents, [editingName]: agentDef }
    await saveAgents()
    cancelEdit()
  }

  // Delete agent
  async function deleteAgent(name: string) {
    if (!confirm(`Remove agent "${name}"?`)) return

    const { [name]: _, ...rest } = agents
    agents = rest
    await saveAgents()
  }

  onMount(() => {
    loadAgents()
  })

  // Reload when project changes
  $effect(() => {
    if (projectId) {
      loadAgents()
    }
  })

  // Get agent names for iteration
  let agentNames = $derived(Object.keys(agents))
</script>

<div class="custom-agents" data-testid="custom-agents-editor">
  <div class="header">
    <h3>Custom Agents</h3>
    <p class="subtitle">Define specialized subagents for Claude to use via the Task tool</p>
    <button
      class="btn-add"
      data-testid="add-agent-btn"
      onclick={() => showAddForm = true}
      disabled={showAddForm}
    >
      + Add Agent
    </button>
  </div>

  {#if isLoading}
    <div class="loading">
      <span class="spinner"></span>
      Loading...
    </div>
  {:else}
    {#if showAddForm}
      <div class="add-form" data-testid="add-agent-form">
        <div class="form-group">
          <label for="agent-name">Agent Name</label>
          <input
            id="agent-name"
            type="text"
            placeholder="e.g., test-runner, code-reviewer"
            bind:value={newAgentName}
            disabled={isSaving}
            data-testid="agent-name-input"
          />
        </div>
        <div class="form-group">
          <label for="agent-description">Description (shown to Claude)</label>
          <input
            id="agent-description"
            type="text"
            placeholder="e.g., Runs unit and integration tests"
            bind:value={newAgentDescription}
            disabled={isSaving}
            data-testid="agent-description-input"
          />
        </div>
        <div class="form-group">
          <label for="agent-prompt">Prompt (instructions for the agent)</label>
          <textarea
            id="agent-prompt"
            placeholder="e.g., Run all tests using npm test. Report any failures with details."
            bind:value={newAgentPrompt}
            disabled={isSaving}
            rows="3"
            data-testid="agent-prompt-input"
          ></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="agent-tools">Tools (optional, comma-separated)</label>
            <input
              id="agent-tools"
              type="text"
              placeholder="e.g., Bash, Read, Grep"
              bind:value={newAgentTools}
              disabled={isSaving}
              data-testid="agent-tools-input"
            />
          </div>
          <div class="form-group">
            <label for="agent-model">Model (optional)</label>
            <input
              id="agent-model"
              type="text"
              placeholder="e.g., haiku, sonnet"
              bind:value={newAgentModel}
              disabled={isSaving}
              data-testid="agent-model-input"
            />
          </div>
        </div>
        <div class="form-actions">
          <button
            class="btn-cancel"
            onclick={() => { showAddForm = false; newAgentName = ''; newAgentDescription = ''; newAgentPrompt = ''; newAgentTools = ''; newAgentModel = '' }}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            class="btn-save"
            data-testid="save-agent-btn"
            onclick={addAgent}
            disabled={isSaving || !newAgentName.trim() || !newAgentDescription.trim() || !newAgentPrompt.trim()}
          >
            {isSaving ? 'Adding...' : 'Add Agent'}
          </button>
        </div>
      </div>
    {/if}

    <div class="agents-list" data-testid="agents-list">
      {#if agentNames.length === 0}
        <div class="empty-state">
          No custom agents configured yet.
          Add specialized agents to help Claude with specific tasks in your project.
        </div>
      {:else}
        {#each agentNames as name}
          <div class="agent-item" class:editing={editingName === name} data-testid="agent-item">
            {#if editingName === name}
              <div class="edit-form">
                <div class="agent-name-header">{name}</div>
                <input
                  type="text"
                  bind:value={editDescription}
                  placeholder="Description"
                  disabled={isSaving}
                />
                <textarea
                  bind:value={editPrompt}
                  placeholder="Prompt"
                  disabled={isSaving}
                  rows="3"
                ></textarea>
                <div class="form-row">
                  <input
                    type="text"
                    bind:value={editTools}
                    placeholder="Tools (comma-separated)"
                    disabled={isSaving}
                  />
                  <input
                    type="text"
                    bind:value={editModel}
                    placeholder="Model"
                    disabled={isSaving}
                  />
                </div>
                <div class="edit-actions">
                  <button class="btn-cancel" onclick={cancelEdit} disabled={isSaving}>Cancel</button>
                  <button
                    class="btn-save"
                    onclick={saveEdit}
                    disabled={isSaving || !editDescription.trim() || !editPrompt.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            {:else}
              <div class="agent-info">
                <span class="agent-name">{name}</span>
                <span class="agent-description">{agents[name].description}</span>
                <span class="agent-prompt">{agents[name].prompt.slice(0, 100)}{agents[name].prompt.length > 100 ? '...' : ''}</span>
                {#if agents[name].tools?.length || agents[name].model}
                  <div class="agent-meta">
                    {#if agents[name].tools?.length}
                      <span class="meta-tag">Tools: {agents[name].tools?.join(', ')}</span>
                    {/if}
                    {#if agents[name].model}
                      <span class="meta-tag">Model: {agents[name].model}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="agent-actions">
                <button class="btn-edit" data-testid="edit-agent-btn" onclick={() => startEdit(name)}>Edit</button>
                <button class="btn-delete" data-testid="delete-agent-btn" onclick={() => deleteAgent(name)}>Remove</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="help-text">
      <p>Custom agents are specialized subagents that Claude can invoke via the Task tool.</p>
      <p>Examples:</p>
      <ul>
        <li><strong>test-runner</strong>: "Run tests and report failures"</li>
        <li><strong>code-reviewer</strong>: "Review code for style and best practices"</li>
        <li><strong>doc-generator</strong>: "Generate documentation for public APIs"</li>
      </ul>
      <p class="note">These agents are passed to Claude via the --agents CLI flag when spawning sessions.</p>
    </div>
  {/if}
</div>

<style>
  .custom-agents {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--color-surface, #12121a);
    border-radius: 8px;
    height: 100%;
    overflow-y: auto;
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

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem;
    font-size: 0.85rem;
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    color: var(--color-text, #e0e0e0);
    font-family: inherit;
    resize: vertical;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary, #ff6b35);
  }

  .form-row {
    display: flex;
    gap: 0.5rem;
  }

  .form-row .form-group {
    flex: 1;
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

  .agents-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--color-muted, #666);
    font-size: 0.85rem;
    background: var(--color-bg, #0a0a0f);
    border-radius: 6px;
  }

  .agent-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-bg, #0a0a0f);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 6px;
  }

  .agent-item.editing {
    flex-direction: column;
    align-items: stretch;
  }

  .agent-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .agent-name {
    font-weight: 600;
    color: var(--color-primary, #ff6b35);
    font-family: 'Fira Code', 'Monaco', monospace;
  }

  .agent-name-header {
    font-weight: 600;
    color: var(--color-primary, #ff6b35);
    font-family: 'Fira Code', 'Monaco', monospace;
    margin-bottom: 0.5rem;
  }

  .agent-description {
    font-size: 0.85rem;
    color: var(--color-text, #e0e0e0);
  }

  .agent-prompt {
    font-size: 0.75rem;
    color: var(--color-muted, #666);
    font-style: italic;
  }

  .agent-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .meta-tag {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 3px;
    color: var(--color-muted, #666);
  }

  .agent-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
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

  .edit-form input,
  .edit-form textarea {
    padding: 0.5rem;
    font-size: 0.85rem;
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    color: var(--color-text, #e0e0e0);
    font-family: inherit;
    resize: vertical;
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

  .help-text strong {
    color: var(--color-primary, #ff6b35);
    font-family: 'Fira Code', 'Monaco', monospace;
  }

  .help-text .note {
    margin-top: 0.5rem;
    font-style: italic;
    color: var(--color-muted, #555);
  }
</style>
