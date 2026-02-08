<script lang="ts">
  /**
   * CyclePanel - Manages iterative development cycles
   *
   * Features:
   * - View current cycle and its tasks
   * - Complete cycle with learnings
   * - Plan next cycle
   * - View cycle history with learnings
   * - Record decisions (ADRs) per cycle
   */

  import { selectedProject } from '../stores/appState'
  import type { Cycle, Task, Decision } from '../../../shared/types'
  import { Button } from './shared'
  import {
    CycleTaskList,
    CycleDecisionList,
    CycleHistoryItem,
    NewCycleModal,
    CompleteCycleModal,
    DecisionModal
  } from './cycle'
  import { AUDIT_CYCLE_FREQUENCY } from '../../../shared/constants'

  // Props
  interface Props {
    projectId: string | null
    isOpen: boolean
    onClose: () => void
  }

  let { projectId, isOpen, onClose }: Props = $props()

  // State
  let cycles = $state<Cycle[]>([])
  let activeCycle = $state<Cycle | null>(null)
  let activeCycleTasks = $state<Task[]>([])
  let activeCycleDecisions = $state<Decision[]>([])
  let selectedCycleId = $state<string | null>(null)
  let selectedCycleData = $state<{cycle: Cycle; tasks: Task[]; decisions: Decision[]} | null>(null)
  let nextCycleNumber = $state<number>(0)  // Track next cycle number for modal guidance

  // UI state
  let showNewCycleForm = $state(false)
  let showCompleteCycleForm = $state(false)
  let showDecisionForm = $state(false)
  let isLoading = $state(false)

  // Subscribe to project changes
  let currentProjectId: string | null = null
  selectedProject.subscribe(p => {
    currentProjectId = p?.id ?? null
  })

  // Load cycles when project changes
  $effect(() => {
    if (projectId && isOpen) {
      loadCycles()
    }
  })

  async function loadCycles() {
    if (!projectId) return
    isLoading = true
    try {
      cycles = await window.api.db.cycles.getForProject(projectId)
      activeCycle = await window.api.db.cycles.getActive(projectId)
      nextCycleNumber = await window.api.db.cycles.getNextNumber(projectId)

      if (activeCycle) {
        activeCycleTasks = await window.api.db.cycles.getTasks(activeCycle.id)
        activeCycleDecisions = await window.api.db.decisions.getForCycle(activeCycle.id)
      } else {
        activeCycleTasks = []
        activeCycleDecisions = []
      }
    } catch (error) {
      console.error('Failed to load cycles:', error)
    } finally {
      isLoading = false
    }
  }

  async function loadSelectedCycleData(cycleId: string) {
    try {
      const cycle = await window.api.db.cycles.get(cycleId)
      if (cycle) {
        const tasks = await window.api.db.cycles.getTasks(cycleId)
        const decisions = await window.api.db.decisions.getForCycle(cycleId)
        selectedCycleData = { cycle, tasks, decisions }
      }
    } catch (error) {
      console.error('Failed to load cycle data:', error)
    }
  }

  async function handleCreateCycle(goal: string, tasks?: Array<{ title: string; description: string; type: string }>) {
    if (!projectId) return
    isLoading = true
    try {
      const nextNumber = await window.api.db.cycles.getNextNumber(projectId)
      const cycle = await window.api.db.cycles.create(projectId, nextNumber, goal || undefined)

      // If Claude suggested tasks, create them attached to this cycle
      if (tasks && tasks.length > 0) {
        for (const task of tasks) {
          await window.api.db.tasks.create(projectId, task.title, task.description, cycle.id)
        }
      }

      showNewCycleForm = false
      await loadCycles()
    } catch (error) {
      console.error('Failed to create cycle:', error)
    } finally {
      isLoading = false
    }
  }

  async function handleCompleteCycle(learnings: string) {
    if (!activeCycle) return
    isLoading = true
    const completedCycleNumber = activeCycle.cycle_number
    try {
      await window.api.db.cycles.complete(activeCycle.id, learnings || undefined)
      showCompleteCycleForm = false
      await loadCycles()

      // Auto-show the Plan Next Cycle modal after completing a cycle
      showNewCycleForm = true

      // Check if we should trigger an audit (every AUDIT_CYCLE_FREQUENCY cycles)
      // Note: cycle_number is 0-indexed, so we add 1 for the count
      const completedCount = completedCycleNumber + 1
      if (completedCount > 0 && completedCount % AUDIT_CYCLE_FREQUENCY === 0 && projectId) {
        // Dispatch audit trigger event
        window.dispatchEvent(new CustomEvent('audit-trigger', {
          detail: { cycleNumber: completedCycleNumber, projectId }
        }))
        // Log audit trigger to audit log
        await window.api.db.audit.log(null, 'audit_triggered', JSON.stringify({
          cycleNumber: completedCycleNumber,
          frequency: AUDIT_CYCLE_FREQUENCY,
          reason: `Cycle ${completedCycleNumber} completed (every ${AUDIT_CYCLE_FREQUENCY} cycles)`
        }))
      }
    } catch (error) {
      console.error('Failed to complete cycle:', error)
    } finally {
      isLoading = false
    }
  }

  async function handleCreateDecision(title: string, rationale: string, alternatives: string) {
    if (!projectId || !activeCycle) return
    isLoading = true
    try {
      await window.api.db.decisions.create(
        projectId,
        title,
        rationale || undefined,
        activeCycle.id,
        alternatives || undefined
      )
      showDecisionForm = false
      await loadCycles()
    } catch (error) {
      console.error('Failed to create decision:', error)
    } finally {
      isLoading = false
    }
  }

  async function handleDeleteDecision(decisionId: string) {
    if (!confirm('Delete this decision?')) return
    try {
      await window.api.db.decisions.delete(decisionId)
      await loadCycles()
      if (selectedCycleData) {
        await loadSelectedCycleData(selectedCycleData.cycle.id)
      }
    } catch (error) {
      console.error('Failed to delete decision:', error)
    }
  }

  function toggleCycleHistory(cycleId: string) {
    if (selectedCycleId === cycleId) {
      selectedCycleId = null
      selectedCycleData = null
    } else {
      selectedCycleId = cycleId
      loadSelectedCycleData(cycleId)
    }
  }

  let completedCycles = $derived(cycles.filter(c => c.status === 'completed').reverse())
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onClose} data-testid="cycle-panel" role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel" onclick={(e) => e.stopPropagation()} role="presentation">
      <header class="panel-header">
        <h2>Cycles</h2>
        <button class="close-btn" onclick={onClose}>x</button>
      </header>

      {#if isLoading}
        <div class="loading">Loading...</div>
      {:else}
        <div class="panel-content">
          <!-- Active Cycle Section -->
          <section class="section">
            <h3>Current Cycle</h3>
            {#if activeCycle}
              <div class="active-cycle">
                <div class="cycle-header">
                  <span class="cycle-number">Cycle {activeCycle.cycle_number}</span>
                  <span class="cycle-status active">Active</span>
                </div>
                {#if activeCycle.goal}
                  <p class="cycle-goal">{activeCycle.goal}</p>
                {/if}

                <!-- Tasks in this cycle -->
                <CycleTaskList tasks={activeCycleTasks} />

                <!-- Decisions in this cycle -->
                <CycleDecisionList
                  decisions={activeCycleDecisions}
                  showAddButton={true}
                  onAddClick={() => showDecisionForm = true}
                  onDeleteDecision={handleDeleteDecision}
                />

                <!-- Complete cycle button -->
                <div class="cycle-actions">
                  <Button variant="primary" onclick={() => showCompleteCycleForm = true}>
                    <span data-testid="complete-cycle-btn">Complete Cycle</span>
                  </Button>
                </div>
              </div>
            {:else}
              <p class="empty-text">No active cycle</p>
              <Button variant="primary" onclick={() => showNewCycleForm = true}>
                <span data-testid="start-cycle-0-btn">Start Cycle 0</span>
              </Button>
            {/if}
          </section>

          <!-- Cycle History Section -->
          <section class="section">
            <h3>
              Cycle History
              {#if activeCycle}
                <Button variant="small" onclick={() => showNewCycleForm = true}>+ Plan Next</Button>
              {/if}
            </h3>
            {#if completedCycles.length === 0}
              <p class="empty-text">No completed cycles yet</p>
            {:else}
              <ul class="cycle-history" data-testid="cycle-history-list">
                {#each completedCycles as cycle}
                  <CycleHistoryItem
                    {cycle}
                    isExpanded={selectedCycleId === cycle.id}
                    cycleData={selectedCycleId === cycle.id ? selectedCycleData : null}
                    onToggle={() => toggleCycleHistory(cycle.id)}
                  />
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      {/if}

      <!-- Modals -->
      <NewCycleModal
        isOpen={showNewCycleForm}
        onClose={() => showNewCycleForm = false}
        onCreate={handleCreateCycle}
        {isLoading}
        cycleNumber={nextCycleNumber}
        {projectId}
      />

      <CompleteCycleModal
        isOpen={showCompleteCycleForm}
        cycleNumber={activeCycle?.cycle_number ?? null}
        onClose={() => showCompleteCycleForm = false}
        onComplete={handleCompleteCycle}
        {isLoading}
      />

      <DecisionModal
        isOpen={showDecisionForm}
        onClose={() => showDecisionForm = false}
        onCreate={handleCreateDecision}
        {isLoading}
      />
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .panel {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    width: 600px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .panel-header h2 {
    font-size: 16px;
    color: #ff6b35;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .close-btn:hover {
    color: #ff6b35;
  }

  .panel-content {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
  }

  .loading {
    padding: 40px;
    text-align: center;
    color: #666;
  }

  .section {
    margin-bottom: 24px;
  }

  .section h3 {
    font-size: 13px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .active-cycle {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    padding: 16px;
  }

  .cycle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .cycle-number {
    font-weight: 600;
    color: #e0e0e0;
  }

  .cycle-status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
  }

  .cycle-status.active {
    background: rgba(0, 200, 100, 0.2);
    color: #00c864;
  }

  .cycle-goal {
    font-size: 13px;
    color: #aaa;
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .empty-text {
    font-size: 12px;
    color: #555;
    font-style: italic;
  }

  .cycle-actions {
    padding-top: 12px;
    border-top: 1px solid #252530;
    display: flex;
    justify-content: flex-end;
  }

  .cycle-history {
    list-style: none;
    padding: 0;
    margin: 0;
  }
</style>
