<script lang="ts">
  /**
   * NewCycleModal - Modal for creating a new cycle
   *
   * PRD Section 2: Cycle Structure
   * - Early cycles: Focus on MVP scope and E2E tests first
   * - Later cycles: Expand features iteratively, TDD-driven
   * - 1-3 tasks per cycle, audit after each, record learnings
   *
   * Supports Claude-assisted planning: "Ask Claude" generates a goal + tasks suggestion.
   */

  import { Modal, FormGroup, Button } from '../shared'
  import type { CycleSuggestion } from '../../../../shared/types/benchmark'

  interface Props {
    isOpen: boolean
    onClose: () => void
    onCreate: (goal: string, tasks?: Array<{ title: string; description: string; type: string }>) => void
    isLoading?: boolean
    cycleNumber?: number  // 0 for first cycle, undefined if unknown
    projectId?: string | null
  }

  let { isOpen, onClose, onCreate, isLoading = false, cycleNumber, projectId = null }: Props = $props()

  let goal = $state('')
  let direction = $state('')
  let planningWithClaude = $state(false)
  let suggestion = $state<CycleSuggestion | null>(null)
  let planError = $state<string | null>(null)

  // Determine if this is the first cycle
  const isFirstCycle = $derived(cycleNumber === 0)

  // Title and hint based on cycle type (PRD Section 2)
  const modalTitle = $derived(isFirstCycle ? 'Start First Cycle' : 'Plan Next Cycle')
  const modalHint = $derived(
    isFirstCycle
      ? 'Start with MVP scope and E2E tests. Get core functionality working first, then iterate.'
      : 'Only plan 1-3 tasks per cycle. Learn from each cycle, then plan the next.'
  )
  const placeholder = $derived(
    isFirstCycle
      ? 'What is the MVP goal for this cycle? Focus on core functionality and E2E tests first.'
      : 'What do you want to achieve in this cycle? Focus on the smallest increment that proves value.'
  )

  async function handleAskClaude() {
    if (!projectId) return
    planningWithClaude = true
    planError = null
    suggestion = null

    try {
      const result = await window.api.db.cycles.plan(projectId, direction || undefined)
      suggestion = result
      goal = result.goal
    } catch (error) {
      planError = error instanceof Error ? error.message : String(error)
    } finally {
      planningWithClaude = false
    }
  }

  function handleCreate() {
    onCreate(goal, suggestion?.tasks)
    resetState()
  }

  function handleClose() {
    resetState()
    onClose()
  }

  function handleDismissSuggestion() {
    suggestion = null
    planError = null
  }

  function resetState() {
    goal = ''
    direction = ''
    suggestion = null
    planError = null
    planningWithClaude = false
  }
</script>

<Modal
  {isOpen}
  onClose={handleClose}
  title={modalTitle}
  hint={modalHint}
>
  {#if suggestion}
    <!-- Claude suggestion display -->
    <div class="suggestion">
      <div class="suggestion-header">
        <span class="suggestion-label">Claude suggests:</span>
        <button class="dismiss-btn" onclick={handleDismissSuggestion}>x</button>
      </div>
      <div class="suggestion-goal">{suggestion.goal}</div>
      {#if suggestion.tasks.length > 0}
        <div class="suggestion-tasks">
          <span class="tasks-label">Tasks ({suggestion.tasks.length}):</span>
          {#each suggestion.tasks as task}
            <div class="suggestion-task">
              <span class="task-type">[{task.type}]</span>
              <span class="task-title">{task.title}</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if suggestion.rationale}
        <div class="suggestion-rationale">{suggestion.rationale}</div>
      {/if}
    </div>
  {/if}

  {#if planError}
    <div class="plan-error">{planError}</div>
  {/if}

  <FormGroup label="Cycle Goal" id="cycle-goal">
    <textarea
      id="cycle-goal"
      data-testid="cycle-goal-input"
      bind:value={goal}
      placeholder={placeholder}
      rows="3"
    ></textarea>
  </FormGroup>

  {#if !isFirstCycle}
    <FormGroup label="Direction for Claude (optional)" id="cycle-direction">
      <input
        id="cycle-direction"
        data-testid="cycle-direction-input"
        type="text"
        bind:value={direction}
        placeholder='e.g., "focus on testing" or "add authentication"'
      />
    </FormGroup>
  {/if}

  {#snippet actions()}
    {#if !isFirstCycle && projectId}
      <Button
        variant="secondary"
        onclick={handleAskClaude}
        disabled={isLoading || planningWithClaude}
      >
        <span data-testid="ask-claude-plan-btn">
          {planningWithClaude ? 'Thinking...' : 'Ask Claude to Plan'}
        </span>
      </Button>
    {/if}
    <Button variant="secondary" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" onclick={handleCreate} disabled={isLoading || planningWithClaude}>
      <span data-testid="create-cycle-btn">
        {suggestion ? 'Accept & Create' : 'Create Cycle'}
      </span>
    </Button>
  {/snippet}
</Modal>

<style>
  .suggestion {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .suggestion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .suggestion-label {
    font-size: 11px;
    color: #ff6b35;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 14px;
  }

  .dismiss-btn:hover {
    color: #ff6b35;
  }

  .suggestion-goal {
    font-size: 14px;
    color: #e0e0e0;
    margin-bottom: 8px;
    font-weight: 500;
  }

  .suggestion-tasks {
    margin-bottom: 8px;
  }

  .tasks-label {
    font-size: 11px;
    color: #888;
    display: block;
    margin-bottom: 4px;
  }

  .suggestion-task {
    font-size: 12px;
    color: #ccc;
    padding: 2px 0;
  }

  .task-type {
    color: #888;
    font-size: 10px;
    margin-right: 4px;
  }

  .task-title {
    color: #ddd;
  }

  .suggestion-rationale {
    font-size: 11px;
    color: #888;
    border-top: 1px solid #252535;
    padding-top: 8px;
    margin-top: 4px;
    font-style: italic;
  }

  .plan-error {
    background: rgba(255, 50, 50, 0.1);
    border: 1px solid rgba(255, 50, 50, 0.3);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 12px;
    color: #ff6b6b;
  }
</style>
