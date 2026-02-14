<script lang="ts">
  import { appStore, currentTask, projectTasks, selectedProject } from '../stores/appState'
  import type { Task, Project } from '../stores/appState'
  import type { Branch } from '../../../shared/types'
  import RecommendButton from './RecommendButton.svelte'

  // Props for terminal panel reference and dialog references
  interface Props {
    terminalPanel?: {
      startClaudeSession: (task: Task, projectId: string, systemPrompt?: string, additionalDirs?: string[]) => Promise<string | null>
      resumeClaudeSession: (task: Task, projectId: string) => Promise<string | null>
      stopClaudeSession: () => Promise<void>
      isSessionRunning: () => boolean
    }
    branchingDialog?: {
      open: () => void
    }
    clearWithSummaryDialog?: {
      open: () => void
    }
    mergeBranchDialog?: {
      open: (branch: Branch) => void
    }
  }

  let { terminalPanel, branchingDialog, clearWithSummaryDialog, mergeBranchDialog }: Props = $props()

  let activeTask = $state<Task | null>(null)
  let isRunning = $state(false)
  let tasks = $state<Task[]>([])
  let currentProject = $state<Project | null>(null)
  let activeBranches = $state<Branch[]>([])

  $effect(() => {
    const unsubs = [
      currentTask.subscribe(t => { activeTask = t }),
      appStore.subscribe(state => { isRunning = state.isTaskRunning }),
      projectTasks.subscribe(t => { tasks = t }),
      selectedProject.subscribe(p => { currentProject = p })
    ]
    return () => unsubs.forEach(fn => fn())
  })

  // Load active branches for the current task
  $effect(() => {
    if (activeTask) {
      window.api.branching.getForTask(activeTask.id).then(branches => {
        // Filter to only active branches
        activeBranches = branches.filter(b => b.status === 'active')
      }).catch(err => {
        console.error('[NERV] Failed to load branches:', err)
        activeBranches = []
      })
    } else {
      activeBranches = []
    }
  })

  function getNextTask(): Task | null {
    return tasks.find(t => t.status === 'todo') || null
  }

  // Get the first interrupted task (for resume)
  function getInterruptedTask(): Task | null {
    return tasks.find(t => t.status === 'interrupted') || null
  }

  // Check if we can resume (task has session_id)
  function canResumeTask(task: Task): boolean {
    return task.status === 'interrupted' && !!task.session_id
  }

  async function handleStartTask() {
    const nextTask = getNextTask()
    if (nextTask && currentProject) {
      // Update task status first
      await appStore.startTask(nextTask.id)

      // Create worktrees for the task (multi-repo support)
      // Skip worktree creation for debug tasks - they work on main branch and produce reports only
      let worktreePath: string | undefined
      let additionalDirs: string[] = []

      if (nextTask.task_type !== 'debug') {
        try {
          const repos = await window.api.db.repos.getForProject(currentProject.id)

          if (repos.length > 0) {
            console.log('[NERV] Creating worktrees for', repos.length, 'repo(s)')
            const worktreeResults = await window.api.worktree.createForTask(nextTask.id, currentProject.id)

            if (worktreeResults.length > 0) {
              // Use first worktree as primary working directory
              worktreePath = worktreeResults[0].worktreePath

              // Store worktree path in task
              await window.api.db.tasks.updateWorktree(nextTask.id, worktreePath)

              // Additional repos become --add-dir arguments
              if (worktreeResults.length > 1) {
                additionalDirs = worktreeResults.slice(1).map(r => r.worktreePath)
              }

              console.log('[NERV] Worktree created:', worktreePath)
              if (additionalDirs.length > 0) {
                console.log('[NERV] Additional dirs:', additionalDirs)
              }
            }
          }
        } catch (err) {
          console.error('[NERV] Failed to create worktrees:', err)
          // Continue without worktrees - will use current directory
        }
      } else {
        console.log('[NERV] Debug task - skipping worktree creation, using main branch')
      }

      // Generate NERV.md context via IPC - this creates the full context file
      let systemPrompt: string
      try {
        // Use the nervMd API to generate the system prompt from SQLite state
        systemPrompt = await window.api.nervMd.generate(currentProject.id, nextTask.id)
        console.log('[NERV] Generated system prompt:', systemPrompt.length, 'chars')

        // Also save the NERV.md file for reference
        const savedPath = await window.api.nervMd.save(currentProject.id, nextTask.id)
        console.log('[NERV] Saved NERV.md to:', savedPath)
      } catch (err) {
        console.error('[NERV] Failed to generate NERV.md, using fallback:', err)
        // Fallback to basic prompt if generation fails
        systemPrompt = `## NERV Task Context

Task ID: ${nextTask.id}
Title: ${nextTask.title}
${nextTask.description ? `Description: ${nextTask.description}` : ''}

Project: ${currentProject.name}
${currentProject.goal ? `Goal: ${currentProject.goal}` : ''}

Please complete this task following best practices. When done, summarize what you accomplished.
`
      }

      // Start Claude session via terminal panel
      if (terminalPanel) {
        // Update the task with worktree path if we have one
        const taskWithWorktree = worktreePath
          ? { ...nextTask, worktree_path: worktreePath }
          : nextTask

        await terminalPanel.startClaudeSession(taskWithWorktree, currentProject.id, systemPrompt, additionalDirs)
      }
    }
  }

  async function handleStopTask() {
    // Stop Claude session first
    if (terminalPanel) {
      await terminalPanel.stopClaudeSession()
    }
    // Then update store
    await appStore.stopTask()
  }

  // Resume an interrupted task
  async function handleResumeTask() {
    const interruptedTask = getInterruptedTask()
    if (!interruptedTask || !currentProject) return

    // Check if we can resume (has session ID)
    if (!canResumeTask(interruptedTask)) {
      console.warn('[NERV] Cannot resume task - no session ID')
      // Fall back to starting fresh if no session ID
      await handleStartTask()
      return
    }

    // Update task status to in_progress
    await appStore.startTask(interruptedTask.id)

    // Resume Claude session via terminal panel
    if (terminalPanel) {
      await terminalPanel.resumeClaudeSession(interruptedTask, currentProject.id)
    }
  }

  async function handleApproveTask() {
    if (!activeTask) return
    await appStore.updateTaskStatus(activeTask.id, 'done')
    // Note: Don't call stopTask() here as it would change status to 'interrupted'
    // The store state will be cleaned up when a new task starts
  }

  async function handleRequestChanges() {
    if (!activeTask) return
    // Move task back to in_progress for more work
    await appStore.updateTaskStatus(activeTask.id, 'in_progress')
  }

  // Check if task is in review status
  function isInReview(): boolean {
    return activeTask?.status === 'review'
  }

  function handleBranch() {
    // Open the branching dialog
    if (branchingDialog) {
      branchingDialog.open()
    }
  }

  function handleClearWithSummary() {
    // Open the clear with summary dialog
    if (clearWithSummaryDialog) {
      clearWithSummaryDialog.open()
    }
  }

  // Open merge dialog for active branch
  function handleMergeBranch() {
    if (activeBranches.length > 0 && mergeBranchDialog) {
      // Open dialog with first active branch
      mergeBranchDialog.open(activeBranches[0])
    }
  }

  // Handle branch created - start a new Claude session with branch context
  export async function handleBranchCreated(branchId: string, branchContext: string) {
    if (!activeTask || !currentProject) return

    // Stop the current session
    if (terminalPanel) {
      await terminalPanel.stopClaudeSession()
    }

    // Refresh active branches to show Merge button
    try {
      const branches = await window.api.branching.getForTask(activeTask.id)
      activeBranches = branches.filter(b => b.status === 'active')
    } catch (err) {
      console.error('[NERV] Failed to refresh branches:', err)
    }

    // Start a new session with the branch context
    if (terminalPanel) {
      await terminalPanel.startClaudeSession(activeTask, currentProject.id, branchContext)
    }

    console.log('[NERV] Started branch session:', branchId)
  }

  // Handle clear complete - start a new Claude session with the clear context
  export async function handleClearComplete(clearContext: string) {
    if (!activeTask || !currentProject) return

    // Stop the current session
    if (terminalPanel) {
      await terminalPanel.stopClaudeSession()
    }

    // Start a new session with the clear context
    if (terminalPanel) {
      await terminalPanel.startClaudeSession(activeTask, currentProject.id, clearContext)
    }

    console.log('[NERV] Started cleared session with summary')
  }

  // Handle actions from RecommendButton that need UI interaction
  function handleRecommendAction(action: string, data?: Record<string, unknown>) {
    switch (action) {
      case 'start_task':
        handleStartTask()
        break
      case 'open_audit':
        // Dispatch custom event to open audit panel
        window.dispatchEvent(new CustomEvent('nerv-open-audit'))
        break
      case 'resume_task':
        handleResumeTask()
        break
      default:
        console.log('[NERV] Recommend action requires manual handling:', action, data)
        break
    }
  }

  // More actions dropdown state
  let showMoreActions = $state(false)

  // Send input field for quick messages to Claude session (PRD Section 1 mockup line 145)
  let sendInputValue = $state('')
  let sendInput: HTMLInputElement | undefined = $state(undefined)

  async function handleSendMessage() {
    if (!sendInputValue.trim() || !isRunning) return

    // Send the message to the active Claude session
    const message = sendInputValue.trim() + '\n'
    sendInputValue = ''

    // Get the active tab's terminal/session and send input
    window.dispatchEvent(new CustomEvent('nerv-send-input', { detail: message }))
  }

  function handleSendKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }

  $effect(() => {
    // Determine button states
  })
</script>

<footer class="action-bar">
  <!-- Row 1: Send input (primary interaction) -->
  <div class="send-row">
    <div class="send-input-wrapper">
      <input
        id="send-input"
        type="text"
        class="send-input"
        data-testid="send-input"
        placeholder={isRunning ? "Type a message to Claude..." : "Start a task to chat with Claude"}
        bind:value={sendInputValue}
        bind:this={sendInput}
        onkeydown={handleSendKeydown}
        disabled={!isRunning}
      />
      <button
        class="action-btn send"
        data-testid="send-btn"
        onclick={handleSendMessage}
        disabled={!isRunning || !sendInputValue.trim()}
        title="Send message to Claude session (Enter)"
      >
        Send
      </button>
    </div>
  </div>

  <!-- Row 2: Action buttons + task info -->
  <div class="controls-row">
    <div class="action-buttons">
      <button
        class="action-btn start"
        data-testid="start-task-btn"
        onclick={handleStartTask}
        disabled={!currentProject || isRunning || !getNextTask()}
      >
        {#if isRunning}
          Running...
        {:else}
          Start Task
        {/if}
      </button>

      <button
        class="action-btn stop"
        data-testid="stop-task-btn"
        onclick={handleStopTask}
        disabled={!isRunning}
      >
        Stop
      </button>

      {#if getInterruptedTask() && !isRunning}
        <button
          class="action-btn resume"
          data-testid="resume-task-btn"
          onclick={handleResumeTask}
          disabled={isRunning}
          title={canResumeTask(getInterruptedTask()!) ? "Resume interrupted task from last session" : "Start interrupted task fresh (no session to resume)"}
        >
          {canResumeTask(getInterruptedTask()!) ? 'Resume' : 'Restart'}
        </button>
      {/if}

      {#if isInReview()}
        <div class="btn-group review-actions">
          <button
            class="action-btn approve"
            data-testid="approve-task-btn"
            onclick={handleApproveTask}
            title="Approve this task and mark as done"
          >
            Approve
          </button>

          <button
            class="action-btn request-changes"
            data-testid="request-changes-btn"
            onclick={handleRequestChanges}
            title="Request changes - move task back to in progress"
          >
            Request Changes
          </button>
        </div>
      {/if}

      <!-- More Actions dropdown for secondary actions -->
      <div class="more-actions-wrapper">
        <button
          class="action-btn more-actions"
          onclick={() => showMoreActions = !showMoreActions}
          disabled={!isRunning && activeBranches.length === 0}
          title="More actions"
        >
          More
        </button>
        {#if showMoreActions}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="more-actions-backdrop" onclick={() => showMoreActions = false}></div>
          <div class="more-actions-menu" data-testid="more-actions-menu">
            <button
              class="more-actions-item"
              data-testid="branch-btn"
              onclick={() => { showMoreActions = false; handleBranch() }}
              disabled={!isRunning}
            >
              Branch
            </button>
            {#if activeBranches.length > 0}
              <button
                class="more-actions-item"
                data-testid="merge-branch-btn"
                onclick={() => { showMoreActions = false; handleMergeBranch() }}
              >
                Merge
              </button>
            {/if}
            <button
              class="more-actions-item"
              onclick={() => { showMoreActions = false; handleClearWithSummary() }}
              disabled={!isRunning}
            >
              Clear Context
            </button>
          </div>
        {/if}
      </div>

      <RecommendButton onExecuteAction={handleRecommendAction} />
    </div>

    <div class="task-info">
      {#if activeTask}
        <span class="current-task">
          <span class="task-label">Current:</span>
          <span class="task-id">{activeTask.id}</span>
          <span class="task-title">{activeTask.title}</span>
        </span>
      {:else if currentProject && getNextTask()}
        <span class="next-task">
          <span class="task-label">Next:</span>
          <span class="task-id">{getNextTask()?.id}</span>
          <span class="task-title">{getNextTask()?.title}</span>
        </span>
      {:else if currentProject}
        <span class="no-task">No tasks available - create one to get started</span>
      {:else}
        <span class="no-task">Select or create a project to begin</span>
      {/if}
    </div>
  </div>
</footer>

<style>
  .action-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    flex-shrink: 0;
  }

  /* Row 1: Prominent send input */
  .send-row {
    display: flex;
    width: 100%;
  }

  .send-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0;
    flex: 1;
  }

  .send-input {
    flex: 1;
    padding: 10px 16px;
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md) 0 0 var(--radius-nerv-md);
    background: var(--color-nerv-panel);
    color: var(--color-nerv-text);
    font-size: 14px;
    font-family: inherit;
  }

  .send-input::placeholder {
    color: #555;
  }

  .send-input:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
    background: var(--color-nerv-panel-hover);
    box-shadow: 0 0 0 1px var(--color-nerv-primary);
  }

  .send-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.send {
    background: var(--color-nerv-primary);
    border-color: var(--color-nerv-primary);
    color: white;
    border-radius: 0 var(--radius-nerv-md) var(--radius-nerv-md) 0;
    border-left-width: 0;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
  }

  .action-btn.send:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover);
    border-color: var(--color-nerv-primary-hover);
  }

  /* Row 2: Controls */
  .controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .action-buttons {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-group {
    display: flex;
    gap: 0;
  }

  .btn-group .action-btn:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-width: 0;
  }

  .btn-group .action-btn:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .action-btn {
    padding: 8px 16px;
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.start {
    background: var(--color-nerv-primary);
    border-color: var(--color-nerv-primary);
    color: white;
    min-width: 100px;
  }

  .action-btn.start:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover);
    border-color: var(--color-nerv-primary-hover);
  }

  .action-btn.stop {
    background: var(--color-nerv-panel-hover);
    color: var(--color-nerv-error);
  }

  .action-btn.stop:hover:not(:disabled) {
    background: var(--color-nerv-error-bg);
    border-color: var(--color-nerv-error);
  }

  .action-btn.resume {
    background: #1a2a30;
    border-color: #3a6a7a;
    color: #6bcbcb;
  }

  .action-btn.resume:hover:not(:disabled) {
    background: #1a3a40;
    border-color: #4a8a9a;
    color: #8bebeb;
  }

  .review-actions {
    margin-left: 4px;
    border-left: 1px solid var(--color-nerv-border);
    padding-left: 6px;
  }

  .action-btn.approve {
    background: var(--color-nerv-success-bg);
    color: var(--color-nerv-success);
    padding: 8px 14px;
  }

  .action-btn.approve:hover:not(:disabled) {
    background: var(--color-nerv-success-bg-hover);
    border-color: #4a7a4a;
    color: #8beb97;
  }

  .action-btn.request-changes {
    background: var(--color-nerv-warning-bg);
    color: #ffb347;
    padding: 8px 14px;
  }

  .action-btn.request-changes:hover:not(:disabled) {
    background: var(--color-nerv-warning-bg-hover);
    border-color: #7a6a3a;
    color: #ffc967;
  }

  /* More Actions dropdown */
  .more-actions-wrapper {
    position: relative;
  }

  .action-btn.more-actions {
    background: var(--color-nerv-panel-hover);
    color: var(--color-nerv-text-muted);
    padding: 8px 14px;
  }

  .action-btn.more-actions:hover:not(:disabled) {
    background: var(--color-nerv-panel);
    border-color: var(--color-nerv-border-hover);
    color: var(--color-nerv-text);
  }

  .more-actions-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .more-actions-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    background: var(--color-nerv-panel-hover);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
    z-index: 100;
    min-width: 140px;
    overflow: hidden;
  }

  .more-actions-item {
    display: block;
    width: 100%;
    padding: 8px 14px;
    background: transparent;
    border: none;
    color: var(--color-nerv-text);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-nerv-fast);
  }

  .more-actions-item:hover:not(:disabled) {
    background: var(--color-nerv-border);
  }

  .more-actions-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .more-actions-item:not(:last-child) {
    border-bottom: 1px solid var(--color-nerv-border);
  }

  /* Task info */
  .task-info {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    font-size: 12px;
    overflow: hidden;
  }

  .current-task,
  .next-task {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .task-label {
    color: var(--color-nerv-text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .current-task .task-label {
    color: var(--color-nerv-primary);
  }

  .task-id {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 11px;
    padding: 2px 6px;
    background: var(--color-nerv-panel-hover);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
  }

  .task-title {
    color: var(--color-nerv-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-task {
    color: #555;
    font-style: italic;
  }
</style>
