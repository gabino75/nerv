<script lang="ts">
  import { appStore, selectedProject, isProjectReadOnly } from '../stores/appState'
  import LockedProjectDialog from './LockedProjectDialog.svelte'
  import type { InstanceInfo, LockedProjectAction } from '../../../shared/types'

  let showNewProjectModal = $state(false)
  let newProjectName = $state('')
  let newProjectGoal = $state('')

  // Locked project dialog state
  let showLockedDialog = $state(false)
  let lockedProjectId = $state('')
  let lockedProjectName = $state('')
  let lockedBy = $state<InstanceInfo | null>(null)
  let isStale = $state(false)

  function handleNewProject() {
    showNewProjectModal = true
  }

  function closeModal() {
    showNewProjectModal = false
    newProjectName = ''
    newProjectGoal = ''
  }

  async function createProject() {
    if (!newProjectName.trim()) return

    await appStore.addProject(newProjectName.trim(), newProjectGoal.trim() || undefined)
    closeModal()
  }

  async function selectProject(projectId: string) {
    // Try to acquire lock on the project
    const result = await window.api.instance.acquireProjectLock(projectId)

    if (result.success) {
      // Lock acquired, proceed with selection
      appStore.selectProject(projectId)
    } else if (result.lockedBy) {
      // Show locked project dialog
      const project = projects.find(p => p.id === projectId)
      lockedProjectId = projectId
      lockedProjectName = project?.name || 'Unknown Project'
      lockedBy = result.lockedBy
      isStale = result.isStale || false
      showLockedDialog = true
    }
  }

  async function handleLockedAction(action: LockedProjectAction) {
    showLockedDialog = false

    switch (action) {
      case 'open-readonly':
        // Open without lock in read-only mode
        appStore.selectProject(lockedProjectId, true)
        break
      case 'focus-other':
        // Try to focus the other instance
        if (lockedBy) {
          const focused = await window.api.instance.focusInstance(lockedBy.processId)
          if (!focused) {
            // If we couldn't focus programmatically, show a helpful message
            // The user will need to manually switch to the other instance
            console.log(`Unable to focus instance ${lockedBy.processId} automatically. Please switch to the other NERV window manually.`)
          }
        }
        break
      case 'force-open':
        // Force acquire the lock
        await window.api.instance.forceAcquireProjectLock(lockedProjectId)
        appStore.selectProject(lockedProjectId)
        break
      case 'cancel':
        // Do nothing
        break
    }

    // Reset dialog state
    lockedProjectId = ''
    lockedProjectName = ''
    lockedBy = null
    isStale = false
  }

  // Subscribe to store with $state for reactivity
  let projects = $state<Project[]>([])
  let selected = $state<Project | null>(null)
  let readOnly = $state(false)

  appStore.subscribe(state => {
    projects = state.projects
  })

  selectedProject.subscribe(p => {
    selected = p
  })

  isProjectReadOnly.subscribe(r => {
    readOnly = r
  })
</script>

<section class="panel sidebar" data-testid="project-list">
  <h2>Projects</h2>

  {#if projects.length === 0}
    <div class="empty-state">
      <p>No projects yet</p>
      <button class="btn-primary" data-testid="new-project" onclick={handleNewProject}>+ New Project</button>
    </div>
  {:else}
    <div class="project-list">
      {#each projects as project}
        <button
          class="project-item"
          class:selected={selected?.id === project.id}
          class:readonly={selected?.id === project.id && readOnly}
          data-testid="project-item"
          data-project-id={project.id}
          onclick={() => selectProject(project.id)}
        >
          <span class="project-indicator" class:active={selected?.id === project.id} class:readonly={selected?.id === project.id && readOnly}></span>
          <span class="project-name">{project.name}</span>
          {#if selected?.id === project.id && readOnly}
            <span class="readonly-icon" title="Read-only mode">🔒</span>
          {/if}
        </button>
      {/each}
    </div>
    <button class="btn-add" data-testid="add-project" onclick={handleNewProject}>+ New</button>
  {/if}
</section>

{#if showNewProjectModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={closeModal} role="dialog" aria-modal="true" tabindex="-1" data-testid="new-project-dialog">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="presentation">
      <h3>New Project</h3>

      <div class="form-group">
        <label for="project-name">Project Name</label>
        <input
          id="project-name"
          data-testid="project-name-input"
          type="text"
          bind:value={newProjectName}
          placeholder="e.g., OAuth2 Feature"
        />
      </div>

      <div class="form-group">
        <label for="project-goal">Goal</label>
        <textarea
          id="project-goal"
          data-testid="project-goal-input"
          bind:value={newProjectGoal}
          placeholder="Describe what you want to build..."
          rows="3"
        ></textarea>
      </div>

      <div class="modal-actions">
        <button class="btn" onclick={closeModal}>Cancel</button>
        <button
          class="btn-primary"
          data-testid="create-project-btn"
          onclick={createProject}
          disabled={!newProjectName.trim()}
        >
          Create Project
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Locked project dialog -->
<LockedProjectDialog
  isOpen={showLockedDialog}
  projectId={lockedProjectId}
  projectName={lockedProjectName}
  {lockedBy}
  {isStale}
  onAction={handleLockedAction}
/>

<style>
  .panel {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .panel h2 {
    font-size: 13px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .panel {
      padding: 8px;
      gap: 6px;
      border-radius: 6px;
    }
    .panel h2 {
      font-size: 11px;
    }
  }

  @media (max-height: 600px) {
    .panel {
      padding: 8px;
      gap: 6px;
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: #555;
    font-size: 13px;
    gap: 12px;
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: auto;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    min-width: 0;
  }

  @media (max-width: 600px) {
    .project-item {
      padding: 5px 6px;
      font-size: 11px;
      gap: 4px;
    }
  }

  .project-item:hover {
    background: #1a1a24;
    color: #aaa;
  }

  .project-item.selected {
    background: #1a1a24;
    border-color: #ff6b35;
    color: #e0e0e0;
  }

  .project-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #333;
  }

  .project-indicator.active {
    background: #ff6b35;
  }

  .project-indicator.readonly {
    background: #ffb347;
  }

  .project-item.readonly {
    border-color: #ffb347;
  }

  .readonly-icon {
    font-size: 10px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-add {
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed #3a3a4a;
    border-radius: 4px;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-add:hover {
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .btn-primary {
    padding: 8px 16px;
    background: #ff6b35;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #ff8555;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn {
    padding: 8px 16px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #888;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:hover {
    background: #252530;
    color: #aaa;
  }

  /* Modal */
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

  .modal {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    padding: 24px;
    width: 400px;
    max-width: 90vw;
  }

  .modal h3 {
    font-size: 18px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0 0 20px 0;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: #888;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 14px;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
</style>
