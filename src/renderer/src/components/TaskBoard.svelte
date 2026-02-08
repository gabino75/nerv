<script lang="ts">
  /**
   * TaskBoard - Kanban-style task board (PRD Section: Task Management)
   *
   * Displays tasks in columns by status:
   * - todo: Tasks waiting to be started
   * - in_progress: Currently active task
   * - interrupted: Paused tasks that can be resumed
   * - review: Tasks awaiting approval (with review gate)
   * - done: Completed tasks
   */

  import { appStore, projectTasks, selectedProject, currentTask, isProjectReadOnly } from '../stores/appState'
  import type { Task, Project, TaskStatus, Cycle, BuiltInSkill, DocumentationSource, ReviewMode } from '../../../shared/types'
  import { TASK_STATUS_CONFIG, TASK_TYPE_LABELS } from '../../../shared/constants'
  import TaskReviewModal from './task/TaskReviewModal.svelte'
  import ReviewModeToggle from './ReviewModeToggle.svelte'
  import { onMount } from 'svelte'

  // Column order matches the task workflow
  const COLUMN_ORDER: TaskStatus[] = ['todo', 'in_progress', 'interrupted', 'review', 'done']

  let showNewTaskModal = $state(false)
  let newTaskTitle = $state('')
  let newTaskDescription = $state('')
  let newTaskType = $state<'implementation' | 'research' | 'bug-fix' | 'refactor' | 'debug'>('implementation')
  let researchQuestions = $state('')
  let activeCycle = $state<Cycle | null>(null)
  let assignToCycle = $state(true)
  let selectedSkill = $state<string>('')
  let availableSkills = $state<BuiltInSkill[]>([])

  // Research task specific state (PRD Section 4)
  let documentationSources = $state<DocumentationSource[]>([])
  let selectedDocSources = $state<Set<string>>(new Set())
  let outputAddToClaudeMd = $state(true)
  let outputCreateAdr = $state(true)
  let outputProposeImplementation = $state(false)

  // Review modal state
  let showReviewModal = $state(false)
  let taskToReview = $state<Task | null>(null)

  // Store subscriptions
  let tasks = $state<Task[]>([])
  let project = $state<Project | null>(null)
  let activeTask = $state<Task | null>(null)
  let isRunning = $state(false)

  let readOnly = $state(false)

  projectTasks.subscribe(t => { tasks = t })
  selectedProject.subscribe(p => { project = p })
  currentTask.subscribe(t => { activeTask = t })
  appStore.subscribe(state => { isRunning = state.isTaskRunning })
  isProjectReadOnly.subscribe(r => { readOnly = r })

  // Review mode state (PRD Review Modes section)
  let reviewMode = $derived<ReviewMode>(project?.review_mode || 'normal')

  async function handleReviewModeChange(mode: ReviewMode) {
    if (!project) return
    try {
      await window.api.db.projects.update(project.id, { review_mode: mode })
      // Reload project to update state
      await appStore.loadProjects()
    } catch (error) {
      console.error('Failed to update review mode:', error)
    }
  }

  // Load available skills on mount
  onMount(async () => {
    try {
      availableSkills = await window.api.skills.discover()
    } catch (error) {
      console.error('Failed to load skills:', error)
    }
  })

  // Group tasks by status for Kanban columns
  let tasksByStatus = $derived.by(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [], in_progress: [], interrupted: [], review: [], done: []
    }
    for (const task of tasks) {
      if (grouped[task.status]) grouped[task.status].push(task)
    }
    return grouped
  })

  async function handleNewTask() {
    showNewTaskModal = true
    // Load active cycle when opening modal
    if (project) {
      activeCycle = await window.api.db.cycles.getActive(project.id) ?? null
      assignToCycle = !!activeCycle
      // Load documentation sources for research tasks (PRD Section 4)
      try {
        documentationSources = await window.api.db.docSources.getForProject(project.id)
        selectedDocSources = new Set(documentationSources.map(d => d.id))
      } catch (error) {
        console.error('Failed to load documentation sources:', error)
        documentationSources = []
      }
    }
  }

  function closeModal() {
    showNewTaskModal = false
    newTaskTitle = ''
    newTaskDescription = ''
    newTaskType = 'implementation'
    researchQuestions = ''
    activeCycle = null
    assignToCycle = true
    selectedSkill = ''
    // Reset research task specific state
    selectedDocSources = new Set()
    outputAddToClaudeMd = true
    outputCreateAdr = true
    outputProposeImplementation = false
  }

  async function createTask() {
    if (!newTaskTitle.trim() || !project) return
    let fullDescription = newTaskDescription.trim()
    if (newTaskType === 'research' && researchQuestions.trim()) {
      fullDescription = (fullDescription ? fullDescription + '\n\n' : '') +
        '## Research Questions\n' + researchQuestions.trim()
    }
    // Add documentation sources for research tasks (PRD Section 4)
    if (newTaskType === 'research' && selectedDocSources.size > 0) {
      const selectedSources = documentationSources.filter(d => selectedDocSources.has(d.id))
      if (selectedSources.length > 0) {
        fullDescription = (fullDescription ? fullDescription + '\n\n' : '') +
          '## Documentation Sources\n' +
          selectedSources.map(s => `- ${s.name}: ${s.url_pattern}`).join('\n')
      }
    }
    // Add output options for research tasks (PRD Section 4)
    if (newTaskType === 'research') {
      const outputOptions: string[] = []
      if (outputAddToClaudeMd) outputOptions.push('Add findings to project CLAUDE.md')
      if (outputCreateAdr) outputOptions.push('Create decision record (ADR)')
      if (outputProposeImplementation) outputOptions.push('Propose implementation tasks')
      if (outputOptions.length > 0) {
        fullDescription = (fullDescription ? fullDescription + '\n\n' : '') +
          '## Expected Output\n' +
          outputOptions.map(o => `- [x] ${o}`).join('\n')
      }
    }
    if (newTaskType === 'debug' && researchQuestions.trim()) {
      fullDescription = (fullDescription ? fullDescription + '\n\n' : '') +
        '## Debug Investigation\n' + researchQuestions.trim()
    }
    // Add skill invocation to description if selected
    if (selectedSkill) {
      const skillPrompt = await window.api.skills.generatePrompt(selectedSkill)
      if (skillPrompt) {
        fullDescription = (fullDescription ? fullDescription + '\n\n' : '') +
          '## Workflow Template\n' + skillPrompt
      }
    }
    const cycleId = assignToCycle && activeCycle ? activeCycle.id : undefined
    await window.api.tasksExtended.createWithType(
      project.id, newTaskTitle.trim(), newTaskType, fullDescription || undefined, cycleId
    )
    await appStore.loadTasks(project.id)
    closeModal()
  }

  function getStatusConfig(status: TaskStatus) {
    return TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.todo
  }

  function formatTaskType(type: Task['task_type']): string {
    return TASK_TYPE_LABELS[type] || 'Impl'
  }

  function getTaskDisplayId(task: Task): string {
    const parts = task.id.split('-')
    return `T${parts[0].slice(-4)}`
  }

  function getColumnClass(status: TaskStatus): string {
    return `column-${status.replace('_', '-')}`
  }

  function openReviewModal(task: Task) {
    taskToReview = task
    showReviewModal = true
  }

  function closeReviewModal() {
    showReviewModal = false
    taskToReview = null
  }

  async function submitForReview(task: Task) {
    // Move task to review status and create review record
    await window.api.db.tasks.updateStatus(task.id, 'review')
    await window.api.reviews.create(task.id)
    if (project) {
      await appStore.loadTasks(project.id)
    }
  }
</script>

<section class="kanban-board" data-testid="task-list">
  <div class="board-header">
    <h2>Task Board{#if readOnly}<span class="readonly-badge" title="Project opened read-only">Read-Only</span>{/if}</h2>
    <div class="header-controls">
      <ReviewModeToggle
        projectId={project?.id ?? null}
        {reviewMode}
        onModeChange={handleReviewModeChange}
        disabled={readOnly}
      />
      <button class="btn-add-top" data-testid="add-task-btn" onclick={handleNewTask} disabled={!project || readOnly} title={readOnly ? 'Cannot add tasks in read-only mode' : ''}>
        + Add Task
      </button>
    </div>
  </div>

  {#if !project}
    <div class="empty-state"><p>Select a project to view tasks</p></div>
  {:else}
    <div class="columns-container" data-testid="kanban-columns">
      {#each COLUMN_ORDER as status}
        {@const config = getStatusConfig(status)}
        {@const columnTasks = tasksByStatus[status]}
        <div class="column {getColumnClass(status)}" data-testid={`column-${status}`}>
          <div class="column-header">
            <span class="column-icon" style="color: {config.color}">{config.icon}</span>
            <span class="column-title">{config.label}</span>
            <span class="column-count">{columnTasks.length}</span>
          </div>
          <div class="column-content">
            {#each columnTasks as task (task.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="task-card"
                class:active={activeTask?.id === task.id}
                class:running={activeTask?.id === task.id && isRunning}
                class:clickable={status === 'review'}
                onclick={() => status === 'review' && openReviewModal(task)}
                data-testid="task-item"
                data-task-id={task.id}
                data-task-status={task.status}
              >
                <div class="card-header">
                  <span class="task-id">{getTaskDisplayId(task)}</span>
                  <span class="task-type" class:research={task.task_type === 'research'} class:bug-fix={task.task_type === 'bug-fix'} class:refactor={task.task_type === 'refactor'} class:debug={task.task_type === 'debug'}>
                    {formatTaskType(task.task_type)}
                  </span>
                </div>
                <span class="task-title">{task.title}</span>
                {#if task.description}
                  <p class="task-desc">{task.description.substring(0, 60)}{task.description.length > 60 ? '...' : ''}</p>
                {/if}
                {#if status === 'in_progress' && !readOnly}
                  <button
                    class="btn-submit-review"
                    onclick={(e) => { e.stopPropagation(); submitForReview(task); }}
                    data-testid="submit-review-btn"
                  >
                    Submit for Review
                  </button>
                {/if}
                {#if status === 'review'}
                  <div class="review-hint">Click to review</div>
                {/if}
              </div>
            {:else}
              <div class="column-empty">
                {#if status === 'todo'}No tasks waiting
                {:else if status === 'done'}No completed tasks
                {:else}Empty{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if taskToReview}
  <TaskReviewModal
    task={taskToReview}
    isOpen={showReviewModal}
    onClose={closeReviewModal}
  />
{/if}

{#if showNewTaskModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={closeModal} role="dialog" aria-modal="true" tabindex="-1" data-testid="new-task-dialog">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="presentation">
      <h3>New Task</h3>
      <div class="form-group" role="radiogroup" aria-labelledby="task-type-label">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label id="task-type-label">Task Type</label>
        <div class="task-type-selector">
          <button class="type-btn" class:active={newTaskType === 'implementation'}
            onclick={() => newTaskType = 'implementation'} type="button" data-testid="task-type-implementation">
            Implementation
          </button>
          <button class="type-btn research" class:active={newTaskType === 'research'}
            onclick={() => newTaskType = 'research'} type="button" data-testid="task-type-research">
            Research
          </button>
          <button class="type-btn bug-fix" class:active={newTaskType === 'bug-fix'}
            onclick={() => newTaskType = 'bug-fix'} type="button" data-testid="task-type-bug-fix">
            Bug Fix
          </button>
          <button class="type-btn refactor" class:active={newTaskType === 'refactor'}
            onclick={() => newTaskType = 'refactor'} type="button" data-testid="task-type-refactor">
            Refactor
          </button>
          <button class="type-btn debug" class:active={newTaskType === 'debug'}
            onclick={() => newTaskType = 'debug'} type="button" data-testid="task-type-debug">
            Debug
          </button>
        </div>
      </div>
      <div class="form-group">
        <label for="task-title">Title</label>
        <input id="task-title" data-testid="task-title-input" type="text" bind:value={newTaskTitle}
          placeholder={newTaskType === 'research' ? 'e.g., Research AWS Cognito integration approach' : 'e.g., Implement OAuth callback handler'} />
      </div>
      <div class="form-group">
        <label for="task-description">Description</label>
        <textarea id="task-description" bind:value={newTaskDescription} placeholder="Detailed description..." rows="3"></textarea>
      </div>
      {#if newTaskType === 'research'}
        <div class="form-group">
          <label for="research-questions">Research Questions</label>
          <textarea id="research-questions" data-testid="research-questions-input" bind:value={researchQuestions}
            placeholder="- What is the recommended approach?&#10;- What are the trade-offs?" rows="3"></textarea>
          <p class="form-hint">Specific questions to answer during research</p>
        </div>
        {#if documentationSources.length > 0}
          <div class="form-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Documentation Sources to Search</label>
            <div class="doc-sources-list">
              {#each documentationSources as docSource}
                <label class="checkbox-label doc-source-item">
                  <input
                    type="checkbox"
                    checked={selectedDocSources.has(docSource.id)}
                    onchange={() => {
                      if (selectedDocSources.has(docSource.id)) {
                        selectedDocSources.delete(docSource.id)
                        selectedDocSources = new Set(selectedDocSources)
                      } else {
                        selectedDocSources.add(docSource.id)
                        selectedDocSources = new Set(selectedDocSources)
                      }
                    }}
                  />
                  <span class="doc-source-name">{docSource.name}</span>
                  <span class="doc-source-url">{docSource.url_pattern}</span>
                </label>
              {/each}
            </div>
            <p class="form-hint">Select documentation sources Claude should search</p>
          </div>
        {/if}
        <div class="form-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Output</label>
          <div class="output-options-list">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={outputAddToClaudeMd} />
              <span>Add findings to project CLAUDE.md</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={outputCreateAdr} />
              <span>Create decision record (ADR)</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={outputProposeImplementation} />
              <span>Propose implementation tasks</span>
            </label>
          </div>
          <p class="form-hint">What should Claude produce from this research</p>
        </div>
      {/if}
      {#if newTaskType === 'debug'}
        <div class="form-group">
          <label for="debug-investigation">Debug Investigation</label>
          <textarea id="debug-investigation" data-testid="debug-investigation-input" bind:value={researchQuestions}
            placeholder="- Error message or symptoms&#10;- Expected vs actual behavior&#10;- Steps to reproduce" rows="3"></textarea>
          <p class="form-hint">Details for debugging - produces research report with suggested fixes, no code changes</p>
        </div>
      {/if}
      {#if availableSkills.length > 0}
        <div class="form-group">
          <label for="skill-select">Workflow Template (optional)</label>
          <select id="skill-select" bind:value={selectedSkill} data-testid="skill-select">
            <option value="">None - standard task</option>
            {#each availableSkills as skill}
              <option value={skill.name}>/{skill.name} - {skill.description}</option>
            {/each}
          </select>
          <p class="form-hint">Select a built-in workflow template to guide Claude</p>
        </div>
      {/if}
      {#if activeCycle}
        <div class="form-group cycle-assignment">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={assignToCycle} data-testid="assign-to-cycle-checkbox" />
            <span>Assign to Cycle {activeCycle.cycle_number}</span>
            {#if activeCycle.goal}
              <span class="cycle-goal-hint">({activeCycle.goal.substring(0, 40)}{activeCycle.goal.length > 40 ? '...' : ''})</span>
            {/if}
          </label>
        </div>
      {/if}
      <div class="modal-actions">
        <button class="btn" onclick={closeModal}>Cancel</button>
        <button class="btn-primary" data-testid="create-task-btn" onclick={createTask} disabled={!newTaskTitle.trim()}>
          Create Task
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .kanban-board {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }

  @media (max-width: 600px) {
    .kanban-board {
      padding: 8px;
      gap: 6px;
      border-radius: 6px;
    }
  }

  .board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid #2a2a3a;
  }

  .board-header h2 {
    font-size: 14px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  @media (max-width: 600px) {
    .header-controls {
      gap: 8px;
      flex-wrap: wrap;
    }
  }

  .readonly-badge {
    font-size: 9px;
    padding: 2px 6px;
    background: #3a2a1a;
    color: #ffb347;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }

  .btn-add-top {
    padding: 4px 10px;
    background: transparent;
    border: 1px dashed #3a3a4a;
    border-radius: 4px;
    color: #666;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-add-top:hover:not(:disabled) { border-color: #ff6b35; color: #ff6b35; }
  .btn-add-top:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: #555;
    font-size: 13px;
  }

  .columns-container {
    display: flex;
    gap: 6px;
    flex: 1;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .column {
    flex: 1 1 0;
    min-width: 100px;
    max-width: 180px;
    display: flex;
    flex-direction: column;
    background: #0d0d12;
    border-radius: 6px;
    overflow: hidden;
  }

  /* Narrower columns on small screens */
  @media (max-width: 900px) {
    .columns-container {
      gap: 4px;
    }
    .column {
      min-width: 90px;
      max-width: 150px;
    }
  }

  /* Very narrow: hide some columns, show only key ones */
  @media (max-width: 600px) {
    .columns-container {
      gap: 4px;
    }
    .column {
      min-width: 80px;
      max-width: none;
    }
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: #151520;
    border-bottom: 2px solid #2a2a3a;
    min-height: 0;
  }

  .column-icon { font-size: 11px; flex-shrink: 0; }
  .column-title { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.3px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .column-count { font-size: 9px; color: #555; background: #1a1a24; padding: 1px 5px; border-radius: 10px; flex-shrink: 0; }

  @media (max-width: 600px) {
    .column-header {
      padding: 4px 6px;
    }
    .column-title {
      font-size: 9px;
    }
  }

  .column-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    overflow-y: auto;
    max-height: 200px;
  }

  @media (max-height: 700px) {
    .column-content {
      max-height: 120px;
    }
  }

  @media (max-height: 500px) {
    .column-content {
      max-height: 80px;
      padding: 4px;
      gap: 3px;
    }
  }

  .column-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 8px;
    color: #444;
    font-size: 11px;
    text-align: center;
  }

  .task-card {
    background: #151520;
    border: 1px solid #2a2a3a;
    border-radius: 5px;
    padding: 6px 8px;
    transition: all 0.15s;
    min-width: 0;
  }

  .task-card:hover { background: #1a1a28; border-color: #3a3a4a; }
  .task-card.active { border-color: #ff6b35; }
  .task-card.running { animation: pulse 2s ease-in-out infinite; }
  .task-card.clickable { cursor: pointer; }
  .task-card.clickable:hover { border-color: #60a5fa; }

  @keyframes pulse {
    0%, 100% { border-color: #ff6b35; }
    50% { border-color: #ff8555; }
  }

  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; gap: 4px; }
  .task-id { font-size: 9px; color: #555; font-family: 'SF Mono', Monaco, monospace; flex-shrink: 0; }
  .task-type { font-size: 8px; padding: 1px 4px; background: #252530; border-radius: 3px; color: #777; text-transform: uppercase; flex-shrink: 0; }
  .task-type.research { background: #1a2a3a; color: #6bcb77; }
  .task-type.bug-fix { background: #3a1a1a; color: #ff6b6b; }
  .task-type.refactor { background: #2a1a3a; color: #b39ddb; }
  .task-type.debug { background: #3a2a1a; color: #ffb347; }
  .task-title { font-size: 11px; color: #e0e0e0; display: block; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task-desc { margin: 3px 0 0; font-size: 9px; color: #555; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 600px) {
    .task-card {
      padding: 4px 6px;
    }
    .task-title {
      font-size: 10px;
    }
    .task-desc {
      display: none;
    }
  }

  /* Column accent colors */
  .column-todo .column-header { border-bottom-color: #888; }
  .column-in-progress .column-header { border-bottom-color: #ff6b35; }
  .column-interrupted .column-header { border-bottom-color: #fbbf24; }
  .column-review .column-header { border-bottom-color: #60a5fa; }
  .column-done .column-header { border-bottom-color: #4ade80; }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
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
    width: 420px;
    max-width: 90vw;
  }

  .modal h3 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 20px; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }

  .form-group input, .form-group textarea, .form-group select {
    width: 100%;
    padding: 10px 12px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 14px;
    font-family: inherit;
  }

  .form-group select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }

  .form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline: none; border-color: #ff6b35; }
  .form-group textarea { resize: vertical; min-height: 80px; }
  .form-hint { margin: 4px 0 0; font-size: 11px; color: #555; }
  .task-type-selector { display: flex; gap: 8px; flex-wrap: wrap; }

  .type-btn {
    flex: 1;
    padding: 10px 16px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #888;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .type-btn:hover { background: #151520; color: #aaa; }
  .type-btn.active { border-color: #ff6b35; color: #ff6b35; background: rgba(255, 107, 53, 0.1); }
  .type-btn.research.active { border-color: #6bcb77; color: #6bcb77; background: rgba(107, 203, 119, 0.1); }
  .type-btn.bug-fix.active { border-color: #ff6b6b; color: #ff6b6b; background: rgba(255, 107, 107, 0.1); }
  .type-btn.refactor.active { border-color: #b39ddb; color: #b39ddb; background: rgba(179, 157, 219, 0.1); }
  .type-btn.debug.active { border-color: #ffb347; color: #ffb347; background: rgba(255, 179, 71, 0.1); }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

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

  .btn:hover { background: #252530; color: #aaa; }

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

  .btn-primary:hover:not(:disabled) { background: #ff8555; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .cycle-assignment { margin-top: 8px; }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #aaa;
    cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #ff6b35;
  }
  .cycle-goal-hint {
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  /* Documentation sources list (PRD Section 4) */
  .doc-sources-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    max-height: 120px;
    overflow-y: auto;
  }

  .doc-source-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .doc-source-name {
    font-weight: 500;
    color: #e0e0e0;
    flex-shrink: 0;
  }

  .doc-source-url {
    font-size: 11px;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Output options (PRD Section 4) */
  .output-options-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
  }

  .output-options-list .checkbox-label {
    font-size: 13px;
  }

  /* Review gate styles */
  .btn-submit-review {
    margin-top: 6px;
    padding: 3px 6px;
    background: transparent;
    border: 1px solid #60a5fa;
    border-radius: 3px;
    color: #60a5fa;
    font-size: 9px;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .btn-submit-review:hover {
    background: rgba(96, 165, 250, 0.1);
  }

  .review-hint {
    margin-top: 4px;
    font-size: 8px;
    color: #60a5fa;
    text-align: center;
    opacity: 0.7;
  }
</style>
